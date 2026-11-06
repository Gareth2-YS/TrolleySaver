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
MAX_BASKET_LINES = 50
MAX_QUANTITY = 99
MAX_SEARCH_LENGTH = 100


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


def validate_evidence_upload_request(body):
    """Return (productId, retailerId, contentType, sizeBytes) for an evidence-photo upload link."""
    errors = {}
    product_id, retailer_id = body.get("productId"), body.get("retailerId")
    if not isinstance(product_id, str) or not product_id.strip():
        errors["productId"] = "Choose a product"
    if not isinstance(retailer_id, str) or not retailer_id.strip():
        errors["retailerId"] = "Choose a store"
    content_type = size = None
    try:
        content_type, size = validate_upload_request(body)
    except ApiError as error:
        if error.code != "VALIDATION_ERROR":
            raise
        errors.update(error.field_errors)
    if errors:
        _fail(errors)
    return product_id.strip(), retailer_id.strip(), content_type, size


def observed_too_old(observed, now):
    """True when a price was seen before the oldest allowed Singapore calendar day: today (SGT)
    minus MAX_OBSERVED_AGE_DAYS. The frontend's date picker uses the same day, so its earliest
    date is always accepted."""
    earliest = now.astimezone(SGT).date() - timedelta(days=MAX_OBSERVED_AGE_DAYS)
    return observed.astimezone(SGT).date() < earliest


def parse_observed_at(value, now):
    """Accept a date (YYYY-MM-DD, read as midnight SGT) or an ISO datetime; naive datetimes are SGT.

    A date is checked by Singapore calendar day, a datetime to the moment."""
    if not isinstance(value, str) or not value.strip():
        raise ValueError("Choose the observed date")
    value = value.strip()
    date_only = len(value) == 10
    try:
        if date_only:
            observed = datetime.combine(datetime.strptime(value, "%Y-%m-%d").date(), time(), SGT)
        else:
            observed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            if observed.tzinfo is None:
                observed = observed.replace(tzinfo=SGT)
    except ValueError:
        raise ValueError("Must be a date (YYYY-MM-DD) or ISO 8601 datetime")
    if observed > now + CLOCK_SKEW:
        raise ValueError("Observed date cannot be in the future")
    too_old = observed_too_old(observed, now) if date_only else observed < now - timedelta(days=MAX_OBSERVED_AGE_DAYS)
    if too_old:
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


def validate_basket(body, product_ids, retailer_ids):
    """Return ([{productId, quantity}] with repeated products merged, [retailerId in catalog order])."""
    items = body.get("items")
    if not isinstance(items, list) or not items:
        _fail({"items": "Add at least one product"})
    if len(items) > MAX_BASKET_LINES:
        _fail({"items": f"A basket can hold at most {MAX_BASKET_LINES} products"})

    errors = {}
    merged = {}
    for i, item in enumerate(items):
        if not isinstance(item, dict):
            errors[f"items[{i}]"] = "Must be an object with productId and quantity"
            continue
        product_id, quantity = item.get("productId"), item.get("quantity")
        valid = True
        if not isinstance(product_id, str) or product_id not in product_ids:
            errors[f"items[{i}].productId"] = "Unknown product"
            valid = False
        if not _is_int(quantity) or not 1 <= quantity <= MAX_QUANTITY:
            errors[f"items[{i}].quantity"] = f"Must be a whole number from 1 to {MAX_QUANTITY}"
            valid = False
        if valid:
            merged[product_id] = merged.get(product_id, 0) + quantity
            if merged[product_id] > MAX_QUANTITY:
                errors[f"items[{i}].quantity"] = f"Total quantity of one product can be at most {MAX_QUANTITY}"

    requested = body.get("retailerIds")
    chosen = list(retailer_ids)
    if requested is not None:
        if not isinstance(requested, list) or not requested:
            errors["retailerIds"] = "Choose at least one store, or leave this out to compare every store"
        else:
            unknown = [r for r in requested if r not in retailer_ids]
            if unknown:
                errors["retailerIds"] = "Unknown store: " + ", ".join(str(r) for r in unknown)
            chosen = [r for r in retailer_ids if r in requested]
    if errors:
        _fail(errors)
    return [{"productId": pid, "quantity": quantity} for pid, quantity in merged.items()], chosen


def _optional_text(params, name):
    value = (params.get(name) or "").strip()
    return value.casefold() or None


def _optional_cents(params, name, errors):
    raw = (params.get(name) or "").strip()
    if not raw:
        return None
    if not raw.isdigit():
        errors[name] = "Must be a whole number of cents, 0 or more"
        return None
    return int(raw)


def validate_search(params):
    """Return the search criteria from GET /products/search query parameters (all optional)."""
    errors = {}
    q = (params.get("q") or "").strip()
    if len(q) > MAX_SEARCH_LENGTH:
        errors["q"] = f"Keep the search under {MAX_SEARCH_LENGTH} characters"

    hcs = (params.get("hcs") or "").strip().lower()
    if hcs not in ("", "true", "false"):
        errors["hcs"] = "Must be true or false"

    low = _optional_cents(params, "minPriceCents", errors)
    high = _optional_cents(params, "maxPriceCents", errors)
    if low is not None and high is not None and low > high:
        errors["maxPriceCents"] = "Maximum price must not be less than the minimum price"
    if errors:
        _fail(errors)
    return {
        "words": q.casefold().split(),
        "category": _optional_text(params, "category"),
        "brand": _optional_text(params, "brand"),
        "dietary": _optional_text(params, "dietary"),
        "hcs": {"true": True, "false": False}.get(hcs),
        "minPriceCents": low,
        "maxPriceCents": high,
    }
