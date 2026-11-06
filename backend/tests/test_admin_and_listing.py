from datetime import datetime, timedelta, timezone

import pytest

from conftest import ADMIN_ID, MILK_ID, OTHER_USER_ID, USER_ID, api_event, call, put_photo
from handlers import admin_submissions, catalog, create_submission, my_submissions

SGT = timezone(timedelta(hours=8))


def submit(price, user_id=USER_ID, retailer="fairprice", photo_key=None):
    body = {"productId": MILK_ID, "retailerId": retailer, "priceCents": price, "observedAt": datetime.now(SGT).strftime("%Y-%m-%d")}
    if photo_key:
        body["photoKey"] = photo_key
    status, record = call(create_submission.handler, api_event("POST", "/price-submissions", body, user_id=user_id))
    assert status == 201
    return record


def admin_list(status=None, groups="admin", user_id=ADMIN_ID):
    query = {"status": status} if status else None
    return call(admin_submissions.handler, api_event("GET", "/admin/price-submissions", user_id=user_id, groups=groups, query=query))


def moderate(submission_id, body, groups="admin"):
    event = api_event("PATCH", "/admin/price-submissions/{id}", body, user_id=ADMIN_ID, groups=groups, path_params={"id": submission_id})
    return call(admin_submissions.handler, event)


def test_my_submissions_only_returns_callers_newest_first(aws):
    first = submit(300)
    second = submit(310)
    submit(320, user_id=OTHER_USER_ID)
    status, body = call(my_submissions.handler, api_event("GET", "/price-submissions/mine"))
    assert status == 200
    assert [i["id"] for i in body["items"]] == [second["id"], first["id"]]
    assert all(i["userId"] == USER_ID for i in body["items"])
    assert body["items"][0]["productName"] == "Magnolia Fresh Milk"


def test_my_submissions_pagination(aws):
    for price in (300, 301, 302):
        submit(price)
    status, page1 = call(my_submissions.handler, api_event("GET", "/price-submissions/mine", query={"limit": "2"}))
    assert status == 200 and len(page1["items"]) == 2 and page1["nextToken"]
    status, page2 = call(my_submissions.handler, api_event("GET", "/price-submissions/mine", query={"limit": "2", "nextToken": page1["nextToken"]}))
    assert status == 200 and len(page2["items"]) == 1 and page2["nextToken"] is None


@pytest.mark.parametrize("start_key", [{"foo": "bar"}, {"productId": MILK_ID}])
def test_page_token_that_does_not_fit_the_query_is_400(aws, start_key):
    """A token that decodes but isn't a start key for this list (edited by hand, or from another list)."""
    from common import db

    submit(300)
    token = db.encode_page_token(start_key)
    for handler, resource, groups in ((my_submissions.handler, "/price-submissions/mine", None),
                                      (admin_submissions.handler, "/admin/price-submissions", "admin")):
        status, error = call(handler, api_event("GET", resource, groups=groups, query={"nextToken": token}))
        assert status == 400 and error["code"] == "INVALID_PAGE_TOKEN", (resource, status, error)


def test_garbage_page_token_is_400(aws):
    status, error = call(my_submissions.handler, api_event("GET", "/price-submissions/mine", query={"nextToken": "not-a-token"}))
    assert status == 400 and error["code"] == "INVALID_PAGE_TOKEN"


def test_start_key_dynamodb_refuses_is_400():
    """Real DynamoDB refuses a well-formed start key from another partition (e.g. another user's list)
    with a ValidationException; moto can't reproduce that, so a stand-in table raises it."""
    from botocore.exceptions import ClientError

    from common import db
    from common.http import ApiError

    class RefusingTable:
        def query(self, **kwargs):
            raise ClientError({"Error": {"Code": "ValidationException", "Message": "The provided starting key is invalid"}}, "Query")

    keys = ("productId", "sk", "userId", "submittedAt")
    token = db.encode_page_token({name: "x" for name in keys})
    with pytest.raises(ApiError) as raised:
        db.query_page(RefusingTable(), {}, token, keys)
    assert raised.value.status == 400 and raised.value.code == "INVALID_PAGE_TOKEN"
    with pytest.raises(ClientError):  # without a token it's a genuine failure, not the client's fault
        db.query_page(RefusingTable(), {}, None, keys)


@pytest.mark.parametrize("groups", [None, "user"])
def test_admin_routes_forbidden_for_non_admins(aws, groups):
    assert admin_list(groups=groups)[0] == 403
    assert moderate("whatever", {"decision": "accepted"}, groups=groups)[0] == 403


def test_groups_claim_formats(aws):
    assert admin_list(groups="[user admin]")[0] == 200
    assert admin_list(groups=["admin"])[0] == 200


