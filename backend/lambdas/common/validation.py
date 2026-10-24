"""Request validation for image uploads and price submissions.

The frontend validates too, but anything from the client can be forged, so every rule is repeated here.
"""

import os
from datetime import datetime, time, timedelta, timezone

from common.http import ApiError

SGT = timezone(timedelta(hours=8))
IMAGE_EXTENSIONS = {"image/jpeg": "jpg", "image/png": "png"}
MAX_PRICE_CENTS = 100_000
MAX_OBSERVED_AGE_DAYS = 30
CLOCK_SKEW = timedelta(minutes=5)


def max_upload_bytes():
    return int(os.environ.get("MAX_UPLOAD_BYTES", 5 * 1024 * 1024))


def to_iso(dt):
    """UTC ISO 8601 with milliseconds and a Z suffix, matching existing seed data."""
    return dt.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _is_int(value):
    return isinstance(value, int) and not isinstance(value, bool)


def _fail(field_errors):
    raise ApiError(400, "VALIDATION_ERROR", "Some fields are invalid.", field_errors)


def validate_upload_request(body):
    errors = {}
    content_type = body.get("contentType")
    size = body.get("sizeBytes")
    if content_type not in IMAGE_EXTENSIONS:
        errors["contentType"] = "Must be image/jpeg or image/png"
    if not _is_int(size) or size <= 0:
        errors["sizeBytes"] = "Must be a positive whole number of bytes"
    elif size > max_upload_bytes():
        raise ApiError(400, "IMAGE_TOO_LARGE", "Image must be 5 MB or smaller.", {"photo": "Image must be 5 MB or smaller"})
    if errors:
        _fail(errors)
    return content_type, size


def parse_observed_at(value, now):
    """Accept a date (YYYY-MM-DD, read as midnight SGT) or an ISO datetime; naive datetimes are SGT."""
    if not isinstance(value, str) or not value.strip():
        raise ValueError("Choose the observed date")
    value = value.strip()
    try:
        if len(value) == 10:
            observed = datetime.combine(datetime.strptime(value, "%Y-%m-%d").date(), time(), SGT)
        else:
            observed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            if observed.tzinfo is None:
                observed = observed.replace(tzinfo=SGT)
    except ValueError:
        raise ValueError("Must be a date (YYYY-MM-DD) or ISO 8601 datetime")
    if observed > now + CLOCK_SKEW:
        raise ValueError("Observed date cannot be in the future")
    if observed < now - timedelta(days=MAX_OBSERVED_AGE_DAYS):
        raise ValueError(f"Observed date must be within the last {MAX_OBSERVED_AGE_DAYS} days")
    return observed


def validate_submission(body, now):
    """Return (productId, retailerId, priceCents, observedAt datetime, photoKey or None)."""
    errors = {}
    product_id = body.get("productId")
    retailer_id = body.get("retailerId")
    price_cents = body.get("priceCents")
    photo_key = body.get("photoKey")
    observed = None

    if not isinstance(product_id, str) or not product_id.strip():
        errors["productId"] = "Choose a product"
    if not isinstance(retailer_id, str) or not retailer_id.strip():
        errors["retailerId"] = "Choose a store"
    if not _is_int(price_cents) or price_cents <= 0:
        errors["priceCents"] = "Price must be a whole number of cents greater than 0"
    elif price_cents > MAX_PRICE_CENTS:
        errors["priceCents"] = "Price is too high"
    try:
        observed = parse_observed_at(body.get("observedAt"), now)
    except ValueError as error:
        errors["observedAt"] = str(error)
    if photo_key is not None and (not isinstance(photo_key, str) or not photo_key.strip()):
        errors["photoKey"] = "Must be the photoKey returned by the upload URL request"
    if errors:
        _fail(errors)
    return product_id.strip(), retailer_id.strip(), price_cents, observed, photo_key
