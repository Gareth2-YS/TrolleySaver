import pytest

from conftest import api_event, call
from handlers import catalog


def products(origin=None, header="Origin"):
    event = api_event("GET", "/products", user_id=None)
    if origin:
        event["headers"] = {header: origin}
    return catalog.handler(event, None)


@pytest.mark.parametrize("origin", ["http://localhost:5173", "https://site.example.test"])
def test_allowed_origins_are_echoed(aws, origin):
    headers = products(origin)["headers"]
    assert headers["Access-Control-Allow-Origin"] == origin
    assert headers["Vary"] == "Origin"


def test_other_sites_get_no_allow_origin(aws):
    headers = products("https://evil.example")["headers"]
    assert "Access-Control-Allow-Origin" not in headers
    assert headers["Vary"] == "Origin"


def test_header_name_is_case_insensitive(aws):
    # API Gateway passes headers as the browser sent them; HTTP/2 browsers send them lower-case.
    assert products("http://localhost:5173", header="origin")["headers"]["Access-Control-Allow-Origin"] == "http://localhost:5173"


def test_no_origin_header_means_no_allow_origin(aws):
    assert "Access-Control-Allow-Origin" not in products()["headers"]


def test_error_responses_echo_the_origin_too(aws):
    event = api_event("GET", "/nothing-here", user_id=None)
    event["headers"] = {"Origin": "https://site.example.test"}
    result = catalog.handler(event, None)
    assert result["statusCode"] == 404 and result["headers"]["Access-Control-Allow-Origin"] == "https://site.example.test"


def test_origin_does_not_leak_into_the_next_request(aws):
    products("https://site.example.test")
    assert "Access-Control-Allow-Origin" not in products()["headers"]
    assert call(catalog.handler, api_event("GET", "/retailers", user_id=None))[0] == 200


def test_every_response_says_nosniff_and_no_store(aws):
    """Browsers must take responses as the JSON they are, and nobody may keep a copy of someone's data."""
    from common.http import ApiError, api_handler, no_content

    @api_handler
    def failing(event, context):
        raise ApiError(400, "VALIDATION_ERROR", "Some fields are invalid.")

    for result in (products(), failing({}, None), no_content()):
        assert result["headers"]["X-Content-Type-Options"] == "nosniff"
        assert result["headers"]["Cache-Control"] == "no-store"
