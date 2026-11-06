# TrolleySaver API reference

**Owner:** Gareth (backend) · **Last updated:** 29 Oct 2026 · **Covers:** login, catalog, product search, price & photo submissions, new product requests, admin moderation, Smart Basket

This is the contract between the frontend and the backend. It covers login, the product catalog and search, price and photo submissions, proposing new products, admin moderation and the Smart Basket comparison.

How the frontend should adopt it is described in the feature handoffs:
- [auth](../handoffs/2026-10-24-auth-backend-to-frontend.md)
- price upload: [first version](../handoffs/2026-10-24-price-upload-backend-to-frontend.md), then [29 Oct changes](../handoffs/2026-10-29-price-upload-backend-to-frontend.md)
- [new product requests](../handoffs/2026-10-29-new-product-backend-to-frontend.md)
- [Smart Basket](../handoffs/2026-10-24-smart-basket-backend-to-frontend.md)

- [1. Basics](#1-basics)
- [2. Authentication](#2-authentication)
- [3. Endpoints](#3-endpoints)
- [4. Data types](#4-data-types)
- [5. Errors](#5-errors)
- [6. Limits](#6-limits)
- [7. Example client code](#7-example-client-code)
- [8. Trying the API by hand](#8-trying-the-api-by-hand)

---

## 1. Basics

| | |
|---|---|
| **Base URL** | The stack output `ApiUrl`, e.g. `https://<api-id>.execute-api.ap-southeast-1.amazonaws.com/dev`. Use it as `VITE_API_BASE_URL`. |
| **Environment** | `dev` is the only deployed environment. Build the frontend against it. |
| **Format** | JSON request and response bodies (`Content-Type: application/json`) |
| **Auth** | `Authorization: Bearer <Cognito access token>` on every route except the catalog and the basket comparison |
| **CORS** | Allowed origins are `http://localhost:5173` (the Vite dev server) and the deployed site (the stack output `SiteUrl`, `https://<id>.cloudfront.net`). Responses name the caller's origin only when it's one of those. Allowed headers are `Authorization, Content-Type`, and methods are `GET, POST, PATCH, DELETE`. See [deployment.md §5](../deployment.md#5-cors-which-sites-may-call-the-api). |
| **Money** | Integer cents: `363` means $3.63 |
| **Timestamps** | UTC ISO 8601 with milliseconds, e.g. `2026-10-24T08:15:02.120Z`. Show them in Singapore time. |
| **Ids** | Product ids are UUIDs. Retailer ids are `fairprice`, `shengsiong` and `coldstorage`. A submission `id` is an opaque string: store it and pass it back, never build or parse it. |
| **Pagination** | List endpoints take `limit` (default 50, max 100) and return `nextToken`. Pass it back as `?nextToken=…` to get the next page. `null` means there are no more pages. |
| **Text** | Names, brands, categories, tags, search terms and rejection reasons can't contain control characters or invisible formatting characters (e.g. a zero-width space or a right-to-left override): `fieldErrors` says "Must not contain hidden or control characters". Zero-width joiners are allowed. Text is stored in Unicode NFC form. |
| **Response headers** | Every backend response has `X-Content-Type-Options: nosniff` and `Cache-Control: no-store`. |
| **Throttling** | 20 requests a second across all callers, bursts up to 40. Over it, API Gateway answers `429` (see [5. Errors](#5-errors)). |

Get the environment values (`ApiUrl`, `UserPoolId`, `UserPoolClientId`) from Gareth, or run:

```powershell
aws cloudformation describe-stacks --stack-name trolleysaver-dev --query "Stacks[0].Outputs" --output table
```

They aren't secret, but don't commit them. Keep them in `frontend/.env.local`.

## 2. Authentication

Login is handled by **Amazon Cognito** through Amplify in the frontend (`frontend/src/auth/cognito-auth-service.ts`). There are no login endpoints in this API.

| Topic | Behaviour |
|---|---|
| Sign-up | Email + password + optional `name`. Accounts are **confirmed automatically**, with no verification code. |
| Password policy | At least 8 characters, with upper case, lower case, a number and a symbol |
| Sign-in | SRP (Amplify's default) or `USER_PASSWORD_AUTH`. No MFA and no forced password change. |
| Roles | Cognito groups. Self-registered accounts are put in `user` by the server; admins are in `admin`. The group is in the access token's `cognito:groups` claim. |
| Admin accounts | Created with `backend/scripts/create_admin.py` by anyone with access to the team's AWS account, never through sign-up |
| Token lifetimes | Access and ID tokens last 60 minutes, refresh tokens 30 days. Amplify refreshes automatically. |
| Which token | **Send the access token.** ID tokens are rejected with `401`. |
| Display name | The `name` claim is **only in the ID token**, not the access token |

The server always takes the caller's identity from the verified token. Fields like `userId` or `status` in a request body are ignored.

## 3. Endpoints

| Method & path | Auth | Purpose |
|---|---|---|
| [`GET /products`](#get-products) | public | Product catalog |
| [`GET /retailers`](#get-retailers) | public | Store list |
| [`GET /products/search`](#get-productssearch) | public | Search and filter products, with each one's current store prices |
| [`POST /price-submissions/image-upload-url`](#post-price-submissionsimage-upload-url) | user | Get a one-time URL to upload a shelf-tag photo for one existing product |
| [`POST {uploadUrl}`](#uploading-the-photo-to-s3) | none (signed URL) | Upload the photo directly to S3 |
| [`POST /price-submissions`](#post-price-submissions) | user | Submit a price |
| [`GET /price-submissions/mine`](#get-price-submissionsmine) | user | The caller's own submissions |
| [`GET /admin/price-submissions`](#get-adminprice-submissions) | admin | Review queue (flagged prices) |
| [`PATCH /admin/price-submissions/{id}`](#patch-adminprice-submissionsid) | admin | Accept or reject a flagged price |
| [`POST /product-requests/image-upload-url`](#post-product-requestsimage-upload-url) | user | Get a one-time URL to upload a new product's picture, or an evidence photo for its price |
| [`POST /product-requests`](#post-product-requests) | user | Propose a product that isn't in the catalog, with its first price |
| [`GET /product-requests/mine`](#get-product-requestsmine) | user | The caller's own product requests |
| [`DELETE /product-requests/{id}`](#delete-product-requestsid) | user | Delete one of the caller's own requests while it's still pending |
| [`GET /admin/product-requests`](#get-adminproduct-requests) | admin | Review queue (pending product requests) |
| [`PATCH /admin/product-requests/{id}`](#patch-adminproduct-requestsid) | admin | Approve (publish) or reject a product request |
| [`POST /basket/compare`](#post-basketcompare) | public | Price a basket at every store, plus a healthier version of it |

"user" means any signed-in account, including admins.

### `GET /products`

Returns every product, sorted by name.

```json
200 OK
{
  "items": [
    {
      "id": "e0bbb251-86fc-5f79-ae73-afb84fa2e54f",
      "name": "Magnolia Fresh Milk",
      "brand": "Magnolia",
      "packQty": 946,
      "packUnit": "ml",
      "packCount": 1,
      "category": "milk",
      "hcs": false,
      "dietary": ["halal"],
      "searchTerms": [],
      "minCents": 181,
      "maxCents": 548,
      "priceUpdatedAt": "2026-11-03T16:05:01.230Z"
    }
  ]
}
```

See [Product](#product) for field details. **`priceUpdatedAt`** is on every product: when the nightly price job last recomputed any of its store prices (UTC), or `null` if it has never been priced. Products added through an approved [product request](#post-product-requests) also have a picture: an `imageKey` and a signed **`imageUrl`** that works for 1 hour. The products the team loaded have no picture, so keep showing their category icon. The same applies to `GET /products/search`.

### `GET /retailers`

```json
200 OK
{ "items": [ { "id": "coldstorage", "name": "Cold Storage" }, { "id": "fairprice", "name": "FairPrice" }, { "id": "shengsiong", "name": "Sheng Siong" } ] }
```

### `GET /products/search`

Public, no token needed. Returns the products that match every filter given, sorted by name. Each one comes with its current price at each store and its lowest price. With no parameters it returns the whole catalog, priced, so the Search page needs only this one call.

| Query | Example | Matches |
|---|---|---|
| `q` | `magnolia milk` | Products containing **every** word, ignoring case, in their name, brand, category, `searchTerms`, `dietary` or pack size. Up to 100 characters. |
| `category` | `milk` | `category` equal to this, ignoring case |
| `brand` | `Magnolia` | `brand` equal to this, ignoring case |
| `dietary` | `halal` | `dietary` contains this, ignoring case |
| `hcs` | `true` | `true`: Healthier Choice products only. `false`: products without the symbol. |
| `minPriceCents`, `maxPriceCents` | `200`, `500` | Lowest current price within this range, inclusive. Whole cents, 0 or more. Products with no current price are left out whenever either bound is given. |

```
GET /products/search?q=milk&hcs=false&maxPriceCents=500
```

```jsonc
200 OK
{
  "items": [
    {
      "id": "e0bbb251-86fc-5f79-ae73-afb84fa2e54f", "name": "Magnolia Fresh Milk", "brand": "Magnolia",
      "packQty": 946, "packUnit": "ml", "packCount": 1, "category": "milk", "hcs": false, "dietary": ["halal"],
      "searchTerms": [], "minCents": 181, "maxCents": 548,
      "prices": {
        "fairprice":  { "priceCents": 363, "priceDate": "2026-10-25", "submissionCount": 2 },
        "shengsiong": { "priceCents": 350, "priceDate": "2026-10-25", "submissionCount": 1 }
      },
      "lowestPrice": { "retailerId": "shengsiong", "retailerName": "Sheng Siong", "priceCents": 350, "priceDate": "2026-10-25" }
    }
  ],
  "total": 1,
  "catalogSize": 42,
  "facets": { "categories": ["bread", "cereal", "milk", …], "brands": ["Gardenia", "Magnolia", …], "dietary": ["halal", "vegetarian"] },
  "priceMaxAgeDays": 30,
  "pricesUpdated": "2026-10-25T16:05:01.230Z"
}
```

- **Prices** are the same daily averages the Smart Basket uses ([how they're worked out](#post-basketcompare)). A store with no price, or only one more than `priceMaxAgeDays` old, is missing from `prices`.
- **`lowestPrice`** is the cheapest store, with ties going to the alphabetically first retailer id. It's `null` when no store has a current price.
- **`facets`** lists every category, brand and dietary tag in the **whole catalog**, not just the results, so dropdowns don't shrink as filters are applied.
- **`total`** is the number of results and **`catalogSize`** the number of products, for "12 of 42 products".
- No pagination: every match is returned.

Errors: `400 VALIDATION_ERROR` (`q`, `category`, `brand` or `dietary` over 100 characters, `hcs`, `minPriceCents`, `maxPriceCents`; `maxPriceCents` also when it's below `minPriceCents`).

### `POST /price-submissions/image-upload-url`

Step 1 of 3 for a submission with a photo. It returns a one-time, 5-minute upload form for **one** JPEG or PNG of up to 5 MiB. The photo is evidence for a price of **one existing product at one existing store**, so both must be named, and no upload form is given for a product or store that doesn't exist.

| Body field | Type | Required | Rules |
|---|---|---|---|
| `productId` | string | yes | Must be an id from `GET /products` |
| `retailerId` | string | yes | Must be an id from `GET /retailers` |
| `contentType` | string | yes | `image/jpeg` or `image/png` |
| `sizeBytes` | integer | yes | 1 – 5,242,880 |
| `fileName` | string | no | Ignored (the server generates the object name) |

```json
POST /price-submissions/image-upload-url
{ "productId": "e0bbb251-86fc-5f79-ae73-afb84fa2e54f", "retailerId": "fairprice", "contentType": "image/png", "sizeBytes": 183004 }
```

```json
200 OK
{
  "method": "POST",
  "uploadUrl": "https://trolleysaver-dev-photos-<account>.s3.ap-southeast-1.amazonaws.com/",
  "fields": {
    "Content-Type": "image/png",
    "key": "price-evidence/<your-user-id>/<product-id>/2b0f….png",
    "x-amz-algorithm": "AWS4-HMAC-SHA256",
    "x-amz-credential": "…",
    "x-amz-date": "…",
    "x-amz-security-token": "…",
    "policy": "…",
    "x-amz-signature": "…"
  },
  "expiresAt": "2026-10-24T08:20:02.120Z",
  "maxSizeBytes": 5242880,
  "photoKey": "price-evidence/<your-user-id>/<product-id>/2b0f….png"
}
```

Treat `fields` as opaque and send all of them. Keep `photoKey` for step 3, which must be for **the same product**.

Errors:
- `400 VALIDATION_ERROR` naming each bad field together: `productId`, `retailerId`, `contentType`, `sizeBytes`. An unknown id gives `"productId": "Unknown product"` or `"retailerId": "Unknown store"`.
- `400 IMAGE_TOO_LARGE`
- `401`
- `429 UPLOAD_RATE_LIMITED`: more than 60 upload links this clock hour (UTC), counting product-request uploads too. Each link counts when it's issued, used or not.

### Uploading the photo to S3

Step 2 of 3. Send a `multipart/form-data` POST to `uploadUrl`, containing every entry from `fields` and then the file as a field called **`file`**, which must be **last**. Don't send an `Authorization` header.

```ts
const form = new FormData()
Object.entries(target.fields).forEach(([key, value]) => form.append(key, value))
form.append("file", file)
const res = await fetch(target.uploadUrl, { method: "POST", body: form })
if (res.status !== 204) throw new Error("Upload failed")
```

For a progress bar, use `XMLHttpRequest` and `xhr.upload.onprogress`, because `fetch` can't report upload progress.

| Result | Meaning |
|---|---|
| `204 No Content` | Uploaded |
| `400` with `<Code>EntityTooLarge</Code>` | File is over 5 MiB |
| `403` with `<Code>AccessDenied</Code>` | URL expired (over 5 minutes), or the fields were changed. Request a new URL. |

S3 errors are **XML, not JSON**.

### `POST /price-submissions`

Step 3 of 3, and the only step when there's no photo.

| Body field | Type | Required | Rules |
|---|---|---|---|
| `productId` | string | yes | Must be an id from `GET /products` |
| `retailerId` | string | yes | Must be an id from `GET /retailers` |
| `priceCents` | integer | yes | 1 – 100000 ($0.01 – $1,000). Price of **one pack** at regular shelf price. |
| `observedAt` | string | yes | `YYYY-MM-DD` (read as midnight Singapore time) or an ISO 8601 datetime. Not in the future. A date may be up to 30 days before today in Singapore time, so the earliest date a form offers is accepted all day; a datetime at most 30 days before now. |
| `photoKey` | string | no | The `photoKey` from step 1 for **this same product**, after a successful upload in step 2 |

The product and store are checked here too, with or without a photo, because a price without a photo never goes through step 1.

```json
POST /price-submissions
{ "productId": "e0bbb251-86fc-5f79-ae73-afb84fa2e54f", "retailerId": "fairprice", "priceCents": 363,
  "observedAt": "2026-10-24", "photoKey": "price-evidence/<your-user-id>/e0bbb251-…/2b0f….png" }
```

```json
201 Created
{
  "id": "ZTBiYmIyNTEtODZm…",
  "submissionId": "c1413f67-3c11-449f-8b55-20893e82c6b8",
  "productId": "e0bbb251-86fc-5f79-ae73-afb84fa2e54f",
  "productName": "Magnolia Fresh Milk",
  "retailerId": "fairprice",
  "retailerName": "FairPrice",
  "userId": "196ae5bc-20c1-70ca-1b13-15f961e72cb0",
  "priceCents": 363,
  "observedAt": "2026-10-23T16:00:00.000Z",
  "submittedAt": "2026-10-24T08:15:02.120Z",
  "status": "accepted",
  "photoKey": "price-evidence/196ae5bc-…/e0bbb251-…/2b0f….png",
  "photoContentType": "image/png",
  "photoSizeBytes": 183004
}
```

**Evidence photos are for admin verification only.** Contributors see that a photo is attached (`photoKey`, type and size) but never get a `photoUrl` to view it; only the admin endpoints include one.

**`status` is decided by the server:**

| Condition | `status` | What happens |
|---|---|---|
| `minCents ≤ priceCents ≤ maxCents` for the product | `accepted` | Counts as a real price straight away |
| Outside that range | `flagged` | Hidden from shoppers until an admin accepts or rejects it |

Errors, in the order they're checked:

| Status | `code` | When |
|---|---|---|
| 400 | `INVALID_BODY` | Body isn't a JSON object |
| 400 | `VALIDATION_ERROR` | `fieldErrors` names the bad fields (`productId`, `retailerId`, `priceCents`, `observedAt`, `photoKey`), including unknown product or store ids |
| 429 | `RATE_LIMITED` | Over 30 submissions in the past hour |
| 409 | `DUPLICATE_SUBMISSION` | This user already submitted the same product, store and price for the same Singapore day |
| 400 | `VALIDATION_ERROR` | `photoKey` isn't one of the caller's own uploads **for this product** |
| 400 | `PHOTO_NOT_FOUND` | Nothing was uploaded for that `photoKey` |
| 400 | `INVALID_PHOTO` | The uploaded object isn't a JPEG/PNG of 5 MiB or less, or its bytes aren't the image type it was uploaded as. A file that fails the second check is deleted. |

### `GET /price-submissions/mine`

The caller's own submissions in every status, newest first. There's no `photoUrl`; evidence photos are for admins only.

| Query | Default | Notes |
|---|---|---|
| `limit` | 50 | 1–100 |
| `nextToken` | — | From the previous page |

```json
200 OK
{ "items": [ { …Submission… } ], "nextToken": null }
```

Errors: `400 VALIDATION_ERROR` (`limit`), `400 INVALID_PAGE_TOKEN`, `401`.

### `GET /admin/price-submissions`

Admin only. Lists submissions by status, newest first. Records also include `submitterName`, `submitterEmail` and, when a photo is attached, a 5-minute `photoUrl` to check the evidence.

| Query | Default | Notes |
|---|---|---|
| `status` | `flagged` | `flagged`, `accepted` or `rejected` |
| `limit` | 50 | 1–100 |
| `nextToken` | — | From the previous page |

Errors: `400 VALIDATION_ERROR` (`status`, `limit`), `400 INVALID_PAGE_TOKEN`, `401`, `403 FORBIDDEN`.

### `PATCH /admin/price-submissions/{id}`

Admin only. Decides a **flagged** submission. Each one can be decided once.

| Body field | Type | Required | Rules |
|---|---|---|---|
| `decision` | string | yes | `accepted` or `rejected` |
| `reason` | string | when rejecting | 1–500 characters, shown to the contributor |

```json
PATCH /admin/price-submissions/ZTBiYmIyNTEtODZm…
{ "decision": "rejected", "reason": "Shelf label is unreadable" }
```

```json
200 OK
{ …Submission…, "status": "rejected", "reviewedAt": "2026-10-24T09:01:44.810Z", "reviewedBy": "<admin user id>",
  "rejectionReason": "Shelf label is unreadable", "submitterName": "Alex Tan", "submitterEmail": "alex@example.com" }
```

Errors: `400 VALIDATION_ERROR` (`decision`, `reason`), `401`, `403 FORBIDDEN`, `404 NOT_FOUND`, `409 ALREADY_MODERATED`. A 409 means the submission isn't flagged: either another admin got there first, or it was accepted automatically.

### Proposing a new product

When a shopper finds a product that isn't in the catalog, they can propose it with its first price. A **product picture is required**; an evidence photo of the price is optional.

1. Upload the picture, and optionally an evidence photo, with [`POST /product-requests/image-upload-url`](#post-product-requestsimage-upload-url), then send each file to S3 [as in step 2 above](#uploading-the-photo-to-s3).
2. Send the request with [`POST /product-requests`](#post-product-requests).

The request stays **`pending`** and is hidden from the catalog, search and the basket until an admin approves it ([`PATCH /admin/product-requests/{id}`](#patch-adminproduct-requestsid)). Approving publishes the product, with its picture, and its first price as an accepted submission. The price reaches the Smart Basket after that night's price job. Until an admin decides, the contributor can take the request back with [`DELETE /product-requests/{id}`](#delete-product-requestsid).

### `POST /product-requests/image-upload-url`

User. Returns a one-time, 5-minute upload form, exactly like the [evidence upload link](#post-price-submissionsimage-upload-url), for one JPEG or PNG of up to 5 MiB.

| Body field | Type | Required | Rules |
|---|---|---|---|
| `purpose` | string | yes | `product-image` for the product's picture, or `evidence` for a shelf-tag photo of its price |
| `contentType` | string | yes | `image/jpeg` or `image/png` |
| `sizeBytes` | integer | yes | 1 – 5,242,880 |

The response is the same as the evidence upload link's. It carries `productImageKey` when `purpose` is `product-image`, or `photoKey` when it is `evidence`. Keep the key for `POST /product-requests`.

Errors: `400 VALIDATION_ERROR` (`purpose`, `contentType`, `sizeBytes`), `400 IMAGE_TOO_LARGE`, `401`, `429 UPLOAD_RATE_LIMITED` (the same hourly allowance as price photos).

### `POST /product-requests`

User. Proposes the product and its first price. **Every field is required** except `photoKey`.

| Body field | Type | Rules |
|---|---|---|
| `name` | string | 2–120 characters |
| `brand` | string | 1–60 characters |
| `category` | string | 1–40 characters, stored lower-case like the existing categories (`milk`, `bread`, …) |
| `packQty` | number | Size of one unit, more than 0 and at most 100000 (decimals allowed, e.g. `32.5`) |
| `packUnit` | string | `ml`, `L`, `g`, `kg`, `pcs` or `rolls` (any capitalisation) |
| `packCount` | integer | Units per pack, 1–100 |
| `hcs` | boolean | Has the Healthier Choice Symbol |
| `dietary` | string[] | At most 5 tags of 1–30 characters, e.g. `["halal"]`; `[]` for none |
| `retailerId` | string | Store where the price was seen; must be an id from `GET /retailers` |
| `priceCents` | integer | 1 – 100000, the regular shelf price of one pack |
| `observedAt` | string | Same rules as for a price submission |
| `productImageKey` | string | **Required.** From the upload link with `purpose: "product-image"`, after a successful upload |
| `photoKey` | string, optional | From the upload link with `purpose: "evidence"`, after a successful upload |

```json
POST /product-requests
{ "name": "Oatside Barista Oat Milk", "brand": "Oatside", "category": "milk", "packQty": 1, "packUnit": "L",
  "packCount": 1, "hcs": false, "dietary": ["vegan"], "retailerId": "fairprice", "priceCents": 545,
  "observedAt": "2026-10-29", "productImageKey": "product-images/pending/<your-user-id>/9c1e….png" }
```

```json
201 Created
{
  "id": "2f4b7a10-…", "requestId": "2f4b7a10-…", "status": "pending", "userId": "<your-user-id>",
  "submittedAt": "2026-10-29T03:12:44.120Z",
  "name": "Oatside Barista Oat Milk", "brand": "Oatside", "category": "milk", "packQty": 1, "packUnit": "L",
  "packCount": 1, "hcs": false, "dietary": ["vegan"],
  "retailerId": "fairprice", "retailerName": "FairPrice", "priceCents": 545, "observedAt": "2026-10-28T16:00:00.000Z",
  "productImageKey": "product-images/pending/<your-user-id>/9c1e….png", "productImageContentType": "image/png",
  "productImageSizeBytes": 48210, "productImageUrl": "https://…"
}
```

Errors, in the order they're checked:

| Status | `code` | When |
|---|---|---|
| 400 | `INVALID_BODY` | Body isn't a JSON object |
| 400 | `VALIDATION_ERROR` | `fieldErrors` names every missing or bad field, including `"productImageKey": "Upload a picture of the product"` and an unknown store |
| 429 | `RATE_LIMITED` | More than 10 product requests in the past 24 hours |
| 409 | `PRODUCT_EXISTS` | The catalog already has this product (same name, brand, pack size and units per pack, ignoring case and spacing; a 6 × 1 L pack is not a duplicate of a single 1 L). The response includes **`productId`** so the user can submit a price for it instead. |
| 409 | `PRODUCT_ALREADY_REQUESTED` | Someone has already proposed this product and it's waiting for an admin |
| 400 | `VALIDATION_ERROR` | `productImageKey` or `photoKey` isn't one of the caller's own uploads for a product request |
| 400 | `PHOTO_NOT_FOUND` / `INVALID_PHOTO` | Nothing was uploaded for that key, or it isn't a real JPEG/PNG of 5 MiB or less |

### `GET /product-requests/mine`

User. The caller's own product requests in every status, newest first, paginated like `GET /price-submissions/mine`. Each one shows:
- its `status` and `productImageUrl`
- `rejectionReason` when rejected
- `productId` once approved, the id of the published product

There's no evidence `photoUrl`.

### `DELETE /product-requests/{id}`

User. Deletes one of the caller's own requests **while it is still `pending`**. Once an admin has approved or rejected it, it can't be deleted. No body.

The request is removed for good, along with its product picture and evidence photo. It disappears from `GET /product-requests/mine` and the admin queue, and the same product can be proposed again. A deleted request no longer counts toward the daily limit of 10.

```
DELETE /product-requests/2f4b7a10-…
204 No Content
```

Errors:

| Status | `code` | When |
|---|---|---|
| 401 | — | No or invalid token |
| 404 | `NOT_FOUND` | No such request, or it belongs to someone else (other people's requests always look missing, even to admins) |
| 409 | `ALREADY_MODERATED` | It's already approved or rejected. `message` says which, e.g. "This product request is already approved." |

If an admin is deciding the request at the same moment, only one of them wins. Either the delete gets `409`, or the admin gets `404 NOT_FOUND` and nothing is published.

### `GET /admin/product-requests`

Admin only. Lists product requests by status, newest first.

| Query | Default | Notes |
|---|---|---|
| `status` | `pending` | `pending`, `approved` or `rejected` |
| `limit` | 50 | 1–100 |
| `nextToken` | — | From the previous page |

Each record also has these fields:
- `submitterName` and `submitterEmail`
- `productImageUrl`
- the evidence `photoUrl`, when there is one
- for pending requests, `suggestedMinCents` and `suggestedMaxCents`: the believable price range the product gets unless the admin changes it. That's half to one and a half times the first price; for 545 it's 272–818.

Errors: `400 VALIDATION_ERROR` (`status`, `limit`), `400 INVALID_PAGE_TOKEN`, `401`, `403 FORBIDDEN`.

### `PATCH /admin/product-requests/{id}`

Admin only. Decides a **pending** product request. Each one can be decided once.

| Body field | Type | Required | Rules |
|---|---|---|---|
| `decision` | string | yes | `approved` or `rejected` |
| `reason` | string | when rejecting | 1–500 characters, shown to the contributor |
| `changes` | object | no | Corrections to publish instead of what the contributor typed. It can contain any product field (same rules as above), plus `minCents` / `maxCents` (the believable price range, defaulting to the suggested one) and `searchTerms` (at most 10 extra search words). |

```json
PATCH /admin/product-requests/2f4b7a10-…
{ "decision": "approved", "changes": { "category": "plant milk", "searchTerms": ["oat", "barista"] } }
```

- **Approving publishes in one step:**
  - the product, under a new `productId`
  - its picture, moved to `product-images/<productId>.<ext>`
  - its first price, as an **accepted** submission by the contributor

  The response is the updated request, with `status: "approved"`, `productId` and the published values. The product then appears in `GET /products` and search, with an `imageUrl`.
- **Rejecting** stores the reason and deletes the pending picture.

Errors:

| Status | `code` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `decision`, `reason`, or a field in `changes` (including `maxCents` below `minCents`, or an unknown field) |
| 401 / 403 | `FORBIDDEN` | Not an admin |
| 404 | `NOT_FOUND` | No such request |
| 409 | `ALREADY_MODERATED` | The request isn't pending any more; another admin may have got there first |
| 409 | `PRODUCT_EXISTS` | The product was added to the catalog meanwhile (includes `productId`). Reject the request instead. |
| 409 | `PRODUCT_IMAGE_MISSING` | The request's picture is gone from storage. Reject the request instead. |
| 409 | `OBSERVATION_TOO_OLD` | The request's price was seen more than 30 days ago (Singapore days), so it can't be published as a current price. Reject the request and ask for a fresh one. |

### `POST /basket/compare`

Public, no token needed. Prices the shopper's basket at every store and returns two comparisons side by side:
- `basket`: exactly the products the shopper picked.
- `healthierBasket`: the same basket with each product swapped for a Healthier Choice product in its category, where one exists.

Nothing is stored. The frontend keeps the basket (e.g. in `localStorage`) and sends all of it each time.

**Prices update once a day.** Each store's price for a product is that day's **average** of the accepted prices contributors submitted for that store, worked out at 00:05 Singapore time. A price submitted today shows in the basket from tomorrow. Show `pricesUpdated` on the page, e.g. "Prices updated 26 Oct, 00:05".

| Body field | Type | Required | Rules |
|---|---|---|---|
| `items` | array | yes | 1–50 lines of `{ productId, quantity }` |
| `items[].productId` | string | yes | An `id` from `GET /products` |
| `items[].quantity` | integer | yes | Number of packs, 1–99. Repeated products are merged by adding their quantities, up to 99 in total. |
| `retailerIds` | string[] | no | Only compare these stores. Leave it out to compare every store. |

```json
POST /basket/compare
{ "items": [ { "productId": "<white bread id>", "quantity": 2 }, { "productId": "<Dynamo id>", "quantity": 1 },
             { "productId": "<Thai rice id>", "quantity": 1 } ] }
```

```jsonc
200 OK
{
  "priceMaxAgeDays": 30,
  "pricesUpdated": "2026-10-25T16:05:01.230Z",
  "basket": {
    "stores": [
      { "retailerId": "shengsiong", "retailerName": "Sheng Siong", "rank": 1, "complete": true,
        "pricedCount": 3, "missingCount": 0, "coveragePercent": 100.0, "totalCents": 3750,
        "lines": [ { "productId": "…", "productName": "Gardenia Enriched White Bread", "brand": "Gardenia",
                     "packQty": 400, "packUnit": "g", "packCount": 1, "hcs": false, "category": "bread",
                     "quantity": 2, "unitPriceCents": 250, "subtotalCents": 500,
                     "priceDate": "2026-10-24", "submissionCount": 1 },
                   … ],
        "unpriced": [] },
      { "retailerId": "fairprice", "rank": 2, "totalCents": 3970, … },
      { "retailerId": "coldstorage", "rank": 3, "totalCents": 4370, … }
    ],
    "recommendation": { "retailerId": "shengsiong", "retailerName": "Sheng Siong", "totalCents": 3750, "complete": true },
    "savings": [
      { "retailerId": "fairprice", "retailerName": "FairPrice", "basis": "full-basket", "comparedLines": 3,
        "otherTotalCents": 3970, "recommendedTotalCents": 3750, "savingsCents": 220, "savingsPercent": 5.5 },
      { "retailerId": "coldstorage", …, "savingsCents": 620, "savingsPercent": 14.2 }
    ],
    "maxSavingsCents": 620
  },
  "healthierBasket": {
    "stores": [ { "retailerId": "shengsiong", "totalCents": 3934,
                  "lines": [ { "productName": "Gardenia 100% Wholemeal Extra Soft & Fine Bread", "hcs": true,
                               "replacesProductId": "<white bread id>", "quantity": 2, "subtotalCents": 660, … }, … ], … }, … ],
    "recommendation": { "retailerId": "shengsiong", "totalCents": 3934, "complete": true, … },
    "savings": [ … ], "maxSavingsCents": 696,
    "swaps": [
      { "originalProductId": "<white bread id>", "originalName": "Gardenia Enriched White Bread", "category": "bread", "status": "swapped" },
      { "originalProductId": "<Dynamo id>", "originalName": "Dynamo Laundry Detergent - Anti-Bacterial", "category": "detergent", "status": "no-hcs-option" },
      { "originalProductId": "<Thai rice id>", "originalName": "SongHe AAA Thai Hom Mali Rice", "category": "rice", "status": "swapped" }
    ]
  },
  "healthierExtra": { "basketTotalCents": 3750, "healthierTotalCents": 3934, "extraCents": 184, "extraPercent": 4.9 }
}
```

How it decides:
- **Which price a store uses:** the store's **daily average** for that product.
  - **What goes in:** the accepted prices submitted for that product at that store during the previous Singapore day, rounded to the nearest cent. Flagged and rejected prices are never used.
  - **On each line:** `priceDate` is the day the average comes from, and `submissionCount` is how many prices went into it.
  - **Days with no new prices:** the last average is kept, up to `priceMaxAgeDays` (30) days old.
  - **No usable price:** a product with no price at a store is listed in that store's `unpriced`, not left out.
  - **`pricesUpdated`:** when the averages were last worked out. It's `null` if they have never been computed.
- **Ranking:** stores that price every line (`complete`) come first, cheapest first. Incomplete stores follow, by how many lines they price and then by total. Equal totals are ordered by store name. `totalCents` only adds up the priced lines.
- **Recommendation:** the top-ranked store, or `null` if no store has a price for anything. When `complete` is `false`, no store sells the whole basket. Say so in the UI.
- **Savings:** the recommended store compared with each other store.
  - `basis: "full-basket"`: both stores price everything, so this is the true saving on the whole basket.
  - `basis: "common-items"`: one of them is missing something, so only the `comparedLines` lines both stores price are compared. The saving can be negative.
  - `savingsCents` is `null` when the two stores share no priced lines.
  - `maxSavingsCents` is the largest full-basket saving: the "you save up to …" figure.
- **Healthier basket:** each line's `swaps[].status` says what happened to it.
  - `swapped`: replaced with a Healthier Choice product from the same category. Each store uses its cheapest one, and the line carries `replacesProductId`.
  - `already-hcs`: kept, because it is already a Healthier Choice product.
  - `no-hcs-option`: kept, because the category has no Healthier Choice product.

  If a swapped line has no Healthier Choice price at some store, it is unpriced there rather than falling back to the original. `healthierBasket` is `null` when nothing can be swapped.
- **`healthierExtra`:** how much more the healthier basket's best store costs than the basket's best store. It can be negative when the healthier basket is cheaper. It is `null` unless both recommendations are complete.

Errors: `400 INVALID_BODY`, `400 VALIDATION_ERROR` (`items`, `items[i]`, `items[i].productId`, `items[i].quantity`, `retailerIds`).

## 4. Data types

### Product

| Field | Type | Notes |
|---|---|---|
| `id` | string (UUID) | |
| `name`, `brand`, `category` | string | |
| `packQty` | number | Size of one unit, e.g. `946` |
| `packUnit` | string | `ml`, `L`, `g`, `kg`, `pcs`, `rolls` |
| `packCount` | integer, optional | Units per pack, e.g. `6` for 6 × 180 ml cans. Treat missing as `1`. |
| `hcs` | boolean | Has the Healthier Choice Symbol |
| `dietary` | string[], optional | e.g. `["halal", "vegetarian"]` |
| `searchTerms` | string[], optional | Extra words to match in search |
| `minCents`, `maxCents` | integer | Believable price range. Prices outside it are flagged. |
| `imageKey`, `imageUrl` | string, optional | Only on products published from a product request. `imageUrl` is a signed link to the product's picture that works for **1 hour**. Products without it keep their category icon. |
| `createdFromRequest`, `createdAt` | string, optional | Only on products published from a product request |
| `priceUpdatedAt` | string (UTC ISO 8601) or `null` | When the nightly price job (00:05 SGT) last recomputed any of this product's store prices: that run's time. It only changes on nights when new accepted prices came in for the product. Always present in `GET /products` (`null` if never priced); in `GET /products/search`, present once set. Not the same as a store's `priceDate` (the day a store's average covers) or the page-wide `pricesUpdated` (the last run of all). |

### Retailer

| Field | Type |
|---|---|
| `id` | `fairprice` \| `shengsiong` \| `coldstorage` |
| `name` | string |

### Submission

| Field | Type | Present |
|---|---|---|
| `id` | string | Always. Opaque; use it in `PATCH`. |
| `submissionId` | string (UUID) | On submissions made through the API (older seed data may not have it) |
| `productId`, `productName` | string, string \| null | Always |
| `retailerId`, `retailerName` | string, string \| null | Always |
| `userId` | string | Always. The contributor's Cognito user id; `seed-team` for prices loaded by the team. |
| `priceCents` | integer | Always |
| `observedAt`, `submittedAt` | string (ISO 8601 UTC) | Always |
| `status` | `accepted` \| `flagged` \| `rejected` | Always |
| `photoKey`, `photoContentType`, `photoSizeBytes` | string, string, integer | When a photo was attached |
| `photoUrl` | string | **Admin endpoints only**, when a photo was attached. A signed link that **expires 5 minutes** after the response; if the image fails to load, fetch the list again. |
| `productRequestId` | string | Only on the first price of a product published from a product request |
| `reviewedAt`, `reviewedBy` | string | After an admin decision (also on a published product's first price) |
| `rejectionReason` | string | When rejected |
| `submitterName`, `submitterEmail` | string \| null | Admin endpoints only |

```ts
export type ApiSubmissionStatus = "accepted" | "flagged" | "rejected"

export interface ApiSubmission {
  id: string
  submissionId?: string
  productId: string
  productName: string | null
  retailerId: string
  retailerName: string | null
  userId: string
  priceCents: number
  observedAt: string
  submittedAt: string
  status: ApiSubmissionStatus
  photoKey?: string
  photoContentType?: "image/jpeg" | "image/png"
  photoSizeBytes?: number
  photoUrl?: string                   // admin endpoints only
  productRequestId?: string
  reviewedAt?: string
  reviewedBy?: string
  rejectionReason?: string
  submitterName?: string | null
  submitterEmail?: string | null
}
```

### Product request

```ts
export type ApiProductRequestStatus = "pending" | "approved" | "rejected"

export interface ApiProductRequest {
  id: string                          // same as requestId; use it in PATCH and DELETE
  requestId: string
  status: ApiProductRequestStatus
  userId: string
  submittedAt: string
  name: string
  brand: string
  category: string
  packQty: number
  packUnit: "ml" | "L" | "g" | "kg" | "pcs" | "rolls"
  packCount: number
  hcs: boolean
  dietary: string[]
  retailerId: string
  retailerName: string | null
  priceCents: number
  observedAt: string
  productImageKey: string
  productImageContentType: "image/jpeg" | "image/png"
  productImageSizeBytes: number
  productImageUrl: string             // signed, 1 hour
  photoKey?: string                   // evidence photo, if one was sent
  photoContentType?: "image/jpeg" | "image/png"
  photoSizeBytes?: number
  photoUrl?: string                   // admin endpoints only, 5 minutes
  submitterName?: string | null       // admin endpoints only
  submitterEmail?: string | null      // admin endpoints only
  suggestedMinCents?: number          // admin endpoints, pending requests only
  suggestedMaxCents?: number
  reviewedAt?: string
  reviewedBy?: string
  rejectionReason?: string            // when rejected
  productId?: string                  // when approved: the published product
  submissionId?: string               // when approved: its first price
  minCents?: number                   // when approved: the published price range
  maxCents?: number
}
```

### Product search

The response of [`GET /products/search`](#get-productssearch):

```ts
export interface ApiStorePrice {
  priceCents: number
  priceDate: string                   // "2026-10-25": the Singapore day this daily average comes from
  submissionCount: number
}

export interface ApiSearchProduct extends ApiProduct {   // ApiProduct: the Product fields above
  prices: Record<string, ApiStorePrice>                   // keyed by retailerId; stores with no current price are missing
  lowestPrice: { retailerId: string; retailerName: string | null; priceCents: number; priceDate: string } | null
}

export interface ApiSearchResult {
  items: ApiSearchProduct[]
  total: number
  catalogSize: number
  facets: { categories: string[]; brands: string[]; dietary: string[] }
  priceMaxAgeDays: number
  pricesUpdated: string | null
}
```

### Basket comparison

The response of [`POST /basket/compare`](#post-basketcompare):

```ts
export interface ApiBasketLine {
  productId: string
  productName: string | null
  brand: string | null
  packQty: number | null
  packUnit: string | null
  packCount: number
  hcs: boolean
  category: string | null
  quantity: number
  unitPriceCents: number
  subtotalCents: number
  priceDate: string                   // "2026-10-24": the Singapore day this daily average comes from
  submissionCount: number             // prices averaged into unitPriceCents
  replacesProductId?: string          // healthier basket only, on swapped lines
}

export interface ApiBasketStore {
  retailerId: string
  retailerName: string | null
  rank: number                        // 1 = best
  complete: boolean                   // prices every line
  pricedCount: number
  missingCount: number
  coveragePercent: number
  totalCents: number                  // priced lines only
  lines: ApiBasketLine[]
  unpriced: { productId: string; productName: string | null; category: string | null }[]
}

export interface ApiBasketSaving {
  retailerId: string
  retailerName: string | null
  basis: "full-basket" | "common-items"
  comparedLines: number
  otherTotalCents: number | null
  recommendedTotalCents: number | null
  savingsCents: number | null         // other store minus recommended store
  savingsPercent: number | null       // of otherTotalCents
}

export interface ApiBasketComparison {
  stores: ApiBasketStore[]
  recommendation: { retailerId: string; retailerName: string | null; totalCents: number; complete: boolean } | null
  savings: ApiBasketSaving[]
  maxSavingsCents: number | null
}

export interface ApiBasketResult {
  priceMaxAgeDays: number
  pricesUpdated: string | null        // when the daily averages were last computed (UTC ISO 8601)
  basket: ApiBasketComparison
  healthierBasket: (ApiBasketComparison & {
    swaps: { originalProductId: string; originalName: string | null; category: string | null
             status: "swapped" | "already-hcs" | "no-hcs-option" }[]
  }) | null
  healthierExtra: { basketTotalCents: number; healthierTotalCents: number; extraCents: number; extraPercent: number } | null
}
```

## 5. Errors

Errors from the backend always have this shape:

```json
{ "code": "VALIDATION_ERROR", "message": "Some fields are invalid.",
  "fieldErrors": { "priceCents": "Price must be a whole number of cents greater than 0" }, "requestId": "3f1c…" }
```

`message` and the `fieldErrors` values are user-readable. `fieldErrors` only appears on validation errors. A few errors add a field the client can act on, such as `productId` on `PRODUCT_EXISTS`.

| Status | `code` | Meaning |
|---|---|---|
| 400 | `INVALID_BODY` | Body missing, not JSON, or not an object |
| 400 | `VALIDATION_ERROR` | See `fieldErrors` |
| 400 | `IMAGE_TOO_LARGE` | Upload request over 5 MiB |
| 400 | `PHOTO_NOT_FOUND` | `photoKey` or `productImageKey` has no uploaded file |
| 400 | `INVALID_PHOTO` | Uploaded file isn't a JPEG/PNG of 5 MiB or less, or its bytes aren't the image type it was uploaded as (the file is then deleted) |
| 400 | `INVALID_PAGE_TOKEN` | `nextToken` was altered, or came from a different list |
| 401 | `UNAUTHENTICATED` | Token missing its user (rare, see below) |
| 403 | `FORBIDDEN` | Admin route called by a non-admin |
| 404 | `NOT_FOUND` | Submission or product request doesn't exist |
| 409 | `DUPLICATE_SUBMISSION` | Same product, store and price already submitted today |
| 409 | `ALREADY_MODERATED` | Submission isn't flagged, or product request isn't pending, any more |
| 409 | `PRODUCT_EXISTS` | The proposed product is already in the catalog; `productId` says which |
| 409 | `PRODUCT_ALREADY_REQUESTED` | The proposed product is already waiting for an admin |
| 409 | `PRODUCT_IMAGE_MISSING` | A pending request's picture is gone; the admin should reject it |
| 409 | `OBSERVATION_TOO_OLD` | A pending request's price is more than 30 days old; the admin should reject it |
| 429 | `RATE_LIMITED` | Too many submissions this hour, or product requests today |
| 429 | `UPLOAD_RATE_LIMITED` | More than 60 photo upload links in this clock hour |
| 500 | `INTERNAL_ERROR` | Backend bug. Report the `requestId` to Gareth. |

**API Gateway errors don't use that shape.** They come before the backend runs and contain only `{"message": "…"}`:

| Status | `message` | Cause |
|---|---|---|
| 401 | `Unauthorized` (or `The incoming token has expired`) | No token, an expired or invalid token, or an ID token instead of an access token. Refresh the session or send the user to log in. |
| 403 | `Missing Authentication Token`, or `Invalid key=value pair … in Authorization header` when a token was sent | **Wrong path or method.** API Gateway reports unknown routes this way; it isn't a login problem. |
| 429 | `Too Many Requests` | Over the API's throttle (20 a second, bursts of 40, for all callers together). Wait a moment and retry. |
| 502 / 504 | `Internal server error` / timeout | Backend crashed or timed out |

## 6. Limits

| Limit | Value |
|---|---|
| Image types | `image/jpeg`, `image/png` |
| Image size | 5 MiB (5,242,880 bytes), one image per upload link |
| Upload URL lifetime | 5 minutes |
| `photoUrl` lifetime (evidence, admins only) | 5 minutes |
| `imageUrl` / `productImageUrl` lifetime (product pictures) | 1 hour |
| Price | 1 – 100000 cents |
| `observedAt` | Not in the future (5-minute clock tolerance). A date: up to 30 days before today (Singapore time). A datetime: at most 30 days old. A product request can only be approved while its price is still within those 30 days. |
| Submissions per user | 30 per rolling hour (counts every status) |
| Product requests per user | 10 per rolling 24 hours (counts every status) |
| Photo upload links per user | 60 per clock hour (UTC), price photos and product requests together |
| API throughput | 20 requests a second, bursts of 40, all callers together |
| Search filters (`q`, `category`, `brand`, `dietary`) | 100 characters each |
| Duplicate rule | One submission per user, product, store, price and Singapore day |
| Rejection reason | 500 characters |
| Page size | Default 50, max 100 |
| Basket | 1–50 products, 1–99 of each |
| Basket prices | Daily averages, recomputed at 00:05 SGT; kept for up to 30 days without new submissions |

Not supported yet: promotions and member prices, branch-level prices, editing or withdrawing a submission, and users flagging other users' prices.

## 7. Example client code

```ts
const API = import.meta.env.VITE_API_BASE_URL

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public fieldErrors?: Record<string, string>) {
    super(message)
  }
}

export async function api<T>(path: string, options: { method?: string; body?: unknown; token?: string | null } = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const code = data.code ?? (res.status === 401 ? "UNAUTHENTICATED" : `HTTP_${res.status}`)
    throw new ApiError(res.status, code, data.message ?? "Request failed", data.fieldErrors)
  }
  return data as T
}

// A contributor submitting a price with a photo
const token = await getAccessToken()
const target = await api<{ uploadUrl: string; fields: Record<string, string>; photoKey: string }>(
  "/price-submissions/image-upload-url",
  { method: "POST", token, body: { productId, retailerId, contentType: file.type, sizeBytes: file.size } })
const form = new FormData()
Object.entries(target.fields).forEach(([k, v]) => form.append(k, v))
form.append("file", file)
const upload = await fetch(target.uploadUrl, { method: "POST", body: form })
if (upload.status !== 204) throw new Error("Photo upload failed. Please try again.")
const created = await api<ApiSubmission>("/price-submissions", {
  method: "POST", token,
  body: { productId, retailerId, priceCents: Math.round(price * 100), observedAt: "2026-10-24", photoKey: target.photoKey },
})
```

## 8. Trying the API by hand

You don't need an AWS account: Cognito's sign-in endpoint is public. Sign up through the app first (or ask Gareth for an account), then:

**PowerShell**
```powershell
$clientId = "<UserPoolClientId>"; $api = "<ApiUrl>";
$body = @{ AuthFlow = "USER_PASSWORD_AUTH"; ClientId = $clientId; AuthParameters = @{ USERNAME = "you@example.com"; PASSWORD = "<password>" } } | ConvertTo-Json;
$auth = Invoke-RestMethod -Method Post -Uri "https://cognito-idp.ap-southeast-1.amazonaws.com/" -ContentType "application/x-amz-json-1.1" -Headers @{ "X-Amz-Target" = "AWSCognitoIdentityProviderService.InitiateAuth" } -Body $body;
$token = $auth.AuthenticationResult.AccessToken;
Invoke-RestMethod "$api/products";
Invoke-RestMethod "$api/price-submissions/mine" -Headers @{ Authorization = "Bearer $token" }
```

Each line ends with `;`, so this still works if your terminal joins pasted lines into one.

**bash / curl**
```bash
TOKEN=$(curl -s https://cognito-idp.ap-southeast-1.amazonaws.com/ \
  -H "Content-Type: application/x-amz-json-1.1" \
  -H "X-Amz-Target: AWSCognitoIdentityProviderService.InitiateAuth" \
  -d '{"AuthFlow":"USER_PASSWORD_AUTH","ClientId":"<UserPoolClientId>","AuthParameters":{"USERNAME":"you@example.com","PASSWORD":"<password>"}}' \
  | python -c "import json,sys; print(json.load(sys.stdin)['AuthenticationResult']['AccessToken'])")
curl -H "Authorization: Bearer $TOKEN" "<ApiUrl>/price-submissions/mine"
```

You can also copy the token from a signed-in browser session. Amplify keeps it in `localStorage` under a key ending in `.accessToken`. Tokens expire after 60 minutes.

In Postman or Insomnia, set the auth type to *Bearer Token* and paste the access token. CORS doesn't apply outside the browser.
