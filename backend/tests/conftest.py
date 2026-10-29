import json
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

import boto3
import pytest
from moto import mock_aws

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lambdas"))

from common import db  # noqa: E402

REGION = "ap-southeast-1"
BUCKET = "trolleysaver-unit-photos"
USER_ID = "11111111-aaaa-4bbb-8ccc-000000000001"
OTHER_USER_ID = "22222222-aaaa-4bbb-8ccc-000000000002"
ADMIN_ID = "33333333-aaaa-4bbb-8ccc-000000000003"
MILK_ID = "a2210900-d837-5e6d-bbbc-73dea4f80ea1"

ENV = {
    "AWS_DEFAULT_REGION": REGION,
    "AWS_REGION": REGION,
    "AWS_ACCESS_KEY_ID": "testing",
    "AWS_SECRET_ACCESS_KEY": "testing",
    "AWS_SESSION_TOKEN": "testing",
    "PRODUCT_TABLE": "unit-product",
    "RETAILER_TABLE": "unit-retailer",
    "SUBMISSION_TABLE": "unit-price-submission",
    "USER_TABLE": "unit-user",
    "RETAILER_PRICE_TABLE": "unit-retailer-price",
    "PHOTO_BUCKET": BUCKET,
    "ALLOWED_ORIGIN": "http://localhost:5173",
    "RATE_LIMIT_PER_HOUR": "30",
}


def create_tables(dynamodb, prefix="unit"):
    for name, key in (("product", "id"), ("retailer", "id"), ("user", "userId")):
        dynamodb.create_table(
            TableName=f"{prefix}-{name}",
            BillingMode="PAY_PER_REQUEST",
            AttributeDefinitions=[{"AttributeName": key, "AttributeType": "S"}],
            KeySchema=[{"AttributeName": key, "KeyType": "HASH"}],
        )
    attrs = ["productId", "sk", "retailerId", "observedAt", "userId", "submittedAt", "status"]
    gsis = {"ByRetailer": ("retailerId", "observedAt"), "ByUser": ("userId", "submittedAt"), "ByStatus": ("status", "submittedAt")}
    dynamodb.create_table(
        TableName=f"{prefix}-price-submission",
        BillingMode="PAY_PER_REQUEST",
        AttributeDefinitions=[{"AttributeName": a, "AttributeType": "S"} for a in attrs],
        KeySchema=[{"AttributeName": "productId", "KeyType": "HASH"}, {"AttributeName": "sk", "KeyType": "RANGE"}],
        GlobalSecondaryIndexes=[
            {
                "IndexName": name,
                "KeySchema": [{"AttributeName": pk, "KeyType": "HASH"}, {"AttributeName": sk, "KeyType": "RANGE"}],
                "Projection": {"ProjectionType": "ALL"},
            }
            for name, (pk, sk) in gsis.items()
        ],
    )
    dynamodb.create_table(
        TableName=f"{prefix}-retailer-price",
        BillingMode="PAY_PER_REQUEST",
        AttributeDefinitions=[{"AttributeName": a, "AttributeType": "S"} for a in ("productId", "retailerId")],
        KeySchema=[{"AttributeName": "productId", "KeyType": "HASH"}, {"AttributeName": "retailerId", "KeyType": "RANGE"}],
    )


@pytest.fixture
def aws(monkeypatch):
    for key, value in ENV.items():
        monkeypatch.setenv(key, value)
    db.reset()
    with mock_aws():
        dynamodb = boto3.resource("dynamodb", region_name=REGION)
        create_tables(dynamodb)
        boto3.client("s3", region_name=REGION).create_bucket(
            Bucket=BUCKET, CreateBucketConfiguration={"LocationConstraint": REGION}
        )
        dynamodb.Table("unit-product").put_item(Item={
            "id": MILK_ID, "name": "Magnolia Fresh Milk", "brand": "Magnolia", "packQty": 946,
            "packUnit": "ml", "category": "milk", "hcs": False, "minCents": 181, "maxCents": 548,
        })
        for rid, name in (("fairprice", "FairPrice"), ("shengsiong", "Sheng Siong"), ("coldstorage", "Cold Storage")):
            dynamodb.Table("unit-retailer").put_item(Item={"id": rid, "name": name})
        dynamodb.Table("unit-user").put_item(Item={"userId": USER_ID, "displayName": "Alex Tan", "email": "alex@example.com", "submissionCount": 0})
        yield dynamodb
    db.reset()


