"""End-to-end smoke test against a deployed stack.

Usage (from backend/):
    .venv/Scripts/python scripts/smoke_test.py --env dev

Creates a throwaway contributor (through public sign-up) and a throwaway admin, exercises auth,
photo upload, submissions, moderation, product requests and the Smart Basket over real HTTP, then
deletes everything it created (including any product it published).
"""

import argparse
import base64
import secrets
import sys
from datetime import datetime, timedelta, timezone

import boto3
import requests
from botocore.exceptions import ClientError

from create_admin import create_admin
from invoke import cleanup as delete_user_data
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
    site = outputs["SiteUrl"]
    cognito = boto3.client("cognito-idp", region_name=args.region)
    dynamodb = boto3.resource("dynamodb", region_name=args.region)
    users_table = dynamodb.Table(f"trolleysaver-{args.env}-user")

    t = Checks()
    suffix = secrets.token_hex(4)
    user_email, admin_email = f"smoke-user-{suffix}@example.com", f"smoke-admin-{suffix}@example.com"
    user_password, admin_password = strong_password(), strong_password()
    created = {"users": [], "subs": []}

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
        t.check("GET /products returns priceUpdatedAt on every product",
                all("priceUpdatedAt" in p for p in products) and any(p.get("priceUpdatedAt") for p in products),
                [p.get("name") for p in products if "priceUpdatedAt" not in p][:5])
        r = call("GET", "/retailers")
        retailers = [x["id"] for x in r.json().get("items", [])] if r.ok else []
        t.check("GET /retailers is public", r.status_code == 200 and "fairprice" in retailers, r.text[:200])
        if not products or "fairprice" not in retailers:
            raise SystemExit("Catalog is empty; run scripts/seed_catalog.py first.")
        product = next(p for p in products if p.get("minCents") and p.get("maxCents"))

        # --- Smart Basket (public) ---
        hcs_categories = {p["category"] for p in products if p.get("hcs")}
        swappable = next((p for p in products if not p.get("hcs") and p["category"] in hcs_categories), None)
        basket_product = swappable or product
        r = call("POST", "/basket/compare", json={"items": [{"productId": basket_product["id"], "quantity": 2}]})
        result = r.json() if r.ok else {}
        stores = result.get("basket", {}).get("stores", [])
        t.check("POST /basket/compare is public and ranks every store",
                r.status_code == 200 and sorted(s["retailerId"] for s in stores) == sorted(retailers), r.text[:300])
        t.check("basket has a recommendation", bool(result.get("basket", {}).get("recommendation")), r.text[:300])
        if swappable:
            healthier = result.get("healthierBasket") or {}
            t.check("healthier basket swaps to an HCS product",
                    any(s["status"] == "swapped" for s in healthier.get("swaps", [])), r.text[:300])
        r = call("POST", "/basket/compare", json={"items": [{"productId": basket_product["id"], "quantity": 0}]})
        t.check("invalid basket -> 400 with fieldErrors",
                r.status_code == 400 and "items[0].quantity" in r.json().get("fieldErrors", {}), r.text[:300])
        r = requests.options(f"{api}/basket/compare", timeout=TIMEOUT,
                             headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST"})
        t.check("basket CORS preflight allowed", r.status_code == 200 and r.headers.get("Access-Control-Allow-Origin") in ("*", "http://localhost:5173"), r.headers)

        # --- CORS: responses name only the allowed sites (the local dev server and the deployed site) ---
        for origin in ("http://localhost:5173", site):
            r = requests.get(f"{api}/products", headers={"Origin": origin}, timeout=TIMEOUT)
            t.check(f"GET /products from {origin} -> allowed", r.headers.get("Access-Control-Allow-Origin") == origin, r.headers)
        r = requests.get(f"{api}/products", headers={"Origin": "https://evil.example"}, timeout=TIMEOUT)
        t.check("GET /products from another site -> not allowed", "Access-Control-Allow-Origin" not in r.headers, r.headers)
        t.check("API responses say nosniff and no-store",
                r.headers.get("X-Content-Type-Options") == "nosniff" and r.headers.get("Cache-Control") == "no-store", r.headers)

        # --- Authorizer ---
        upload_body = {"productId": product["id"], "retailerId": "fairprice", "fileName": "shelf.png",
                       "contentType": "image/png", "sizeBytes": len(PNG)}
        t.check("no token -> 401", call("POST", "/price-submissions/image-upload-url", json=upload_body).status_code == 401)
        t.check("ID token -> 401", call("POST", "/price-submissions/image-upload-url", id_token, json=upload_body).status_code == 401)
        t.check("garbage token -> 401", call("POST", "/price-submissions/image-upload-url", "not.a.jwt", json=upload_body).status_code == 401)

        # --- Evidence photo upload (step 1 needs an existing product and store) ---
        r = call("POST", "/price-submissions/image-upload-url", access, json={"contentType": "image/png", "sizeBytes": len(PNG)})
        t.check("upload URL without product/store -> 400",
                r.status_code == 400 and {"productId", "retailerId"} <= set(r.json().get("fieldErrors", {})), r.text[:300])
        r = call("POST", "/price-submissions/image-upload-url", access, json={**upload_body, "productId": "not-a-product"})
        t.check("upload URL for a fake product -> 400",
                r.status_code == 400 and r.json().get("fieldErrors") == {"productId": "Unknown product"}, r.text[:300])
        r = call("POST", "/price-submissions/image-upload-url", access, json=upload_body)
        t.check("upload URL issued", r.status_code == 200, r.text[:300])
        target = r.json()
        photo_key = target["photoKey"]
        t.check("photo key is scoped to caller and product", photo_key.startswith(f"price-evidence/{user_sub}/{product['id']}/"), photo_key)
        up = requests.post(target["uploadUrl"], data=target["fields"], files={"file": ("shelf.png", PNG, "image/png")}, timeout=TIMEOUT)
        t.check("browser-style POST to S3 succeeds", up.status_code in (200, 204), f"{up.status_code} {up.text[:300]}")
        r = requests.options(target["uploadUrl"], headers={"Origin": site, "Access-Control-Request-Method": "POST"}, timeout=TIMEOUT)
        t.check("photo bucket accepts uploads from the deployed site", r.headers.get("Access-Control-Allow-Origin") == site, r.headers)

        big = call("POST", "/price-submissions/image-upload-url", access, json=upload_body).json()
        too_big = requests.post(big["uploadUrl"], data=big["fields"],
                                files={"file": ("big.png", b"0" * (5 * 1024 * 1024 + 1), "image/png")}, timeout=120)
        t.check("S3 rejects uploads over 5 MiB", too_big.status_code == 400 and "EntityTooLarge" in too_big.text, too_big.status_code)

        # --- Submissions ---
        mid = (int(product["minCents"]) + int(product["maxCents"])) // 2
        today_sgt = datetime.now(timezone(timedelta(hours=8))).date().isoformat()
        base = {"productId": product["id"], "retailerId": "fairprice", "observedAt": today_sgt}
        r = call("POST", "/price-submissions", access, json={**base, "priceCents": mid})
        accepted = r.json()
        t.check("in-range price -> 201 accepted", r.status_code == 201 and accepted.get("status") == "accepted", r.text[:300])
        r = call("POST", "/price-submissions", access,
                 json={**base, "priceCents": min(int(product["maxCents"]) + 1000, 100000), "photoKey": photo_key})
        flagged = r.json()
        t.check("out-of-range price with photo -> 201 flagged", r.status_code == 201 and flagged.get("status") == "flagged", r.text[:300])
        t.check("contributor gets no evidence photo link", "photoUrl" not in flagged and flagged.get("photoKey") == photo_key, r.text[:300])
        other = next((p for p in products if p["id"] != product["id"]), None)
        if other:
            r = call("POST", "/price-submissions", access, json={**base, "productId": other["id"], "priceCents": mid, "photoKey": photo_key})
            t.check("photo uploaded for another product -> 400", r.status_code == 400 and "photoKey" in r.json().get("fieldErrors", {}), r.text[:300])
        r = call("POST", "/price-submissions", access, json={**base, "productId": "not-a-product", "priceCents": mid})
        t.check("price for a fake product -> 400", r.status_code == 400 and "productId" in r.json().get("fieldErrors", {}), r.text[:300])
        r = call("POST", "/price-submissions", access, json={**base, "priceCents": mid})
        t.check("duplicate -> 409", r.status_code == 409, r.status_code)
        r = call("POST", "/price-submissions", access, json={**base, "priceCents": "3.50"})
        t.check("invalid body -> 400 with fieldErrors", r.status_code == 400 and "priceCents" in r.json().get("fieldErrors", {}), r.text[:300])
        never_uploaded = f"price-evidence/{user_sub}/{product['id']}/never-uploaded.png"
        r = call("POST", "/price-submissions", access, json={**base, "priceCents": mid + 1, "photoKey": never_uploaded})
        t.check("photo that was never uploaded -> 400 PHOTO_NOT_FOUND",
                r.status_code == 400 and r.json().get("code") == "PHOTO_NOT_FOUND", r.text[:300])
        # A web page uploaded as "image/png": S3 only checks the declared type, the backend checks the bytes.
        fake = call("POST", "/price-submissions/image-upload-url", access, json=upload_body).json()
        requests.post(fake["uploadUrl"], data=fake["fields"], files={"file": ("shelf.png", b"<html>not an image</html>", "image/png")}, timeout=TIMEOUT)
        r = call("POST", "/price-submissions", access, json={**base, "priceCents": mid + 2, "photoKey": fake["photoKey"]})
        t.check("a file that isn't really a PNG -> 400 INVALID_PHOTO",
                r.status_code == 400 and r.json().get("code") == "INVALID_PHOTO", r.text[:300])
        try:
            boto3.client("s3", region_name=args.region).head_object(Bucket=bucket, Key=fake["photoKey"])
            fake_deleted = False
        except ClientError:
            fake_deleted = True
        t.check("...and the fake file is deleted", fake_deleted, fake["photoKey"])

        r = call("GET", "/price-submissions/mine", access)
        mine = r.json().get("items", []) if r.ok else []
        t.check("GET /mine returns both submissions", {i["id"] for i in mine} == {accepted["id"], flagged["id"]}, r.text[:300])
        t.check("GET /mine has no evidence photo links", all("photoUrl" not in i for i in mine), r.text[:300])
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
        queued = next((i for i in queue if i["id"] == flagged["id"]), None)
        t.check("admin sees flagged submission", queued is not None, r.text[:300])
        t.check("accepted submission not in flagged queue", all(i["id"] != accepted["id"] for i in queue))
        photo = requests.get(queued["photoUrl"], timeout=TIMEOUT) if queued and queued.get("photoUrl") else None
        t.check("admin's photoUrl serves the evidence image", photo is not None and photo.status_code == 200 and photo.content == PNG)
        r = call("PATCH", f"/admin/price-submissions/{flagged['id']}", admin_access, json={"decision": "accepted"})
        t.check("admin accepts flagged -> 200", r.status_code == 200 and r.json().get("status") == "accepted", r.text[:300])
        r = call("PATCH", f"/admin/price-submissions/{flagged['id']}", admin_access, json={"decision": "rejected", "reason": "late"})
        t.check("second decision -> 409", r.status_code == 409, r.status_code)
        r = requests.options(f"{api}/price-submissions", timeout=TIMEOUT,
                             headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST"})
        t.check("CORS preflight allowed", r.status_code == 200 and r.headers.get("Access-Control-Allow-Origin") in ("*", "http://localhost:5173"), r.headers)

        # --- New product request ---
        image_body = {"purpose": "product-image", "contentType": "image/png", "sizeBytes": len(PNG)}
        r = call("POST", "/product-requests/image-upload-url", access, json=image_body)
        t.check("product-image upload URL issued", r.status_code == 200, r.text[:300])
        image_target = r.json()
        image_key = image_target["productImageKey"]
        t.check("product image goes to the caller's pending folder", image_key.startswith(f"product-images/pending/{user_sub}/"), image_key)
        up = requests.post(image_target["uploadUrl"], data=image_target["fields"], files={"file": ("oat.png", PNG, "image/png")}, timeout=TIMEOUT)
        t.check("product image uploaded to S3", up.status_code in (200, 204), up.status_code)
        new_product = {"name": f"Smoke Test Oat Milk {suffix}", "brand": "Smoke Test", "category": "milk", "packQty": 1,
                       "packUnit": "L", "packCount": 1, "hcs": False, "dietary": [], "retailerId": "fairprice",
                       "priceCents": 545, "observedAt": today_sgt}
        r = call("POST", "/product-requests", access, json=new_product)
        t.check("product request without a picture -> 400",
                r.status_code == 400 and "productImageKey" in r.json().get("fieldErrors", {}), r.text[:300])
        r = call("POST", "/product-requests", access, json={**new_product, "productImageKey": image_key})
        request = r.json()
        t.check("product request -> 201 pending", r.status_code == 201 and request.get("status") == "pending", r.text[:300])
        catalog_names = {p["name"] for p in call("GET", "/products").json().get("items", [])}
        t.check("pending product is hidden from the catalog", new_product["name"] not in catalog_names)
        r = call("GET", "/product-requests/mine", access)
        mine_requests = r.json().get("items", []) if r.ok else []
        t.check("GET /product-requests/mine shows it with its picture",
                any(i["id"] == request.get("id") and i.get("productImageUrl") for i in mine_requests), r.text[:300])

        # --- Deleting a pending product request ---
        spare_target = call("POST", "/product-requests/image-upload-url", access, json=image_body).json()
        requests.post(spare_target["uploadUrl"], data=spare_target["fields"], files={"file": ("rice.png", PNG, "image/png")}, timeout=TIMEOUT)
        r = call("POST", "/product-requests", access,
                 json={**new_product, "name": f"Smoke Test Rice {suffix}", "productImageKey": spare_target["productImageKey"]})
        spare = r.json()
        t.check("second product request -> 201 pending", r.status_code == 201 and spare.get("status") == "pending", r.text[:300])
        t.check("someone else deleting it -> 404", call("DELETE", f"/product-requests/{spare.get('id')}", admin_access).status_code == 404)
        r = call("DELETE", f"/product-requests/{spare.get('id')}", access)
        t.check("owner deletes a pending request -> 204", r.status_code == 204, r.text[:300])
        mine_ids = {i["id"] for i in call("GET", "/product-requests/mine", access).json().get("items", [])}
        t.check("deleted request is gone from /mine", spare.get("id") not in mine_ids and request.get("id") in mine_ids)
        t.check("deleting it again -> 404", call("DELETE", f"/product-requests/{spare.get('id')}", access).status_code == 404)
        r = requests.options(f"{api}/product-requests/{spare.get('id')}", timeout=TIMEOUT,
                             headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "DELETE"})
        t.check("DELETE CORS preflight allowed",
                r.status_code == 200 and "DELETE" in r.headers.get("Access-Control-Allow-Methods", ""), r.headers)
        t.check("user token on product queue -> 403", call("GET", "/admin/product-requests", access).status_code == 403)
        r = call("GET", "/admin/product-requests", admin_access)
        queued_request = next((i for i in r.json().get("items", []) if i["id"] == request.get("id")), None) if r.ok else None
        t.check("admin sees the product request with submitter and suggested range",
                bool(queued_request) and queued_request.get("submitterEmail") == user_email
                and (queued_request.get("suggestedMinCents"), queued_request.get("suggestedMaxCents")) == (272, 818), r.text[:300])
        r = call("PATCH", f"/admin/product-requests/{request.get('id')}", admin_access,
                 json={"decision": "approved", "changes": {"category": "smoke test"}})
        approved = r.json()
        t.check("admin approves -> 200 with a productId", r.status_code == 200 and approved.get("status") == "approved"
                and approved.get("productId"), r.text[:300])
        listed = next((p for p in call("GET", "/products").json().get("items", []) if p["id"] == approved.get("productId")), None)
        t.check("approved product is in the catalog with the admin's correction", bool(listed) and listed.get("category") == "smoke test")
        picture = requests.get(listed["imageUrl"], timeout=TIMEOUT) if listed and listed.get("imageUrl") else None
        t.check("product imageUrl serves the picture", picture is not None and picture.status_code == 200 and picture.content == PNG)
        r = call("PATCH", f"/admin/product-requests/{request.get('id')}", admin_access, json={"decision": "approved"})
        t.check("second product decision -> 409", r.status_code == 409, r.status_code)
        r = call("DELETE", f"/product-requests/{request.get('id')}", access)
        t.check("deleting an approved request -> 409",
                r.status_code == 409 and r.json().get("code") == "ALREADY_MODERATED", r.text[:300])
    finally:
        print("Cleaning up...")
        if created["subs"]:
            delete_user_data(args.env, args.region, created["subs"])
        for email in created["users"]:
            try:
                cognito.admin_delete_user(UserPoolId=pool_id, Username=email)
            except cognito.exceptions.UserNotFoundException:
                pass

    print(f"\n{'All checks passed' if not t.failures else f'{t.failures} check(s) failed'}")
    sys.exit(1 if t.failures else 0)


if __name__ == "__main__":
    main()
