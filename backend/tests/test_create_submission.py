from datetime import datetime, timedelta, timezone

import pytest

from conftest import MILK_ID, OTHER_USER_ID, USER_ID, api_event, call, put_photo
from handlers import create_submission

SGT = timezone(timedelta(hours=8))


def today():
    return datetime.now(SGT).strftime("%Y-%m-%d")


def submit(body, user_id=USER_ID):
    return call(create_submission.handler, api_event("POST", "/price-submissions", body, user_id=user_id))


def valid_body(**overrides):
    body = {"productId": MILK_ID, "retailerId": "fairprice", "priceCents": 363, "observedAt": today()}
    body.update(overrides)
    return body


def test_in_range_price_is_accepted_and_stored(aws):
    status, record = submit(valid_body())
    assert status == 201
    assert record["status"] == "accepted"
    assert record["userId"] == USER_ID
    assert record["priceCents"] == 363
    assert record["productName"] == "Magnolia Fresh Milk"
    assert record["retailerName"] == "FairPrice"
    assert record["id"] and "sk" not in record
    stored = aws.Table("unit-price-submission").query(
        KeyConditionExpression="productId = :p", ExpressionAttributeValues={":p": MILK_ID}
    )["Items"]
    assert len(stored) == 1
    assert stored[0]["sk"].startswith(f"fairprice#{stored[0]['observedAt']}#")
    assert aws.Table("unit-user").get_item(Key={"userId": USER_ID})["Item"]["submissionCount"] == 1


@pytest.mark.parametrize("price", [100, 9999])
def test_out_of_range_price_is_flagged(aws, price):
    status, record = submit(valid_body(priceCents=price))
    assert status == 201
    assert record["status"] == "flagged"


def test_body_user_id_is_ignored(aws):
    status, record = submit(valid_body(userId=OTHER_USER_ID))
    assert status == 201
    assert record["userId"] == USER_ID


@pytest.mark.parametrize("body, field", [
    ({"retailerId": "fairprice", "priceCents": 363}, "productId"),
    (valid_body(priceCents=3.63), "priceCents"),
    (valid_body(priceCents=0), "priceCents"),
    (valid_body(priceCents=True), "priceCents"),
    (valid_body(observedAt="2099-01-01"), "observedAt"),
    (valid_body(observedAt="2020-01-01"), "observedAt"),
    (valid_body(observedAt="yesterday"), "observedAt"),
    (valid_body(retailerId=""), "retailerId"),
])
def test_validation_errors(aws, body, field):
    status, error = submit(body)
    assert status == 400
    assert error["code"] == "VALIDATION_ERROR"
    assert field in error["fieldErrors"]
    assert error["requestId"] == "req-123"


def test_unknown_product_and_store_rejected(aws):
    status, error = submit(valid_body(productId="nope"))
    assert status == 400 and "productId" in error["fieldErrors"]
    status, error = submit(valid_body(retailerId="giant"))
    assert status == 400 and "retailerId" in error["fieldErrors"]


def test_invalid_json_body(aws):
    status, error = call(create_submission.handler, api_event("POST", "/price-submissions", "{not json"))
    assert status == 400 and error["code"] == "INVALID_BODY"


def test_missing_identity_is_401(aws):
    status, error = call(create_submission.handler, api_event("POST", "/price-submissions", valid_body(), user_id=None))
    assert status == 401


def test_id_token_claims_rejected(aws):
    status, _ = call(create_submission.handler, api_event("POST", "/price-submissions", valid_body(), token_use="id"))
    assert status == 401


def test_duplicate_same_day_is_409(aws):
    assert submit(valid_body())[0] == 201
    status, error = submit(valid_body())
    assert status == 409 and error["code"] == "DUPLICATE_SUBMISSION"
    # A different price, store or user is not a duplicate.
    assert submit(valid_body(priceCents=365))[0] == 201
    assert submit(valid_body(retailerId="shengsiong"))[0] == 201
    assert submit(valid_body(), user_id=OTHER_USER_ID)[0] == 201


def test_rate_limit(aws, monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_PER_HOUR", "2")
    assert submit(valid_body(priceCents=300))[0] == 201
    assert submit(valid_body(priceCents=301))[0] == 201
    status, error = submit(valid_body(priceCents=302))
    assert status == 429 and error["code"] == "RATE_LIMITED"


def test_photo_is_verified_and_recorded(aws):
    key = f"price-evidence/{USER_ID}/abc.png"
    put_photo(key)
    status, record = submit(valid_body(photoKey=key))
    assert status == 201
    assert record["photoKey"] == key
    assert record["photoContentType"] == "image/png"
    assert record["photoSizeBytes"] == 1024
    assert record["photoUrl"].startswith("https://")


def test_photo_from_another_users_prefix_rejected(aws):
    key = f"price-evidence/{OTHER_USER_ID}/abc.png"
    put_photo(key)
    status, error = submit(valid_body(photoKey=key))
    assert status == 400 and "photoKey" in error["fieldErrors"]


def test_missing_photo_rejected(aws):
    status, error = submit(valid_body(photoKey=f"price-evidence/{USER_ID}/missing.png"))
    assert status == 400 and error["code"] == "PHOTO_NOT_FOUND"


def test_wrong_photo_type_rejected(aws):
    key = f"price-evidence/{USER_ID}/abc.png"
    put_photo(key, content_type="application/pdf")
    status, error = submit(valid_body(photoKey=key))
    assert status == 400 and error["code"] == "INVALID_PHOTO"
