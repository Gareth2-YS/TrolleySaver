"""GET /price-submissions/mine: the caller's own submissions, newest first."""

from boto3.dynamodb.conditions import Key

from common import db
from common.auth import get_caller
from common.http import api_handler, response
from common.submissions import to_records


@api_handler
def handler(event, context):
    caller = get_caller(event)
    query = {
        "IndexName": "ByUser",
        "KeyConditionExpression": Key("userId").eq(caller.user_id),
        "ScanIndexForward": False,
        "Limit": db.page_limit(event),
    }
    token = (event.get("queryStringParameters") or {}).get("nextToken")
    items, next_token = db.query_page(db.submissions(), query, token, ("productId", "sk", "userId", "submittedAt"))
    return response(200, {"items": to_records(items), "nextToken": next_token})