def test_queue_lists_only_flagged_with_submitter(aws):
    submit(363)
    flagged = submit(9999)
    status, body = admin_list()
    assert status == 200
    assert [i["id"] for i in body["items"]] == [flagged["id"]]
    assert body["items"][0]["submitterName"] == "Alex Tan"
    assert body["items"][0]["submitterEmail"] == "alex@example.com"


def test_evidence_photo_link_only_for_admins(aws):
    key = f"price-evidence/{USER_ID}/{MILK_ID}/shelf.png"
    put_photo(key)
    flagged = submit(9999, photo_key=key)

    status, mine = call(my_submissions.handler, api_event("GET", "/price-submissions/mine"))
    assert status == 200
    assert mine["items"][0]["photoKey"] == key  # the contributor can see a photo is attached...
    assert "photoUrl" not in mine["items"][0]   # ...but gets no link to view it

    status, queue = admin_list()
    assert status == 200 and queue["items"][0]["id"] == flagged["id"]
    assert queue["items"][0]["photoUrl"].startswith("https://")

    status, decided = moderate(flagged["id"], {"decision": "accepted"})
    assert status == 200 and decided["photoUrl"].startswith("https://")


def test_accept_flagged_then_conflict(aws):
    flagged = submit(9999)
    status, record = moderate(flagged["id"], {"decision": "accepted"})
    assert status == 200
    assert record["status"] == "accepted"
    assert record["reviewedBy"] == ADMIN_ID
    assert record["reviewedAt"]
    assert admin_list()[1]["items"] == []
    status, error = moderate(flagged["id"], {"decision": "rejected", "reason": "late"})
    assert status == 409 and error["code"] == "ALREADY_MODERATED"


def test_reject_requires_reason(aws):
    flagged = submit(9999)
    status, error = moderate(flagged["id"], {"decision": "rejected"})
    assert status == 400 and "reason" in error["fieldErrors"]
    status, record = moderate(flagged["id"], {"decision": "rejected", "reason": "Shelf label unreadable"})
    assert status == 200
    assert record["status"] == "rejected" and record["rejectionReason"] == "Shelf label unreadable"


def test_cannot_moderate_accepted_submission(aws):
    accepted = submit(363)
    status, error = moderate(accepted["id"], {"decision": "rejected", "reason": "no"})
    assert status == 409


def test_unknown_or_garbage_id_is_404(aws):
    from common.db import encode_submission_id
    assert moderate(encode_submission_id(MILK_ID, "fairprice#nope"), {"decision": "accepted"})[0] == 404
    assert moderate("!!!", {"decision": "accepted"})[0] == 404


def test_invalid_decision_and_status(aws):
    flagged = submit(9999)
    assert moderate(flagged["id"], {"decision": "approved"})[0] == 400
    assert admin_list(status="pending")[0] == 400


def test_catalog_routes(aws):
    status, body = call(catalog.handler, api_event("GET", "/products", user_id=None))
    assert status == 200 and body["items"][0]["id"] == MILK_ID and body["items"][0]["minCents"] == 181
    assert "imageUrl" not in body["items"][0]  # catalog products without a picture keep their category icon
    status, body = call(catalog.handler, api_event("GET", "/retailers", user_id=None))
    assert status == 200 and [r["id"] for r in body["items"]] == ["coldstorage", "fairprice", "shengsiong"]


def test_catalog_returns_price_updated_at_on_every_product(aws):
    aws.Table("unit-product").put_item(Item={"id": "p-2", "name": "Bread", "priceUpdatedAt": "2026-11-03T16:05:00.120Z"})
    status, body = call(catalog.handler, api_event("GET", "/products", user_id=None))
    by_id = {p["id"]: p for p in body["items"]}
    assert status == 200
    assert by_id["p-2"]["priceUpdatedAt"] == "2026-11-03T16:05:00.120Z"
    assert by_id[MILK_ID]["priceUpdatedAt"] is None  # never priced: present, but null


def test_catalog_signs_product_pictures(aws):
    aws.Table("unit-product").put_item(Item={"id": "p-1", "name": "Aardvark Oats", "imageKey": "product-images/p-1.png"})
    status, body = call(catalog.handler, api_event("GET", "/products", user_id=None))
    picture = next(p for p in body["items"] if p["id"] == "p-1")
    assert status == 200
    assert "product-images/p-1.png" in picture["imageUrl"] and "X-Amz-Expires=3600" in picture["imageUrl"]


def test_rejection_reason_with_hidden_characters_is_refused(aws):
    flagged = submit(9999)
    status, error = moderate(flagged["id"], {"decision": "rejected", "reason": "Label​ unreadable"})
    assert status == 400 and error["fieldErrors"]["reason"] == "Must not contain hidden or control characters"
    status, record = moderate(flagged["id"], {"decision": "rejected", "reason": "Label unreadable.\nPlease retake."})
    assert status == 200 and record["rejectionReason"] == "Label unreadable.\nPlease retake."
