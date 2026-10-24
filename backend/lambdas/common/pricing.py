"""The price the basket uses for each product at each retailer: the latest accepted, non-stale one."""

import os
from datetime import timedelta

from boto3.dynamodb.conditions import Attr, Key

from common import db
from common.validation import to_iso

STATUS_ACCEPTED = "accepted"


def max_age_days():
    return int(os.environ.get("PRICE_MAX_AGE_DAYS", 30))


def latest_prices(product_ids, now, max_age):
    """Return {productId: {retailerId: {priceCents, observedAt, submittedAt}}}.

    Only accepted prices observed within the last `max_age` days count. The newest observedAt wins,
    and a tie goes to the later submittedAt. Products or retailers with no usable price are absent.
    """
    cutoff = to_iso(now - timedelta(days=max_age))
    prices = {}
    for product_id in dict.fromkeys(product_ids):
        latest = {}
        kwargs = {
            "KeyConditionExpression": Key("productId").eq(product_id),
            "FilterExpression": Attr("status").eq(STATUS_ACCEPTED) & Attr("observedAt").gte(cutoff),
        }
        while True:
            page = db.submissions().query(**kwargs)
            for item in page["Items"]:
                current = latest.get(item["retailerId"])
                if current is None or (item["observedAt"], item["submittedAt"]) > (current["observedAt"], current["submittedAt"]):
                    latest[item["retailerId"]] = {
                        "priceCents": int(item["priceCents"]),
                        "observedAt": item["observedAt"],
                        "submittedAt": item["submittedAt"],
                    }
            if "LastEvaluatedKey" not in page:
                break
            kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]
        prices[product_id] = latest
    return prices
