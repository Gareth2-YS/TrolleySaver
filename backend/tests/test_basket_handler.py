from datetime import datetime, timedelta, timezone

import pytest

from conftest import DETERGENT_ID, MILK_ID, WHITE_ID, WHOLEMEAL_ID, api_event, call, put_price
from handlers import basket


def compare(body, user_id=None):
    return call(basket.handler, api_event("POST", "/basket/compare", body, user_id=user_id))


def store(result, retailer_id, key="basket"):
    return next(s for s in result[key]["stores"] if s["retailerId"] == retailer_id)


def test_public_basket_with_healthier_version(basket_catalog):
    status, result = compare({"items": [{"productId": WHITE_ID, "quantity": 2}, {"productId": DETERGENT_ID, "quantity": 1}]})
    assert status == 200
    assert result["priceMaxAgeDays"] == 30
    assert [s["retailerId"] for s in result["basket"]["stores"]] == ["shengsiong", "fairprice", "coldstorage"]
    assert result["basket"]["recommendation"] == {"retailerId": "shengsiong", "retailerName": "Sheng Siong", "totalCents": 1327, "complete": True}
    assert result["basket"]["maxSavingsCents"] == 1380 - 1327

    healthier = result["healthierBasket"]
    assert [(s["originalProductId"], s["status"]) for s in healthier["swaps"]] == [(WHITE_ID, "swapped"), (DETERGENT_ID, "no-hcs-option")]
    bread = store(result, "shengsiong", "healthierBasket")["lines"][0]
    assert (bread["productId"], bread["replacesProductId"], bread["subtotalCents"]) == (WHOLEMEAL_ID, WHITE_ID, 640)
    assert result["healthierExtra"] == {"basketTotalCents": 1327, "healthierTotalCents": 1487, "extraCents": 160, "extraPercent": 12.1}


def test_signed_in_callers_get_the_same_answer(basket_catalog):
    body = {"items": [{"productId": WHITE_ID, "quantity": 1}]}
    assert compare(body) == compare(body, user_id="someone")


def test_latest_accepted_price_wins(basket_catalog):
    now = datetime.now(timezone.utc)
    put_price(MILK_ID, "fairprice", 400, observed_at=now - timedelta(days=5))
    put_price(MILK_ID, "fairprice", 300, observed_at=now - timedelta(days=2))
    put_price(MILK_ID, "fairprice", 350, observed_at=now - timedelta(days=3))
    # Same observedAt as the newest: the later submission wins.
    put_price(MILK_ID, "fairprice", 310, observed_at=now - timedelta(days=2), submitted_at=now - timedelta(hours=1))
    status, result = compare({"items": [{"productId": MILK_ID, "quantity": 1}]})
    assert status == 200
    assert store(result, "fairprice")["lines"][0]["unitPriceCents"] == 310


def test_flagged_and_rejected_prices_are_ignored(basket_catalog):
    now = datetime.now(timezone.utc)
    put_price(MILK_ID, "fairprice", 363, observed_at=now - timedelta(days=3))
    put_price(MILK_ID, "fairprice", 9999, observed_at=now - timedelta(days=1), status="flagged")
    put_price(MILK_ID, "fairprice", 1, observed_at=now - timedelta(hours=2), status="rejected")
    status, result = compare({"items": [{"productId": MILK_ID, "quantity": 1}]})
    assert store(result, "fairprice")["lines"][0]["unitPriceCents"] == 363


def test_stale_price_is_ignored(basket_catalog):
    now = datetime.now(timezone.utc)
    put_price(MILK_ID, "fairprice", 363, observed_at=now - timedelta(days=2))
    put_price(MILK_ID, "coldstorage", 365, observed_at=now - timedelta(days=31))
    status, result = compare({"items": [{"productId": MILK_ID, "quantity": 1}]})
    cold_storage = store(result, "coldstorage")
    assert not cold_storage["complete"] and cold_storage["unpriced"][0]["productId"] == MILK_ID
    assert result["basket"]["recommendation"]["retailerId"] == "fairprice"


