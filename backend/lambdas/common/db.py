"""AWS resource handles, opaque ids and pagination tokens shared by the handlers."""

import base64
import json
import os
import time
from decimal import Decimal

import boto3
from boto3.dynamodb.types import TypeSerializer
from botocore.config import Config
from botocore.exceptions import ClientError

from common.http import ApiError

_cache = {}
_serializer = TypeSerializer()


def reset():
    """Drop cached clients (used by tests so each moto mock gets fresh ones)."""
    _cache.clear()


def _region():
    return os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "ap-southeast-1"


def _dynamodb():
    if "dynamodb" not in _cache:
        _cache["dynamodb"] = boto3.resource("dynamodb", region_name=_region())
    return _cache["dynamodb"]


def _dynamodb_client():
    if "dynamodb_client" not in _cache:
        _cache["dynamodb_client"] = boto3.client("dynamodb", region_name=_region())
    return _cache["dynamodb_client"]


def s3():
    if "s3" not in _cache:
        # Regional SigV4 endpoint so presigned URLs work right after bucket creation (no 307 redirect).
        _cache["s3"] = boto3.client(
            "s3",
            region_name=_region(),
            config=Config(signature_version="s3v4", s3={"addressing_style": "virtual"}),
        )
    return _cache["s3"]


def cognito():
    if "cognito" not in _cache:
        _cache["cognito"] = boto3.client("cognito-idp", region_name=_region())
    return _cache["cognito"]


def products():
    return _dynamodb().Table(os.environ["PRODUCT_TABLE"])


def retailers():
    return _dynamodb().Table(os.environ["RETAILER_TABLE"])


def submissions():
    return _dynamodb().Table(os.environ["SUBMISSION_TABLE"])


def users():
    return _dynamodb().Table(os.environ["USER_TABLE"])


def retailer_prices():
    return _dynamodb().Table(os.environ["RETAILER_PRICE_TABLE"])


def product_requests():
    return _dynamodb().Table(os.environ["PRODUCT_REQUEST_TABLE"])


def photo_bucket():
    return os.environ["PHOTO_BUCKET"]


def require_item(table, key, field, message):
    """Fetch an item the request refers to, or fail with a field error (DynamoDB has no foreign keys)."""
    item = table.get_item(Key=key).get("Item")
    if not item:
        raise ApiError(400, "VALIDATION_ERROR", "Some fields are invalid.", {field: message})
    return item


def serialize(values):
    """Plain Python values -> DynamoDB attribute values, for the low-level client."""
    return {name: _serializer.serialize(value) for name, value in values.items()}


def transact_write(actions):
    """All-or-nothing writes across tables. Each action is a TransactWriteItems entry with plain values
    in Item / Key / ExpressionAttributeValues; they are serialised here."""
    prepared = []
    for action in actions:
        (kind, spec), = action.items()
        spec = dict(spec)
        for part in ("Item", "Key", "ExpressionAttributeValues"):
            if part in spec:
                spec[part] = serialize(spec[part])
        prepared.append({kind: spec})
    _dynamodb_client().transact_write_items(TransactItems=prepared)


# BatchGetItem takes at most 100 keys per request. Keys DynamoDB leaves unprocessed (when the table is
# throttled) are sent again after 50, 100, 200, 400 and 800 ms; still unprocessed after that, the call
# fails rather than answering with items silently missing.
BATCH_GET_LIMIT = 100
BATCH_GET_ATTEMPTS = 6
BATCH_GET_BACKOFF_SECONDS = 0.05


