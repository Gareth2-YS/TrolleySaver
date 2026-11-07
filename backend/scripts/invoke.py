"""Call the backend Lambdas directly as any user, without Cognito or an access token.

API Gateway normally verifies the Cognito token and passes the caller's claims to the Lambda.
This script builds that same event itself, with whatever user id and groups you choose, and either
invokes the deployed function (default) or runs the handler code on your machine (--local).
Both hit the real tables and bucket of the chosen environment using your own AWS credentials,
so this only works for people with access to the AWS account.

Usage (from backend/; see TESTING.md for a full walkthrough):
    .venv/Scripts/python scripts/invoke.py products
    .venv/Scripts/python scripts/invoke.py submit --set productId=<id> --set retailerId=fairprice --set priceCents=363 --set observedAt=2026-10-24
    .venv/Scripts/python scripts/invoke.py upload-photo --file shelf.jpg --product <id> --retailer fairprice   # prints a photoKey
    .venv/Scripts/python scripts/invoke.py mine
    .venv/Scripts/python scripts/invoke.py review-queue --as admin
    .venv/Scripts/python scripts/invoke.py moderate --as admin --id <id> --set decision=rejected --set reason="Unreadable label"
    .venv/Scripts/python scripts/invoke.py delete-submission --id <id>         # only while it's pending (flagged)
    .venv/Scripts/python scripts/invoke.py upload-request-image --file oat.png                              # prints a productImageKey
    .venv/Scripts/python scripts/invoke.py request-product --set name="Oat Milk" ... --set dietary=[vegan,halal]
    .venv/Scripts/python scripts/invoke.py my-product-requests
    .venv/Scripts/python scripts/invoke.py delete-product-request --id <id>    # only while it's pending
    .venv/Scripts/python scripts/invoke.py product-queue --as admin
    .venv/Scripts/python scripts/invoke.py moderate-product --as admin --id <id> --set decision=approved --set changes.category=milk
    .venv/Scripts/python scripts/invoke.py basket --body-file baskets/weekly-staples.json
    .venv/Scripts/python scripts/invoke.py search --query q=milk --query maxPriceCents=500
    .venv/Scripts/python scripts/invoke.py aggregate                          # nightly price job, for yesterday
    .venv/Scripts/python scripts/invoke.py aggregate --set date=2026-10-24    # ... or one day, or --set backfillDays=30
    .venv/Scripts/python scripts/invoke.py cleanup        # delete everything the fake users created

--set KEY=VALUE builds the JSON body for you (whole numbers become numbers, true/false booleans,
[a,b] a list, [] an empty list, a.b=value a nested field, everything else text), which avoids shell
quoting problems. --body '<json>' sends raw JSON instead, and --body-file reads it from a file
(easiest for nested bodies such as a basket).
Add --local to run the handler in-process (set breakpoints, add prints, no deploy needed).
"""

import argparse
import json
import mimetypes
import os
import re
import sys
import uuid
from pathlib import Path

import boto3
import requests
from boto3.dynamodb.conditions import Key

from stack import DEFAULT_REGION, stack_outputs

DEFAULT_ENV = "dev"
DEFAULT_USER_ID = "invoke-test-user"
DEFAULT_ADMIN_ID = "invoke-test-admin"

