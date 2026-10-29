# Price & image upload: backend → frontend handoff (29 Oct changes)

**Date:** 29 Oct 2026 · **From:** Gareth (backend) · **To:** frontend developer · **Status:** deployed to `dev`. **One frontend change is needed** before photo submissions work again.

This follows the [24 Oct price-upload handoff](2026-10-24-price-upload-backend-to-frontend.md) and changes two things agreed after group testing. Contract details are in the [API reference](../api/README.md#post-price-submissionsimage-upload-url).

## 1. The upload link now needs the product and store (action needed)

A shelf-tag photo is evidence for a price of **one existing product at one existing store**. So asking for an upload link (`POST /price-submissions/image-upload-url`) now requires `productId` and `retailerId`:
- **No link without a real product:** the backend refuses to give an upload link for a product or store that doesn't exist.
- **The photo is tied to that product:** its key includes the product id, and saving a price with a photo uploaded for a different product is refused.

**What breaks until this is done:** submitting **with a photo** on `/contribute` fails at the upload-link step with `400 VALIDATION_ERROR` (`fieldErrors` names `productId` and `retailerId`). Submitting a price **without** a photo still works.

**The change** is in the API adapter. The form already has the product and store when it asks for the upload link (`frontend/src/pages/contribute.tsx:267`):

| File | Change |
|---|---|
| `frontend/src/contributions/types.ts:79` | `requestImageUpload(file, accessToken)` → also take the product and store, e.g. `requestImageUpload(file, productId, storeId, accessToken)` |
| `frontend/src/contributions/service.ts:184` | Send them in the body: `{ productId, retailerId: storeId, contentType: file.type, sizeBytes: file.size }` |
| `frontend/src/contributions/service.ts:98` | The local adapter takes the same new arguments (it can ignore them) |
| `frontend/src/pages/contribute.tsx:267` | Pass `values.productId` and `values.storeId` |

The response is unchanged apart from the key's shape (`price-evidence/<userId>/<productId>/<uuid>.<ext>`), and the photo upload and `POST /price-submissions` calls stay exactly as they are.

New errors the form may see at the upload-link step:
- `"productId": "Unknown product"` or `"retailerId": "Unknown store"`: only possible if the dropdowns are out of date. Reload the catalog.
- At save time, `"photoKey": "Use the photoKey returned by your upload URL request"` means the photo was uploaded for a different product, e.g. the user changed the product after uploading. Request a new upload link for the selected product.

## 2. Evidence photos are for admins only (no action needed)

Contributors no longer get a `photoUrl` for their own evidence photos:
- **Contributor responses:** neither `POST /price-submissions` nor `GET /price-submissions/mine` includes one. The record still has `photoKey`, `photoContentType` and `photoSizeBytes`, so the page can show that a photo is attached.
- **Admin responses:** `GET /admin/price-submissions` and `PATCH /admin/price-submissions/{id}` still include a 5-minute `photoUrl`.

The current page already copes. `mapSubmission` sets `previewUrl` from `photoUrl`, and `PhotoView` shows its **"Private image"** placeholder when there's no `previewUrl`. Nothing breaks. You may want to change the wording, e.g. "Photo attached – visible to admins".

## 3. Test checklist

Against `dev`, after the change in section 1:

1. Submit a price with a photo. It's saved, and "my submissions" shows the photo as attached but not viewable.
2. As an admin, the flagged queue shows the photo for out-of-range prices.
3. Upload a photo, then change the product before submitting. The submission is refused with the `photoKey` error; the form should request a fresh upload link.
4. Submit a price without a photo. Nothing has changed.

Backend tests for all of this: `backend/tests/test_upload_url.py`, `test_create_submission.py` and `test_admin_and_listing.py`, plus the smoke test (`backend/TESTING.md` §1.3). By hand: `backend/TESTING.md` §3.6.
