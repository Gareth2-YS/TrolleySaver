"""The price the basket and search use for each product at each retailer: the stored daily average.

The nightly price-aggregator job (handlers/aggregate_prices.py) keeps one row per (product,
retailer) in the retailer-price table: key productId (partition) + retailerId (sort), holding the
latest day that had accepted prices. A row whose priceDate is more than `max_age` days ago is stale
and ignored, so the product shows as unpriced at that store.

Search lists the whole catalogue, so it reads the table whole (`stored_prices`). The basket needs only
a few products at the chosen stores, so it fetches exactly those rows by key (`prices_by_key`).
"""

import os
from datetime import timedelta

from common import db
from common.validation import SGT


def max_age_days():
    return int(os.environ.get("PRICE_MAX_AGE_DAYS", 30))


# What a basket or search result needs from each row.
PRICE_ATTRIBUTES = ("productId", "retailerId", "priceCents", "priceDate", "submissionCount")


def _oldest_fresh_day(now, max_age):
    """The earliest priceDate still in use: today in Singapore minus `max_age` days."""
    return (now.astimezone(SGT).date() - timedelta(days=max_age)).isoformat()


def _add(prices, row):
    prices.setdefault(row["productId"], {})[row["retailerId"]] = {
        "priceCents": int(row["priceCents"]),
        "priceDate": row["priceDate"],
        "submissionCount": int(row["submissionCount"]),
    }


def prices_by_key(product_ids, retailer_ids, now, max_age):
    """{productId: {retailerId: {priceCents, priceDate, submissionCount}}} for exactly these products
    at these retailers, fetched by key with BatchGetItem (every product x retailer pair, at most 100
    keys per request). A pair with no row, or with a stale one, is left out: unpriced at that store.
    """
    pairs = [{"productId": p, "retailerId": r} for p in dict.fromkeys(product_ids) for r in dict.fromkeys(retailer_ids)]
    oldest = _oldest_fresh_day(now, max_age)
    prices = {}
    for row in db.batch_get_items(db.retailer_prices(), pairs, PRICE_ATTRIBUTES):
        if row["priceDate"] >= oldest:
            _add(prices, row)
    return prices


def latest_price_update(products):
    """When the nightly job last stored a price, or None before its first run.

    The job sets every product it stores a price for to that run's time (priceUpdatedAt, the same
    value as the rows' computedAt), so the newest priceUpdatedAt in the catalogue is the newest
    computedAt in the retailer-price table, without reading that table.
    """
    return max((p["priceUpdatedAt"] for p in products if p.get("priceUpdatedAt")), default=None)


def stored_prices(product_ids, retailer_ids, now, max_age):
    """Return ({productId: {retailerId: {priceCents, priceDate, submissionCount}}}, pricesUpdated).

    pricesUpdated is the latest computedAt in the table (when the job last ran), or None if it's empty.
    The table holds one small row per product and store, so it is read whole rather than key by key.
    """
    products, retailers = set(product_ids), set(retailer_ids)
    oldest = _oldest_fresh_day(now, max_age)
    prices, updated = {}, None
    for row in db.scan_all(db.retailer_prices()):
        if row.get("computedAt") and (updated is None or row["computedAt"] > updated):
            updated = row["computedAt"]
        if row["productId"] not in products or row["retailerId"] not in retailers or row["priceDate"] < oldest:
            continue
        _add(prices, row)
    return prices, updated
