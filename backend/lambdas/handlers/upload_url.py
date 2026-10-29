"""POST /price-submissions/image-upload-url: a short-lived presigned POST for one shelf-tag photo.

The photo is evidence for a price of one existing product at one existing store, so both must be named
and must exist before an upload link is handed out. The product id is part of the photo's key, and
POST /price-submissions only accepts the photo for that same product.

A presigned POST (rather than PUT) lets S3 itself enforce the content type and size limit.
"""

from common import db
from common.auth import get_caller
from common.http import api_handler, parse_json_body, response
from common.images import evidence_prefix, new_key, presigned_upload
from common.validation import validate_evidence_upload_request


@api_handler
def handler(event, context):
    caller = get_caller(event)
    product_id, retailer_id, content_type, _ = validate_evidence_upload_request(parse_json_body(event))
    db.require_item(db.products(), {"id": product_id}, "productId", "Unknown product")
    db.require_item(db.retailers(), {"id": retailer_id}, "retailerId", "Unknown store")
    photo_key = new_key(evidence_prefix(caller.user_id, product_id), content_type)
    return response(200, {**presigned_upload(photo_key, content_type), "photoKey": photo_key})
