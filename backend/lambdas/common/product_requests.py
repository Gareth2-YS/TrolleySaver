"""Validation and shaping for product requests: a contributor proposing a product the catalog doesn't have.

A request holds every product field, the product's first price (store, price, observed date), a required
product picture and an optional evidence photo. It stays `pending` until an admin approves it (the
product and its price are then created) or rejects it.
"""

import math
from decimal import Decimal, InvalidOperation

from common import db
from common.http import ApiError
from common.images import EVIDENCE_URL_TTL_SECONDS, PRODUCT_IMAGE_URL_TTL_SECONDS, signed_url
from common.validation import MAX_PRICE_CENTS, parse_observed_at

PACK_UNITS = {"ml": "ml", "l": "L", "g": "g", "kg": "kg", "pcs": "pcs", "rolls": "rolls"}
MAX_PACK_QTY = 100_000
MAX_PACK_COUNT = 100
MAX_DIETARY_TAGS = 5
MAX_SEARCH_TERMS = 10
MAX_TAG_LENGTH = 30
TEXT_LIMITS = {"name": (2, 120), "brand": (1, 60), "category": (1, 40)}
PRODUCT_FIELDS = ("name", "brand", "category", "packQty", "packUnit", "packCount", "hcs", "dietary")


def _fail(field_errors):
    raise ApiError(400, "VALIDATION_ERROR", "Some fields are invalid.", field_errors)


def _is_int(value):
    return isinstance(value, int) and not isinstance(value, bool)


def _text(value, field, errors):
    low, high = TEXT_LIMITS[field]
    if not isinstance(value, str) or not low <= len(value.strip()) <= high:
        errors[field] = f"Must be {low}–{high} characters"
        return None
    text = " ".join(value.split())
    return text.lower() if field == "category" else text


def _pack_qty(value, errors):
    if isinstance(value, bool) or not isinstance(value, (int, float, Decimal)):
        errors["packQty"] = "Must be a number"
        return None
    try:
        qty = Decimal(str(value))
    except InvalidOperation:
        errors["packQty"] = "Must be a number"
        return None
    if not 0 < qty <= MAX_PACK_QTY:
        errors["packQty"] = f"Must be more than 0 and at most {MAX_PACK_QTY}"
        return None
    qty = qty.quantize(Decimal("0.001")).normalize()
    return int(qty) if qty == qty.to_integral_value() else qty


def _tags(value, field, limit, errors):
    if not isinstance(value, list) or len(value) > limit:
        errors[field] = f"Must be a list of at most {limit} tags"
        return None
    tags = []
    for tag in value:
        if not isinstance(tag, str) or not 1 <= len(tag.strip()) <= MAX_TAG_LENGTH:
            errors[field] = f"Each tag must be 1–{MAX_TAG_LENGTH} characters"
            return None
        tags.append(tag.strip().lower())
    return list(dict.fromkeys(tags))


def validate_product_fields(body, partial=False):
    """Clean the product fields in `body`. With partial=True (an admin's corrections) only the fields
    present are checked and returned; otherwise every field is required."""
    errors, fields = {}, {}
    for field in PRODUCT_FIELDS:
        if field not in body:
            if not partial:
                errors[field] = "Required"
            continue
        value = body[field]
        if field in TEXT_LIMITS:
            cleaned = _text(value, field, errors)
        elif field == "packQty":
            cleaned = _pack_qty(value, errors)
        elif field == "packUnit":
            cleaned = PACK_UNITS.get(value.strip().lower()) if isinstance(value, str) else None
            if cleaned is None:
                errors[field] = "Must be one of " + ", ".join(PACK_UNITS.values())
        elif field == "packCount":
            cleaned = value if _is_int(value) and 1 <= value <= MAX_PACK_COUNT else None
            if cleaned is None:
                errors[field] = f"Must be a whole number from 1 to {MAX_PACK_COUNT}"
        elif field == "hcs":
            cleaned = value if isinstance(value, bool) else None
            if cleaned is None:
                errors[field] = "Must be true or false"
        else:  # dietary
            cleaned = _tags(value, field, MAX_DIETARY_TAGS, errors)
        if field not in errors:
            fields[field] = cleaned
    return fields, errors


