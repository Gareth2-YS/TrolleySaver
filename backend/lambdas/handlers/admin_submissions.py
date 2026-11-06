"""Admin moderation of flagged submissions.

GET   /admin/price-submissions?status=flagged   review queue, newest first
PATCH /admin/price-submissions/{id}             {"decision": "accepted" | "rejected", "reason"?}
"""

from datetime import datetime, timezone

from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

from common import db
from common.auth import require_admin
from common.http import ApiError, api_handler, parse_json_body, response
from common.submissions import to_records
from common.validation import to_iso

STATUSES = ("flagged", "accepted", "rejected")
DECISIONS = ("accepted", "rejected")
MAX_REASON_LENGTH = 500


def list_submissions(event):
    params = event.get("queryStringParameters") or {}
    status = params.get("status", "flagged")
    if status not in STATUSES:
        raise ApiError(400, "VALIDATION_ERROR", "Some fields are invalid.", {"status": f"Must be one of {', '.join(STATUSES)}"})
    query = {
        "IndexName": "ByStatus",
        "KeyConditionExpression": Key("status").eq(status),
        "ScanIndexForward": False,
        "Limit": db.page_limit(event),
    }
    items, next_token = db.query_page(db.submissions(), query, params.get("nextToken"), ("productId", "sk", "status", "submittedAt"))
    return response(200, {"items": to_records(items, admin=True), "nextToken": next_token})


def moderate(event, admin):
    product_id, sk = db.decode_submission_id((event.get("pathParameters") or {}).get("id", ""))
    body = parse_json_body(event)
    decision = body.get("decision")
    reason = body.get("reason")
    if decision not in DECISIONS:
        raise ApiError(400, "VALIDATION_ERROR", "Some fields are invalid.", {"decision": "Must be accepted or rejected"})
    if decision == "rejected":
        if not isinstance(reason, str) or not reason.strip():
            raise ApiError(400, "VALIDATION_ERROR", "Some fields are invalid.", {"reason": "Enter a reason before rejecting"})
        if len(reason.strip()) > MAX_REASON_LENGTH:
            raise ApiError(400, "VALIDATION_ERROR", "Some fields are invalid.", {"reason": f"Keep the reason under {MAX_REASON_LENGTH} characters"})

    values = {":decision": decision, ":flagged": "flagged", ":now": to_iso(datetime.now(timezone.utc)), ":admin": admin.user_id}
    update = "SET #status = :decision, reviewedAt = :now, reviewedBy = :admin"
    if decision == "rejected":
        update += ", rejectionReason = :reason"
        values[":reason"] = reason.strip()
    try:
        result = db.submissions().update_item(
            Key={"productId": product_id, "sk": sk},
            UpdateExpression=update,
            ConditionExpression="attribute_exists(sk) AND #status = :flagged",
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues=values,
            ReturnValues="ALL_NEW",
        )
    except ClientError as error:
        if error.response.get("Error", {}).get("Code") != "ConditionalCheckFailedException":
            raise
        current = db.submissions().get_item(Key={"productId": product_id, "sk": sk}).get("Item")
        if not current:
            raise ApiError(404, "NOT_FOUND", "This submission could not be found.")
        raise ApiError(409, "ALREADY_MODERATED", f"This submission is already {current['status']}.")
    return response(200, to_records([result["Attributes"]], admin=True)[0])


@api_handler
def handler(event, context):
    admin = require_admin(event)
    if event.get("httpMethod") == "PATCH":
        return moderate(event, admin)
    return list_submissions(event)
