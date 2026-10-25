"""Nightly job: store each product's average price at each retailer for the Smart Basket.

Runs at 00:05 Singapore time (EventBridge Scheduler) and averages the accepted submissions of the day
that just ended. It can also be invoked by hand:
    {}                          yesterday (SGT)
    {"date": "2026-10-24"}      one specific Singapore day
    {"backfillDays": 30}        the last 30 days, oldest first (fills an empty table)
"""

import logging
import os
from datetime import datetime, timedelta, timezone

from boto3.dynamodb.conditions import Key

from common import db
from common.daily_prices import daily_rows, parse_day, window, yesterday
from common.validation import to_iso

logger = logging.getLogger()
logger.setLevel(os.environ.get("LOG_LEVEL", "INFO"))


def accepted_before(end):
    """Every accepted submission submitted before `end`, via the ByStatus index."""
    items, kwargs = [], {
        "IndexName": "ByStatus",
        "KeyConditionExpression": Key("status").eq("accepted") & Key("submittedAt").lt(end),
    }
    while True:
        page = db.submissions().query(**kwargs)
        items.extend(page["Items"])
        if "LastEvaluatedKey" not in page:
            return items
        kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]


def days_to_process(event, now):
    if event.get("date"):
        return [parse_day(event["date"])]
    if event.get("backfillDays"):
        last = yesterday(now) + timedelta(days=1)  # include today so far, useful after seeding
        return [last - timedelta(days=n) for n in range(int(event["backfillDays"]) - 1, -1, -1)]
    return [yesterday(now)]


def handler(event, context):
    event = event or {}
    now = datetime.now(timezone.utc)
    days = days_to_process(event, now)
    items = accepted_before(window(days[-1])[1])
    computed_at = to_iso(now)
    summary = []
    with db.retailer_prices().batch_writer(overwrite_by_pkeys=["productId", "retailerId"]) as batch:
        for day in days:
            rows = daily_rows(items, day, computed_at)
            for row in rows:
                batch.put_item(Item=row)
            summary.append({"date": day.isoformat(), "pairsUpdated": len(rows)})
    logger.info("Daily prices: %s", summary)
    return {"days": summary, "computedAt": computed_at}
