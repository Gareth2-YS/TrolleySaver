import sys
from pathlib import Path

import boto3
import pytest
from boto3.dynamodb.conditions import Key
from moto import mock_aws

from conftest import ENV, REGION, create_tables

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import seed_catalog  # noqa: E402

PREFIX = "trolleysaver-unit"
EXISTING_MILK_ID = "a2210900-d837-5e6d-bbbc-73dea4f80ea1"


@pytest.fixture
def tables(monkeypatch):
    for key, value in ENV.items():
        monkeypatch.setenv(key, value)
    with mock_aws():
        dynamodb = boto3.resource("dynamodb", region_name=REGION)
        create_tables(dynamodb, PREFIX)
        yield {name: dynamodb.Table(f"{PREFIX}-{name}") for name in ("product", "retailer", "price-submission")}


def run_seed(monkeypatch, *extra):
    monkeypatch.setattr(sys, "argv", ["seed_catalog.py", "--env", "unit", *extra])
    seed_catalog.main()


def counts(tables):
    return {name: len(table.scan()["Items"]) for name, table in tables.items()}


def prices_for(tables, product_id):
    return tables["price-submission"].query(KeyConditionExpression=Key("productId").eq(product_id))["Items"]


def test_seeds_empty_tables(tables, monkeypatch):
    run_seed(monkeypatch)
    assert counts(tables) == {"product": 24, "retailer": 3, "price-submission": 72}
    item = tables["price-submission"].scan()["Items"][0]
    assert item["userId"] == "seed-team" and item["status"] == "accepted"


def test_existing_entries_are_reused_and_never_replaced(tables, monkeypatch):
    # Hand-made data like the dev tables: same product name (different case/spacing), custom values.
    tables["product"].put_item(Item={"id": EXISTING_MILK_ID, "name": "magnolia  fresh milk", "minCents": 100, "maxCents": 900})
    tables["retailer"].put_item(Item={"id": "fairprice", "name": "FairPrice (custom)"})
    tables["price-submission"].put_item(Item={
        "productId": EXISTING_MILK_ID, "sk": "fairprice#2026-10-22T14:59:36.973Z#existing", "retailerId": "fairprice",
        "userId": "seed-team", "priceCents": 363, "status": "accepted",
        "observedAt": "2026-10-22T14:59:36.973Z", "submittedAt": "2026-10-22T14:59:36.973Z",
    })

    run_seed(monkeypatch)

    # 23 new products + the existing milk; no duplicate milk with a new id.
    assert counts(tables)["product"] == 24
    milk = tables["product"].get_item(Key={"id": EXISTING_MILK_ID})["Item"]
    assert (milk["minCents"], milk["maxCents"], milk["name"]) == (100, 900, "magnolia  fresh milk")
    assert tables["retailer"].get_item(Key={"id": "fairprice"})["Item"]["name"] == "FairPrice (custom)"

    # The milk's spreadsheet prices attach to the existing id; FairPrice already had a seed price, so it's skipped.
    milk_prices = prices_for(tables, EXISTING_MILK_ID)
    by_store = sorted((p["retailerId"], p["sk"].endswith("#existing")) for p in milk_prices)
    assert by_store == [("coldstorage", False), ("fairprice", True), ("shengsiong", False)]
    assert counts(tables)["price-submission"] == 72


def test_contributor_prices_do_not_block_seed_prices(tables, monkeypatch):
    tables["product"].put_item(Item={"id": EXISTING_MILK_ID, "name": "Magnolia Fresh Milk", "minCents": 181, "maxCents": 548})
    tables["price-submission"].put_item(Item={
        "productId": EXISTING_MILK_ID, "sk": "fairprice#2026-10-23T01:00:00.000Z#user", "retailerId": "fairprice",
        "userId": "some-contributor", "priceCents": 370, "status": "accepted",
        "observedAt": "2026-10-23T01:00:00.000Z", "submittedAt": "2026-10-23T01:00:00.000Z",
    })
    run_seed(monkeypatch)
    assert sorted(p["userId"] for p in prices_for(tables, EXISTING_MILK_ID)) == ["seed-team"] * 3 + ["some-contributor"]


def test_rerun_adds_nothing(tables, monkeypatch, capsys):
    run_seed(monkeypatch)
    before = counts(tables)
    run_seed(monkeypatch)
    assert counts(tables) == before
    assert "Nothing to add." in capsys.readouterr().out


def test_dry_run_writes_nothing(tables, monkeypatch, capsys):
    run_seed(monkeypatch, "--dry-run")
    assert counts(tables) == {"product": 0, "retailer": 0, "price-submission": 0}
    assert "24 to add" in capsys.readouterr().out
