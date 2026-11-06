from datetime import datetime, timedelta, timezone

import boto3
import pytest
from botocore.exceptions import ClientError

from conftest import ADMIN_ID, BUCKET, MILK_ID, OTHER_USER_ID, REGION, USER_ID, api_event, call, put_photo, sgt_today
from handlers import admin_product_requests, aggregate_prices, catalog, product_requests, search
from handlers import upload_url as price_upload_url

SGT = timezone(timedelta(hours=8))
IMAGE_KEY = f"product-images/pending/{USER_ID}/oat.png"


def today():
    return datetime.now(SGT).strftime("%Y-%m-%d")


def upload_url(body, user_id=USER_ID):
    return call(product_requests.handler, api_event("POST", "/product-requests/image-upload-url", body, user_id=user_id))


def create(body, user_id=USER_ID):
    return call(product_requests.handler, api_event("POST", "/product-requests", body, user_id=user_id))


def mine(user_id=USER_ID):
    return call(product_requests.handler, api_event("GET", "/product-requests/mine", user_id=user_id))


def delete_request(request_id, user_id=USER_ID):
    event = api_event("DELETE", "/product-requests/{id}", user_id=user_id, path_params={"id": request_id})
    return call(product_requests.handler, event)


def admin_list(status=None, groups="admin"):
    query = {"status": status} if status else None
    return call(admin_product_requests.handler, api_event("GET", "/admin/product-requests", user_id=ADMIN_ID, groups=groups, query=query))


def decide(request_id, body, groups="admin"):
    event = api_event("PATCH", "/admin/product-requests/{id}", body, user_id=ADMIN_ID, groups=groups, path_params={"id": request_id})
    return call(admin_product_requests.handler, event)


def valid_request(**overrides):
    body = {
        "name": "Oatside Barista  Oat Milk", "brand": "Oatside", "category": "Milk", "packQty": 1, "packUnit": "l",
        "packCount": 1, "hcs": True, "dietary": ["Vegan", "vegan"], "retailerId": "fairprice", "priceCents": 545,
        "observedAt": today(), "productImageKey": IMAGE_KEY,
    }
    body.update(overrides)
    return body


def object_exists(key):
    try:
        boto3.client("s3", region_name=REGION).head_object(Bucket=BUCKET, Key=key)
        return True
    except ClientError:
        return False


@pytest.fixture
def pending(aws):
    """One pending request from USER_ID, with its picture uploaded."""
    put_photo(IMAGE_KEY)
    status, record = create(valid_request())
    assert status == 201
    return record


# ---------- upload links ----------

def test_product_image_upload_link_goes_to_pending_folder(aws):
    status, body = upload_url({"purpose": "product-image", "contentType": "image/jpeg", "sizeBytes": 2048})
    assert status == 200
    assert body["productImageKey"].startswith(f"product-images/pending/{USER_ID}/") and body["productImageKey"].endswith(".jpg")
    assert body["fields"]["key"] == body["productImageKey"]


def test_evidence_upload_link_goes_to_new_product_folder(aws):
    status, body = upload_url({"purpose": "evidence", "contentType": "image/png", "sizeBytes": 2048})
    assert status == 200 and body["photoKey"].startswith(f"price-evidence/{USER_ID}/new-product/")


@pytest.mark.parametrize("payload, field", [
    ({"contentType": "image/png", "sizeBytes": 10}, "purpose"),
    ({"purpose": "logo", "contentType": "image/png", "sizeBytes": 10}, "purpose"),
    ({"purpose": "product-image", "contentType": "image/gif", "sizeBytes": 10}, "contentType"),
])
def test_upload_link_validation(aws, payload, field):
    status, error = upload_url(payload)
    assert status == 400 and field in error["fieldErrors"]


def test_upload_link_needs_login(aws):
    assert upload_url({"purpose": "product-image", "contentType": "image/png", "sizeBytes": 10}, user_id=None)[0] == 401


# ---------- creating a request ----------