def batch_get_items(table, keys, attributes=None):
    """Fetch items from one table by their full keys (dicts, e.g. {"productId": p, "retailerId": r}).

    Returns the items found, in no particular order; a key with no item is simply absent. Repeated
    keys are fetched once. `attributes` limits what comes back (a projection). Raises a 503 ApiError
    if DynamoDB still hasn't processed some keys after BATCH_GET_ATTEMPTS requests.
    """
    unique = list({tuple(sorted(key.items())): key for key in keys}.values())
    items = []
    for start in range(0, len(unique), BATCH_GET_LIMIT):
        request = {"Keys": unique[start:start + BATCH_GET_LIMIT]}
        if attributes:
            request["ProjectionExpression"] = ", ".join(f"#a{i}" for i in range(len(attributes)))
            request["ExpressionAttributeNames"] = {f"#a{i}": a for i, a in enumerate(attributes)}
        pending = {table.name: request}
        for attempt in range(BATCH_GET_ATTEMPTS):
            if attempt:
                time.sleep(BATCH_GET_BACKOFF_SECONDS * 2 ** (attempt - 1))
            result = _dynamodb().batch_get_item(RequestItems=pending)
            items.extend(result["Responses"].get(table.name, []))
            # Unprocessed keys come back with the request's projection, ready to resend as they are.
            pending = result.get("UnprocessedKeys") or {}
            if not pending:
                break
        else:
            raise ApiError(503, "SERVICE_BUSY", "The service is busy right now. Please try again in a moment.")
    return items


def batch_get(table, key_name, keys, attributes=None):
    """Fetch items by a single-attribute key from one table, returning {key: item}."""
    unique = list(dict.fromkeys(k for k in keys if k))
    return {item[key_name]: item for item in batch_get_items(table, [{key_name: k} for k in unique], attributes)}


def scan_all(table):
    items, kwargs = [], {}
    while True:
        page = table.scan(**kwargs)
        items.extend(page["Items"])
        if "LastEvaluatedKey" not in page:
            return items
        kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]


def count_query(table, **kwargs):
    total = 0
    while True:
        page = table.query(Select="COUNT", **kwargs)
        total += page["Count"]
        if "LastEvaluatedKey" not in page:
            return total
        kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]


def _b64encode(text):
    return base64.urlsafe_b64encode(text.encode()).decode().rstrip("=")


def _b64decode(token):
    return base64.urlsafe_b64decode(token + "=" * (-len(token) % 4)).decode()


def encode_submission_id(product_id, sk):
    return _b64encode(f"{product_id}|{sk}")


def decode_submission_id(submission_id):
    try:
        product_id, sk = _b64decode(submission_id).split("|", 1)
    except (ValueError, UnicodeDecodeError):
        raise ApiError(404, "NOT_FOUND", "This submission could not be found.")
    return product_id, sk


def encode_page_token(last_key):
    if not last_key:
        return None
    return _b64encode(json.dumps(last_key, default=lambda v: int(v) if isinstance(v, Decimal) else str(v)))


def decode_page_token(token):
    if not token:
        return None
    try:
        key = json.loads(_b64decode(token))
    except (ValueError, UnicodeDecodeError):
        raise ApiError(400, "INVALID_PAGE_TOKEN", "The nextToken is invalid.")
    if not isinstance(key, dict):
        raise ApiError(400, "INVALID_PAGE_TOKEN", "The nextToken is invalid.")
    return key


def query_page(table, query, token, key_names):
    """One page of `query`, continuing after `token` (a nextToken from an earlier page).

    `key_names` are the attributes of a start key for this query: the table's key plus the index's.
    Returns (items, nextToken). A token that decodes but doesn't fit this query, e.g. one that was edited
    or came from another list, is refused as a client error rather than failing as a 500."""
    start_key = decode_page_token(token)
    if start_key:
        if set(start_key) != set(key_names) or not all(isinstance(value, str) for value in start_key.values()):
            raise ApiError(400, "INVALID_PAGE_TOKEN", "The nextToken is invalid.")
        query = {**query, "ExclusiveStartKey": start_key}
    try:
        page = table.query(**query)
    except ClientError as error:
        if start_key and error.response.get("Error", {}).get("Code") == "ValidationException":
            raise ApiError(400, "INVALID_PAGE_TOKEN", "The nextToken is invalid.")
        raise
    return page["Items"], encode_page_token(page.get("LastEvaluatedKey"))


def page_limit(event, default=50, maximum=100):
    raw = (event.get("queryStringParameters") or {}).get("limit")
    if raw is None:
        return default
    try:
        value = int(raw)
    except ValueError:
        raise ApiError(400, "VALIDATION_ERROR", "limit must be a whole number.", {"limit": "Must be a whole number"})
    return max(1, min(value, maximum))
