"""POST /price-submissions: record a price a contributor saw on the shelf.

The product and store must exist, whether or not a photo is attached: price-only submissions never
ask for an upload link, so this is where non-existent products are always refused. An attached photo
must have been uploaded for this same product (its key starts with price-evidence/<user>/<product>/).

In-range prices are accepted immediately; prices outside the product's believable range are
flagged for an administrator to accept or reject.
"""

import os
import uuid
from datetime import datetime, time, timedelta, timezone

from boto3.dynamodb.conditions import Attr, Key

from common import db
from common.auth import get_caller
from common.http import ApiError, api_handler, parse_json_body, response
from common.images import check_upload, evidence_prefix
from common.submissions import to_record
from common.validation import SGT, to_iso, validate_submission

STATUS_ACCEPTED = "accepted"
STATUS_FLAGGED = "flagged"


def _rate_limit():
    return int(os.environ.get("RATE_LIMIT_PER_HOUR", 30))


def _check_rate_limit(user_id, now):
    recent = db.count_query(
        db.submissions(),
        IndexName="ByUser",
        KeyConditionExpression=Key("userId").eq(user_id) & Key("submittedAt").gte(to_iso(now - timedelta(hours=1))),
    )
    if recent >= _rate_limit():
        raise ApiError(429, "RATE_LIMITED", f"You can submit up to {_rate_limit()} prices per hour. Please try again later.")


def _check_duplicate(user_id, product_id, retailer_id, price_cents, observed):
    """Same user, product, store and price on the same Singapore calendar day."""
    day_start = datetime.combine(observed.astimezone(SGT).date(), time(), SGT)
    day_end = day_start + timedelta(days=1) - timedelta(milliseconds=1)
    duplicates = db.count_query(
        db.submissions(),
        KeyConditionExpression=Key("productId").eq(product_id)
        & Key("sk").between(f"{retailer_id}#{to_iso(day_start)}", f"{retailer_id}#{to_iso(day_end)}~"),
        FilterExpression=Attr("userId").eq(user_id) & Attr("priceCents").eq(price_cents),
    )
    if duplicates:
        raise ApiError(409, "DUPLICATE_SUBMISSION", "You have already submitted this price for this product and store today.")


def _status_for(product, price_cents):
    low, high = product.get("minCents"), product.get("maxCents")
    if (low is not None and price_cents < low) or (high is not None and price_cents > high):
        return STATUS_FLAGGED
    return STATUS_ACCEPTED


@api_handler
def handler(event, context):
    caller = get_caller(event)
    now = datetime.now(timezone.utc)
    product_id, retailer_id, price_cents, observed, photo_key = validate_submission(parse_json_body(event), now)

    product = db.require_item(db.products(), {"id": product_id}, "productId", "Unknown product")
    retailer = db.require_item(db.retailers(), {"id": retailer_id}, "retailerId", "Unknown store")
    _check_rate_limit(caller.user_id, now)
    _check_duplicate(caller.user_id, product_id, retailer_id, price_cents, observed)

    submission_id = str(uuid.uuid4())
    observed_at = to_iso(observed)
    item = {
        "productId": product_id,
        "sk": f"{retailer_id}#{observed_at}#{submission_id}",
        "submissionId": submission_id,
        "retailerId": retailer_id,
        "userId": caller.user_id,
        "priceCents": price_cents,
        "observedAt": observed_at,
        "submittedAt": to_iso(now),
        "status": _status_for(product, price_cents),
    }
    if photo_key:
        content_type, size = check_upload(photo_key, evidence_prefix(caller.user_id, product_id), "photoKey")
        item.update(photoKey=photo_key, photoContentType=content_type, photoSizeBytes=size)

    db.submissions().put_item(Item=item, ConditionExpression="attribute_not_exists(sk)")
    db.users().update_item(
        Key={"userId": caller.user_id},
        UpdateExpression="ADD submissionCount :one",
        ExpressionAttributeValues={":one": 1},
    )
    record = to_record(item, {product_id: product}, {retailer_id: retailer})
    return response(201, record)