def test_request_is_stored_pending_and_cleaned(aws, pending):
    assert pending["status"] == "pending" and pending["id"] == pending["requestId"]
    assert pending["name"] == "Oatside Barista Oat Milk"
    assert pending["category"] == "milk" and pending["packUnit"] == "L" and pending["dietary"] == ["vegan"]
    assert pending["userId"] == USER_ID and pending["retailerName"] == "FairPrice"
    assert pending["observedAt"].endswith("T16:00:00.000Z")
    assert pending["productImageUrl"].startswith("https://")
    assert "duplicateKey" not in pending and "photoUrl" not in pending and "submitterName" not in pending
    # Not in the catalog until an admin approves it.
    assert [p["id"] for p in call(catalog.handler, api_event("GET", "/products", user_id=None))[1]["items"]] == [MILK_ID]


def test_every_field_is_required(aws):
    status, error = create({})
    assert status == 400 and error["code"] == "VALIDATION_ERROR"
    assert set(error["fieldErrors"]) == {"name", "brand", "category", "packQty", "packUnit", "packCount", "hcs", "dietary",
                                         "retailerId", "priceCents", "observedAt", "productImageKey"}


def test_product_image_is_required(aws):
    body = valid_request()
    del body["productImageKey"]
    status, error = create(body)
    assert status == 400 and error["fieldErrors"] == {"productImageKey": "Upload a picture of the product"}


def test_product_image_from_another_users_folder_rejected(aws):
    key = f"product-images/pending/{OTHER_USER_ID}/oat.png"
    put_photo(key)
    status, error = create(valid_request(productImageKey=key))
    assert status == 400 and "productImageKey" in error["fieldErrors"]


def test_product_image_never_uploaded_rejected(aws):
    status, error = create(valid_request())
    assert status == 400 and error["code"] == "PHOTO_NOT_FOUND"


def test_product_image_must_be_an_image(aws):
    put_photo(IMAGE_KEY, content_type="application/pdf")
    status, error = create(valid_request())
    assert status == 400 and error["code"] == "INVALID_PHOTO"


@pytest.mark.parametrize("override, field", [
    ({"name": "x"}, "name"),
    ({"brand": ""}, "brand"),
    ({"category": "c" * 41}, "category"),
    ({"packQty": 0}, "packQty"),
    ({"packQty": "1"}, "packQty"),
    ({"packQty": True}, "packQty"),
    ({"packUnit": "litre"}, "packUnit"),
    ({"packCount": 0}, "packCount"),
    ({"packCount": 1.5}, "packCount"),
    ({"hcs": "yes"}, "hcs"),
    ({"dietary": "halal"}, "dietary"),
    ({"dietary": ["a", "b", "c", "d", "e", "f"]}, "dietary"),
    ({"priceCents": 5.45}, "priceCents"),
    ({"observedAt": "2099-01-01"}, "observedAt"),
    ({"photoKey": ""}, "photoKey"),
])
def test_field_rules(aws, override, field):
    put_photo(IMAGE_KEY)
    status, error = create(valid_request(**override))
    assert status == 400 and field in error["fieldErrors"]


def test_decimal_pack_size_and_empty_dietary_accepted(aws):
    put_photo(IMAGE_KEY)
    status, record = create(valid_request(packQty=32.5, packUnit="G", dietary=[]))
    assert status == 201 and record["packQty"] == 32.5 and record["packUnit"] == "g" and record["dietary"] == []


def test_unknown_store_rejected(aws):
    put_photo(IMAGE_KEY)
    status, error = create(valid_request(retailerId="giant"))
    assert status == 400 and error["fieldErrors"] == {"retailerId": "Unknown store"}


def test_optional_evidence_photo_is_checked_and_kept(aws):
    put_photo(IMAGE_KEY)
    evidence = f"price-evidence/{USER_ID}/new-product/shelf.png"
    put_photo(evidence)
    status, record = create(valid_request(photoKey=evidence))
    assert status == 201 and record["photoKey"] == evidence and "photoUrl" not in record


def test_evidence_photo_must_come_from_the_new_product_folder(aws):
    put_photo(IMAGE_KEY)
    evidence = f"price-evidence/{USER_ID}/{MILK_ID}/shelf.png"
    put_photo(evidence)
    status, error = create(valid_request(photoKey=evidence))
    assert status == 400 and "photoKey" in error["fieldErrors"]


def test_existing_catalog_product_is_refused_with_its_id(aws):
    put_photo(IMAGE_KEY)
    status, error = create(valid_request(name="magnolia  FRESH milk", brand="MAGNOLIA", packQty=946, packUnit="ML"))
    assert status == 409 and error["code"] == "PRODUCT_EXISTS" and error["productId"] == MILK_ID


