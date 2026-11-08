"""The basket reads its prices by key (BatchGetItem on retailer-price), not by scanning the table."""

from datetime import datetime, time, timedelta, timezone
from decimal import Decimal

import pytest

from common import db, pricing
from conftest import DETERGENT_ID, MILK_ID, SGT, WHITE_ID, WHOLEMEAL_ID, api_event, call, put_price, put_stored_price, sgt_today
from handlers import aggregate_prices, basket

GARDENIA_WHOLEMEAL_ID = "b0000000-0000-4000-8000-000000000004"
PRICE_TABLE = "unit-retailer-price"


def compare(body):
    return call(basket.handler, api_event("POST", "/basket/compare", body))


def store(result, retailer_id, key="basket"):
    return next(s for s in result[key]["stores"] if s["retailerId"] == retailer_id)


class RecordingDynamo:
    """Stands in for db._dynamodb(): records every BatchGetItem request, and for the first
    `unprocessed_rounds` requests answers only half the keys, returning the rest as UnprocessedKeys
    (what DynamoDB does when a table is throttled)."""

    def __init__(self, real, unprocessed_rounds=0):
        self.real, self.unprocessed_rounds, self.requests = real, unprocessed_rounds, []

    def Table(self, name):
        return self.real.Table(name)

    def batch_get_item(self, RequestItems):
        self.requests.append(RequestItems)
        if not self.unprocessed_rounds:
            return self.real.batch_get_item(RequestItems=RequestItems)
        self.unprocessed_rounds -= 1
        (name, request), = RequestItems.items()
        half = len(request["Keys"]) // 2
        answered = self.real.batch_get_item(RequestItems={name: {**request, "Keys": request["Keys"][:half]}})["Responses"] if half else {name: []}
        return {"Responses": answered, "UnprocessedKeys": {name: {**request, "Keys": request["Keys"][half:]}}}

    def keys(self):
        return [(k["productId"], k["retailerId"]) for r in self.requests for k in r[PRICE_TABLE]["Keys"]]


@pytest.fixture
def recorder(basket_catalog, monkeypatch):
    real = db._dynamodb()
    recording = RecordingDynamo(real)
    monkeypatch.setattr(db, "_dynamodb", lambda: recording)
    sleeps = []
    monkeypatch.setattr(db.time, "sleep", sleeps.append)
    recording.sleeps = sleeps
    scanned = []
    original_scan = db.scan_all
    monkeypatch.setattr(db, "scan_all", lambda table: scanned.append(table.name) or original_scan(table))
    recording.scanned = scanned
    return recording


def add_product(aws, product_id, name, category, hcs=False):
    aws.Table("unit-product").put_item(Item={"id": product_id, "name": name, "brand": "Test", "packQty": 1,
                                             "packUnit": "pcs", "category": category, "hcs": hcs})


def test_fetches_exactly_the_pairs_it_needs_and_never_scans_prices(recorder):
    status, result = compare({"items": [{"productId": WHITE_ID, "quantity": 1}, {"productId": DETERGENT_ID, "quantity": 1}],
                              "retailerIds": ["fairprice", "coldstorage"]})
    assert status == 200
    # The two basket products and the white bread's HCS alternative, at the two chosen stores only.
    assert sorted(recorder.keys()) == sorted((p, r) for p in (WHITE_ID, DETERGENT_ID, WHOLEMEAL_ID) for r in ("fairprice", "coldstorage"))
    assert len(recorder.requests) == 1
    request = recorder.requests[0][PRICE_TABLE]
    assert sorted(request["ExpressionAttributeNames"].values()) == sorted(pricing.PRICE_ATTRIBUTES)
    assert PRICE_TABLE not in recorder.scanned
    assert store(result, "fairprice")["totalCents"] == 250 + 848


def test_more_than_100_pairs_are_fetched_in_requests_of_at_most_100(recorder, basket_catalog):
    ids = [f"c0000000-0000-4000-8000-{n:012d}" for n in range(40)]
    for n, product_id in enumerate(ids):
        add_product(basket_catalog, product_id, f"Snack {n:02d}", "snacks")
        for retailer_id in ("fairprice", "shengsiong", "coldstorage"):
            put_stored_price(product_id, retailer_id, 100 + n)
    status, result = compare({"items": [{"productId": p, "quantity": 1} for p in ids]})
    assert status == 200
    assert [len(r[PRICE_TABLE]["Keys"]) for r in recorder.requests] == [100, 20]  # 40 products x 3 stores
    assert len(set(recorder.keys())) == 120
    for retailer_id in ("fairprice", "shengsiong", "coldstorage"):
        assert store(result, retailer_id)["complete"] and store(result, retailer_id)["totalCents"] == sum(100 + n for n in range(40))


def test_unprocessed_keys_are_retried_with_exponential_backoff(recorder):
    body = {"items": [{"productId": WHITE_ID, "quantity": 2}, {"productId": DETERGENT_ID, "quantity": 1}]}
    expected = compare(body)
    recorder.requests.clear()
    recorder.unprocessed_rounds = 3
    assert compare(body) == expected
    assert recorder.sleeps == [0.05, 0.1, 0.2]
    assert len(recorder.requests) == 4


