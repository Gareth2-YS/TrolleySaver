# New product requests: backend → frontend handoff

**Date:** 29 Oct 2026 · **From:** Gareth (backend) · **To:** frontend developer · **Status:** backend deployed to `dev` and tested end to end; **frontend not started**

Shoppers can now propose a product that isn't in the catalog, with its first price and a picture. An admin approves it, which publishes the product, or rejects it. The backend is done; this note covers what the frontend needs to build. Every endpoint, field and error is in the [API reference → Proposing a new product](../api/README.md#proposing-a-new-product).

## 1. The flow

1. **Contributor**, e.g. a "Can't find your product?" link on `/contribute`:
   1. Fills in every product field, the store, price and date, picks a **picture of the product (required)** and, optionally, a shelf-tag photo of the price.
   2. Uploads each image: `POST /product-requests/image-upload-url` with `purpose: "product-image"` or `"evidence"`, then a multipart POST to S3, exactly like the existing photo upload.
   3. Sends `POST /product-requests` with the fields and the returned `productImageKey` (and `photoKey`).
   4. Sees the request as **pending** in a list from `GET /product-requests/mine`.
2. **Admin**, e.g. a second tab in the admin view:
   1. Lists pending requests with `GET /admin/product-requests`. Each one has the submitter, the picture (`productImageUrl`), the evidence photo (`photoUrl`) and a suggested believable price range.
   2. Approves, optionally correcting fields or the price range, or rejects with a reason: `PATCH /admin/product-requests/{id}`.
3. **Everyone:** once approved, the product appears in `GET /products` and `GET /products/search` like any other, with an `imageUrl`. Its first price reaches the Smart Basket after that night's price job.

A pending request is never in the catalog, search or basket.

## 2. The contributor form

All product fields are required (the group's decision), and the backend checks them all:

| Field | Input | Rule |
|---|---|---|
| `name` | text | 2–120 characters |
| `brand` | text | 1–60 characters |
| `category` | dropdown from `facets.categories` of `GET /products/search`, or free text | 1–40 characters, stored lower-case |
| `packQty` | number | More than 0, at most 100000, decimals allowed |
| `packUnit` | dropdown | `ml`, `L`, `g`, `kg`, `pcs`, `rolls` |
| `packCount` | number | Whole number 1–100 (units per pack, e.g. 6 for 6 × 180 ml) |
| `hcs` | checkbox | Healthier Choice Symbol |
| `dietary` | multi-select (`facets.dietary`) | At most 5 tags; may be empty |
| `retailerId`, `priceCents`, `observedAt` | same as the price form | Same rules as `POST /price-submissions` |
| product picture | image picker | **Required.** JPEG/PNG, ≤ 5 MB |
| shelf-tag photo | image picker | Optional, same limits |

Errors to handle:
- **`409 PRODUCT_EXISTS`:** the product is already in the catalog. The response has `productId`, so offer "Submit a price for this product instead", which opens the normal price form with it selected.
- **`409 PRODUCT_ALREADY_REQUESTED`:** someone already proposed it, and it's waiting for an admin.
- **`429 RATE_LIMITED`:** more than 10 requests in a day.
- **`400 VALIDATION_ERROR`:** show `fieldErrors` against the fields. If the picture is missing, the key is `productImageKey`.

## 3. The admin view

- **Queue:** `GET /admin/product-requests` (pending by default; `?status=approved|rejected` for history).
- **Approve:** `PATCH … { "decision": "approved" }`. To correct what the contributor typed, add `"changes": { … }` with any product field, `minCents` / `maxCents` (prefill them from `suggestedMinCents` / `suggestedMaxCents`) or `searchTerms`. The response is the approved request with the new `productId`.
- **Reject:** `PATCH … { "decision": "rejected", "reason": "…" }`. A reason is required, and the contributor sees it.
- **`409` responses:**
  - `ALREADY_MODERATED`: another admin decided first. Refresh the queue.
  - `PRODUCT_EXISTS`: the product was added meanwhile. Reject the request instead.
  - `PRODUCT_IMAGE_MISSING`: the picture is gone. Reject the request instead.

Admin accounts: none exist yet; see [auth handoff §5](2026-10-24-auth-backend-to-frontend.md#5-admin-accounts-none-exist-yet).

## 4. Product pictures on product cards

Products published from a request have an **`imageUrl`** in `GET /products` and `GET /products/search`. Show it on the product card when it's there, and keep the category icon (`frontend/assets/product-icons/`) otherwise; the 24 products the team loaded have no picture.

`imageUrl` is a signed link that works for **1 hour**. If an image fails to load (`onError`), refetch the list rather than retrying the same link.

## 5. Test checklist

Against `dev` with `VITE_AUTH_MODE=cognito` and `VITE_PRICE_SUBMISSION_MODE=api`:

1. Proposing a product without a picture is blocked, by the client and by the server (400 `productImageKey`).
2. Proposing "Magnolia Fresh Milk" (Magnolia, 946 ml) gives "already in the catalog", with a way to submit a price for it.
3. A valid proposal appears as pending in the contributor's list, and not in search.
4. As an admin, the queue shows it with its picture and suggested range. Approve it with a corrected category.
5. The product now appears in search with its picture, and the contributor's list shows it approved.
6. Propose another product and reject it with a reason. The contributor sees the reason.
7. Deciding the same request in two admin tabs shows "already decided" in the second.

The backend side of all of this is covered by `backend/tests/test_product_requests.py` and the smoke test, and can be tried by hand with `backend/TESTING.md` part 10. Clean up any test products you publish on dev; `backend/scripts/invoke.py cleanup --user-id <user id>` removes a user's requests and the products published from them.