def test_price_max_age_is_configurable(basket_catalog, monkeypatch):
    monkeypatch.setenv("PRICE_MAX_AGE_DAYS", "60")
    put_price(MILK_ID, "coldstorage", 365, observed_at=datetime.now(timezone.utc) - timedelta(days=31))
    status, result = compare({"items": [{"productId": MILK_ID, "quantity": 1}]})
    assert result["priceMaxAgeDays"] == 60
    assert store(result, "coldstorage")["complete"]


def test_repeated_products_are_merged(basket_catalog):
    status, result = compare({"items": [{"productId": WHITE_ID, "quantity": 1}, {"productId": WHITE_ID, "quantity": 2}]})
    lines = store(result, "fairprice")["lines"]
    assert len(lines) == 1 and lines[0]["quantity"] == 3 and lines[0]["subtotalCents"] == 750


def test_retailer_filter(basket_catalog):
    status, result = compare({"items": [{"productId": WHITE_ID, "quantity": 1}], "retailerIds": ["fairprice", "coldstorage"]})
    assert status == 200
    assert [s["retailerId"] for s in result["basket"]["stores"]] == ["fairprice", "coldstorage"]
    assert [s["retailerId"] for s in result["healthierBasket"]["stores"]] == ["fairprice", "coldstorage"]


def test_no_healthier_basket_when_nothing_can_be_swapped(basket_catalog):
    status, result = compare({"items": [{"productId": DETERGENT_ID, "quantity": 1}, {"productId": WHOLEMEAL_ID, "quantity": 1}]})
    assert status == 200
    assert result["healthierBasket"] is None and result["healthierExtra"] is None


def test_unpriced_product_is_listed_not_dropped(basket_catalog):
    status, result = compare({"items": [{"productId": MILK_ID, "quantity": 1}, {"productId": WHITE_ID, "quantity": 1}]})
    for s in result["basket"]["stores"]:
        assert s["unpriced"] == [{"productId": MILK_ID, "productName": "Magnolia Fresh Milk", "category": "milk"}]
        assert s["pricedCount"] == 1 and not s["complete"]
    assert result["basket"]["recommendation"]["complete"] is False


@pytest.mark.parametrize("body, field", [
    ({}, "items"),
    ({"items": []}, "items"),
    ({"items": "milk"}, "items"),
    ({"items": [{"productId": WHITE_ID, "quantity": 0}]}, "items[0].quantity"),
    ({"items": [{"productId": WHITE_ID, "quantity": 100}]}, "items[0].quantity"),
    ({"items": [{"productId": WHITE_ID, "quantity": 1.5}]}, "items[0].quantity"),
    ({"items": [{"productId": WHITE_ID, "quantity": True}]}, "items[0].quantity"),
    ({"items": [{"productId": WHITE_ID, "quantity": 60}, {"productId": WHITE_ID, "quantity": 60}]}, "items[1].quantity"),
    ({"items": [{"productId": WHITE_ID, "quantity": 1}, {"productId": "nope", "quantity": 1}]}, "items[1].productId"),
    ({"items": ["milk"]}, "items[0]"),
    ({"items": [{"productId": WHITE_ID, "quantity": 1}], "retailerIds": ["giant"]}, "retailerIds"),
    ({"items": [{"productId": WHITE_ID, "quantity": 1}], "retailerIds": []}, "retailerIds"),
])
def test_validation_errors(basket_catalog, body, field):
    status, error = compare(body)
    assert status == 400 and error["code"] == "VALIDATION_ERROR"
    assert field in error["fieldErrors"]


def test_too_many_lines(basket_catalog):
    status, error = compare({"items": [{"productId": WHITE_ID, "quantity": 1}] * 51})
    assert status == 400 and "items" in error["fieldErrors"]


def test_invalid_json(basket_catalog):
    status, error = compare("{not json")
    assert status == 400 and error["code"] == "INVALID_BODY"
