"""GET /products and GET /retailers: public catalog lookups for dropdowns and canonical ids.

Products added through an approved product request have a picture; they get a signed `imageUrl`.
Every product has `priceUpdatedAt`: when the nightly price job last updated its prices, or null if
it has never been priced.
"""

from common import db
from common.http import ApiError, api_handler, response
from common.images import with_image_url


@api_handler
def handler(event, context):
    resource = event.get("resource") or event.get("path")
    if resource == "/products":
        items = sorted(db.scan_all(db.products()), key=lambda p: p.get("name", ""))
        return response(200, {"items": [{"priceUpdatedAt": None, **with_image_url(p)} for p in items]})
    if resource == "/retailers":
        items = sorted(db.scan_all(db.retailers()), key=lambda r: r.get("name", ""))
        return response(200, {"items": items})
    raise ApiError(404, "NOT_FOUND", "Route not found.")