# route name -> (function suffix, handler module, HTTP method, API resource, needs auth)
ROUTES = {
    "products": ("catalog", "catalog", "GET", "/products", False),
    "retailers": ("catalog", "catalog", "GET", "/retailers", False),
    "upload-url": ("upload-url", "upload_url", "POST", "/price-submissions/image-upload-url", True),
    "submit": ("create-submission", "create_submission", "POST", "/price-submissions", True),
    "mine": ("my-submissions", "my_submissions", "GET", "/price-submissions/mine", True),
    "delete-submission": ("delete-submission", "delete_submission", "DELETE", "/price-submissions/{id}", True),
    "review-queue": ("admin-submissions", "admin_submissions", "GET", "/admin/price-submissions", True),
    "moderate": ("admin-submissions", "admin_submissions", "PATCH", "/admin/price-submissions/{id}", True),
    "basket": ("basket", "basket", "POST", "/basket/compare", False),
    "search": ("search", "search", "GET", "/products/search", False),
    "request-upload-url": ("product-requests", "product_requests", "POST", "/product-requests/image-upload-url", True),
    "request-product": ("product-requests", "product_requests", "POST", "/product-requests", True),
    "my-product-requests": ("product-requests", "product_requests", "GET", "/product-requests/mine", True),
    "delete-product-request": ("product-requests", "product_requests", "DELETE", "/product-requests/{id}", True),
    "product-queue": ("admin-product-requests", "admin_product_requests", "GET", "/admin/product-requests", True),
    "moderate-product": ("admin-product-requests", "admin_product_requests", "PATCH", "/admin/product-requests/{id}", True),
}
# Lambdas that aren't behind API Gateway: the --set fields are sent as the raw event.
JOBS = {
    "aggregate": ("price-aggregator", "aggregate_prices"),
}


def build_event(route, user_id, groups, body, query, submission_id):
    _, _, method, resource, needs_auth = ROUTES[route]
    event = {
        "httpMethod": method,
        "resource": resource,
        "path": resource.replace("{id}", submission_id or ""),
        "body": body,
        "queryStringParameters": query or None,
        "pathParameters": {"id": submission_id} if submission_id else None,
        "requestContext": {"requestId": str(uuid.uuid4()), "authorizer": {}},
    }
    if needs_auth and user_id:
        # The same claims API Gateway's Cognito authorizer would pass through from an access token.
        claims = {"sub": user_id, "token_use": "access", "scope": "aws.cognito.signin.user.admin"}
        if groups:
            claims["cognito:groups"] = groups
        event["requestContext"]["authorizer"]["claims"] = claims
    return event


def invoke_deployed(env, region, route, event):
    function_name = f"trolleysaver-{env}-{(ROUTES.get(route) or JOBS[route])[0]}"
    result = boto3.client("lambda", region_name=region).invoke(FunctionName=function_name, Payload=json.dumps(event))
    payload = json.loads(result["Payload"].read())
    if result.get("FunctionError"):
        raise SystemExit(f"Lambda crashed: {json.dumps(payload, indent=2)}")
    return payload


def invoke_local(env, region, route, event):
    outputs = stack_outputs(env, region)
    os.environ.update({
        "AWS_REGION": region,
        "PRODUCT_TABLE": f"trolleysaver-{env}-product",
        "RETAILER_TABLE": f"trolleysaver-{env}-retailer",
        "SUBMISSION_TABLE": f"trolleysaver-{env}-price-submission",
        "USER_TABLE": f"trolleysaver-{env}-user",
        "RETAILER_PRICE_TABLE": f"trolleysaver-{env}-retailer-price",
        "PRODUCT_REQUEST_TABLE": f"trolleysaver-{env}-product-request",
        "PHOTO_BUCKET": outputs["PhotoBucketName"],
    })
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lambdas"))
    module = __import__(f"handlers.{(ROUTES.get(route) or JOBS[route])[1]}", fromlist=["handler"])

    class Context:
        aws_request_id = (event.get("requestContext") or {}).get("requestId", "local")

    return module.handler(event, Context())


def parse_value(text):
    """--set value typing: 363 -> int, 3.5 -> float, true/false -> bool, null -> None,
    [a,b] -> list, [] -> empty list, else the text."""
    if text.startswith("[") and text.endswith("]"):
        inner = text[1:-1].strip()
        return [parse_value(part.strip()) for part in inner.split(",")] if inner else []
    if re.fullmatch(r"-?\d+", text):
        return int(text)
    if re.fullmatch(r"-?\d+\.\d+", text):
        return float(text)
    return {"true": True, "false": False, "null": None}.get(text, text)


