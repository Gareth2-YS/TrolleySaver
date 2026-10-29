from datetime import timedelta

import pytest

from conftest import DETERGENT_ID, MILK_ID, WHITE_ID, WHOLEMEAL_ID, api_event, call, put_price, put_stored_price, sgt_today
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

    bread_swap, detergent_swap = healthier["swaps"]
    assert [o["productId"] for o in bread_swap["options"]] == [WHOLEMEAL_ID]
    option = bread_swap["options"][0]
    assert (option["priceCents"], option["priceDiffCents"], option["pricePer100"]) == (320, 80, {"cents": 80.0, "unit": "g"})
    assert set(option["prices"]) == {"fairprice", "shengsiong", "coldstorage"}
    assert detergent_swap["options"] == []


def test_signed_in_callers_get_the_same_answer(basket_catalog):
    body = {"items": [{"productId": WHITE_ID, "quantity": 1}]}
    assert compare(body) == compare(body, user_id="someone")


def test_uses_the_stored_daily_average(basket_catalog):
    put_stored_price(MILK_ID, "fairprice", 312, submission_count=3, price_date=sgt_today() - timedelta(days=2))
    status, result = compare({"items": [{"productId": MILK_ID, "quantity": 2}]})
    assert status == 200
    line = store(result, "fairprice")["lines"][0]
    assert (line["unitPriceCents"], line["subtotalCents"], line["submissionCount"]) == (312, 624, 3)
    assert line["priceDate"] == (sgt_today() - timedelta(days=2)).isoformat()
    assert "observedAt" not in line


def test_raw_submissions_wait_for_the_nightly_job(basket_catalog):
    """A new submission only reaches the basket once the job has averaged it into a stored row."""
    put_price(MILK_ID, "fairprice", 363)
    status, result = compare({"items": [{"productId": MILK_ID, "quantity": 1}]})
    assert store(result, "fairprice")["unpriced"][0]["productId"] == MILK_ID


def test_stored_price_older_than_30_days_is_stale(basket_catalog):
    put_stored_price(MILK_ID, "fairprice", 363, price_date=sgt_today() - timedelta(days=30))
    put_stored_price(MILK_ID, "coldstorage", 365, price_date=sgt_today() - timedelta(days=31))
    status, result = compare({"items": [{"productId": MILK_ID, "quantity": 1}]})
    assert store(result, "fairprice")["complete"]
    cold_storage = store(result, "coldstorage")
    assert not cold_storage["complete"] and cold_storage["unpriced"][0]["productId"] == MILK_ID
    assert result["basket"]["recommendation"]["retailerId"] == "fairprice"


def test_price_max_age_is_configurable(basket_catalog, monkeypatch):
    monkeypatch.setenv("PRICE_MAX_AGE_DAYS", "60")
    put_stored_price(MILK_ID, "coldstorage", 365, price_date=sgt_today() - timedelta(days=31))
    status, result = compare({"items": [{"productId": MILK_ID, "quantity": 1}]})
    assert result["priceMaxAgeDays"] == 60
    assert store(result, "coldstorage")["complete"]


def test_prices_updated_is_the_latest_job_run(basket_catalog):
    put_stored_price(MILK_ID, "fairprice", 363, computed_at="2026-10-26T16:05:00.000Z")
    status, result = compare({"items": [{"productId": WHITE_ID, "quantity": 1}]})
    assert result["pricesUpdated"] == "2026-10-26T16:05:00.000Z"


def test_prices_updated_is_null_before_the_first_run(aws):
    status, result = compare({"items": [{"productId": MILK_ID, "quantity": 1}]})
    assert status == 200 and result["pricesUpdated"] is None and result["basket"]["recommendation"] is None


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
