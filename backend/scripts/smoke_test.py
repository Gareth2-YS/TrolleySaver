"""End-to-end smoke test against a deployed stack.

Usage (from backend/):
    .venv/Scripts/python scripts/smoke_test.py --env dev

Creates a throwaway contributor (through public sign-up) and a throwaway admin, exercises auth,
photo upload, submissions and moderation over real HTTP, then deletes everything it created.
"""

import argparse
import base64
import secrets
import sys
from datetime import datetime, timedelta, timezone

import boto3
import requests
from boto3.dynamodb.conditions import Key

from create_admin import create_admin
from stack import DEFAULT_REGION, stack_outputs

# 1x1 transparent PNG
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==")
TIMEOUT = 30


class Checks:
    def __init__(self):
        self.failures = 0

    def check(self, label, condition, detail=""):
        print(f"{'PASS' if condition else 'FAIL'}  {label}" + (f"  ({detail})" if detail and not condition else ""))
        if not condition:
            self.failures += 1
        return condition


def strong_password():
    return f"Aa1!{secrets.token_urlsafe(18)}"


def tokens(cognito, client_id, email, password):
    result = cognito.initiate_auth(
        ClientId=client_id,
        AuthFlow="USER_PASSWORD_AUTH",
        AuthParameters={"USERNAME": email, "PASSWORD": password},
    )["AuthenticationResult"]
    return result["AccessToken"], result["IdToken"]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--env", default="dev")
    parser.add_argument("--region", default=DEFAULT_REGION)
    args = parser.parse_args()

    outputs = stack_outputs(args.env, args.region)
    api, pool_id, client_id, bucket = outputs["ApiUrl"], outputs["UserPoolId"], outputs["UserPoolClientId"], outputs["PhotoBucketName"]
    cognito = boto3.client("cognito-idp", region_name=args.region)
    dynamodb = boto3.resource("dynamodb", region_name=args.region)
    users_table = dynamodb.Table(f"trolleysaver-{args.env}-user")
    submissions_table = dynamodb.Table(f"trolleysaver-{args.env}-price-submission")
    s3 = boto3.client("s3", region_name=args.region)

    t = Checks()
    suffix = secrets.token_hex(4)
    user_email, admin_email = f"smoke-user-{suffix}@example.com", f"smoke-admin-{suffix}@example.com"
    user_password, admin_password = strong_password(), strong_password()
    created = {"users": [], "subs": [], "photos": []}

    def call(method, path, token=None, **kwargs):
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        return requests.request(method, f"{api}{path}", headers=headers, timeout=TIMEOUT, **kwargs)

    try:
        # --- Registration and login ---
        signup = cognito.sign_up(
            ClientId=client_id, Username=user_email, Password=user_password,
            UserAttributes=[{"Name": "email", "Value": user_email}, {"Name": "name", "Value": "Smoke Tester"}],
        )
        created["users"].append(user_email)
        user_sub = signup["UserSub"]
        created["subs"].append(user_sub)
        t.check("public sign-up is auto-confirmed", signup["UserConfirmed"])
        groups = [g["GroupName"] for g in cognito.admin_list_groups_for_user(UserPoolId=pool_id, Username=user_email)["Groups"]]
        t.check("new user is in the 'user' group only", groups == ["user"], groups)
        profile = users_table.get_item(Key={"userId": user_sub}).get("Item")
        t.check("profile row created", bool(profile) and profile.get("displayName") == "Smoke Tester", profile)
        access, id_token = tokens(cognito, client_id, user_email, user_password)
        t.check("sign-in returns tokens", bool(access and id_token))

        # --- Catalog ---
        r = call("GET", "/products")
        products = r.json().get("items", []) if r.ok else []
        t.check("GET /products is public", r.status_code == 200 and len(products) > 0, r.status_code)
        r = call("GET", "/retailers")
        retailers = [x["id"] for x in r.json().get("items", [])] if r.ok else []
        t.check("GET /retailers is public", r.status_code == 200 and "fairprice" in retailers, r.text[:200])
        if not products or "fairprice" not in retailers:
            raise SystemExit("Catalog is empty; run scripts/seed_catalog.py first.")
        product = next(p for p in products if p.get("minCents") and p.get("maxCents"))

        # --- Authorizer ---
        upload_body = {"fileName": "shelf.png", "contentType": "image/png", "sizeBytes": len(PNG)}
        t.check("no token -> 401", call("POST", "/price-submissions/image-upload-url", json=upload_body).status_code == 401)
        t.check("ID token -> 401", call("POST", "/price-submissions/image-upload-url", id_token, json=upload_body).status_code == 401)
        t.check("garbage token -> 401", call("POST", "/price-submissions/image-upload-url", "not.a.jwt", json=upload_body).status_code == 401)

        # --- Photo upload ---
        r = call("POST", "/price-submissions/image-upload-url", access, json=upload_body)
        t.check("upload URL issued", r.status_code == 200, r.text[:300])
        target = r.json()
        photo_key = target["photoKey"]
        created["photos"].append(photo_key)
        t.check("photo key is scoped to caller", photo_key.startswith(f"price-evidence/{user_sub}/"), photo_key)
        up = requests.post(target["uploadUrl"], data=target["fields"], files={"file": ("shelf.png", PNG, "image/png")}, timeout=TIMEOUT)
        t.check("browser-style POST to S3 succeeds", up.status_code in (200, 204), f"{up.status_code} {up.text[:300]}")

        r = call("POST", "/price-submissions/image-upload-url", access, json=upload_body)
        big = r.json()
        created["photos"].append(big["photoKey"])
        too_big = requests.post(big["uploadUrl"], data=big["fields"],
                                files={"file": ("big.png", b"0" * (5 * 1024 * 1024 + 1), "image/png")}, timeout=120)
        t.check("S3 rejects uploads over 5 MiB", too_big.status_code == 400 and "EntityTooLarge" in too_big.text, too_big.status_code)

        # --- Submissions ---
        mid = (int(product["minCents"]) + int(product["maxCents"])) // 2
        today_sgt = datetime.now(timezone(timedelta(hours=8))).date().isoformat()
        base = {"productId": product["id"], "retailerId": "fairprice", "observedAt": today_sgt}
        r = call("POST", "/price-submissions", access, json={**base, "priceCents": mid, "photoKey": photo_key})
        accepted = r.json()
        t.check("in-range price -> 201 accepted", r.status_code == 201 and accepted.get("status") == "accepted", r.text[:300])
        r = call("POST", "/price-submissions", access, json={**base, "priceCents": min(int(product["maxCents"]) + 1000, 100000)})
        flagged = r.json()
        t.check("out-of-range price -> 201 flagged", r.status_code == 201 and flagged.get("status") == "flagged", r.text[:300])
        r = call("POST", "/price-submissions", access, json={**base, "priceCents": mid})
        t.check("duplicate -> 409", r.status_code == 409, r.status_code)
        r = call("POST", "/price-submissions", access, json={**base, "priceCents": "3.50"})
        t.check("invalid body -> 400 with fieldErrors", r.status_code == 400 and "priceCents" in r.json().get("fieldErrors", {}), r.text[:300])

        r = call("GET", "/price-submissions/mine", access)
        mine = r.json().get("items", []) if r.ok else []
        t.check("GET /mine returns both submissions", {i["id"] for i in mine} == {accepted["id"], flagged["id"]}, r.text[:300])
        with_photo = next((i for i in mine if i.get("photoUrl")), None)
        photo = requests.get(with_photo["photoUrl"], timeout=TIMEOUT) if with_photo else None
        t.check("presigned photoUrl serves the image", photo is not None and photo.status_code == 200 and photo.content == PNG)
        t.check("photo is not publicly readable",
                requests.get(f"https://{bucket}.s3.{args.region}.amazonaws.com/{photo_key}", timeout=TIMEOUT).status_code == 403)

        # --- Moderation ---
        t.check("user token on admin list -> 403", call("GET", "/admin/price-submissions", access).status_code == 403)
        t.check("user token on moderate -> 403",
                call("PATCH", f"/admin/price-submissions/{flagged['id']}", access, json={"decision": "accepted"}).status_code == 403)

        created["users"].append(admin_email)
        admin_sub = create_admin(cognito, users_table, pool_id, admin_email, "Smoke Admin", admin_password)
        created["subs"].append(admin_sub)
        admin_access, _ = tokens(cognito, client_id, admin_email, admin_password)

        r = call("GET", "/admin/price-submissions?status=flagged", admin_access)
        queue = r.json().get("items", []) if r.ok else []
        t.check("admin sees flagged submission", any(i["id"] == flagged["id"] for i in queue), r.text[:300])
        t.check("accepted submission not in flagged queue", all(i["id"] != accepted["id"] for i in queue))
        r = call("PATCH", f"/admin/price-submissions/{flagged['id']}", admin_access, json={"decision": "accepted"})
        t.check("admin accepts flagged -> 200", r.status_code == 200 and r.json().get("status") == "accepted", r.text[:300])
        r = call("PATCH", f"/admin/price-submissions/{flagged['id']}", admin_access, json={"decision": "rejected", "reason": "late"})
        t.check("second decision -> 409", r.status_code == 409, r.status_code)
        r = requests.options(f"{api}/price-submissions", timeout=TIMEOUT,
                             headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST"})
        t.check("CORS preflight allowed", r.status_code == 200 and r.headers.get("Access-Control-Allow-Origin") == "http://localhost:5173", r.headers)
    finally:
        print("Cleaning up...")
        for sub in created["subs"]:
            items = submissions_table.query(IndexName="ByUser", KeyConditionExpression=Key("userId").eq(sub))["Items"]
            for item in items:
                submissions_table.delete_item(Key={"productId": item["productId"], "sk": item["sk"]})
            users_table.delete_item(Key={"userId": sub})
        for key in created["photos"]:
            s3.delete_object(Bucket=bucket, Key=key)
        for email in created["users"]:
            try:
                cognito.admin_delete_user(UserPoolId=pool_id, Username=email)
            except cognito.exceptions.UserNotFoundException:
                pass

    print(f"\n{'All checks passed' if not t.failures else f'{t.failures} check(s) failed'}")
    sys.exit(1 if t.failures else 0)


if __name__ == "__main__":
    main()