def api_event(method="GET", resource="/", body=None, user_id=USER_ID, groups=None, query=None, path_params=None, token_use="access"):
    event = {
        "httpMethod": method,
        "resource": resource,
        "path": resource,
        "body": json.dumps(body) if isinstance(body, (dict, list)) else body,
        "queryStringParameters": query,
        "pathParameters": path_params,
        "requestContext": {"authorizer": {}},
    }
    if user_id:
        claims = {"sub": user_id, "token_use": token_use, "scope": "aws.cognito.signin.user.admin"}
        if groups:
            claims["cognito:groups"] = groups
        event["requestContext"]["authorizer"]["claims"] = claims
    return event


class Context:
    aws_request_id = "req-123"


def call(handler, event):
    result = handler(event, Context())
    return result["statusCode"], json.loads(result["body"])


def put_photo(key, content_type="image/png", size=1024):
    boto3.client("s3", region_name=REGION).put_object(Bucket=BUCKET, Key=key, Body=b"x" * size, ContentType=content_type)


def iso(dt):
    return dt.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def put_price(product_id, retailer_id, cents, observed_at=None, status="accepted", submitted_at=None, user_id="seed-team",
              reviewed_at=None):
    """Write a price submission directly (create_submission refuses prices observed over 30 days ago)."""
    observed = iso(observed_at or datetime.now(timezone.utc) - timedelta(days=1))
    submission_id = str(uuid.uuid4())
    item = {
        "productId": product_id,
        "sk": f"{retailer_id}#{observed}#{submission_id}",
        "submissionId": submission_id,
        "retailerId": retailer_id,
        "userId": user_id,
        "priceCents": cents,
        "observedAt": observed,
        "submittedAt": iso(submitted_at) if submitted_at else observed,
        "status": status,
    }
    if reviewed_at:
        item.update(reviewedAt=iso(reviewed_at), reviewedBy="admin")
    boto3.resource("dynamodb", region_name=REGION).Table(ENV["SUBMISSION_TABLE"]).put_item(Item=item)


SGT = timezone(timedelta(hours=8))


def sgt_today():
    return datetime.now(SGT).date()


def put_stored_price(product_id, retailer_id, cents, price_date=None, submission_count=1, computed_at="2026-10-25T16:05:00.000Z"):
    """Write a retailer-price row directly, as if the nightly job had stored it."""
    boto3.resource("dynamodb", region_name=REGION).Table(ENV["RETAILER_PRICE_TABLE"]).put_item(Item={
        "productId": product_id,
        "retailerId": retailer_id,
        "priceCents": cents,
        "submissionCount": submission_count,
        "priceDate": (price_date or sgt_today() - timedelta(days=1)).isoformat(),
        "computedAt": computed_at,
    })


WHITE_ID = "b0000000-0000-4000-8000-000000000001"
WHOLEMEAL_ID = "b0000000-0000-4000-8000-000000000002"
DETERGENT_ID = "b0000000-0000-4000-8000-000000000003"


@pytest.fixture
def basket_catalog(aws):
    """Bread with an HCS alternative and a detergent with none, with stored prices at all three stores."""
    table = aws.Table("unit-product")
    for item in (
        {"id": WHITE_ID, "name": "Sunshine White Bread", "brand": "Sunshine", "packQty": 400, "packUnit": "g", "category": "bread", "hcs": False},
        {"id": WHOLEMEAL_ID, "name": "Sunshine Wholemeal Bread", "brand": "Sunshine", "packQty": 400, "packUnit": "g", "category": "bread", "hcs": True},
        {"id": DETERGENT_ID, "name": "Top Detergent", "brand": "Top", "packQty": Decimal("2.6"), "packUnit": "kg", "category": "detergent", "hcs": False},
    ):
        table.put_item(Item=item)
    for product_id, prices in (
        (WHITE_ID, {"fairprice": 250, "shengsiong": 240, "coldstorage": 260}),
        (WHOLEMEAL_ID, {"fairprice": 330, "shengsiong": 320, "coldstorage": 340}),
        (DETERGENT_ID, {"fairprice": 848, "shengsiong": 847, "coldstorage": 860}),
    ):
        for retailer_id, cents in prices.items():
            put_stored_price(product_id, retailer_id, cents)
    return aws
