"""Shaping stored price-submission items into API records."""

from common import db

PHOTO_URL_TTL_SECONDS = 300
_HIDDEN = {"sk"}


def photo_url(photo_key):
    return db.s3().generate_presigned_url(
        "get_object",
        Params={"Bucket": db.photo_bucket(), "Key": photo_key},
        ExpiresIn=PHOTO_URL_TTL_SECONDS,
    )


def to_record(item, products=None, retailers=None, users=None):
    record = {k: v for k, v in item.items() if k not in _HIDDEN}
    record["id"] = db.encode_submission_id(item["productId"], item["sk"])
    if products is not None:
        record["productName"] = (products.get(item["productId"]) or {}).get("name")
    if retailers is not None:
        record["retailerName"] = (retailers.get(item["retailerId"]) or {}).get("name")
    if users is not None:
        submitter = users.get(item["userId"]) or {}
        record["submitterName"] = submitter.get("displayName")
        record["submitterEmail"] = submitter.get("email")
    if item.get("photoKey"):
        record["photoUrl"] = photo_url(item["photoKey"])
    return record


def to_records(items, include_submitter=False):
    """Hydrate product/retailer names (and submitter names for admins) in a few batch reads."""
    if not items:
        return []
    products = db.batch_get(db.products(), "id", [i["productId"] for i in items], ["id", "name"])
    retailers = db.batch_get(db.retailers(), "id", [i["retailerId"] for i in items], ["id", "name"])
    users = None
    if include_submitter:
        users = db.batch_get(db.users(), "userId", [i["userId"] for i in items], ["userId", "displayName", "email"])
    return [to_record(i, products, retailers, users) for i in items]
