"""POST /basket/compare: price a shopper's basket at every store, plus a healthier version of it.

Public and stateless: the frontend keeps the basket and sends it whole each time. The response has
the basket as picked and, beside it, the same basket with Healthier Choice swaps, each with the
cheapest store, a per-store breakdown, unpriced items and savings against the other stores.
Prices are the daily averages stored by the nightly price-aggregator job.
"""

from datetime import datetime, timezone

from common import db
from common.basket import compare, exact_choices
from common.healthier import candidate_ids, extra_cost, healthier_choices
from common.http import api_handler, parse_json_body, response
from common.pricing import max_age_days, stored_prices
from common.validation import validate_basket


@api_handler
def handler(event, context):
    body = parse_json_body(event)
    products = {p["id"]: p for p in db.scan_all(db.products())}
    catalog_retailers = sorted(db.scan_all(db.retailers()), key=lambda r: r.get("name", ""))
    lines, retailer_ids = validate_basket(body, products, [r["id"] for r in catalog_retailers])
    retailers = [r for r in catalog_retailers if r["id"] in retailer_ids]

    max_age = max_age_days()
    product_ids = [line["productId"] for line in lines] + candidate_ids(lines, products)
    prices, prices_updated = stored_prices(product_ids, retailer_ids, datetime.now(timezone.utc), max_age)

    basket = compare(lines, products, retailers, exact_choices(lines, products, prices, retailer_ids))
    healthier = None
    choices, swaps = healthier_choices(lines, products, prices, retailer_ids)
    if choices:
        healthier = compare(lines, products, retailers, choices)
        healthier["swaps"] = swaps
    return response(200, {
        "priceMaxAgeDays": max_age,
        "pricesUpdated": prices_updated,
        "basket": basket,
        "healthierBasket": healthier,
        "healthierExtra": extra_cost(basket, healthier),
    })
