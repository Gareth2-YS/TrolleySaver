"""Shaping stored price-submission items into API records.

Evidence photos are only for admin verification: contributors see that a photo is attached
(photoKey and its type/size) but only admin views get a signed `photoUrl` to look at it.
"""

from common import db
from common.images import EVIDENCE_URL_TTL_SECONDS, signed_url

_HIDDEN = {"sk"}


def photo_url(photo_key):
    return signed_url(photo_key, EVIDENCE_URL_TTL_SECONDS)


def to_record(item, products=None, retailers=None, users=None, include_photo_url=False):
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
    if include_photo_url and item.get("photoKey"):
        record["photoUrl"] = photo_url(item["photoKey"])
    return record


def to_records(items, admin=False):
    """Hydrate product/retailer names in a few batch reads. Admin views also get the submitter's name
    and email and a signed link to the evidence photo."""
    if not items:
        return []
    products = db.batch_get(db.products(), "id", [i["productId"] for i in items], ["id", "name"])
    retailers = db.batch_get(db.retailers(), "id", [i["retailerId"] for i in items], ["id", "name"])
    users = None
    if admin:
        users = db.batch_get(db.users(), "userId", [i["userId"] for i in items], ["userId", "displayName", "email"])
    return [to_record(i, products, retailers, users, include_photo_url=admin) for i in items]
