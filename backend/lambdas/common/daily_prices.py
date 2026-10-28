"""The daily average price of each product at each retailer. Pure functions, no AWS calls.

Every night the accepted submissions that entered the system during the previous Singapore day are
averaged per (product, retailer). A submission counts on the day it was submitted, or, if an admin
accepted it after it was flagged, on the day it was accepted.
"""

from datetime import date, datetime, time, timedelta
from decimal import ROUND_HALF_UP, Decimal

from common.validation import SGT, to_iso


def window(day):
    """(start, end) of one Singapore calendar day as UTC ISO strings; start inclusive, end exclusive."""
    start = datetime.combine(day, time(), SGT)
    return to_iso(start), to_iso(start + timedelta(days=1))


def yesterday(now):
    return now.astimezone(SGT).date() - timedelta(days=1)


def parse_day(value):
    return date.fromisoformat(value)


def counted_at(item):
    """When a submission joined the accepted prices: its admin decision if it had one, else submission."""
    return item.get("reviewedAt") or item["submittedAt"]


def average(cents):
    """Mean of whole-cent prices, rounded to the nearest cent with halves rounded up."""
    return int((Decimal(sum(cents)) / len(cents)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def group(items, start, end):
    """{(productId, retailerId): [priceCents, ...]} for accepted items counted inside [start, end)."""
    groups = {}
    for item in items:
        if item.get("status") != "accepted" or not start <= counted_at(item) < end:
            continue
        groups.setdefault((item["productId"], item["retailerId"]), []).append(int(item["priceCents"]))
    return groups


def daily_rows(items, day, computed_at):
    """The retailer-price rows to write for one day. Pairs with no submissions that day get no row,
    so whatever is stored for them already is kept (carried forward)."""
    start, end = window(day)
    return [
        {
            "productId": product_id,
            "retailerId": retailer_id,
            "priceCents": average(cents),
            "submissionCount": len(cents),
            "priceDate": day.isoformat(),
            "computedAt": computed_at,
        }
        for (product_id, retailer_id), cents in sorted(group(items, start, end).items())
    ]
