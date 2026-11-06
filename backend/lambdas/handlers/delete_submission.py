"""DELETE /price-submissions/{id}: withdraw one of the caller's own prices while it's still pending.

Only a flagged price can be deleted: the system flagged it as outside the product's usual range, and
an admin hasn't reviewed it yet. An accepted price may already be in the daily averages and a rejected
one is decided, so both stay. Deleting removes the evidence photo too, takes the price off the
contributor's count, and frees the product and store for another price that day.
"""

from botocore.exceptions import ClientError

from common import db
from common.auth import get_caller
from common.http import ApiError, api_handler, no_content
from common.images import delete_quietly

STATUS_FLAGGED = "flagged"


def _load_own(product_id, sk, caller):
    """The caller's submission; someone else's is reported as missing, so ids can't be probed."""
    item = db.submissions().get_item(Key={"productId": product_id, "sk": sk}).get("Item")
    if not item or item["userId"] != caller.user_id:
        raise ApiError(404, "NOT_FOUND", "This submission could not be found.")
    return item


def _already_decided(item):
    raise ApiError(409, "ALREADY_MODERATED", f"This submission is already {item['status']}.")


@api_handler
def handler(event, context):
    caller = get_caller(event)
    product_id, sk = db.decode_submission_id((event.get("pathParameters") or {}).get("id", ""))
    item = _load_own(product_id, sk, caller)
    if item["status"] != STATUS_FLAGGED:
        _already_decided(item)
    try:
        db.submissions().delete_item(
            Key={"productId": product_id, "sk": sk},
            ConditionExpression="#status = :flagged AND userId = :me",
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={":flagged": STATUS_FLAGGED, ":me": caller.user_id},
        )
    except ClientError as error:
        if error.response.get("Error", {}).get("Code") != "ConditionalCheckFailedException":
            raise
        # An admin decided it (or the owner deleted it) since it was loaded.
        _already_decided(_load_own(product_id, sk, caller))
    try:
        db.users().update_item(
            Key={"userId": caller.user_id},
            UpdateExpression="ADD submissionCount :minus",
            ConditionExpression="submissionCount > :zero",
            ExpressionAttributeValues={":minus": -1, ":zero": 0},
        )
    except ClientError as error:
        if error.response.get("Error", {}).get("Code") != "ConditionalCheckFailedException":
            raise
    if item.get("photoKey"):
        delete_quietly(item["photoKey"])
    return no_content()
