from datetime import datetime, timedelta, timezone

import boto3
from botocore.exceptions import ClientError

from conftest import ADMIN_ID, BUCKET, MILK_ID, OTHER_USER_ID, REGION, USER_ID, api_event, call, put_photo
from handlers import admin_submissions, create_submission, delete_submission, my_submissions

SGT = timezone(timedelta(hours=8))
PHOTO = f"price-evidence/{USER_ID}/{MILK_ID}/shelf.png"


def submit(price, photo_key=None, retailer="fairprice"):
    body = {"productId": MILK_ID, "retailerId": retailer, "priceCents": price, "observedAt": datetime.now(SGT).strftime("%Y-%m-%d")}
    if photo_key:
        body["photoKey"] = photo_key
    status, record = call(create_submission.handler, api_event("POST", "/price-submissions", body))
    assert status == 201
    return record


def delete(submission_id, user_id=USER_ID):
    event = api_event("DELETE", "/price-submissions/{id}", user_id=user_id, path_params={"id": submission_id})
    return call(delete_submission.handler, event)


def moderate(submission_id, body):
    event = api_event("PATCH", "/admin/price-submissions/{id}", body, user_id=ADMIN_ID, groups="admin", path_params={"id": submission_id})
    return call(admin_submissions.handler, event)


def mine():
    return call(my_submissions.handler, api_event("GET", "/price-submissions/mine"))[1]["items"]


def photo_exists(key):
    try:
        boto3.client("s3", region_name=REGION).head_object(Bucket=BUCKET, Key=key)
        return True
    except ClientError:
        return False


def submission_count(aws):
    return aws.Table("unit-user").get_item(Key={"userId": USER_ID})["Item"]["submissionCount"]


def test_owner_deletes_a_pending_price_with_its_photo(aws):
    put_photo(PHOTO)
    flagged = submit(9999, photo_key=PHOTO)
    assert flagged["status"] == "flagged" and submission_count(aws) == 1
    assert delete(flagged["id"]) == (204, None)
    assert mine() == []
    assert not photo_exists(PHOTO)
    assert submission_count(aws) == 0


def test_the_same_product_and_store_can_be_priced_again_after_deleting(aws):
    flagged = submit(9999)
    assert delete(flagged["id"])[0] == 204
    assert submit(363)["status"] == "accepted"


def test_someone_elses_price_is_reported_missing(aws):
    flagged = submit(9999)
    status, error = delete(flagged["id"], user_id=OTHER_USER_ID)
    assert status == 404 and error["code"] == "NOT_FOUND"
    assert [i["id"] for i in mine()] == [flagged["id"]]


def test_accepted_and_rejected_prices_cant_be_deleted(aws):
    accepted = submit(363)
    status, error = delete(accepted["id"])
    assert status == 409 and error == {**error, "code": "ALREADY_MODERATED", "message": "This submission is already accepted."}
    rejected = submit(9999, retailer="shengsiong")
    assert moderate(rejected["id"], {"decision": "rejected", "reason": "Blurry"})[0] == 200
    status, error = delete(rejected["id"])
    assert status == 409 and error["message"] == "This submission is already rejected."
    assert len(mine()) == 2


def test_deleting_twice_or_a_made_up_id_is_404(aws):
    flagged = submit(9999)
    assert delete(flagged["id"])[0] == 204
    assert delete(flagged["id"])[0] == 404
    assert delete("not-an-id")[0] == 404


def test_delete_needs_login(aws):
    assert delete(submit(9999)["id"], user_id=None)[0] == 401


def test_an_admin_deciding_a_deleted_price_gets_404(aws):
    flagged = submit(9999)
    assert delete(flagged["id"])[0] == 204
    status, error = moderate(flagged["id"], {"decision": "accepted"})
    assert status == 404 and error["code"] == "NOT_FOUND"


def test_a_delete_racing_an_admin_decision_is_409_and_keeps_the_price(aws, monkeypatch):
    flagged = submit(9999)
    real_load = delete_submission._load_own
    loads = []

    def accepted_just_after_loading(product_id, sk, caller):
        item = real_load(product_id, sk, caller)
        if not loads:  # the admin accepts it between our read and our delete
            assert moderate(flagged["id"], {"decision": "accepted"})[0] == 200
        loads.append(item)
        return item

    monkeypatch.setattr(delete_submission, "_load_own", accepted_just_after_loading)
    status, error = delete(flagged["id"])
    assert status == 409 and error["message"] == "This submission is already accepted."
    assert [i["status"] for i in mine()] == ["accepted"]