def validate_request(body, now):
    """Every field of a new product request, cleaned. Image keys are checked against S3 by the handler."""
    fields, errors = validate_product_fields(body)
    retailer_id, price_cents = body.get("retailerId"), body.get("priceCents")
    if not isinstance(retailer_id, str) or not retailer_id.strip():
        errors["retailerId"] = "Choose a store"
    if not _is_int(price_cents) or price_cents <= 0:
        errors["priceCents"] = "Price must be a whole number of cents greater than 0"
    elif price_cents > MAX_PRICE_CENTS:
        errors["priceCents"] = "Price is too high"
    observed = None
    try:
        observed = parse_observed_at(body.get("observedAt"), now)
    except ValueError as error:
        errors["observedAt"] = str(error)
    image_key, photo_key = body.get("productImageKey"), body.get("photoKey")
    if not isinstance(image_key, str) or not image_key.strip():
        errors["productImageKey"] = "Upload a picture of the product"
    if photo_key is not None and (not isinstance(photo_key, str) or not photo_key.strip()):
        errors["photoKey"] = "Must be the photoKey returned by the upload URL request"
    if errors:
        _fail(errors)
    return {**fields, "retailerId": retailer_id.strip(), "priceCents": price_cents, "observed": observed,
            "productImageKey": image_key, "photoKey": photo_key}


def validate_approval_changes(changes, price_cents):
    """An admin's corrections when approving: any product field, plus the believable range and search terms.

    Returns (product field changes, minCents, maxCents, searchTerms)."""
    if changes is None:
        changes = {}
    if not isinstance(changes, dict):
        _fail({"changes": "Must be an object"})
    fields, errors = validate_product_fields(changes, partial=True)
    low_default, high_default = suggested_range(price_cents)
    low, high = changes.get("minCents", low_default), changes.get("maxCents", high_default)
    for name, value in (("minCents", low), ("maxCents", high)):
        if not _is_int(value) or not 1 <= value <= MAX_PRICE_CENTS:
            errors[name] = f"Must be a whole number of cents from 1 to {MAX_PRICE_CENTS}"
    if "minCents" not in errors and "maxCents" not in errors and low > high:
        errors["maxCents"] = "Must not be less than minCents"
    terms = []
    if "searchTerms" in changes:
        terms = _tags(changes["searchTerms"], "searchTerms", MAX_SEARCH_TERMS, errors)
    unknown = set(changes) - set(PRODUCT_FIELDS) - {"minCents", "maxCents", "searchTerms"}
    if unknown:
        errors["changes"] = "Unknown field: " + ", ".join(sorted(unknown))
    if errors:
        _fail(errors)
    return fields, low, high, terms


def suggested_range(price_cents):
    """Believable price range for a new product: half to one and a half times its first price
    (the convention the team's product spreadsheet uses)."""
    return max(1, price_cents // 2), min(MAX_PRICE_CENTS, math.ceil(price_cents * 3 / 2))


def duplicate_key(fields):
    """Same product = same name, brand and pack size (quantity, unit and units per pack), ignoring case
    and spacing, so a 6 x 1 L pack is a different product from a single 1 L. Products without a
    packCount (the oldest catalog entries) count as single packs."""
    qty = Decimal(str(fields["packQty"])).normalize()
    count = int(fields.get("packCount") or 1)
    return "|".join([
        " ".join(str(fields["name"]).split()).casefold(),
        " ".join(str(fields["brand"]).split()).casefold(),
        format(qty, "f"),
        str(fields["packUnit"]).casefold(),
        str(count),
    ])


def find_existing_product(fields):
    """The catalog product this request duplicates, if any (the catalog is small, so it's scanned)."""
    key = duplicate_key(fields)
    for product in db.scan_all(db.products()):
        if all(product.get(f) is not None for f in ("name", "brand", "packQty", "packUnit")) and duplicate_key(product) == key:
            return product
    return None


def to_record(item, retailers, users=None, admin=False):
    """A request as the API shows it. Contributors see their own product picture; only admins get the
    submitter's name and email and a link to the evidence photo."""
    record = {k: v for k, v in item.items() if k != "duplicateKey"}
    record["id"] = item["requestId"]
    record["retailerName"] = (retailers.get(item["retailerId"]) or {}).get("name")
    if item.get("productImageKey"):
        record["productImageUrl"] = signed_url(item["productImageKey"], PRODUCT_IMAGE_URL_TTL_SECONDS)
    if admin:
        submitter = (users or {}).get(item["userId"]) or {}
        record["submitterName"] = submitter.get("displayName")
        record["submitterEmail"] = submitter.get("email")
        if item.get("photoKey"):
            record["photoUrl"] = signed_url(item["photoKey"], EVIDENCE_URL_TTL_SECONDS)
        if item.get("status") == "pending":
            record["suggestedMinCents"], record["suggestedMaxCents"] = suggested_range(int(item["priceCents"]))
    return record


def to_records(items, admin=False):
    if not items:
        return []
    retailers = db.batch_get(db.retailers(), "id", [i["retailerId"] for i in items], ["id", "name"])
    users = None
    if admin:
        users = db.batch_get(db.users(), "userId", [i["userId"] for i in items], ["userId", "displayName", "email"])
    return [to_record(i, retailers, users, admin) for i in items]
