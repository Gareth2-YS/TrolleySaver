from datetime import datetime, timedelta, timezone

import boto3
import pytest
from botocore.exceptions import ClientError

from conftest import BUCKET, MILK_ID, OTHER_USER_ID, REGION, USER_ID, api_event, call, put_photo
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


def test_unknown_product_rejected_even_with_a_valid_photo(aws):
    # The product check at save time doesn't depend on the photo: nothing is stored for a fake product.
    key = f"price-evidence/{USER_ID}/{MILK_ID}/abc.png"
    put_photo(key)
    status, error = submit(valid_body(productId="nope", photoKey=key))
    assert status == 400 and error["fieldErrors"] == {"productId": "Unknown product"}
    assert aws.Table("unit-price-submission").scan()["Items"] == []


def test_invalid_json_body(aws):
    status, error = call(create_submission.handler, api_event("POST", "/price-submissions", "{not json"))
    assert status == 400 and error["code"] == "INVALID_BODY"


def test_missing_identity_is_401(aws):
    status, error = call(create_submission.handler, api_event("POST", "/price-submissions", valid_body(), user_id=None))
    assert status == 401


def test_id_token_claims_rejected(aws):
    status, _ = call(create_submission.handler, api_event("POST", "/price-submissions", valid_body(), token_use="id"))
    assert status == 401


def test_one_price_per_product_and_store_a_day(aws):
    assert submit(valid_body())[0] == 201
    for body in (valid_body(), valid_body(priceCents=365)):  # the same price again, or a different one
        status, error = submit(body)
        assert status == 409 and error["code"] == "DUPLICATE_SUBMISSION"
        assert error["message"] == "You've already submitted a price for this product at this store today."
    # Another store, another day or another person is fine.
    assert submit(valid_body(retailerId="shengsiong"))[0] == 201
    yesterday = (datetime.now(SGT) - timedelta(days=1)).strftime("%Y-%m-%d")
    assert submit(valid_body(observedAt=yesterday))[0] == 201
    assert submit(valid_body(), user_id=OTHER_USER_ID)[0] == 201


def test_a_rejected_price_frees_the_day_for_a_corrected_one(aws):
    from handlers import admin_submissions
    status, flagged = submit(valid_body(priceCents=9999))
    assert status == 201 and flagged["status"] == "flagged"
    assert submit(valid_body(priceCents=363))[0] == 409  # still pending, so it counts
    event = api_event("PATCH", "/admin/price-submissions/{id}", {"decision": "rejected", "reason": "Typo"},
                      user_id="admin", groups="admin", path_params={"id": flagged["id"]})
    assert call(admin_submissions.handler, event)[0] == 200
    status, corrected = submit(valid_body(priceCents=363))
    assert status == 201 and corrected["status"] == "accepted"


def test_rate_limit(aws, monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_PER_HOUR", "2")
    assert submit(valid_body(retailerId="fairprice"))[0] == 201
    assert submit(valid_body(retailerId="shengsiong"))[0] == 201
    status, error = submit(valid_body(retailerId="coldstorage"))
    assert status == 429 and error["code"] == "RATE_LIMITED"


def test_photo_is_verified_recorded_and_shown_to_its_contributor(aws):
    key = f"price-evidence/{USER_ID}/{MILK_ID}/abc.png"
    put_photo(key)
    status, record = submit(valid_body(photoKey=key))
    assert status == 201
    assert record["photoKey"] == key
    assert record["photoContentType"] == "image/png"
    assert record["photoSizeBytes"] == 1024
    assert record["photoUrl"].startswith("https://")  # a short-lived link, so they can see their photo


def test_photo_from_another_users_prefix_rejected(aws):
    key = f"price-evidence/{OTHER_USER_ID}/{MILK_ID}/abc.png"
    put_photo(key)
    status, error = submit(valid_body(photoKey=key))
    assert status == 400 and "photoKey" in error["fieldErrors"]


def test_photo_uploaded_for_another_product_rejected(aws):
    key = f"price-evidence/{USER_ID}/some-other-product/abc.png"
    put_photo(key)
    status, error = submit(valid_body(photoKey=key))
    assert status == 400 and "photoKey" in error["fieldErrors"]


def test_photo_without_a_product_folder_rejected(aws):
    # Keys from before upload links were tied to a product.
    key = f"price-evidence/{USER_ID}/abc.png"
    put_photo(key)
    status, error = submit(valid_body(photoKey=key))
    assert status == 400 and "photoKey" in error["fieldErrors"]


def test_missing_photo_rejected(aws):
    status, error = submit(valid_body(photoKey=f"price-evidence/{USER_ID}/{MILK_ID}/missing.png"))
    assert status == 400 and error["code"] == "PHOTO_NOT_FOUND"


def test_wrong_photo_type_rejected(aws):
    key = f"price-evidence/{USER_ID}/{MILK_ID}/abc.png"
    put_photo(key, content_type="application/pdf")
    status, error = submit(valid_body(photoKey=key))
    assert status == 400 and error["code"] == "INVALID_PHOTO"


def _exists(key):
    try:
        boto3.client("s3", region_name=REGION).head_object(Bucket=BUCKET, Key=key)
        return True
    except ClientError:
        return False


@pytest.mark.parametrize("content_type, contents", [
    ("image/png", b"<html><script>alert(1)</script></html>"),  # a web page labelled as an image
    ("image/png", b"GIF89a" + b"x" * 100),                      # another image type
    ("image/jpeg", b"\x89PNG\r\n\x1a\n" + b"x" * 100),          # a PNG declared as a JPEG
])
def test_a_file_that_isnt_the_image_it_claims_is_refused_and_deleted(aws, content_type, contents):
    key = f"price-evidence/{USER_ID}/{MILK_ID}/abc.{'png' if content_type == 'image/png' else 'jpg'}"
    put_photo(key, content_type=content_type, body=contents)
    status, error = submit(valid_body(photoKey=key))
    assert status == 400 and error["code"] == "INVALID_PHOTO"
    assert error["fieldErrors"] == {"photoKey": "Not a JPG or PNG image"}
    assert not _exists(key)


def test_a_real_jpeg_is_accepted(aws):
    key = f"price-evidence/{USER_ID}/{MILK_ID}/abc.jpg"
    put_photo(key, content_type="image/jpeg")
    status, record = submit(valid_body(photoKey=key))
    assert status == 201 and record["photoContentType"] == "image/jpeg"
