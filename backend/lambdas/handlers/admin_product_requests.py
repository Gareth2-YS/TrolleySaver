"""Admin review of product requests.

GET   /admin/product-requests?status=pending   queue (pending | approved | rejected), newest first
PATCH /admin/product-requests/{id}             {"decision": "approved", "changes"?: {...}}
                                               {"decision": "rejected", "reason": "..."}

Approving publishes the product and its first price. In one transaction with the request's status change
it creates the product (its picture copied to product-images/<productId>.<ext>) and the price as an
accepted submission. The price counts towards the daily average of the day it was approved (reviewedAt),
so a request whose price was seen more than 30 days before that can't be approved, only rejected.
"""

import uuid
from datetime import datetime, timezone

from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

from common import db
from common.auth import require_admin
from common.http import ApiError, api_handler, parse_json_body, response
from common.images import delete_quietly, product_image_key
from common.product_requests import PRODUCT_FIELDS, find_existing_product, to_records, validate_approval_changes
from common.validation import MAX_OBSERVED_AGE_DAYS, observed_too_old, to_iso, validate_reason

STATUSES = ("pending", "approved", "rejected")
DECISIONS = ("approved", "rejected")


def list_requests(event):
    params = event.get("queryStringParameters") or {}
    status = params.get("status", "pending")
    if status not in STATUSES:
        raise ApiError(400, "VALIDATION_ERROR", "Some fields are invalid.", {"status": f"Must be one of {', '.join(STATUSES)}"})
    query = {
        "IndexName": "ByStatus",
        "KeyConditionExpression": Key("status").eq(status),
        "ScanIndexForward": False,
        "Limit": db.page_limit(event),
    }
    items, next_token = db.query_page(db.product_requests(), query, params.get("nextToken"), ("requestId", "status", "submittedAt"))
    return response(200, {"items": to_records(items, admin=True), "nextToken": next_token})


def _load(request_id):
    item = db.product_requests().get_item(Key={"requestId": request_id}).get("Item") if request_id else None
    if not item:
        raise ApiError(404, "NOT_FOUND", "This product request could not be found.")
    return item


def _already_decided(request_id):
    raise ApiError(409, "ALREADY_MODERATED", f"This product request is already {_load(request_id)['status']}.")


def reject(item, reason, admin, now):
    try:
        db.product_requests().update_item(
            Key={"requestId": item["requestId"]},
            UpdateExpression="SET #status = :rejected, reviewedAt = :now, reviewedBy = :admin, rejectionReason = :reason",
            ConditionExpression="#status = :pending",
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={":rejected": "rejected", ":pending": "pending", ":now": now,
                                       ":admin": admin.user_id, ":reason": reason},
        )
    except ClientError as error:
        if error.response.get("Error", {}).get("Code") != "ConditionalCheckFailedException":
            raise
        _already_decided(item["requestId"])
    delete_quietly(item["productImageKey"])  # a rejected product's picture is never shown
    return _load(item["requestId"])


