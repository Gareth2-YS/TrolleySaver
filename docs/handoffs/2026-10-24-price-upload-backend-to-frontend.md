# Price & image upload: backend → frontend handoff

**Date:** 24 Oct 2026 · **From:** Gareth (backend) · **To:** frontend developer · **Status:** deployed to `dev`, passing end-to-end tests

This is the backend's reply to [2026-10-23-price-upload-frontend-to-backend.md](2026-10-23-price-upload-frontend-to-backend.md). All six operations it asked for exist, but **some decisions changed** (section 2). What's left is frontend work: replace the placeholder API adapter and adjust the `/contribute` page.

- Endpoint details, examples and error codes: [API reference](../api/README.md)
- Login setup: do [2026-10-24-auth-backend-to-frontend.md](2026-10-24-auth-backend-to-frontend.md) first, then set `VITE_PRICE_SUBMISSION_MODE=api`.

## 1. Operations → endpoints

Replace `UnavailableApiSubmissionService` in `frontend/src/contributions/service.ts` with a real implementation of the existing `SubmissionService` interface. Keep `LocalSubmissionService` for offline work.

| `SubmissionService` method | Endpoint | Notes |
|---|---|---|
| `requestImageUpload(file, token)` | [`POST /price-submissions/image-upload-url`](../api/README.md#post-price-submissionsimage-upload-url) | Send `{ contentType: file.type, sizeBytes: file.size }`. **Add `fields: Record<string, string>` to `UploadTarget`.** |
| `uploadImage(target, file, onProgress)` | [`POST {uploadUrl}`](../api/README.md#uploading-the-photo-to-s3) | Multipart form: all `fields`, then `file` last. Use `XMLHttpRequest` so `onProgress` keeps working. Returns `204`. |
| `createSubmission(input, token)` | [`POST /price-submissions`](../api/README.md#post-price-submissions) | Body below |
| `listMySubmissions(userId, token)` | [`GET /price-submissions/mine`](../api/README.md#get-price-submissionsmine) | `userId` isn't needed; the server uses the token |
| `listPendingSubmissions(actor, token)` | [`GET /admin/price-submissions?status=flagged`](../api/README.md#get-adminprice-submissions) | |
| `moderateSubmission(id, decision, reason, actor, token)` | [`PATCH /admin/price-submissions/{id}`](../api/README.md#patch-adminprice-submissionsid) | Send `"accepted"` (not `"approved"`) or `"rejected"` |

`createSubmission` body:

```ts
{
  productId: input.productId,
  retailerId: input.storeId,
  priceCents: Math.round(input.price * 100),
  observedAt: input.observedDate,      // "2026-10-24" is accepted as-is
  photoKey: input.photo?.photoKey,     // leave out when there's no photo
}
```

Don't send submitter fields, `status` or timestamps. The server sets them and ignores client values.

After a successful upload, `uploadImage` should return:

```ts
{ fileName: file.name, contentType: file.type as "image/jpeg" | "image/png", sizeBytes: file.size,
  photoKey: target.photoKey, previewUrl: URL.createObjectURL(file), storage: "private-s3" }
```

## 2. What changed from the original assumptions

| Topic | Frontend today | Backend | What to do |
|---|---|---|---|
| **Moderation** | Everything is `pending` until an admin reviews it | **Reactive:** prices inside the product's believable range are `accepted` immediately. Only out-of-range prices are `flagged` for an admin. | Change the copy. "Every contribution stays pending until an administrator reviews it" becomes something like "Prices in the usual range are published straight away; unusual prices are checked by an admin first." The admin view becomes a "Flagged prices" queue, which will often be empty. |
| **Status names** | `pending` / `approved` / `rejected` | `flagged` / `accepted` / `rejected` | Preferably rename `SubmissionStatus` in `contributions/types.ts` to the backend values. Otherwise map in the adapter (`flagged ↔ pending`, `accepted ↔ approved`). |
| **Product & store lists** | Hard-coded in `contributions/catalog.ts` | [`GET /products`](../api/README.md#get-products), [`GET /retailers`](../api/README.md#get-retailers) (public) | Load the dropdowns from the API. The hard-coded ids (`gardenia-white-600g`, `sheng-siong`, `giant`…) don't exist and are rejected with `400`. |
| **Money** | `price: 2.8` | `priceCents: 280` | Convert in the adapter |
| **Upload method** | PUT to `uploadUrl` | Presigned **POST** with `fields` | See section 1 |
| **Max price** | $10,000 (`contributions/schema.ts`) | $1,000 | Lower the schema max to `1000` |
| **Observed date** | Not in the future | Not in the future **and at most 30 days old** | Add the lower bound to the schema |
| **Duplicates & rate limit** | None | 409 for the same product, store and price on the same day; 429 after 30 submissions an hour | Show the server's `message` |

## 3. Mapping API records to `PriceSubmission`

| `PriceSubmission` field | From the API record |
|---|---|
| `id` | `id` (opaque, never parse) |
| `productId`, `productName` | `productId`, `productName` |
| `storeId`, `storeName` | `retailerId`, `retailerName` |
| `price` | `priceCents / 100` |
| `currency` | `"SGD"` |
| `observedDate` | `observedAt` as a **Singapore** date. `2026-10-23T16:00:00.000Z` is 24 Oct. |
| `status` | `status` (see section 2) |
| `submitterId` | `userId` |
| `submitterName`, `submitterEmail` | Same names. Admin endpoints only; empty for contributors' own lists. |
| `submittedAt`, `reviewedAt`, `reviewedBy`, `rejectionReason` | Same names |
| `photo` | If `photoKey` is present: `{ fileName: photoKey.split("/").pop(), contentType: photoContentType, sizeBytes: photoSizeBytes, photoKey, previewUrl: photoUrl, storage: "private-s3" }` |

- **`photoUrl` expires 5 minutes** after the response. If an `<img>` fails to load, re-fetch the list rather than retrying the same URL.
- **Original file names aren't stored.** The admin card's "Evidence file" line should show the key's file name, or just the size.

## 4. Errors to handle in the UI

The full list is in [API reference §5](../api/README.md#5-errors). The ones the form needs:

- `400 VALIDATION_ERROR`: show `fieldErrors` against the fields. The keys map as `productId`→product, `retailerId`→store, `priceCents`→price, `observedAt`→date, `photoKey`/`photo`→image.
- `400 IMAGE_TOO_LARGE` / `INVALID_PHOTO` / `PHOTO_NOT_FOUND`: ask the user to choose or upload the image again.
- **S3 upload failures:** XML responses, not JSON. Treat any non-2xx as "upload failed, try again" and request a fresh upload URL.
- `409 DUPLICATE_SUBMISSION`, `429 RATE_LIMITED`: show `message`.
- `409 ALREADY_MODERATED` (admin): remove the item from the queue and refresh.
- `401` with only `{"message": …}`: the session ended (see the auth handoff).

## 5. Answers to "Assumptions and unresolved decisions"

| Question | Decision |
|---|---|
| Store or branch pricing | Store (retailer) level only. There's no `branchId`. |
| Source of product and store ids | `GET /products` and `GET /retailers`. Product names come back on every submission as `productName` and `retailerName`. |
| Store contributor name and email on each record? | No. They're looked up from the user profile when admins read the queue (`submitterName`, `submitterEmail`). |
| Can submissions or images be edited or withdrawn? | Not in this iteration. A submission and its image can't be changed once created. |
| Moderation concurrency | A decision only applies if the item is still `flagged`. Otherwise `409 ALREADY_MODERATED`. A reason is required for rejections. `reviewedAt` and `reviewedBy` are stored for audit. |
| Does approval publish the price? | Yes. `accepted` prices are the public price data, and search and the basket should only use `accepted`. There's no separate publishing step. |
| Evidence retention | Photos are kept for now. Cleaning up unused uploads is a backend follow-up. |
| Promotions | Not tracked. Prices are regular shelf prices only. |

## 6. Test checklist

Run these against `dev` with `VITE_AUTH_MODE=cognito` and `VITE_PRICE_SUBMISSION_MODE=api`:

1. The product and store dropdowns come from the API.
2. A normal price with a photo, e.g. Magnolia Fresh Milk at FairPrice for $3.63, shows as **accepted**, with the photo displayed in "my submissions".
3. An unusual price ($20 for the same milk) shows as **flagged**.
4. Submitting the same thing again shows the duplicate message.
5. A GIF, or an image over 5 MB, is blocked by the client.
6. As an admin, the flagged price is in the queue and can be accepted, or rejected with a reason. The contributor then sees the new status. No admin accounts exist yet; create one first ([auth handoff §5](2026-10-24-auth-backend-to-frontend.md#5-admin-accounts-none-exist-yet)).
7. Deciding the same item in two admin tabs shows "already decided" in the second.
8. A photo still loads after the page has been open more than 5 minutes, because the list re-fetches.

Questions or backend bugs go to Gareth. Include the `requestId` from any error response.
