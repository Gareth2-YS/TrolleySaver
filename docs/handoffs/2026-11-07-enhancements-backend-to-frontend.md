# Basket, Search, theme and price-submission enhancements: backend → frontend handoff

**Date:** 7 Nov 2026 · **From:** Gareth (backend) · **To:** frontend developers · **Status:** deployed to `dev`; **please check the site** (§5)

> **Update, 8 Nov:** §3 is done. YHKok merged the two lists into one "Your submissions" list, with All / Prices / New products filters and a "Pending only" switch. Some details in §1 changed with it: the basket's button is "Reset filters" (the empty list offers "Clear search and filters"), the Healthier Choice pill sits under a product's details, and Search's and the basket's dropdowns count their options. [docs/qa/test-cases.md](../qa/test-cases.md) describes the screens as they are now.

A batch of enhancements, frontend and backend. The frontend parts are built. One part is left for the developer reworking the two submission panels (§3).

## 1. What's new on the site

| Page | Change |
|---|---|
| Smart Basket | Each basket line has a bin, "Remove {product} from basket", that removes the whole line at any quantity. The − button now stops at 1. |
| Smart Basket | "Clear filters" beside the Product type and Brand pickers resets them and the search. The "No products match" message has the same button. |
| Smart Basket | In Add groceries, the "Healthier Choice" pill sits above the product name. |
| Search & filter | The quick filter chips (All, Cereal, Milk, Soft Drinks, Cookies, Toilet Rolls) are gone. Healthier Choice is a switch beside "Filters": "Healthier Choice only", `role="switch"`. It isn't counted in "Filters (N)". |
| Search & filter | The "Healthier Choice" pill moved to the top of the card, so long names keep their width. |
| Every page | A sun/moon button in the header switches light and dark mode (§4). |
| Price & image upload | Contributors see **their own** evidence photo as a thumbnail on each price card. Click it to enlarge. |
| Price & image upload | Contributors also see the evidence photo they attached to a product request, beside its picture on "Your product submissions". |
| Price & image upload | A pending (flagged) price has "Delete pending price submission". |
| Price & image upload | One price per product, store and day (§2). |
| Price boxes | The price form, "Upload a new product" and Search's From/To all stop at two decimal places (`limitToCents` in `frontend/src/lib/format.ts`). |

**How the old quick filters were chosen:** Xinpeng hand-picked them on 26 Oct (`QUICK_CATEGORY_LABELS`). Nothing documents why those five. They were removed on 7 Nov rather than kept up to date by hand.

## 2. API changes

All in the [API reference](../api/README.md).

- **New: [`DELETE /price-submissions/{id}`](../api/README.md#delete-price-submissionsid).**
  - Who and what: the owner, while the price is `flagged` (the system flagged it as outside the usual range and no admin has reviewed it).
  - Responses:
    - `204`: deleted, with its photo
    - `404 NOT_FOUND`: already deleted, or someone else's
    - `409 ALREADY_MODERATED`: an admin decided it first
  - `ApiSubmissionService.deleteSubmission` calls it.
- **One price per person, product and store a day,** whatever the price (it used to be per price).
  - `409 DUPLICATE_SUBMISSION`, "You've already submitted a price for this product at this store today."
  - A rejected or deleted price doesn't count, so the contributor can send a corrected one.
- **Contributors get links to their own evidence photos:**
  - `photoUrl` (5 minutes) on `POST /price-submissions` and `GET /price-submissions/mine`.
  - The same on `POST /product-requests` and `GET /product-requests/mine` when the request has an evidence photo.
  - Nobody else's photos are visible, except to admins.

## 3. For the developer reworking the submission panels

Making "Your price submissions" and "Your product submissions" match is yours, including keeping the "Pending review" pill from dropping to a second line under long names. Pieces you can reuse:

- **`EnlargeableImage`** ([frontend/src/components/enlargeable-image.tsx](../../frontend/src/components/enlargeable-image.tsx)): a thumbnail that opens an "Enlarged image of …" dialog, like Search. The price card uses it (`PhotoView` in `contribute.tsx`).
- **`deletePending`** in `ContributorWorkspace` (`contribute.tsx`): the price delete flow. It mirrors `deletePending` in `ProductRequestHistory`.
- **Product-request evidence:** the contributor's own evidence photo now shows on their request cards, beside the product picture, as it does for admins (`RequestImages` in `product-requests.tsx`). `ApiSubmissionService` no longer removes the owner's `photoUrl`.

## 4. Light and dark mode

- **Where it lives:** [frontend/src/lib/theme.ts](../../frontend/src/lib/theme.ts).
  - `startTheme()` runs in `main.tsx` before the first render.
  - `toggleTheme()` switches and remembers the choice (`localStorage`, `trolleysaver.theme`).
  - `useTheme()` gives the current theme. The toaster uses it.
- **The default:** with no choice saved, the site follows the device's setting, and keeps following it if it changes.
- **The colours** are the existing dark palette in `styles.css`, now in two blocks that must stay identical:
  - `:root.dark`, the toggle
  - `@media (prefers-color-scheme: dark) { :root:not(.light) }`, so system-dark users never see a light flash
- **`dark:` classes** follow the `dark` class (`darkMode: "class"`).

## 5. Please check

On the deployed site, run these cases in [docs/qa/test-cases.md](../qa/test-cases.md):
- **Smart Basket:** BSK-04, BSK-21, BSK-22, BSK-23
- **Search:** SRCH-03, SRCH-07, SRCH-18, SRCH-19
- **Price submissions:** PRC-08, PRC-12, PRC-15, PRC-23, PRC-24, PRC-25
- **Product requests:** NPR-23
- **Theme:** LOOK-10, LOOK-11

**Automated coverage:**
- **Backend (292 unit tests):**
  - `tests/test_delete_submission.py`
  - the duplicate and own-photo tests in `test_create_submission.py`, `test_admin_and_listing.py` and `test_product_requests.py`
- **Frontend:**
  - `lib/theme.test.ts` and `lib/format.test.ts`
  - the new basket, Search, contribute and header tests
- **Smoke test (70 checks):**
  - deleting a pending price (204) and an accepted one (409)
  - a second price for the same product and store (409)
  - the owner's photo link working
