from datetime import timedelta

import pytest

from conftest import DETERGENT_ID, MILK_ID, WHITE_ID, WHOLEMEAL_ID, api_event, call, put_price, put_stored_price, sgt_today
from handlers import search

OATS_ID = "b0000000-0000-4000-8000-000000000004"


def find(query=None):
    return call(search.handler, api_event("GET", "/products/search", query=query, user_id=None))


def ids(result):
    return [item["id"] for item in result["items"]]


@pytest.fixture
def catalog(basket_catalog):
    basket_catalog.Table("unit-product").put_item(Item={
        "id": OATS_ID, "name": "Quaker Oats", "brand": "Quaker", "packQty": 800, "packUnit": "g", "category": "cereal",
        "hcs": True, "dietary": ["halal", "vegetarian"], "searchTerms": ["porridge"],
    })
    put_stored_price(OATS_ID, "coldstorage", 455)
    return basket_catalog


def test_no_filters_returns_the_whole_catalog_by_name(catalog):
    status, result = find()
    assert status == 200
    assert ids(result) == [MILK_ID, OATS_ID, WHITE_ID, WHOLEMEAL_ID, DETERGENT_ID]
    assert result["total"] == result["catalogSize"] == 5
    assert result["priceMaxAgeDays"] == 30 and result["pricesUpdated"] == "2026-10-25T16:05:00.000Z"


def test_items_carry_store_prices_and_the_lowest_one(catalog):
    status, result = find()
    bread = next(item for item in result["items"] if item["id"] == WHITE_ID)
    assert set(bread["prices"]) == {"fairprice", "shengsiong", "coldstorage"}
    assert bread["prices"]["fairprice"]["priceCents"] == 250
    assert bread["lowestPrice"] == {"retailerId": "shengsiong", "retailerName": "Sheng Siong", "priceCents": 240,
                                    "priceDate": (sgt_today() - timedelta(days=1)).isoformat()}
    milk = next(item for item in result["items"] if item["id"] == MILK_ID)
    assert milk["prices"] == {} and milk["lowestPrice"] is None


def test_facets_come_from_the_whole_catalog(catalog):
    status, result = find({"category": "milk"})
    assert result["facets"] == {
        "categories": ["bread", "cereal", "detergent", "milk"],
        "brands": ["Magnolia", "Quaker", "Sunshine", "Top"],
        "dietary": ["halal", "vegetarian"],
    }


@pytest.mark.parametrize("q, expected", [
    ("sunshine", [WHITE_ID, WHOLEMEAL_ID]),
    ("WHOLEMEAL", [WHOLEMEAL_ID]),
    ("bread white", [WHITE_ID]),
    ("porridge", [OATS_ID]),
    ("vegetarian", [OATS_ID]),
    ("946", [MILK_ID]),
    ("kg", [DETERGENT_ID]),
    ("  ", [MILK_ID, OATS_ID, WHITE_ID, WHOLEMEAL_ID, DETERGENT_ID]),
    ("caviar", []),
])
def test_text_search(catalog, q, expected):
    status, result = find({"q": q})
    assert status == 200 and ids(result) == expected


def test_filters_ignore_case_and_combine(catalog):
    assert ids(find({"category": "Bread"})[1]) == [WHITE_ID, WHOLEMEAL_ID]
    assert ids(find({"brand": "sunshine", "hcs": "true"})[1]) == [WHOLEMEAL_ID]
    assert ids(find({"category": "bread", "hcs": "false"})[1]) == [WHITE_ID]
    assert ids(find({"dietary": "HALAL"})[1]) == [OATS_ID]
    assert ids(find({"hcs": "true"})[1]) == [OATS_ID, WHOLEMEAL_ID]


def test_price_filter_uses_the_lowest_price(catalog):
    # White bread is 240 at its cheapest store, wholemeal 320, oats 455, detergent 847; milk has no price.
    assert ids(find({"maxPriceCents": "320"})[1]) == [WHITE_ID, WHOLEMEAL_ID]
    assert ids(find({"minPriceCents": "321"})[1]) == [OATS_ID, DETERGENT_ID]
    assert ids(find({"minPriceCents": "240", "maxPriceCents": "240"})[1]) == [WHITE_ID]
    assert ids(find({"minPriceCents": "0"})[1]) == [OATS_ID, WHITE_ID, WHOLEMEAL_ID, DETERGENT_ID]


def test_stale_and_unaggregated_prices_are_ignored(catalog):
    put_stored_price(MILK_ID, "fairprice", 363, price_date=sgt_today() - timedelta(days=31))
    put_price(MILK_ID, "shengsiong", 350)
    status, result = find({"q": "milk"})
    assert result["items"][0]["lowestPrice"] is None
    assert ids(find({"q": "milk", "maxPriceCents": "1000"})[1]) == []


def test_empty_catalog(aws):
    aws.Table("unit-product").delete_item(Key={"id": MILK_ID})
    status, result = find({"q": "milk"})
    assert status == 200 and result["items"] == [] and result["catalogSize"] == 0 and result["pricesUpdated"] is None


@pytest.mark.parametrize("query, field", [
    ({"q": "x" * 101}, "q"),
    ({"category": "x" * 101}, "category"),
    ({"brand": "x" * 101}, "brand"),
    ({"dietary": "x" * 101}, "dietary"),
    ({"hcs": "yes"}, "hcs"),
    ({"minPriceCents": "-1"}, "minPriceCents"),
    ({"minPriceCents": "1.50"}, "minPriceCents"),
    ({"maxPriceCents": "abc"}, "maxPriceCents"),
    ({"minPriceCents": "500", "maxPriceCents": "100"}, "maxPriceCents"),
])
def test_invalid_parameters(catalog, query, field):
    status, result = find(query)
    assert status == 400 and result["code"] == "VALIDATION_ERROR" and field in result["fieldErrors"]
