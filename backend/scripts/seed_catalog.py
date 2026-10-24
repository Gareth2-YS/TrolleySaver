"""Seed the product, retailer and price-submission tables from the team's ground-truth spreadsheet.

Usage (from backend/):
    .venv/Scripts/python scripts/seed_catalog.py --env dev --dry-run     # show what would be added
    .venv/Scripts/python scripts/seed_catalog.py --env dev               # add it

Never replaces or changes existing data:
- A product already in the table (matched by name, ignoring case and extra spaces) is kept exactly
  as it is, and the spreadsheet's prices for it use its existing id. New products get a UUIDv5 id
  derived from the name.
- Retailers that already exist are left alone.
- A seed price is only added when that product has no seed price at that retailer yet
  (seed prices are the ones with userId "seed-team"). Contributors' submissions are never touched.
Every write is conditional ("only if it doesn't exist"), so re-running is safe. Only regular prices
are seeded (promotions aren't tracked), as accepted submissions by "seed-team".
"""

import argparse
import math
import uuid
from collections import Counter, defaultdict
from datetime import datetime, time, timedelta, timezone
from decimal import Decimal
from pathlib import Path

import boto3
import openpyxl
from boto3.dynamodb.conditions import Attr, Key
from botocore.exceptions import ClientError

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_XLSX = REPO_ROOT / "data" / "products 241026.xlsx"
NAMESPACE = uuid.uuid5(uuid.NAMESPACE_URL, "https://trolleysaver/seed")
SGT = timezone(timedelta(hours=8))
SEED_USER = "seed-team"
SHARED_ENVS = ("dev", "staging", "prod")

RETAILERS = {
    "fairprice": "FairPrice",
    "shengsiong": "Sheng Siong",
    "coldstorage": "Cold Storage",
}
RETAILER_ALIASES = {"sheng_siong": "shengsiong", "cold_storage": "coldstorage"}
UNIT_ALIASES = {"mL": "ml"}
COMPARED_FIELDS = ("brand", "packQty", "packUnit", "packCount", "category", "hcs", "minCents", "maxCents")


def normalise_name(name):
    return " ".join(str(name).split()).casefold()


def split_list(value):
    if not value:
        return []
    return [part.strip() for part in str(value).split(",") if part.strip()]


def number(value):
    """Spreadsheet numbers arrive as floats; DynamoDB needs int or Decimal."""
    if value is None or value == "":
        return None
    as_float = float(value)
    return int(as_float) if as_float.is_integer() else Decimal(str(round(as_float, 3)))


def read_rows(path):
    sheet = openpyxl.load_workbook(path, data_only=True, read_only=True).active
    rows = sheet.iter_rows(values_only=True)
    header = [str(h).strip() if h else None for h in next(rows)]
    return [dict(zip(header, row)) for row in rows if row and len(row) > 1 and row[1]]


def build_items(rows, observed_date, existing_ids=None):
    """Turn spreadsheet rows into table items.

    existing_ids maps a normalised product name to the id it already has in the table, so prices
    for existing products are attached to them instead of to a new duplicate product.
    """
    existing_ids = existing_ids or {}
    warnings = []
    by_name = defaultdict(list)
    for row in rows:
        by_name[str(row["name"]).strip()].append(row)

    observed_at = datetime.combine(observed_date, time(), SGT).astimezone(timezone.utc)
    observed_iso = observed_at.isoformat(timespec="milliseconds").replace("+00:00", "Z")

    products, submissions = [], []
    for name, product_rows in by_name.items():
        regular = [r for r in product_rows if r.get("priceType") == "regular"]
        first = regular[0] if regular else product_rows[0]
        product_id = existing_ids.get(normalise_name(name)) or str(uuid.uuid5(NAMESPACE, f"product:{name}"))

        pack_sizes = Counter(number(r["packQty"]) for r in product_rows)
        if len(pack_sizes) > 1:
            sizes = ", ".join(str(size) for size in pack_sizes)
            warnings.append(f"{name}: pack size differs by retailer ({sizes}); using {number(first['packQty'])}")

        products.append({
            "id": product_id,
            "name": name,
            "brand": str(first["brand"]).strip(),
            "packQty": number(first["packQty"]),
            "packUnit": UNIT_ALIASES.get(first["packUnit"], first["packUnit"]),
            "packCount": number(first.get("minQty")) or 1,
            "category": str(first["category"]).strip(),
            "hcs": first.get("healthier_choice") == "certified",
            "dietary": split_list(first.get("dietary")),
            "searchTerms": split_list(first.get("searchTerms")),
            "minCents": math.floor(min(float(r["minCents"]) for r in product_rows)),
            "maxCents": math.ceil(max(float(r["maxCents"]) for r in product_rows)),
        })

        for row in regular:
            retailer_id = RETAILER_ALIASES.get(row["retailerID"], row["retailerID"])
            if retailer_id not in RETAILERS:
                warnings.append(f"{name}: unknown retailer {row['retailerID']!r}, skipped")
                continue
            submission_id = str(uuid.uuid5(NAMESPACE, f"seed:{product_id}:{retailer_id}"))
            submissions.append({
                "productId": product_id,
                "sk": f"{retailer_id}#{observed_iso}#{submission_id}",
                "submissionId": submission_id,
                "retailerId": retailer_id,
                "userId": SEED_USER,
                "priceCents": int(round(float(row["priceCents"]))),
                "observedAt": observed_iso,
                "submittedAt": observed_iso,
                "status": "accepted",
            })
        skipped_promos = len(product_rows) - len(regular)
        if skipped_promos:
            warnings.append(f"{name}: skipped {skipped_promos} promo row(s)")

    retailers = [{"id": rid, "name": rname} for rid, rname in RETAILERS.items()]
    return products, retailers, submissions, warnings