def test_multipack_of_a_catalog_product_is_not_a_duplicate(aws):
    # The catalog milk has no packCount, so it counts as a single pack; a 6-pack is a different product.
    put_photo(IMAGE_KEY)
    status, record = create(valid_request(name="Magnolia Fresh Milk", brand="Magnolia", packQty=946, packUnit="ml", packCount=6))
    assert status == 201 and record["status"] == "pending"


def test_product_already_requested_by_someone_else(aws, pending):
    other_key = f"product-images/pending/{OTHER_USER_ID}/oat.png"
    put_photo(other_key)
    status, error = create(valid_request(productImageKey=other_key), user_id=OTHER_USER_ID)
    assert status == 409 and error["code"] == "PRODUCT_ALREADY_REQUESTED"


def test_multipack_of_a_pending_request_is_not_a_duplicate(aws, pending):
    other_key = f"product-images/pending/{OTHER_USER_ID}/oat.png"
    put_photo(other_key)
    status, record = create(valid_request(productImageKey=other_key, packCount=6), user_id=OTHER_USER_ID)
    assert status == 201 and record["packCount"] == 6


def test_pending_request_saved_with_an_old_style_key_still_counts_as_a_duplicate(aws, pending):
    # Requests saved before packCount joined the key have the old key stored; the check uses their fields.
    table = aws.Table("unit-product-request")
    table.update_item(Key={"requestId": pending["id"]}, UpdateExpression="SET duplicateKey = :old",
                      ExpressionAttributeValues={":old": "oatside barista oat milk|oatside|1|l"})
    other_key = f"product-images/pending/{OTHER_USER_ID}/oat.png"
    put_photo(other_key)
    status, error = create(valid_request(productImageKey=other_key), user_id=OTHER_USER_ID)
    assert status == 409 and error["code"] == "PRODUCT_ALREADY_REQUESTED"


def test_daily_limit(aws, monkeypatch):
    monkeypatch.setenv("PRODUCT_REQUESTS_PER_DAY", "1")
    put_photo(IMAGE_KEY)
    assert create(valid_request())[0] == 201
    status, error = create(valid_request(name="Another Oat Milk"))
    assert status == 429 and error["code"] == "RATE_LIMITED"


# ---------- listing ----------

def test_mine_lists_only_own_requests(aws, pending):
    other_key = f"product-images/pending/{OTHER_USER_ID}/rice.png"
    put_photo(other_key)
    assert create(valid_request(name="Some Rice", productImageKey=other_key), user_id=OTHER_USER_ID)[0] == 201
    status, body = mine()
    assert status == 200 and [r["id"] for r in body["items"]] == [pending["id"]]
    assert body["items"][0]["productImageUrl"].startswith("https://") and "photoUrl" not in body["items"][0]


@pytest.mark.parametrize("groups", [None, "user"])
def test_admin_routes_forbidden_for_non_admins(aws, groups):
    assert admin_list(groups=groups)[0] == 403
    assert decide("anything", {"decision": "approved"}, groups=groups)[0] == 403


def test_admin_queue_shows_submitter_evidence_and_suggested_range(aws):
    put_photo(IMAGE_KEY)
    evidence = f"price-evidence/{USER_ID}/new-product/shelf.png"
    put_photo(evidence)
    created = create(valid_request(photoKey=evidence))[1]
    status, body = admin_list()
    item = body["items"][0]
    assert status == 200 and item["id"] == created["id"]
    assert item["submitterName"] == "Alex Tan" and item["submitterEmail"] == "alex@example.com"
    assert item["photoUrl"].startswith("https://") and item["productImageUrl"].startswith("https://")
    assert (item["suggestedMinCents"], item["suggestedMaxCents"]) == (272, 818)
    assert admin_list(status="approved")[1]["items"] == []
    assert admin_list(status="flagged")[0] == 400


# ---------- approving and rejecting ----------

