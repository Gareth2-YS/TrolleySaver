"""Images uploaded straight from the browser to the private photo bucket.

Two kinds live in the bucket:
  price-evidence/<userId>/<productId>/<uuid>.<ext>   shelf-tag photos proving a price (admins only)
  price-evidence/<userId>/new-product/<uuid>.<ext>   the same, for the first price of a product request
  product-images/pending/<userId>/<uuid>.<ext>       a product request's picture, until an admin decides
  product-images/<productId>.<ext>                    an approved product's picture, shown in the catalog
"""

import uuid
from datetime import datetime, timedelta, timezone

from botocore.exceptions import ClientError

from common import db
from common.http import ApiError
from common.validation import IMAGE_EXTENSIONS, max_upload_bytes, to_iso

UPLOAD_URL_TTL_SECONDS = 300
EVIDENCE_URL_TTL_SECONDS = 300
PRODUCT_IMAGE_URL_TTL_SECONDS = 3600
NEW_PRODUCT = "new-product"


def evidence_prefix(user_id, product_id):
    return f"price-evidence/{user_id}/{product_id}/"


def pending_product_image_prefix(user_id):
    return f"product-images/pending/{user_id}/"


def product_image_key(product_id, source_key):
    return f"product-images/{product_id}.{source_key.rsplit('.', 1)[-1]}"


def new_key(prefix, content_type):
    return f"{prefix}{uuid.uuid4()}.{IMAGE_EXTENSIONS[content_type]}"


def presigned_upload(key, content_type):
    """A one-time presigned POST for exactly this key, type and size limit (S3 enforces all three)."""
    presigned = db.s3().generate_presigned_post(
        Bucket=db.photo_bucket(),
        Key=key,
        Fields={"Content-Type": content_type},
        Conditions=[{"Content-Type": content_type}, ["content-length-range", 1, max_upload_bytes()]],
        ExpiresIn=UPLOAD_URL_TTL_SECONDS,
    )
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=UPLOAD_URL_TTL_SECONDS)
    return {
        "method": "POST",
        "uploadUrl": presigned["url"],
        "fields": presigned["fields"],
        "expiresAt": to_iso(expires_at),
        "maxSizeBytes": max_upload_bytes(),
    }


def check_upload(key, prefix, field):
    """Confirm the client uploaded `key` itself, under the folder it was given, as a valid image.

    Returns (content type, size in bytes).
    """
    if not isinstance(key, str) or not key.startswith(prefix):
        raise ApiError(400, "VALIDATION_ERROR", "Some fields are invalid.",
                       {field: f"Use the {field} returned by your upload URL request"})
    try:
        head = db.s3().head_object(Bucket=db.photo_bucket(), Key=key)
    except ClientError as error:
        if error.response.get("Error", {}).get("Code") in ("404", "NoSuchKey", "NotFound"):
            raise ApiError(400, "PHOTO_NOT_FOUND", "The image upload was not found. Upload the image again.",
                           {field: "Upload not found"})
        raise
    content_type, size = head.get("ContentType"), head.get("ContentLength", 0)
    if content_type not in IMAGE_EXTENSIONS or size > max_upload_bytes():
        raise ApiError(400, "INVALID_PHOTO", "The uploaded image must be a JPG or PNG of 5 MB or less.",
                       {field: "Invalid image"})
    return content_type, size


def signed_url(key, ttl_seconds):
    return db.s3().generate_presigned_url(
        "get_object", Params={"Bucket": db.photo_bucket(), "Key": key}, ExpiresIn=ttl_seconds,
    )


def with_image_url(product):
    """The product as the API shows it: products with a picture get a signed `imageUrl`, valid 1 hour."""
    if not product.get("imageKey"):
        return product
    return {**product, "imageUrl": signed_url(product["imageKey"], PRODUCT_IMAGE_URL_TTL_SECONDS)}


def delete_quietly(key):
    """Best-effort clean-up of an image nothing points to any more."""
    try:
        db.s3().delete_object(Bucket=db.photo_bucket(), Key=key)
    except ClientError:
        pass
