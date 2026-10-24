import json
import os
import sys
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
