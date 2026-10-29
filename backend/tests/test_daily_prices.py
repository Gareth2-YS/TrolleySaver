"""The nightly daily-average job: the pure rules, the Lambda against fake DynamoDB, and the path from
submissions through the job to the basket."""

from datetime import date, datetime, time, timedelta, timezone

import boto3
import pytest

from common.daily_prices import average, daily_rows, group, window, yesterday
from conftest import ENV, MILK_ID, REGION, SGT, Context, api_event, call, put_price, put_stored_price, sgt_today
from handlers import aggregate_prices, basket

DAY = date(2026, 10, 24)


def item(product="p", retailer="fairprice", cents=300, submitted="2026-10-24T04:00:00.000Z", status="accepted", reviewed=None):
    row = {"productId": product, "retailerId": retailer, "priceCents": cents, "submittedAt": submitted, "status": status}
    if reviewed:
        row["reviewedAt"] = reviewed
    return row


# ---------- Pure rules ----------

def test_window_is_one_singapore_day_in_utc():
    assert window(DAY) == ("2026-10-23T16:00:00.000Z", "2026-10-24T16:00:00.000Z")


def test_yesterday_is_in_singapore_time():
    # 00:30 on 26 Oct in Singapore is still 25 Oct in UTC.
    assert yesterday(datetime(2026, 10, 25, 16, 30, tzinfo=timezone.utc)) == date(2026, 10, 25)


def test_window_edges():
    start, end = window(DAY)
    items = [
        item(cents=100, submitted="2026-10-23T15:59:59.999Z"),   # 23:59:59 on 23 Oct SGT: day before
        item(cents=200, submitted="2026-10-23T16:00:00.000Z"),   # 00:00 on 24 Oct SGT: counts
        item(cents=300, submitted="2026-10-24T15:59:59.999Z"),   # 23:59:59 on 24 Oct SGT: counts
        item(cents=400, submitted="2026-10-24T16:00:00.000Z"),   # 00:00 on 25 Oct SGT: next day
    ]
    assert group(items, start, end) == {("p", "fairprice"): [200, 300]}


def test_only_accepted_prices_count():
    start, end = window(DAY)
    items = [item(cents=300), item(cents=9999, status="flagged"), item(cents=1, status="rejected")]
    assert group(items, start, end) == {("p", "fairprice"): [300]}


def test_admin_accepted_price_counts_on_the_day_it_was_accepted():
    start, end = window(DAY)
    earlier = item(cents=380, submitted="2026-10-20T04:00:00.000Z", reviewed="2026-10-24T02:00:00.000Z")
    later = item(cents=390, submitted="2026-10-24T04:00:00.000Z", reviewed="2026-10-25T02:00:00.000Z")
    assert group([earlier, later], start, end) == {("p", "fairprice"): [380]}


def test_each_product_and_retailer_is_averaged_separately():
    start, end = window(DAY)
    items = [item(retailer="fairprice", cents=375), item(retailer="fairprice", cents=200),
             item(retailer="coldstorage", cents=375), item(retailer="coldstorage", cents=500),
             item(product="q", retailer="fairprice", cents=999)]
    assert group(items, start, end) == {("p", "fairprice"): [375, 200], ("p", "coldstorage"): [375, 500], ("q", "fairprice"): [999]}


@pytest.mark.parametrize("cents, expected", [
    ([363], 363),
    ([250, 251], 251),        # 250.5 rounds up
    ([249, 250], 250),        # 249.5 rounds up
    ([375, 200], 288),        # 287.5
    ([375, 500], 438),        # 437.5
    ([100, 101, 101], 101),   # 100.67
    ([100, 100, 101], 100),   # 100.33
])
def test_average_rounds_to_the_nearest_cent_halves_up(cents, expected):
    assert average(cents) == expected


def test_daily_rows():
    items = [item(retailer="fairprice", cents=375), item(retailer="fairprice", cents=200), item(retailer="shengsiong", cents=375)]
    rows = daily_rows(items, DAY, "2026-10-24T16:05:00.000Z")
    assert rows == [
        {"productId": "p", "retailerId": "fairprice", "priceCents": 288, "submissionCount": 2, "priceDate": "2026-10-24", "computedAt": "2026-10-24T16:05:00.000Z"},
        {"productId": "p", "retailerId": "shengsiong", "priceCents": 375, "submissionCount": 1, "priceDate": "2026-10-24", "computedAt": "2026-10-24T16:05:00.000Z"},
    ]
    assert daily_rows(items, DAY + timedelta(days=1), "x") == []   # no submissions that day: nothing written


# ---------- The Lambda, against fake DynamoDB ----------

def at(day, hour=12):
    """A moment on a Singapore calendar day."""
    return datetime.combine(day, time(hour), SGT)


