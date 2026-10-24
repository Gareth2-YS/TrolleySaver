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
    start_key = db.decode_page_token((event.get("queryStringParameters") or {}).get("nextToken"))
    if start_key:
        query["ExclusiveStartKey"] = start_key
    page = db.submissions().query(**query)
    return response(200, {
        "items": to_records(page["Items"]),
        "nextToken": db.encode_page_token(page.get("LastEvaluatedKey")),
    })
