"""GET /products/search: public product search and filters, with each product's current store prices.

Every query parameter is optional; with none it returns the whole catalog. Prices are the daily
averages stored by the nightly price-aggregator job, the same ones the Smart Basket uses.
"""

from datetime import datetime, timezone

from common import db
from common.http import api_handler, response
from common.images import with_image_url
from common.pricing import max_age_days, stored_prices
from common.search import facet_counts, facets, priced, search
from common.validation import validate_search


@api_handler
def handler(event, context):
    criteria = validate_search(event.get("queryStringParameters") or {})
    products = [with_image_url(p) for p in sorted(db.scan_all(db.products()), key=lambda p: p.get("name", ""))]
    retailers = {r["id"]: r for r in db.scan_all(db.retailers())}

    max_age = max_age_days()
    prices, prices_updated = stored_prices([p["id"] for p in products], list(retailers), datetime.now(timezone.utc), max_age)

    catalog = priced(products, prices, retailers)
    items = search(catalog, criteria)
    return response(200, {
        "items": items,
        "total": len(items),
        "catalogSize": len(products),
        "facets": facets(products),
        "facetCounts": facet_counts(catalog, criteria),
        "priceMaxAgeDays": max_age,
        "pricesUpdated": prices_updated,
    })