def request_body(raw_json, pairs):
    if not raw_json and not pairs:
        return None
    body = json.loads(raw_json) if raw_json else {}
    for pair in pairs:
        key, sep, value = pair.partition("=")
        if not sep:
            raise SystemExit(f"--set needs KEY=VALUE, got {pair!r}")
        *parents, name = key.split(".")  # changes.category=milk -> {"changes": {"category": "milk"}}
        target = body
        for parent in parents:
            target = target.setdefault(parent, {})
        target[name] = parse_value(value)
    return json.dumps(body)


def print_result(result):
    print(f"HTTP {result['statusCode']}")
    if result["body"]:
        print(json.dumps(json.loads(result["body"]), indent=2, ensure_ascii=False))


def upload_file(call, route, request, file_path, user_id, groups):
    """Do what the browser does: ask a Lambda for a presigned POST, then upload the file straight to S3."""
    path = Path(file_path)
    if not path.is_file():
        raise SystemExit(f"No such file: {path}")
    content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    body = json.dumps({**request, "contentType": content_type, "sizeBytes": path.stat().st_size, "fileName": path.name})
    result = call(route, build_event(route, user_id, groups, body, None, None))
    if result["statusCode"] != 200:
        print(f"{route} Lambda refused the request:")
        print_result(result)
        return
    target = json.loads(result["body"])
    with path.open("rb") as file:
        response = requests.post(target["uploadUrl"], data=target["fields"],
                                 files={"file": (path.name, file, content_type)}, timeout=120)
    if response.status_code in (200, 204):
        print(f"Uploaded {path.name} ({content_type}, {path.stat().st_size} bytes) to S3 (HTTP {response.status_code})")
        name = "productImageKey" if "productImageKey" in target else "photoKey"
        print(f"{name}: {target[name]}")
    else:
        print(f"S3 rejected the upload: HTTP {response.status_code}\n{response.text}")


def _delete_all(table, key_names, items):
    for item in items:
        table.delete_item(Key={name: item[name] for name in key_names})
    return len(items)