def test_approve_publishes_product_price_and_picture(aws, pending):
    status, record = decide(pending["id"], {"decision": "approved"})
    assert status == 200 and record["status"] == "approved" and record["reviewedBy"] == ADMIN_ID
    product_id = record["productId"]

    product = aws.Table("unit-product").get_item(Key={"id": product_id})["Item"]
    assert product["name"] == "Oatside Barista Oat Milk" and product["category"] == "milk" and product["hcs"] is True
    assert (product["minCents"], product["maxCents"]) == (272, 818)
    assert product["imageKey"] == f"product-images/{product_id}.png" and product["searchTerms"] == []
    assert object_exists(product["imageKey"]) and not object_exists(IMAGE_KEY)
    assert record["productImageKey"] == product["imageKey"]

    prices = aws.Table("unit-price-submission").query(
        KeyConditionExpression="productId = :p", ExpressionAttributeValues={":p": product_id})["Items"]
    assert len(prices) == 1
    price = prices[0]
    assert price["status"] == "accepted" and price["priceCents"] == 545 and price["userId"] == USER_ID
    assert price["submittedAt"] == pending["submittedAt"] and price["reviewedAt"] == record["reviewedAt"]
    assert price["productRequestId"] == pending["id"]
    assert aws.Table("unit-user").get_item(Key={"userId": USER_ID})["Item"]["submissionCount"] == 1

    catalog_items = call(catalog.handler, api_event("GET", "/products", user_id=None))[1]["items"]
    listed = next(p for p in catalog_items if p["id"] == product_id)
    assert listed["imageUrl"].startswith("https://")
    found = call(search.handler, api_event("GET", "/products/search", user_id=None, query={"q": "oatside"}))[1]["items"]
    assert [p["id"] for p in found] == [product_id] and found[0]["imageUrl"].startswith("https://")


def test_approved_price_reaches_the_daily_average_today(aws, pending):
    product_id = decide(pending["id"], {"decision": "approved"})[1]["productId"]
    aggregate_prices.handler({"date": sgt_today().isoformat()}, None)
    row = aws.Table("unit-retailer-price").get_item(Key={"productId": product_id, "retailerId": "fairprice"})["Item"]
    assert row["priceCents"] == 545 and row["priceDate"] == sgt_today().isoformat()


def test_approve_with_admin_corrections(aws, pending):
    changes = {"category": "Plant Milk", "hcs": False, "minCents": 300, "maxCents": 900, "searchTerms": ["Oat", "barista"]}
    status, record = decide(pending["id"], {"decision": "approved", "changes": changes})
    assert status == 200 and record["category"] == "plant milk"
    product = aws.Table("unit-product").get_item(Key={"id": record["productId"]})["Item"]
    assert product["category"] == "plant milk" and product["hcs"] is False
    assert (product["minCents"], product["maxCents"]) == (300, 900) and product["searchTerms"] == ["oat", "barista"]


@pytest.mark.parametrize("changes, field", [
    ({"minCents": 900, "maxCents": 300}, "maxCents"),
    ({"minCents": 0}, "minCents"),
    ({"packUnit": "litre"}, "packUnit"),
    ({"price": 1}, "changes"),
])
def test_invalid_corrections_rejected(aws, pending, changes, field):
    status, error = decide(pending["id"], {"decision": "approved", "changes": changes})
    assert status == 400 and field in error["fieldErrors"]
    assert aws.Table("unit-product").scan()["Count"] == 1  # still only the milk


def test_second_decision_is_409(aws, pending):
    assert decide(pending["id"], {"decision": "approved"})[0] == 200
    status, error = decide(pending["id"], {"decision": "rejected", "reason": "late"})
    assert status == 409 and error["code"] == "ALREADY_MODERATED"
    assert decide(pending["id"], {"decision": "approved"})[0] == 409
    assert aws.Table("unit-product").scan()["Count"] == 2


