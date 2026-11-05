# Frontend integration → backend

**Updated 3 Nov 2026 · `improvement/price-image-upload` · implemented locally, uncommitted.**

The frontend adopts your [price-upload](2026-10-29-price-upload-backend-to-frontend.md), [new-product](2026-10-29-new-product-backend-to-frontend.md), and [pending-request deletion](2026-10-30-new-product-delete-backend-to-frontend.md) contracts. Backend code, infrastructure and schema are unchanged. The latest stash was restored after merging main; all four stash backups are retained.

## What changed

- **Price submissions:** upload-link calls include `productId`, `retailerId`, content type and byte size; multipart uploads send the file last. Creation sends integer cents, Singapore observed dates and the returned `photoKey`. Contributor history shows **Photo attached · visible to administrators** instead of evidence images. Admin evidence viewing and pre-submit previews remain available.
- **New products:** a separate contributor form and admin queue use `/product-requests`. Requests send flat product fields, structured pack size, HCS/dietary claims, retailer, first price and observation date. Required packaging pictures and optional price evidence use separate upload purposes/keys. Validation follows the API's field, date, cents and JPEG/PNG limits.
- **Review:** admins can filter pending/approved/rejected requests, inspect permitted images, correct product fields and price bounds, add search terms, or reject with a reason. The review checklist is a frontend aid, not a stored certification. Contributor history shows status and rejection reasons. `PRODUCT_EXISTS` recovery selects the canonical product in the ordinary price form.
- **Product deletion (30 Oct):** pending requests offer Delete in API and demo modes. Confirmation warns that deletion permanently removes the request, picture and evidence. API calls use an access token, URL-encoded ID and no body; `204` removes the card without parsing JSON. Missing requests show “This request no longer exists.” and refresh; `409 ALREADY_MODERATED` retains the server message and refreshes the status. Approved/rejected requests have no Delete action. Price submissions have no deletion control.
- **Layout and images:** product and price histories sit side by side on desktop and stack on mobile. Search/Basket show product pictures with category fallback; expired pictures trigger one list/catalog refresh. Unpriced products remain unpriced until aggregation. Evidence stays private to admins.
- **Auth:** restored login/registration styling and spacing are preserved. Unknown auth modes fail explicitly; production rejects mock authentication. Existing roles, access-token refresh, search/filter/Clear and basket behavior remain intact.

## Acceptance needed on dev

Use authorized dev accounts with `VITE_AUTH_MODE=cognito` and the intended API URL. The backend team reports the backend deployed and tested; the frontend checks below do not independently prove live AWS behavior.

1. Propose a product with a packaging picture and optional evidence. Check pending history and admin visibility.
2. Cancel Delete: nothing changes. Confirm Delete: request disappears; proposing the same product again works. Verify associated S3 cleanup separately.
3. Approve/reject a request: contributor history has no Delete action. From a stale tab, attempt deletion after moderation: the server message remains visible and the list updates. Also exercise a stale missing request.
4. Verify actual Cognito/admin claims and token refresh, frontend-origin CORS (including DELETE), multipart upload policies, missing/expired images and conflicting decisions.
5. Verify canonical product visibility in Search/Basket before and after nightly aggregation, FairPrice-only coverage, later stores using the same ID, and already-open pages after refresh.

## Remaining decisions and follow-ups

These IDs preserve the earlier discussion without repeating the full implementation history. Backend/ops questions belong to the backend team; product-policy decisions belong to the team. Test-source evidence is not deployed acceptance.

| ID | Current behavior | Remaining decision/check |
|---|---|---|
| D1 — bounds | Suggested range is half to 1.5× the first price, clamped to 1–100000 cents; admins can correct global bounds. | Accept one-observation defaults, assign review ownership, define later correction/audit and remediate missing legacy bounds. |
| D2 — metadata | Required structured fields are validated and correctable. | Agree to leave pending or reject when metadata cannot be established. |
| D3 — taxonomy/claims | Categories/tags are normalized free text; HCS is boolean. | Agree canonical categories, claim evidence/accountability and whether unknown HCS needs its own state. No server certification is implied. |
| D4 — timing | Approval publishes the product and accepted first price; aggregation runs at 00:05 SGT for the prior day. | Accept the delay; define monitoring, recovery and an operational maximum delay. |
| D5 — coverage | Missing store prices stay unknown; no prices or savings are fabricated. | Verify pre/post-aggregation and later-store states on dev. |
| D6 — variants | Duplicate checks return canonical IDs, but identity omits `packCount`. | Resolve 1×1L versus 6×1L identity, simultaneous cross-request approvals and duplicate evidence retention/linking. |
| D7 — freshness/replay | Approval uses review timing without revalidating observation age; aggregate freshness uses price date. | Define maximum approval age and verify older replay/backfills cannot overwrite newer prices; exercise midnight/retry cases. |
| D8 — recovery | Moderation transacts request/catalog/price/count; object copying and cleanup are separate. Pending deletion is now conditionally enforced against moderation. | Define crash/orphan recovery and verify object cleanup. Same-request race protection does not establish cross-request uniqueness or storage atomicity. |
| D9 — swaps | Existing missing-price/coverage wording remains. Swaps use HCS, exact category and store price. | Accept incomplete-subtotal wording; decide dietary constraints and pack-normalized comparisons. |
| D10 — rollout | Entry/manual reloads refresh catalogs/history; no real-time cross-page subscription. | Verify environment versions, read-after-write behavior, deployed CORS and aggregation results. |

### Security and retention

- **Email verification remains open:** `cognito_pre_signup.py` auto-confirms public registrations and auto-verifies supplied email without proving address control. Agree the verification policy before public rollout; a code-confirmation flow would need frontend work. Existing-account takeover was not established.
- **Auth mode guard is implemented:** tests cover invalid modes and production mock rejection. Verify deployed build settings; local mock credential storage is development-only.
- **Abandoned uploads remain open:** upload-link calls can create keys without a completed request, and no bucket lifecycle cleanup is configured. Agree prefix-aware retention, throttling and monitoring while preserving referenced evidence/published pictures.
- **Pending product withdrawal is integrated:** the former missing-route gap is closed in source. Approved/rejected product retention, price-submission withdrawal and broader erasure policy remain separate decisions. The frontend does not verify physical object deletion.

## Verification

**87 tests across 11 files passed; production build/typecheck, lint and diff checks passed.** New coverage includes empty 204 responses, encoded/no-body DELETE, refreshed access tokens, confirmation/cancellation, pending-only controls, duplicate-click prevention, 404/409 list refresh, refresh failure and stale history responses after deletion. The restored price-history test now waits for asynchronous loading. The build retains its existing bundle-size advisory.

Browser checks passed at **1440px and 390px**: cancellation sends no DELETE; only pending requests offer it; the request carries a bearer token and no body; 204 removes the product request while retaining the price submission; 404/409 messages survive refresh. No horizontal overflow or runtime errors were observed. Native confirmation text is recorded in the results rather than pictured.

Browser checks use local Vite, mock authentication and intercepted API fixtures. **Live Cognito/API acceptance, actual image cleanup, re-proposal after deletion and the backend test suite were not run in this frontend task.** No live accounts or data were created. Nothing was committed, pushed or deployed; all restored work remains unstaged. Graphify outputs/runtime stay checkout-only; final graph health is reported with delivery.