def stored():
    table = boto3.resource("dynamodb", region_name=REGION).Table(ENV["RETAILER_PRICE_TABLE"])
    return {(r["productId"], r["retailerId"]): r for r in table.scan()["Items"]}


def run(event):
    return aggregate_prices.handler(event, Context())


def test_default_run_averages_yesterday(aws):
    day = sgt_today() - timedelta(days=1)
    put_price(MILK_ID, "fairprice", 360, submitted_at=at(day, 9))
    put_price(MILK_ID, "fairprice", 371, submitted_at=at(day, 18))
    put_price(MILK_ID, "fairprice", 500, submitted_at=at(day + timedelta(days=1), 1))  # today: not yet
    result = run({})
    assert result["days"] == [{"date": day.isoformat(), "pairsUpdated": 1}]
    row = stored()[(MILK_ID, "fairprice")]
    assert (row["priceCents"], row["submissionCount"], row["priceDate"]) == (366, 2, day.isoformat())


def test_pairs_without_submissions_keep_their_last_average(aws):
    day = sgt_today() - timedelta(days=1)
    put_stored_price(MILK_ID, "coldstorage", 365, price_date=day - timedelta(days=5), computed_at="old")
    put_price(MILK_ID, "fairprice", 360, submitted_at=at(day))
    run({})
    rows = stored()
    assert rows[(MILK_ID, "coldstorage")]["priceCents"] == 365
    assert rows[(MILK_ID, "coldstorage")]["computedAt"] == "old"
    assert rows[(MILK_ID, "fairprice")]["priceCents"] == 360


def test_rerunning_a_day_gives_the_same_prices(aws):
    put_price(MILK_ID, "fairprice", 360, submitted_at=at(DAY))
    put_price(MILK_ID, "fairprice", 363, submitted_at=at(DAY, 15))
    run({"date": DAY.isoformat()})
    first = stored()[(MILK_ID, "fairprice")]
    run({"date": DAY.isoformat()})
    second = stored()[(MILK_ID, "fairprice")]
    assert (first["priceCents"], first["submissionCount"]) == (second["priceCents"], second["submissionCount"]) == (362, 2)


def test_backfill_processes_days_oldest_first(aws):
    today = sgt_today()
    put_price(MILK_ID, "fairprice", 300, submitted_at=at(today - timedelta(days=4)))
    put_price(MILK_ID, "fairprice", 320, submitted_at=at(today - timedelta(days=2)))
    put_price(MILK_ID, "shengsiong", 310, submitted_at=at(today - timedelta(days=4)))
    result = run({"backfillDays": 5})
    assert [d["date"] for d in result["days"]] == [(today - timedelta(days=n)).isoformat() for n in (4, 3, 2, 1, 0)]
    rows = stored()
    assert (rows[(MILK_ID, "fairprice")]["priceCents"], rows[(MILK_ID, "fairprice")]["priceDate"]) == (320, (today - timedelta(days=2)).isoformat())
    assert (rows[(MILK_ID, "shengsiong")]["priceCents"], rows[(MILK_ID, "shengsiong")]["priceDate"]) == (310, (today - timedelta(days=4)).isoformat())


def test_submissions_to_basket(aws):
    """Submissions -> nightly job -> basket, with every kind of submission mixed in."""
    day = sgt_today() - timedelta(days=1)
    older = day - timedelta(days=3)
    put_price(MILK_ID, "fairprice", 360, submitted_at=at(day, 9))
    put_price(MILK_ID, "fairprice", 370, submitted_at=at(day, 10))
    put_price(MILK_ID, "fairprice", 9999, submitted_at=at(day, 11), status="flagged")
    put_price(MILK_ID, "fairprice", 1, submitted_at=at(day, 12), status="rejected", reviewed_at=at(day, 13))
    put_price(MILK_ID, "fairprice", 380, submitted_at=at(older), reviewed_at=at(day, 14))   # flagged, then accepted
    put_price(MILK_ID, "coldstorage", 365, submitted_at=at(older))
    run({"date": older.isoformat()})
    run({})

    status, result = call(basket.handler, api_event("POST", "/basket/compare", {"items": [{"productId": MILK_ID, "quantity": 1}]}, user_id=None))
    assert status == 200
    lines = {s["retailerId"]: s["lines"] for s in result["basket"]["stores"]}
    assert (lines["fairprice"][0]["unitPriceCents"], lines["fairprice"][0]["submissionCount"]) == (370, 3)  # (360 + 370 + 380) / 3
    assert (lines["coldstorage"][0]["unitPriceCents"], lines["coldstorage"][0]["priceDate"]) == (365, older.isoformat())
    assert lines["shengsiong"] == []
    assert result["basket"]["recommendation"]["retailerId"] == "coldstorage"
    assert result["pricesUpdated"] is not None
