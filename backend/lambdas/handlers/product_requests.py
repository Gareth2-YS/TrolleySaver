"""Contributors proposing a product that isn't in the catalog yet, with its first price.

POST /product-requests/image-upload-url   {purpose: "product-image" | "evidence", contentType, sizeBytes}
POST /product-requests                    every product field, retailerId, priceCents, observedAt,
                                          productImageKey (required), photoKey (optional evidence)
GET  /product-requests/mine               the caller's requests, newest first
DELETE /product-requests/{id}             withdraw one of the caller's own pending requests

A request stays `pending`, hidden from the catalog, search and basket, until an admin approves or
rejects it (handlers/admin_product_requests.py). Until then its owner can delete it, pictures and all.
"""

import os
import uuid
from datetime import datetime, timedelta, timezone

from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

from common import db
from common.auth import get_caller
from common.http import ApiError, api_handler, no_content, parse_json_body, response
from common.images import (NEW_PRODUCT, check_upload, delete_quietly, evidence_prefix, new_key, pending_product_image_prefix,
                           presigned_upload)
from common.product_requests import PRODUCT_FIELDS, duplicate_key, find_existing_product, to_record, to_records, validate_request
from common.validation import to_iso, validate_upload_request

PURPOSES = ("product-image", "evidence")


def _daily_limit():
    return int(os.environ.get("PRODUCT_REQUESTS_PER_DAY", 10))


def upload_url(event, caller):
    body = parse_json_body(event)
    purpose = body.get("purpose")
    if purpose not in PURPOSES:
        raise ApiError(400, "VALIDATION_ERROR", "Some fields are invalid.", {"purpose": "Must be product-image or evidence"})
    content_type, _ = validate_upload_request(body)
    if purpose == "product-image":
        key = new_key(pending_product_image_prefix(caller.user_id), content_type)
        return response(200, {**presigned_upload(key, content_type), "productImageKey": key})
    key = new_key(evidence_prefix(caller.user_id, NEW_PRODUCT), content_type)
    return response(200, {**presigned_upload(key, content_type), "photoKey": key})


def _check_rate_limit(user_id, now):
    recent = db.count_query(
        db.product_requests(),
        IndexName="ByUser",
        KeyConditionExpression=Key("userId").eq(user_id) & Key("submittedAt").gte(to_iso(now - timedelta(days=1))),
    )
    if recent >= _daily_limit():
        raise ApiError(429, "RATE_LIMITED", f"You can propose up to {_daily_limit()} new products a day. Please try again tomorrow.")


def _check_duplicates(fields):
    existing = find_existing_product(fields)
    if existing:
        raise ApiError(409, "PRODUCT_EXISTS", "This product is already in the catalog. Submit a price for it instead.",
                       extra={"productId": existing["id"]})
    key = duplicate_key(fields)
    kwargs = {"IndexName": "ByStatus", "KeyConditionExpression": Key("status").eq("pending")}
    while True:
        page = db.product_requests().query(**kwargs)
        # Compare against each request's own fields, not its stored duplicateKey, so requests saved
        # before the key included packCount still match correctly.
        if any(duplicate_key(item) == key for item in page["Items"]):
            raise ApiError(409, "PRODUCT_ALREADY_REQUESTED", "Someone has already proposed this product. It is waiting for an admin.")
        if "LastEvaluatedKey" not in page:
            return
        kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]


def create(event, caller):
    now = datetime.now(timezone.utc)
    request = validate_request(parse_json_body(event), now)
    retailer = db.require_item(db.retailers(), {"id": request["retailerId"]}, "retailerId", "Unknown store")
    _check_rate_limit(caller.user_id, now)
    _check_duplicates(request)
    image_type, image_size = check_upload(request["productImageKey"], pending_product_image_prefix(caller.user_id), "productImageKey")

    item = {
        "requestId": str(uuid.uuid4()),
        "status": "pending",
        "userId": caller.user_id,
        "submittedAt": to_iso(now),
        **{field: request[field] for field in PRODUCT_FIELDS},
        "duplicateKey": duplicate_key(request),
        "retailerId": request["retailerId"],
        "priceCents": request["priceCents"],
        "observedAt": to_iso(request["observed"]),
        "productImageKey": request["productImageKey"],
        "productImageContentType": image_type,
        "productImageSizeBytes": image_size,
    }
    if request["photoKey"]:
        photo_type, photo_size = check_upload(request["photoKey"], evidence_prefix(caller.user_id, NEW_PRODUCT), "photoKey")
        item.update(photoKey=request["photoKey"], photoContentType=photo_type, photoSizeBytes=photo_size)

    db.product_requests().put_item(Item=item, ConditionExpression="attribute_not_exists(requestId)")
    return response(201, to_record(item, {retailer["id"]: retailer}))


def mine(event, caller):
    query = {
        "IndexName": "ByUser",
        "KeyConditionExpression": Key("userId").eq(caller.user_id),
        "ScanIndexForward": False,
        "Limit": db.page_limit(event),
    }
    token = (event.get("queryStringParameters") or {}).get("nextToken")
    items, next_token = db.query_page(db.product_requests(), query, token, ("requestId", "userId", "submittedAt"))
    return response(200, {"items": to_records(items), "nextToken": next_token})


def _load_own(request_id, caller):
    """The caller's request; someone else's is reported as missing, so ids can't be probed."""
    item = db.product_requests().get_item(Key={"requestId": request_id}).get("Item") if request_id else None
    if not item or item["userId"] != caller.user_id:
        raise ApiError(404, "NOT_FOUND", "This product request could not be found.")
    return item


def _already_decided(item):
    raise ApiError(409, "ALREADY_MODERATED", f"This product request is already {item['status']}.")


def delete(event, caller):
    item = _load_own((event.get("pathParameters") or {}).get("id"), caller)
    if item["status"] != "pending":
        _already_decided(item)
    try:
        db.product_requests().delete_item(
            Key={"requestId": item["requestId"]},
            ConditionExpression="#status = :pending AND userId = :me",
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={":pending": "pending", ":me": caller.user_id},
        )
    except ClientError as error:
        if error.response.get("Error", {}).get("Code") != "ConditionalCheckFailedException":
            raise
        # An admin decided it (or the owner deleted it) since it was loaded.
        _already_decided(_load_own(item["requestId"], caller))
    for key in (item["productImageKey"], item.get("photoKey")):
        if key:
            delete_quietly(key)
    return no_content()


@api_handler
def handler(event, context):
    caller = get_caller(event)
    resource = event.get("resource") or event.get("path")
    if resource == "/product-requests/image-upload-url":
        return upload_url(event, caller)
    if resource == "/product-requests/mine":
        return mine(event, caller)
    if resource == "/product-requests" and event.get("httpMethod") == "POST":
        return create(event, caller)
    if resource == "/product-requests/{id}" and event.get("httpMethod") == "DELETE":
        return delete(event, caller)
    raise ApiError(404, "NOT_FOUND", "Route not found.")