def scan_all(table):
    items, kwargs = [], {}
    while True:
        page = table.scan(**kwargs)
        items.extend(page["Items"])
        if "LastEvaluatedKey" not in page:
            return items
        kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]


def has_seed_price(table, product_id, retailer_id):
    kwargs = {
        "KeyConditionExpression": Key("productId").eq(product_id) & Key("sk").begins_with(f"{retailer_id}#"),
        "FilterExpression": Attr("userId").eq(SEED_USER),
        "Select": "COUNT",
    }
    while True:
        page = table.query(**kwargs)
        if page["Count"]:
            return True
        if "LastEvaluatedKey" not in page:
            return False
        kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]


def put_if_absent(table, item, key_attribute):
    """Write the item only if nothing exists at its key. Returns False if something already did."""
    try:
        table.put_item(
            Item=item,
            ConditionExpression="attribute_not_exists(#k)",
            ExpressionAttributeNames={"#k": key_attribute},
        )
        return True
    except ClientError as error:
        if error.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return False
        raise


def differences(existing, new):
    return [f"{field} {existing.get(field)!r} (sheet: {new.get(field)!r})"
            for field in COMPARED_FIELDS if existing.get(field) != new.get(field)]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--env", required=True, help="Environment, e.g. dev (tables trolleysaver-<env>-*)")
    parser.add_argument("--xlsx", type=Path, default=DEFAULT_XLSX)
    parser.add_argument("--observed-date", default="2026-10-24", help="Date the prices were collected (YYYY-MM-DD, SGT)")
    parser.add_argument("--region", default="ap-southeast-1")
    parser.add_argument("--dry-run", action="store_true", help="Read the tables and report what would be added, without writing")
    parser.add_argument("--yes", action="store_true", help="Skip the confirmation prompt for shared environments")
    args = parser.parse_args()

    dynamodb = boto3.resource("dynamodb", region_name=args.region)
    prefix = f"trolleysaver-{args.env}"
    product_table = dynamodb.Table(f"{prefix}-product")
    retailer_table = dynamodb.Table(f"{prefix}-retailer")
    submission_table = dynamodb.Table(f"{prefix}-price-submission")

    try:
        existing_products = {normalise_name(p["name"]): p for p in scan_all(product_table) if p.get("name")}
        existing_retailers = {r["id"] for r in scan_all(retailer_table)}
    except ClientError as error:
        if error.response["Error"]["Code"] == "ResourceNotFoundException":
            raise SystemExit(f"Tables {prefix}-* not found. Check --env and that you're logged in to the right account.")
        raise

    observed_date = datetime.strptime(args.observed_date, "%Y-%m-%d").date()
    products, retailers, submissions, warnings = build_items(
        read_rows(args.xlsx), observed_date, {name: p["id"] for name, p in existing_products.items()}
    )

    new_products = [p for p in products if normalise_name(p["name"]) not in existing_products]
    new_retailers = [r for r in retailers if r["id"] not in existing_retailers]
    new_submissions = [s for s in submissions if not has_seed_price(submission_table, s["productId"], s["retailerId"])]

    for warning in warnings:
        print(f"note: {warning}")
    for product in products:
        existing = existing_products.get(normalise_name(product["name"]))
        if existing:
            diff = differences(existing, product)
            print(f"keep  {product['name']}  (already exists as {existing['id']}"
                  + (f"; left unchanged although it differs: {', '.join(diff)})" if diff else ")"))
        else:
            print(f"add   {product['name']}  ({product['id']}, {product['minCents']}-{product['maxCents']}c)")
    print()
    print(f"{prefix}-product:          {len(new_products):>3} to add, {len(products) - len(new_products):>3} already exist (kept)")
    print(f"{prefix}-retailer:         {len(new_retailers):>3} to add, {len(retailers) - len(new_retailers):>3} already exist (kept)")
    print(f"{prefix}-price-submission: {len(new_submissions):>3} to add, "
          f"{len(submissions) - len(new_submissions):>3} skipped (a seed price already exists for that product and store)")

    if args.dry_run:
        print("\nDry run: nothing was written.")
        return
    if not (new_products or new_retailers or new_submissions):
        print("\nNothing to add.")
        return
    if args.env in SHARED_ENVS and not args.yes:
        confirm = input(f"\nAdd these items to the shared {args.env} tables? Type the env name to confirm: ")
        if confirm.strip() != args.env:
            print("Aborted.")
            return

    added = Counter()
    for item in new_retailers:
        added["retailers"] += put_if_absent(retailer_table, item, "id")
    for item in new_products:
        added["products"] += put_if_absent(product_table, item, "id")
    for item in new_submissions:
        added["prices"] += put_if_absent(submission_table, item, "sk")
    print(f"\nAdded {added['products']} products, {added['retailers']} retailers and {added['prices']} prices to {prefix}-*.")


if __name__ == "__main__":
    main()
