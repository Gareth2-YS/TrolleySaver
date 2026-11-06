"""Images uploaded straight from the browser to the private photo bucket.

Two kinds live in the bucket:
  price-evidence/<userId>/<productId>/<uuid>.<ext>   shelf-tag photos proving a price (admins only)
  price-evidence/<userId>/new-product/<uuid>.<ext>   the same, for the first price of a product request
  product-images/pending/<userId>/<uuid>.<ext>       a product request's picture, until an admin decides
  product-images/<productId>.<ext>                    an approved product's picture, shown in the catalog
"""

import os
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
# The first bytes of every file of each type. S3 only checks the declared Content-Type, so these prove
# the upload really is that kind of image.
IMAGE_SIGNATURES = {"image/jpeg": b"\xff\xd8\xff", "image/png": b"\x89PNG\r\n\x1a\n"}


def _upload_link_limit():
    return int(os.environ.get("UPLOAD_LINKS_PER_HOUR", 60))


def _condition_failed(error):
    return error.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException"


def reserve_upload_link(user_id):
    """Count one upload link against the caller's allowance for this clock hour (UTC), or refuse it.

    Each link lets its holder put up to 5 MB in the bucket, used or not, so without a limit anyone
    could fill it. The count lives on the user's row: uploadWindow (the hour) and uploadCount."""
    window = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H")
    limit = _upload_link_limit()
    # Two tries: if another request starts the new hour between our two updates, the first update
    # succeeds on the second try.
    for _ in range(2):
        try:
            db.users().update_item(
                Key={"userId": user_id},
                UpdateExpression="ADD uploadCount :one",
                ConditionExpression="uploadWindow = :window AND uploadCount < :limit",
                ExpressionAttributeValues={":one": 1, ":window": window, ":limit": limit},
            )
            return
        except ClientError as error:
            if not _condition_failed(error):
                raise
        try:
            db.users().update_item(
                Key={"userId": user_id},
                UpdateExpression="SET uploadWindow = :window, uploadCount = :one",
                ConditionExpression="attribute_not_exists(uploadWindow) OR uploadWindow <> :window",
                ExpressionAttributeValues={":one": 1, ":window": window},
            )
            return
        except ClientError as error:
            if not _condition_failed(error):
                raise
    raise ApiError(429, "UPLOAD_RATE_LIMITED",
                   "You have requested too many photo uploads in the last hour. Please try again later.")


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
    """Confirm the client uploaded `key` itself, under the folder it was given, as a valid image: a
    JPG or PNG of at most 5 MB whose bytes match its declared type. A file that isn't is deleted.

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
    start = db.s3().get_object(Bucket=db.photo_bucket(), Key=key, Range="bytes=0-15")["Body"].read()
    if not start.startswith(IMAGE_SIGNATURES[content_type]):
        delete_quietly(key)
        raise ApiError(400, "INVALID_PHOTO", "The uploaded file isn't a JPG or PNG image.",
                       {field: "Not a JPG or PNG image"})
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
