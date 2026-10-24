import pytest

from conftest import USER_ID, api_event, call
from handlers import upload_url


def request(body, **kwargs):
    return call(upload_url.handler, api_event("POST", "/price-submissions/image-upload-url", body, **kwargs))


@pytest.mark.parametrize("content_type, ext", [("image/jpeg", "jpg"), ("image/png", "png")])
def test_returns_presigned_post_scoped_to_user(aws, content_type, ext):
    status, body = request({"fileName": "shelf.jpg", "contentType": content_type, "sizeBytes": 2048})
    assert status == 200
    assert body["method"] == "POST"
    assert body["photoKey"].startswith(f"price-evidence/{USER_ID}/")
    assert body["photoKey"].endswith(f".{ext}")
    assert body["fields"]["key"] == body["photoKey"]
    assert body["fields"]["Content-Type"] == content_type
    assert "policy" in body["fields"] or "Policy" in body["fields"]
    assert body["maxSizeBytes"] == 5 * 1024 * 1024


def test_rejects_other_content_types(aws):
    status, error = request({"contentType": "image/gif", "sizeBytes": 10})
    assert status == 400 and "contentType" in error["fieldErrors"]


def test_rejects_oversized(aws):
    status, error = request({"contentType": "image/png", "sizeBytes": 5 * 1024 * 1024 + 1})
    assert status == 400 and error["code"] == "IMAGE_TOO_LARGE"


def test_requires_auth(aws):
    status, _ = request({"contentType": "image/png", "sizeBytes": 10}, user_id=None)
    assert status == 401
