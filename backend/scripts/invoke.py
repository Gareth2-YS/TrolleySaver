"""Call the backend Lambdas directly as any user, without Cognito or an access token.

API Gateway normally verifies the Cognito token and passes the caller's claims to the Lambda.
This script builds that same event itself, with whatever user id and groups you choose, and either
invokes the deployed function (default) or runs the handler code on your machine (--local).
Both hit the real tables and bucket of the chosen environment using your own AWS credentials,
so this only works for people with access to the AWS account.

Usage (from backend/; see TESTING.md for a full walkthrough):
    .venv/Scripts/python scripts/invoke.py products
    .venv/Scripts/python scripts/invoke.py submit --set productId=<id> --set retailerId=fairprice --set priceCents=363 --set observedAt=2026-10-24
    .venv/Scripts/python scripts/invoke.py upload-photo --file shelf.jpg      # prints a photoKey to submit with
    .venv/Scripts/python scripts/invoke.py mine
    .venv/Scripts/python scripts/invoke.py review-queue --as admin
    .venv/Scripts/python scripts/invoke.py moderate --as admin --id <id> --set decision=rejected --set reason="Unreadable label"
    .venv/Scripts/python scripts/invoke.py cleanup        # delete everything the fake users created

--set KEY=VALUE builds the JSON body for you (whole numbers become numbers, true/false booleans,
everything else text), which avoids shell quoting problems. --body '<json>' sends raw JSON instead.
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
    "review-queue": ("admin-submissions", "admin_submissions", "GET", "/admin/price-submissions", True),
    "moderate": ("admin-submissions", "admin_submissions", "PATCH", "/admin/price-submissions/{id}", True),
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
    function_name = f"trolleysaver-{env}-{ROUTES[route][0]}"
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
        "PHOTO_BUCKET": outputs["PhotoBucketName"],
    })
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lambdas"))
    module = __import__(f"handlers.{ROUTES[route][1]}", fromlist=["handler"])

    class Context:
        aws_request_id = event["requestContext"]["requestId"]

    return module.handler(event, Context())


def parse_value(text):
    """--set value typing: 363 -> int, 3.5 -> float, true/false -> bool, null -> None, else the text."""
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
        body[key] = parse_value(value)
    return json.dumps(body)


def print_result(result):
    print(f"HTTP {result['statusCode']}")
    print(json.dumps(json.loads(result["body"]), indent=2, ensure_ascii=False))


def upload_photo(call, file_path, user_id, groups):
    """Do what the browser does: ask the upload-url Lambda for a presigned POST, then upload to S3."""
    path = Path(file_path)
    if not path.is_file():
        raise SystemExit(f"No such file: {path}")
    content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    body = json.dumps({"contentType": content_type, "sizeBytes": path.stat().st_size, "fileName": path.name})
    result = call("upload-url", build_event("upload-url", user_id, groups, body, None, None))
    if result["statusCode"] != 200:
        print("upload-url Lambda refused the request:")
        print_result(result)
        return
    target = json.loads(result["body"])
    with path.open("rb") as file:
        response = requests.post(target["uploadUrl"], data=target["fields"],
                                 files={"file": (path.name, file, content_type)}, timeout=120)
    if response.status_code in (200, 204):
        print(f"Uploaded {path.name} ({content_type}, {path.stat().st_size} bytes) to S3 (HTTP {response.status_code})")
        print(f"photoKey: {target['photoKey']}")
    else:
        print(f"S3 rejected the upload: HTTP {response.status_code}\n{response.text}")


def cleanup(env, region, user_ids):
    """Delete submissions, profile rows and photos created by the given (fake) user ids."""
    dynamodb = boto3.resource("dynamodb", region_name=region)
    submissions = dynamodb.Table(f"trolleysaver-{env}-price-submission")
    users = dynamodb.Table(f"trolleysaver-{env}-user")
    s3 = boto3.client("s3", region_name=region)
    bucket = stack_outputs(env, region)["PhotoBucketName"]
    for user_id in user_ids:
        items = submissions.query(IndexName="ByUser", KeyConditionExpression=Key("userId").eq(user_id))["Items"]
        for item in items:
            submissions.delete_item(Key={"productId": item["productId"], "sk": item["sk"]})
        users.delete_item(Key={"userId": user_id})
        photos = s3.list_objects_v2(Bucket=bucket, Prefix=f"price-evidence/{user_id}/").get("Contents", [])
        for photo in photos:
            s3.delete_object(Bucket=bucket, Key=photo["Key"])
        print(f"{user_id}: deleted {len(items)} submission(s), {len(photos)} photo(s) and the profile row")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("route", choices=[*ROUTES, "upload-photo", "cleanup"])
    parser.add_argument("--env", default=DEFAULT_ENV)
    parser.add_argument("--region", default=DEFAULT_REGION)
    parser.add_argument("--as", dest="role", choices=["user", "admin", "anonymous"], default="user")
    parser.add_argument("--user-id", help=f"Fake Cognito sub (default {DEFAULT_USER_ID} / {DEFAULT_ADMIN_ID})")
    parser.add_argument("--set", action="append", default=[], metavar="KEY=VALUE", help="Body field (repeatable); builds the JSON for you")
    parser.add_argument("--body", help="Raw JSON request body (fields from --set are added on top)")
    parser.add_argument("--query", action="append", default=[], metavar="KEY=VALUE", help="Query string parameter (repeatable)")
    parser.add_argument("--id", help="Submission id for the moderate route")
    parser.add_argument("--file", help="Image to upload (upload-photo route)")
    parser.add_argument("--local", action="store_true", help="Run the handler code locally instead of the deployed Lambda")
    args = parser.parse_args()
    sys.stdout.reconfigure(errors="replace")  # product names with symbols shouldn't crash output piped in a Windows terminal

    if args.route == "cleanup":
        cleanup(args.env, args.region, [args.user_id] if args.user_id else [DEFAULT_USER_ID, DEFAULT_ADMIN_ID])
        return
    if args.route == "moderate" and not args.id:
        parser.error("moderate needs --id")
    if args.route == "upload-photo" and not args.file:
        parser.error("upload-photo needs --file")
    try:
        body = request_body(args.body, args.set)
    except json.JSONDecodeError as error:
        raise SystemExit(f"--body is not valid JSON ({error}). Tip: use --set KEY=VALUE instead.")

    user_id = None if args.role == "anonymous" else args.user_id or (DEFAULT_ADMIN_ID if args.role == "admin" else DEFAULT_USER_ID)
    groups = "admin" if args.role == "admin" else ("user" if user_id else None)
    invoke = invoke_local if args.local else invoke_deployed

    def call(route, event):
        return invoke(args.env, args.region, route, event)

    if args.route == "upload-photo":
        upload_photo(call, args.file, user_id, groups)
        return
    query = dict(pair.split("=", 1) for pair in args.query)
    print_result(call(args.route, build_event(args.route, user_id, groups, body, query, args.id)))


if __name__ == "__main__":
    main()
