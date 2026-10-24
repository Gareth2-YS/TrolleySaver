from datetime import datetime, timedelta, timezone

import pytest

from conftest import ADMIN_ID, MILK_ID, OTHER_USER_ID, USER_ID, api_event, call
from handlers import admin_submissions, catalog, create_submission, my_submissions

SGT = timezone(timedelta(hours=8))


def submit(price, user_id=USER_ID, retailer="fairprice"):
    body = {"productId": MILK_ID, "retailerId": retailer, "priceCents": price, "observedAt": datetime.now(SGT).strftime("%Y-%m-%d")}
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
    status, body = call(catalog.handler, api_event("GET", "/retailers", user_id=None))
    assert status == 200 and [r["id"] for r in body["items"]] == ["coldstorage", "fairprice", "shengsiong"]