def test_fails_cleanly_when_keys_stay_unprocessed(recorder):
    recorder.unprocessed_rounds = 99
    status, error = compare({"items": [{"productId": WHITE_ID, "quantity": 1}]})
    assert status == 503 and error["code"] == "SERVICE_BUSY"
    assert len(recorder.requests) == db.BATCH_GET_ATTEMPTS
    assert recorder.sleeps == [0.05, 0.1, 0.2, 0.4, 0.8]


def test_a_store_with_no_row_leaves_the_product_unpriced_there(basket_catalog):
    put_stored_price(MILK_ID, "fairprice", 363)
    status, result = compare({"items": [{"productId": MILK_ID, "quantity": 1}]})
    assert store(result, "fairprice")["complete"] and store(result, "fairprice")["totalCents"] == 363
    for retailer_id in ("shengsiong", "coldstorage"):
        assert store(result, retailer_id)["unpriced"] == [{"productId": MILK_ID, "productName": "Magnolia Fresh Milk", "category": "milk"}]


def test_healthier_basket_uses_the_cheapest_hcs_option_at_each_store(basket_catalog):
    add_product(basket_catalog, GARDENIA_WHOLEMEAL_ID, "Gardenia Wholemeal Bread", "bread", hcs=True)
    put_stored_price(GARDENIA_WHOLEMEAL_ID, "fairprice", 300)  # cheaper than Sunshine's 330
    put_stored_price(GARDENIA_WHOLEMEAL_ID, "shengsiong", 330)  # dearer than Sunshine's 320; no row at Cold Storage
    status, result = compare({"items": [{"productId": WHITE_ID, "quantity": 1}]})
    chosen = {s["retailerId"]: (s["lines"][0]["productId"], s["lines"][0]["unitPriceCents"]) for s in result["healthierBasket"]["stores"]}
    assert chosen == {"fairprice": (GARDENIA_WHOLEMEAL_ID, 300), "shengsiong": (WHOLEMEAL_ID, 320), "coldstorage": (WHOLEMEAL_ID, 340)}


def test_prices_updated_is_when_the_nightly_job_last_stored_a_price(basket_catalog):
    """Taken from the products' priceUpdatedAt, which the job sets to each run's computedAt."""
    yesterday_noon = datetime.combine(sgt_today() - timedelta(days=1), time(12), SGT).astimezone(timezone.utc)
    put_price(MILK_ID, "fairprice", 363, submitted_at=yesterday_noon)
    run = aggregate_prices.handler({}, None)
    status, result = compare({"items": [{"productId": WHITE_ID, "quantity": 1}]})  # milk isn't in the basket
    assert result["pricesUpdated"] == run["computedAt"]


BASKETS = [
    {"items": [{"productId": WHITE_ID, "quantity": 2}, {"productId": DETERGENT_ID, "quantity": 1}]},
    {"items": [{"productId": MILK_ID, "quantity": 1}, {"productId": WHITE_ID, "quantity": 1}, {"productId": WHOLEMEAL_ID, "quantity": 3}]},
    {"items": [{"productId": WHITE_ID, "quantity": 1}, {"productId": MILK_ID, "quantity": 2}], "retailerIds": ["shengsiong", "coldstorage"]},
    {"items": [{"productId": DETERGENT_ID, "quantity": 4}], "retailerIds": ["coldstorage"]},
    {"items": [{"productId": WHITE_ID, "quantity": 1}, {"productId": WHITE_ID, "quantity": 1}]},
]


@pytest.mark.parametrize("body", BASKETS)
def test_same_response_as_reading_the_whole_price_table(basket_catalog, monkeypatch, body):
    """The old read path (Scan retailer-price, filter in Lambda) and the new one give identical answers,
    including pricesUpdated, over fresh, stale, missing and unrelated rows."""
    add_product(basket_catalog, GARDENIA_WHOLEMEAL_ID, "Gardenia Wholemeal Bread", "bread", hcs=True)
    put_stored_price(GARDENIA_WHOLEMEAL_ID, "fairprice", 300, computed_at="2026-10-27T16:05:00.000Z")
    put_stored_price(MILK_ID, "fairprice", 363, submission_count=3, price_date=sgt_today() - timedelta(days=4))
    put_stored_price(MILK_ID, "coldstorage", 365, price_date=sgt_today() - timedelta(days=31))  # stale
    put_stored_price("not-in-the-basket", "shengsiong", Decimal(999), computed_at="2026-10-26T16:05:00.000Z")
    aggregate_prices.handler({"syncProductTimestamps": True}, None)  # every product's priceUpdatedAt, as on dev

    by_key = compare(body)
    monkeypatch.setattr(basket, "prices_by_key", lambda ids, rids, now, age: pricing.stored_prices(ids, rids, now, age)[0])
    monkeypatch.setattr(basket, "latest_price_update", lambda products: pricing.stored_prices([], [], datetime.now(timezone.utc), 30)[1])
    by_scan = compare(body)
    assert by_key == by_scan
    assert by_key[1]["pricesUpdated"] == "2026-10-27T16:05:00.000Z"