def test_simultaneous_approvals_publish_once(aws, pending, monkeypatch):
    """Two admins approve the same request at the same moment: both pass the early checks, and the
    second loses inside the transaction (its condition requires the request to still be pending)."""
    from common.auth import Caller
    from common.http import ApiError

    stale = aws.Table("unit-product-request").get_item(Key={"requestId": pending["id"]})["Item"]
    assert decide(pending["id"], {"decision": "approved"})[0] == 200
    # In a real race the second approval checks for duplicates and copies the picture before the first
    # one has saved anything or tidied up.
    monkeypatch.setattr(admin_product_requests, "find_existing_product", lambda fields: None)
    put_photo(IMAGE_KEY)
    with pytest.raises(ApiError) as raised:
        admin_product_requests.approve(stale, None, Caller(user_id="second-admin", groups=("admin",)), "2026-10-29T01:00:00.000Z")
    assert raised.value.status == 409 and raised.value.code == "ALREADY_MODERATED"
    assert aws.Table("unit-product").scan()["Count"] == 2  # the milk + one oat milk, not two
    published = boto3.client("s3", region_name=REGION).list_objects_v2(Bucket=BUCKET, Prefix="product-images/")["Contents"]
    assert [o["Key"] for o in published if not o["Key"].startswith("product-images/pending/")] == [
        aws.Table("unit-product-request").get_item(Key={"requestId": pending["id"]})["Item"]["productImageKey"]
    ]  # the losing approval's copied picture was removed


def test_late_second_approval_after_picture_moved_is_409(aws, pending, monkeypatch):
    """The second approval arrives after the first has already moved the picture: still a clean 409."""
    from common.auth import Caller
    from common.http import ApiError

    stale = aws.Table("unit-product-request").get_item(Key={"requestId": pending["id"]})["Item"]
    assert decide(pending["id"], {"decision": "approved"})[0] == 200
    monkeypatch.setattr(admin_product_requests, "find_existing_product", lambda fields: None)
    with pytest.raises(ApiError) as raised:
        admin_product_requests.approve(stale, None, Caller(user_id="second-admin", groups=("admin",)), "2026-10-29T01:00:00.000Z")
    assert raised.value.status == 409 and raised.value.code == "ALREADY_MODERATED"


def test_missing_picture_on_pending_request_is_409(aws, pending):
    boto3.client("s3", region_name=REGION).delete_object(Bucket=BUCKET, Key=IMAGE_KEY)
    status, error = decide(pending["id"], {"decision": "approved"})
    assert status == 409 and error["code"] == "PRODUCT_IMAGE_MISSING"
    assert aws.Table("unit-product").scan()["Count"] == 1


def test_reject_requires_reason_and_deletes_picture(aws, pending):
    status, error = decide(pending["id"], {"decision": "rejected"})
    assert status == 400 and "reason" in error["fieldErrors"]
    status, record = decide(pending["id"], {"decision": "rejected", "reason": "Not a grocery item"})
    assert status == 200 and record["status"] == "rejected" and record["rejectionReason"] == "Not a grocery item"
    assert not object_exists(IMAGE_KEY)
    assert aws.Table("unit-product").scan()["Count"] == 1
    assert mine()[1]["items"][0]["status"] == "rejected"


def test_approve_refused_if_product_was_added_meanwhile(aws, pending):
    aws.Table("unit-product").put_item(Item={"id": "added-by-hand", "name": "Oatside Barista Oat Milk", "brand": "Oatside",
                                             "packQty": 1, "packUnit": "L"})
    status, error = decide(pending["id"], {"decision": "approved"})
    assert status == 409 and error["code"] == "PRODUCT_EXISTS" and error["productId"] == "added-by-hand"
    assert admin_list()[1]["items"][0]["status"] == "pending"
    assert object_exists(IMAGE_KEY)


