import pytest

from conftest import MILK_ID, OTHER_USER_ID, USER_ID, api_event, call
from handlers import upload_url


def request(body, **kwargs):
    return call(upload_url.handler, api_event("POST", "/price-submissions/image-upload-url", body, **kwargs))


def body(**overrides):
    values = {"productId": MILK_ID, "retailerId": "fairprice", "contentType": "image/png", "sizeBytes": 2048}
    values.update(overrides)
    return values


@pytest.mark.parametrize("content_type, ext", [("image/jpeg", "jpg"), ("image/png", "png")])
def test_returns_presigned_post_scoped_to_user_and_product(aws, content_type, ext):
    status, result = request(body(contentType=content_type, fileName="shelf.jpg"))
    assert status == 200
    assert result["method"] == "POST"
    assert result["photoKey"].startswith(f"price-evidence/{USER_ID}/{MILK_ID}/")
    assert result["photoKey"].endswith(f".{ext}")
    assert result["fields"]["key"] == result["photoKey"]
    assert result["fields"]["Content-Type"] == content_type
    assert "policy" in result["fields"] or "Policy" in result["fields"]
    assert result["maxSizeBytes"] == 5 * 1024 * 1024


def test_product_and_store_are_required(aws):
    status, error = request({"contentType": "image/png", "sizeBytes": 10})
    assert status == 400 and error["code"] == "VALIDATION_ERROR"
    assert set(error["fieldErrors"]) == {"productId", "retailerId"}


def test_unknown_product_gets_no_upload_link(aws):
    status, error = request(body(productId="not-a-product"))
    assert status == 400 and error["fieldErrors"] == {"productId": "Unknown product"}


def test_unknown_store_gets_no_upload_link(aws):
    status, error = request(body(retailerId="giant"))
    assert status == 400 and error["fieldErrors"] == {"retailerId": "Unknown store"}


def test_rejects_other_content_types(aws):
    status, error = request(body(contentType="image/gif"))
    assert status == 400 and "contentType" in error["fieldErrors"]


def test_reports_every_bad_field_together(aws):
    status, error = request({"contentType": "image/gif", "sizeBytes": 10})
    assert status == 400 and set(error["fieldErrors"]) == {"productId", "retailerId", "contentType"}


def test_rejects_oversized(aws):
    status, error = request(body(sizeBytes=5 * 1024 * 1024 + 1))
    assert status == 400 and error["code"] == "IMAGE_TOO_LARGE"


def test_requires_auth(aws):
    status, _ = request(body(), user_id=None)
    assert status == 401


# ---------- how many links one person can ask for ----------

def test_sixty_upload_links_an_hour_then_429(aws):
    for _ in range(60):
        assert request(body())[0] == 200
    status, error = request(body())
    assert status == 429 and error["code"] == "UPLOAD_RATE_LIMITED"
    # Everyone has their own allowance.
    assert request(body(), user_id=OTHER_USER_ID)[0] == 200


def test_the_allowance_starts_again_each_hour(aws, monkeypatch):
    monkeypatch.setenv("UPLOAD_LINKS_PER_HOUR", "1")
    assert request(body())[0] == 200
    assert request(body())[0] == 429
    aws.Table("unit-user").update_item(Key={"userId": USER_ID}, UpdateExpression="SET uploadWindow = :hour",
                                       ExpressionAttributeValues={":hour": "2026-01-01T00"})
    assert request(body())[0] == 200


def test_refused_requests_dont_use_the_allowance(aws, monkeypatch):
    monkeypatch.setenv("UPLOAD_LINKS_PER_HOUR", "1")
    assert request(body(contentType="image/gif"))[0] == 400
    assert request(body(productId="no-such-product"))[0] == 400
    assert request(body())[0] == 200