def _parse_iso(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def approve(item, changes, admin, now):
    # The first price counts on the day it's approved, so it must still be recent enough then.
    if observed_too_old(_parse_iso(item["observedAt"]), _parse_iso(now)):
        raise ApiError(409, "OBSERVATION_TOO_OLD",
                       f"This request's price was seen more than {MAX_OBSERVED_AGE_DAYS} days ago, so it can't be "
                       "published as a current price. Reject it and ask the contributor for a fresh one.")
    field_changes, min_cents, max_cents, search_terms = validate_approval_changes(changes, int(item["priceCents"]))
    fields = {field: item[field] for field in PRODUCT_FIELDS}
    fields.update(field_changes)
    existing = find_existing_product(fields)
    if existing:
        raise ApiError(409, "PRODUCT_EXISTS", "This product is already in the catalog. Reject the request instead.",
                       extra={"productId": existing["id"]})

    product_id, submission_id = str(uuid.uuid4()), str(uuid.uuid4())
    pending_key = item["productImageKey"]
    image_key = product_image_key(product_id, pending_key)
    bucket = db.photo_bucket()
    try:
        db.s3().copy_object(Bucket=bucket, Key=image_key, CopySource={"Bucket": bucket, "Key": pending_key})
    except ClientError as error:
        if error.response.get("Error", {}).get("Code") not in ("NoSuchKey", "404", "NotFound"):
            raise
        # Another admin's approval may have just moved the picture to its permanent place.
        if _load(item["requestId"])["status"] != "pending":
            _already_decided(item["requestId"])
        raise ApiError(409, "PRODUCT_IMAGE_MISSING", "This request's product picture is missing. Reject the request instead.")

    product = {"id": product_id, **fields, "searchTerms": search_terms, "minCents": min_cents, "maxCents": max_cents,
               "imageKey": image_key, "createdFromRequest": item["requestId"], "createdAt": now}
    submission = {
        "productId": product_id,
        "sk": f"{item['retailerId']}#{item['observedAt']}#{submission_id}",
        "submissionId": submission_id,
        "retailerId": item["retailerId"],
        "userId": item["userId"],
        "priceCents": int(item["priceCents"]),
        "observedAt": item["observedAt"],
        "submittedAt": item["submittedAt"],
        "status": "accepted",
        "reviewedAt": now,
        "reviewedBy": admin.user_id,
        "productRequestId": item["requestId"],
    }
    for name in ("photoKey", "photoContentType", "photoSizeBytes"):
        if item.get(name) is not None:
            submission[name] = item[name]

    # The request keeps the published values, so its history shows what the admin approved.
    published = {**fields, "productId": product_id, "submissionId": submission_id, "productImageKey": image_key,
                 "minCents": min_cents, "maxCents": max_cents, "reviewedAt": now, "reviewedBy": admin.user_id}
    names = {"#status": "status", **{f"#f{i}": name for i, name in enumerate(published)}}
    values = {":approved": "approved", ":pending": "pending", **{f":v{i}": value for i, value in enumerate(published.values())}}
    update = "SET #status = :approved, " + ", ".join(f"#f{i} = :v{i}" for i in range(len(published)))

    try:
        db.transact_write([
            {"Update": {"TableName": db.product_requests().name, "Key": {"requestId": item["requestId"]},
                        "UpdateExpression": update, "ConditionExpression": "#status = :pending",
                        "ExpressionAttributeNames": names, "ExpressionAttributeValues": values}},
            {"Put": {"TableName": db.products().name, "Item": product, "ConditionExpression": "attribute_not_exists(id)"}},
            {"Put": {"TableName": db.submissions().name, "Item": submission, "ConditionExpression": "attribute_not_exists(sk)"}},
            {"Update": {"TableName": db.users().name, "Key": {"userId": item["userId"]},
                        "UpdateExpression": "ADD submissionCount :one", "ExpressionAttributeValues": {":one": 1}}},
        ])
    except ClientError as error:
        delete_quietly(image_key)
        if error.response.get("Error", {}).get("Code") != "TransactionCanceledException":
            raise
        reasons = error.response.get("CancellationReasons") or []
        if reasons and reasons[0].get("Code") == "ConditionalCheckFailed":
            _already_decided(item["requestId"])
        raise
    delete_quietly(pending_key)  # copied to its permanent place
    return _load(item["requestId"])


def moderate(event, admin):
    item = _load((event.get("pathParameters") or {}).get("id"))
    body = parse_json_body(event)
    decision = body.get("decision")
    if decision not in DECISIONS:
        raise ApiError(400, "VALIDATION_ERROR", "Some fields are invalid.", {"decision": "Must be approved or rejected"})
    if item["status"] != "pending":
        _already_decided(item["requestId"])
    now = to_iso(datetime.now(timezone.utc))
    if decision == "rejected":
        updated = reject(item, validate_reason(body.get("reason")), admin, now)
    else:
        updated = approve(item, body.get("changes"), admin, now)
    return response(200, to_records([updated], admin=True)[0])


@api_handler
def handler(event, context):
    admin = require_admin(event)
    if event.get("httpMethod") == "PATCH":
        return moderate(event, admin)
    return list_requests(event)
