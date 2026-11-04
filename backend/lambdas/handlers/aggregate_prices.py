"""Nightly job: store each product's average price at each retailer for the Smart Basket.

Runs at 00:05 Singapore time (EventBridge Scheduler) and averages the accepted submissions of the day
that just ended. Every product that gets a new average also gets `priceUpdatedAt` set to this run's
time, so GET /products can say when its prices last changed. It can also be invoked by hand:
    {}                              yesterday (SGT)
    {"date": "2026-10-24"}          one specific Singapore day
    {"backfillDays": 30}            the last 30 days, oldest first (fills an empty table)
    {"syncProductTimestamps": true} one-off: set every product's priceUpdatedAt from the stored
                                    averages (the latest computedAt of its retailer-price rows)
"""

import logging
import os
from datetime import datetime, timedelta, timezone

from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

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


def stamp_products(timestamps):
    """Set priceUpdatedAt on each product in {productId: timestamp}. Products that no longer exist are
    skipped rather than recreated as empty items. Returns how many were updated."""
    updated = 0
    for product_id, timestamp in sorted(timestamps.items()):
        try:
            db.products().update_item(
                Key={"id": product_id},
                UpdateExpression="SET priceUpdatedAt = :at",
                ConditionExpression="attribute_exists(id)",
                ExpressionAttributeValues={":at": timestamp},
            )
            updated += 1
        except ClientError as error:
            if error.response.get("Error", {}).get("Code") != "ConditionalCheckFailedException":
                raise
            logger.info("Product %s no longer exists; priceUpdatedAt not set", product_id)
    return updated


def sync_product_timestamps():
    """One-off fill: each product's priceUpdatedAt = the latest computedAt among its stored averages."""
    latest = {}
    for row in db.scan_all(db.retailer_prices()):
        computed_at = row.get("computedAt")
        if computed_at and computed_at > latest.get(row["productId"], ""):
            latest[row["productId"]] = computed_at
    updated = stamp_products(latest)
    logger.info("Synced priceUpdatedAt on %s products", updated)
    return {"productsUpdated": updated}


def handler(event, context):
    event = event or {}
    if event.get("syncProductTimestamps"):
        return sync_product_timestamps()
    now = datetime.now(timezone.utc)
    days = days_to_process(event, now)
    items = accepted_before(window(days[-1])[1])
    computed_at = to_iso(now)
    summary, changed = [], set()
    with db.retailer_prices().batch_writer(overwrite_by_pkeys=["productId", "retailerId"]) as batch:
        for day in days:
            rows = daily_rows(items, day, computed_at)
            for row in rows:
                batch.put_item(Item=row)
                changed.add(row["productId"])
            summary.append({"date": day.isoformat(), "pairsUpdated": len(rows)})
    products_updated = stamp_products({product_id: computed_at for product_id in changed})
    logger.info("Daily prices: %s; priceUpdatedAt set on %s products", summary, products_updated)
    return {"days": summary, "computedAt": computed_at, "productsUpdated": products_updated}