def test_request_whose_price_is_over_30_days_old_cannot_be_approved(aws, pending):
    """Approval publishes the first price as today's, so a stale one is refused; rejecting still works."""
    old = (datetime.now(SGT) - timedelta(days=31)).replace(hour=0, minute=0, second=0, microsecond=0)
    aws.Table("unit-product-request").update_item(
        Key={"requestId": pending["id"]}, UpdateExpression="SET observedAt = :old",
        ExpressionAttributeValues={":old": old.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")})
    status, error = decide(pending["id"], {"decision": "approved"})
    assert status == 409 and error["code"] == "OBSERVATION_TOO_OLD" and "more than 30 days ago" in error["message"]
    assert aws.Table("unit-product").scan()["Count"] == 1 and object_exists(IMAGE_KEY)
    assert admin_list()[1]["items"][0]["status"] == "pending"
    assert decide(pending["id"], {"decision": "rejected", "reason": "Price too old"})[0] == 200


def test_request_whose_price_is_exactly_30_days_old_can_still_be_approved(aws, pending):
    day = (datetime.now(SGT) - timedelta(days=30)).replace(hour=0, minute=0, second=0, microsecond=0)
    aws.Table("unit-product-request").update_item(
        Key={"requestId": pending["id"]}, UpdateExpression="SET observedAt = :day",
        ExpressionAttributeValues={":day": day.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")})
    assert decide(pending["id"], {"decision": "approved"})[0] == 200


def test_mine_rejects_a_page_token_from_another_list(aws, pending):
    from common import db

    token = db.encode_page_token({"productId": MILK_ID, "sk": "fairprice#x"})
    status, error = call(product_requests.handler, api_event("GET", "/product-requests/mine", query={"nextToken": token}))
    assert status == 400 and error["code"] == "INVALID_PAGE_TOKEN"
    status, error = call(admin_product_requests.handler, api_event(
        "GET", "/admin/product-requests", user_id=ADMIN_ID, groups="admin", query={"nextToken": token}))
    assert status == 400 and error["code"] == "INVALID_PAGE_TOKEN"


def test_unknown_request_and_bad_decision(aws, pending):
    assert decide("no-such-request", {"decision": "approved"})[0] == 404
    status, error = decide(pending["id"], {"decision": "accepted"})
    assert status == 400 and "decision" in error["fieldErrors"]


# ---------- deleting a request ----------

def test_owner_deletes_pending_request_and_its_images(aws):
    put_photo(IMAGE_KEY)
    evidence = f"price-evidence/{USER_ID}/new-product/shelf.png"
    put_photo(evidence)
    created = create(valid_request(photoKey=evidence))[1]
    assert delete_request(created["id"]) == (204, None)
    assert "Item" not in aws.Table("unit-product-request").get_item(Key={"requestId": created["id"]})
    assert not object_exists(IMAGE_KEY) and not object_exists(evidence)
    assert mine()[1]["items"] == [] and admin_list()[1]["items"] == []


def test_deleted_product_can_be_proposed_again(aws, pending):
    assert delete_request(pending["id"])[0] == 204
    put_photo(IMAGE_KEY)
    assert create(valid_request())[0] == 201


def test_cannot_delete_someone_elses_request(aws, pending):
    status, error = delete_request(pending["id"], user_id=OTHER_USER_ID)
    assert status == 404 and error["code"] == "NOT_FOUND"
    assert "Item" in aws.Table("unit-product-request").get_item(Key={"requestId": pending["id"]})
    assert object_exists(IMAGE_KEY)


def test_delete_unknown_request_is_404(aws):
    assert delete_request("no-such-request")[0] == 404


def test_delete_needs_login(aws, pending):
    assert delete_request(pending["id"], user_id=None)[0] == 401


@pytest.mark.parametrize("decision", [{"decision": "approved"}, {"decision": "rejected", "reason": "Not a grocery item"}])
def test_decided_request_cannot_be_deleted(aws, pending, decision):
    decided = decide(pending["id"], decision)[1]
    status, error = delete_request(pending["id"])
    assert status == 409 and error["code"] == "ALREADY_MODERATED" and decision["decision"] in error["message"]
    assert aws.Table("unit-product-request").get_item(Key={"requestId": pending["id"]})["Item"]["status"] == decision["decision"]
    if decision["decision"] == "approved":
        assert object_exists(decided["productImageKey"])


def test_admin_deciding_a_deleted_request_gets_404(aws, pending):
    assert delete_request(pending["id"])[0] == 204
    assert decide(pending["id"], {"decision": "approved"})[0] == 404
    assert decide(pending["id"], {"decision": "rejected", "reason": "late"})[0] == 404


def test_approval_racing_a_delete_publishes_nothing(aws, pending):
    """The admin loaded the request just before its owner deleted it."""
    from common.auth import Caller
    from common.http import ApiError

    stale = aws.Table("unit-product-request").get_item(Key={"requestId": pending["id"]})["Item"]
    assert delete_request(pending["id"])[0] == 204
    with pytest.raises(ApiError) as raised:
        admin_product_requests.approve(stale, None, Caller(user_id=ADMIN_ID, groups=("admin",)), "2026-10-30T01:00:00.000Z")
    assert raised.value.status == 404
    assert aws.Table("unit-product").scan()["Count"] == 1  # still only the milk


def test_delete_racing_an_approval_is_409(aws, pending, monkeypatch):
    """The owner loaded the request just before an admin approved it: the conditional delete refuses."""
    stale = aws.Table("unit-product-request").get_item(Key={"requestId": pending["id"]})["Item"]
    assert decide(pending["id"], {"decision": "approved"})[0] == 200
    real_load = product_requests._load_own
    loads = iter([lambda request_id, caller: stale])
    monkeypatch.setattr(product_requests, "_load_own", lambda request_id, caller: next(loads, real_load)(request_id, caller))
    status, error = delete_request(pending["id"])
    assert status == 409 and error["message"] == "This product request is already approved."
    assert aws.Table("unit-product-request").get_item(Key={"requestId": pending["id"]})["Item"]["status"] == "approved"


# ---------- hardening: file contents, hidden characters, look-alikes, shared upload allowance ----------

def test_a_product_picture_that_isnt_really_an_image_is_refused_and_deleted(aws):
    put_photo(IMAGE_KEY, body=b"<svg onload=alert(1)></svg>")
    status, error = create(valid_request())
    assert status == 400 and error["code"] == "INVALID_PHOTO" and "productImageKey" in error["fieldErrors"]
    assert not object_exists(IMAGE_KEY)


@pytest.mark.parametrize("override, field", [
    ({"name": "Oat​Milk Barista"}, "name"),        # zero-width space
    ({"name": "Oat Milk ‮atsirab"}, "name"),      # right-to-left override
    ({"brand": "Oat\x00side"}, "brand"),               # NUL
    ({"category": "milk⁦"}, "category"),          # bidi isolate
    ({"dietary": ["vegan﻿"]}, "dietary"),         # byte-order mark
])
def test_hidden_characters_are_refused(aws, override, field):
    put_photo(IMAGE_KEY)
    status, error = create(valid_request(**override))
    assert status == 400 and error["fieldErrors"][field] == "Must not contain hidden or control characters"


def test_text_is_stored_in_one_unicode_form(aws):
    put_photo(IMAGE_KEY)
    status, record = create(valid_request(name="Café Latte"))  # "e" followed by a combining accent
    assert status == 201 and record["name"] == "Café Latte"


@pytest.mark.parametrize("name", ["Ｍagnolia Fresh Milk", "Magno‍lia Fresh Milk", "MAGNOLIA  fresh milk"])
def test_look_alike_names_are_still_duplicates_of_the_catalog(aws, name):
    put_photo(IMAGE_KEY)
    status, error = create(valid_request(name=name, brand="Magnolia", packQty=946, packUnit="ml"))
    assert status == 409 and error["code"] == "PRODUCT_EXISTS" and error["productId"] == MILK_ID


def test_admin_search_terms_with_hidden_characters_are_refused(aws, pending):
    status, error = decide(pending["id"], {"decision": "approved", "changes": {"searchTerms": ["oat", "barista​"]}})
    assert status == 400 and error["fieldErrors"]["searchTerms"] == "Must not contain hidden or control characters"


def test_rejection_reason_with_hidden_characters_is_refused(aws, pending):
    status, error = decide(pending["id"], {"decision": "rejected", "reason": "Blurry ‮photo"})
    assert status == 400 and error["fieldErrors"]["reason"] == "Must not contain hidden or control characters"


def test_rejection_reason_keeps_its_line_breaks(aws, pending):
    status, record = decide(pending["id"], {"decision": "rejected", "reason": "  Blurry photo.\nPlease retake it.  "})
    assert status == 200 and record["rejectionReason"] == "Blurry photo.\nPlease retake it."


def test_product_and_price_photo_upload_links_share_one_hourly_allowance(aws, monkeypatch):
    monkeypatch.setenv("UPLOAD_LINKS_PER_HOUR", "2")
    picture = {"purpose": "product-image", "contentType": "image/png", "sizeBytes": 2048}
    assert upload_url(picture)[0] == 200
    price_photo = {"productId": MILK_ID, "retailerId": "fairprice", "contentType": "image/png", "sizeBytes": 2048}
    assert call(price_upload_url.handler, api_event("POST", "/price-submissions/image-upload-url", price_photo))[0] == 200
    status, error = upload_url({**picture, "purpose": "evidence"})
    assert status == 429 and error["code"] == "UPLOAD_RATE_LIMITED"