def cleanup(env, region, user_ids):
    """Delete everything the given (fake) user ids created: submissions, product requests and the
    products and prices published from them, profile rows, evidence photos and product pictures."""
    dynamodb = boto3.resource("dynamodb", region_name=region)
    table = lambda name: dynamodb.Table(f"trolleysaver-{env}-{name}")  # noqa: E731
    submissions, users, requests_table = table("price-submission"), table("user"), table("product-request")
    products, retailer_prices = table("product"), table("retailer-price")
    s3 = boto3.client("s3", region_name=region)
    bucket = stack_outputs(env, region)["PhotoBucketName"]

    def delete_objects(prefix):
        objects = s3.list_objects_v2(Bucket=bucket, Prefix=prefix).get("Contents", [])
        for obj in objects:
            s3.delete_object(Bucket=bucket, Key=obj["Key"])
        return len(objects)

    for user_id in user_ids:
        product_requests = requests_table.query(IndexName="ByUser", KeyConditionExpression=Key("userId").eq(user_id))["Items"]
        published = 0
        for request in product_requests:
            product_id = request.get("productId")
            if product_id:  # approved: remove the product, every price for it, its daily prices and picture
                _delete_all(submissions, ("productId", "sk"),
                            submissions.query(KeyConditionExpression=Key("productId").eq(product_id))["Items"])
                _delete_all(retailer_prices, ("productId", "retailerId"),
                            retailer_prices.query(KeyConditionExpression=Key("productId").eq(product_id))["Items"])
                products.delete_item(Key={"id": product_id})
                delete_objects(f"product-images/{product_id}.")
                published += 1
            requests_table.delete_item(Key={"requestId": request["requestId"]})
        items = submissions.query(IndexName="ByUser", KeyConditionExpression=Key("userId").eq(user_id))["Items"]
        _delete_all(submissions, ("productId", "sk"), items)
        users.delete_item(Key={"userId": user_id})
        photos = delete_objects(f"price-evidence/{user_id}/") + delete_objects(f"product-images/pending/{user_id}/")
        print(f"{user_id}: deleted {len(items)} submission(s), {len(product_requests)} product request(s) "
              f"({published} published product(s)), {photos} image(s) and the profile row")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("route", choices=[*ROUTES, *JOBS, "upload-photo", "upload-request-image", "cleanup"])
    parser.add_argument("--env", default=DEFAULT_ENV)
    parser.add_argument("--region", default=DEFAULT_REGION)
    parser.add_argument("--as", dest="role", choices=["user", "admin", "anonymous"], default="user")
    parser.add_argument("--user-id", help=f"Fake Cognito sub (default {DEFAULT_USER_ID} / {DEFAULT_ADMIN_ID})")
    parser.add_argument("--set", action="append", default=[], metavar="KEY=VALUE", help="Body field (repeatable); builds the JSON for you")
    parser.add_argument("--body", help="Raw JSON request body (fields from --set are added on top)")
    parser.add_argument("--body-file", help="Read the raw JSON request body from this file instead of --body")
    parser.add_argument("--query", action="append", default=[], metavar="KEY=VALUE", help="Query string parameter (repeatable)")
    parser.add_argument("--id", help="Submission or product-request id (moderate, delete-submission, moderate-product, delete-product-request)")
    parser.add_argument("--file", help="Image to upload (upload-photo, upload-request-image)")
    parser.add_argument("--product", help="Product id the evidence photo is for (upload-photo)")
    parser.add_argument("--retailer", default="fairprice", help="Store id the evidence photo is for (upload-photo; default fairprice)")
    parser.add_argument("--purpose", choices=["product-image", "evidence"], default="product-image",
                        help="What a product-request upload is (upload-request-image; default product-image)")
    parser.add_argument("--local", action="store_true", help="Run the handler code locally instead of the deployed Lambda")
    args = parser.parse_args()
    sys.stdout.reconfigure(errors="replace")  # product names with symbols shouldn't crash output piped in a Windows terminal

    if args.route == "cleanup":
        cleanup(args.env, args.region, [args.user_id] if args.user_id else [DEFAULT_USER_ID, DEFAULT_ADMIN_ID])
        return
    if args.route in ("moderate", "delete-submission", "moderate-product", "delete-product-request") and not args.id:
        parser.error(f"{args.route} needs --id")
    if args.route in ("upload-photo", "upload-request-image") and not args.file:
        parser.error(f"{args.route} needs --file")
    if args.route == "upload-photo" and not args.product:
        parser.error("upload-photo needs --product (evidence photos are tied to a product)")
    if args.body_file:
        if args.body:
            parser.error("use --body or --body-file, not both")
        try:
            args.body = Path(args.body_file).read_text(encoding="utf-8-sig")
        except OSError as error:
            raise SystemExit(f"Can't read --body-file: {error}")
    try:
        body = request_body(args.body, args.set)
    except json.JSONDecodeError as error:
        raise SystemExit(f"The request body is not valid JSON ({error}). Tip: use --set KEY=VALUE or --body-file instead.")

    user_id = None if args.role == "anonymous" else args.user_id or (DEFAULT_ADMIN_ID if args.role == "admin" else DEFAULT_USER_ID)
    groups = "admin" if args.role == "admin" else ("user" if user_id else None)
    invoke = invoke_local if args.local else invoke_deployed

    def call(route, event):
        return invoke(args.env, args.region, route, event)

    if args.route == "upload-photo":
        upload_file(call, "upload-url", {"productId": args.product, "retailerId": args.retailer}, args.file, user_id, groups)
        return
    if args.route == "upload-request-image":
        upload_file(call, "request-upload-url", {"purpose": args.purpose}, args.file, user_id, groups)
        return
    if args.route in JOBS:
        print(json.dumps(call(args.route, json.loads(body) if body else {}), indent=2))
        return
    query = dict(pair.split("=", 1) for pair in args.query)
    print_result(call(args.route, build_event(args.route, user_id, groups, body, query, args.id)))


if __name__ == "__main__":
    main()
