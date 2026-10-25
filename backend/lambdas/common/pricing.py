"""The price the basket uses for each product at each retailer: the stored daily average.

The nightly price-aggregator job (handlers/aggregate_prices.py) keeps one row per (product,
retailer) in the retailer-price table. A row whose priceDate is more than `max_age` days ago is
stale and ignored, so the product shows as unpriced at that store.
"""

import os
from datetime import timedelta

from common import db
from common.validation import SGT


def max_age_days():
    return int(os.environ.get("PRICE_MAX_AGE_DAYS", 30))


def stored_prices(product_ids, retailer_ids, now, max_age):
    """Return ({productId: {retailerId: {priceCents, priceDate, submissionCount}}}, pricesUpdated).

    pricesUpdated is the latest computedAt in the table (when the job last ran), or None if it's empty.
    The table holds one small row per product and store, so it is read whole rather than key by key.
    """
    products, retailers = set(product_ids), set(retailer_ids)
    oldest = (now.astimezone(SGT).date() - timedelta(days=max_age)).isoformat()
    prices, updated = {}, None
    for row in db.scan_all(db.retailer_prices()):
        if row.get("computedAt") and (updated is None or row["computedAt"] > updated):
            updated = row["computedAt"]
        if row["productId"] not in products or row["retailerId"] not in retailers or row["priceDate"] < oldest:
            continue
        prices.setdefault(row["productId"], {})[row["retailerId"]] = {
            "priceCents": int(row["priceCents"]),
            "priceDate": row["priceDate"],
            "submissionCount": int(row["submissionCount"]),
        }
    return prices, updated
