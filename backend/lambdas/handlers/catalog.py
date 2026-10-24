"""GET /products and GET /retailers: public catalog lookups for dropdowns and canonical ids."""

from common import db
from common.http import ApiError, api_handler, response


@api_handler
def handler(event, context):
    resource = event.get("resource") or event.get("path")
    if resource == "/products":
        items = sorted(db.scan_all(db.products()), key=lambda p: p.get("name", ""))
        return response(200, {"items": items})
    if resource == "/retailers":
        items = sorted(db.scan_all(db.retailers()), key=lambda r: r.get("name", ""))
        return response(200, {"items": items})
    raise ApiError(404, "NOT_FOUND", "Route not found.")
