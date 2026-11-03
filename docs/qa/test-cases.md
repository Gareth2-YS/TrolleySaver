# Test case tracker

Every test case in TrolleySaver, in one place, so we can see what has been run and what hasn't. ⭐ marks the **key** tests: the ones that must pass before a demo, a handoff or the final report.

**How to update it:** after running a set of tests, change **Status** to `Done` or `Not done` and update the "Last run" line under that section's heading. Automated tests are listed one row per test function; a row is `Done` when the whole suite passed on the date shown. When someone adds a test, add a row for it.

## Summary

| Section | Test cases | Key ⭐ | Done |
|---|--:|--:|--:|
| [1. Backend unit tests](#1-backend-unit-tests) | 142 | 39 | 142 |
| [2. Frontend unit tests](#2-frontend-unit-tests) | 36 | 9 | 33 |
| [3. End-to-end API smoke test (dev)](#3-end-to-end-api-smoke-test-dev) | 58 | 18 | 58 |
| [4. Smart Basket evaluation (dev)](#4-smart-basket-evaluation-dev) | 6 | 2 | 0 |
| [5. Manual UI checks](#5-manual-ui-checks) | 31 | 14 | 2 |

## 1. Backend unit tests

**Run:** `.venv\Scripts\python -m pytest` from `backend/` (no AWS needed). Some test functions run several cases each, so pytest reports 203 tests for these 142 functions.
**Last run:** 30 Oct 2026: 203 passed.

#### Sign-up and accounts (Cognito triggers)

`backend/tests/test_cognito_triggers.py`

| ID | Test case | Key | Status |
|---|---|:-:|---|
| BE-001 | Pre signup auto confirms public signups | ⭐ | Done |
| BE-002 | Pre signup leaves admin created users alone |  | Done |
| BE-003 | Post confirmation adds group and profile | ⭐ | Done |
| BE-004 | Post confirmation display name falls back to email |  | Done |

#### Evidence photo upload links

`backend/tests/test_upload_url.py`

| ID | Test case | Key | Status |
|---|---|:-:|---|
| BE-005 | Returns presigned post scoped to user and product | ⭐ | Done |
| BE-006 | Product and store are required |  | Done |
| BE-007 | Unknown product gets no upload link |  | Done |
| BE-008 | Unknown store gets no upload link |  | Done |
| BE-009 | Rejects other content types |  | Done |
| BE-010 | Reports every bad field together |  | Done |
| BE-011 | Rejects oversized | ⭐ | Done |
| BE-012 | Requires auth | ⭐ | Done |

#### Submitting a price

`backend/tests/test_create_submission.py`

| ID | Test case | Key | Status |
|---|---|:-:|---|
| BE-013 | In range price is accepted and stored | ⭐ | Done |
| BE-014 | Out of range price is flagged | ⭐ | Done |
| BE-015 | Body user ID is ignored | ⭐ | Done |
| BE-016 | Validation errors |  | Done |
| BE-017 | Unknown product and store rejected |  | Done |
| BE-018 | Unknown product rejected even with a valid photo |  | Done |
| BE-019 | Invalid JSON body |  | Done |
| BE-020 | Missing identity is 401 | ⭐ | Done |
| BE-021 | ID token claims rejected | ⭐ | Done |
| BE-022 | Duplicate same day is 409 |  | Done |
| BE-023 | Rate limit | ⭐ | Done |
| BE-024 | Photo is verified and recorded but not shown to contributor |  | Done |
| BE-025 | Photo from another users prefix rejected | ⭐ | Done |
| BE-026 | Photo uploaded for another product rejected |  | Done |
| BE-027 | Photo without a product folder rejected |  | Done |
| BE-028 | Missing photo rejected |  | Done |
| BE-029 | Wrong photo type rejected |  | Done |

#### My submissions, admin moderation and catalog

`backend/tests/test_admin_and_listing.py`

| ID | Test case | Key | Status |
|---|---|:-:|---|
| BE-030 | My submissions only returns callers newest first | ⭐ | Done |
| BE-031 | My submissions pagination |  | Done |
| BE-032 | Admin routes forbidden for non admins | ⭐ | Done |
| BE-033 | Groups claim formats |  | Done |
| BE-034 | Queue lists only flagged with submitter |  | Done |
| BE-035 | Evidence photo link only for admins | ⭐ | Done |
| BE-036 | Accept flagged then conflict | ⭐ | Done |
| BE-037 | Reject requires reason |  | Done |
| BE-038 | Cannot moderate accepted submission |  | Done |
| BE-039 | Unknown or garbage ID is 404 |  | Done |
| BE-040 | Invalid decision and status |  | Done |
| BE-041 | Catalog routes |  | Done |
| BE-042 | Catalog signs product pictures |  | Done |

#### Nightly daily-price job

`backend/tests/test_daily_prices.py`

| ID | Test case | Key | Status |
|---|---|:-:|---|
| BE-043 | Window is one singapore day in UTC | ⭐ | Done |
| BE-044 | Yesterday is in singapore time |  | Done |
| BE-045 | Window edges |  | Done |
| BE-046 | Only accepted prices count | ⭐ | Done |
| BE-047 | Admin accepted price counts on the day it was accepted |  | Done |
| BE-048 | Each product and retailer is averaged separately |  | Done |
| BE-049 | Average rounds to the nearest cent halves up |  | Done |
| BE-050 | Daily rows |  | Done |
| BE-051 | Default run averages yesterday |  | Done |
| BE-052 | Pairs without submissions keep their last average |  | Done |
| BE-053 | Rerunning a day gives the same prices |  | Done |
| BE-054 | Backfill processes days oldest first |  | Done |
| BE-055 | Submissions to basket | ⭐ | Done |

#### Smart Basket comparison rules

`backend/tests/test_basket_compare.py`

| ID | Test case | Key | Status |
|---|---|:-:|---|
| BE-056 | Hand worked basket | ⭐ | Done |
| BE-057 | Lines carry quantity unit price and subtotal |  | Done |
| BE-058 | Missing price is unpriced and ranks store below complete ones | ⭐ | Done |
| BE-059 | Incomplete stores rank by coverage then total |  | Done |
| BE-060 | No common items gives null saving |  | Done |
| BE-061 | No prices anywhere |  | Done |
| BE-062 | Equal totals break ties by store name |  | Done |
| BE-063 | Retailer subset |  | Done |
| BE-064 | Hand worked healthier basket | ⭐ | Done |
| BE-065 | Already HCS product is kept |  | Done |
| BE-066 | Nothing to swap gives no healthier basket |  | Done |
| BE-067 | Each store uses its cheapest HCS option |  | Done |
| BE-068 | HCS priced at one store leaves others unpriced |  | Done |
| BE-069 | Unpriced HCS everywhere counts as no option |  | Done |
| BE-070 | Healthier basket can be cheaper |  | Done |
| BE-071 | Extra cost needs complete recommendations |  | Done |
| BE-072 | Candidate ids are HCS products in non HCS categories |  | Done |

#### Smart Basket API

`backend/tests/test_basket_handler.py`

| ID | Test case | Key | Status |
|---|---|:-:|---|
| BE-073 | Public basket with healthier version | ⭐ | Done |
| BE-074 | Signed in callers get the same answer |  | Done |
| BE-075 | Uses the stored daily average | ⭐ | Done |
| BE-076 | Raw submissions wait for the nightly job |  | Done |
| BE-077 | Stored price older than 30 days is stale | ⭐ | Done |
| BE-078 | Price max age is configurable |  | Done |
| BE-079 | Prices updated is the latest job run |  | Done |
| BE-080 | Prices updated is null before the first run |  | Done |
| BE-081 | Repeated products are merged |  | Done |
| BE-082 | Retailer filter |  | Done |
| BE-083 | No healthier basket when nothing can be swapped |  | Done |
| BE-084 | Unpriced product is listed not dropped |  | Done |
| BE-085 | Validation errors |  | Done |
| BE-086 | Too many lines |  | Done |
| BE-087 | Invalid JSON |  | Done |

#### Product search and filters

`backend/tests/test_search.py`

| ID | Test case | Key | Status |
|---|---|:-:|---|
| BE-088 | No filters returns the whole catalog by name |  | Done |
| BE-089 | Items carry store prices and the lowest one | ⭐ | Done |
| BE-090 | Facets come from the whole catalog |  | Done |
| BE-091 | Text search | ⭐ | Done |
| BE-092 | Filters ignore case and combine | ⭐ | Done |
| BE-093 | Price filter uses the lowest price |  | Done |
| BE-094 | Stale and unaggregated prices are ignored |  | Done |
| BE-095 | Empty catalog |  | Done |
| BE-096 | Invalid parameters |  | Done |

#### New product requests (propose, approve, reject, delete)

`backend/tests/test_product_requests.py`

| ID | Test case | Key | Status |
|---|---|:-:|---|
| BE-097 | Product image upload link goes to pending folder |  | Done |
| BE-098 | Evidence upload link goes to new product folder |  | Done |
| BE-099 | Upload link validation |  | Done |
| BE-100 | Upload link needs login |  | Done |
| BE-101 | Request is stored pending and cleaned | ⭐ | Done |
| BE-102 | Every field is required |  | Done |
| BE-103 | Product image is required |  | Done |
| BE-104 | Product image from another users folder rejected | ⭐ | Done |
| BE-105 | Product image never uploaded rejected |  | Done |
| BE-106 | Product image must be an image |  | Done |
| BE-107 | Field rules |  | Done |
| BE-108 | Decimal pack size and empty dietary accepted |  | Done |
| BE-109 | Unknown store rejected |  | Done |
| BE-110 | Optional evidence photo is checked and kept |  | Done |
| BE-111 | Evidence photo must come from the new product folder |  | Done |
| BE-112 | Existing catalog product is refused with its ID | ⭐ | Done |
| BE-113 | Product already requested by someone else |  | Done |
| BE-114 | Daily limit |  | Done |
| BE-115 | Mine lists only own requests |  | Done |
| BE-116 | Admin routes forbidden for non admins | ⭐ | Done |
| BE-117 | Admin queue shows submitter evidence and suggested range |  | Done |
| BE-118 | Approve publishes product price and picture | ⭐ | Done |
| BE-119 | Approved price reaches the daily average today |  | Done |
| BE-120 | Approve with admin corrections |  | Done |
| BE-121 | Invalid corrections rejected |  | Done |
| BE-122 | Second decision is 409 |  | Done |
| BE-123 | Simultaneous approvals publish once | ⭐ | Done |
| BE-124 | Late second approval after picture moved is 409 |  | Done |
| BE-125 | Missing picture on pending request is 409 |  | Done |
| BE-126 | Reject requires reason and deletes picture | ⭐ | Done |
| BE-127 | Approve refused if product was added meanwhile |  | Done |
| BE-128 | Unknown request and bad decision |  | Done |
| BE-129 | Owner deletes pending request and its images | ⭐ | Done |
| BE-130 | Deleted product can be proposed again |  | Done |
| BE-131 | Cannot delete someone elses request | ⭐ | Done |
| BE-132 | Delete unknown request is 404 |  | Done |
| BE-133 | Delete needs login |  | Done |
| BE-134 | Decided request cannot be deleted | ⭐ | Done |
| BE-135 | Admin deciding a deleted request gets 404 |  | Done |
| BE-136 | Approval racing a delete publishes nothing |  | Done |
| BE-137 | Delete racing an approval is 409 |  | Done |

#### Catalog seed script

`backend/tests/test_seed_catalog.py`

| ID | Test case | Key | Status |
|---|---|:-:|---|
| BE-138 | Seeds empty tables |  | Done |
| BE-139 | Existing entries are reused and never replaced | ⭐ | Done |
| BE-140 | Contributor prices do not block seed prices |  | Done |
| BE-141 | Rerun adds nothing |  | Done |
| BE-142 | Dry run writes nothing |  | Done |

## 2. Frontend unit tests

**Run:** `npm test` from `frontend/`.
**Last run:** 30 Oct 2026: 33 passed, 3 failed. The failing tests are marked below; they fail on the current branch and need updating to match the price form.

#### Login and registration validation

`frontend/src/auth/schemas.test.ts`

| ID | Test case | Key | Status |
|---|---|:-:|---|
| FE-001 | Accepts a valid login |  | Done |
| FE-002 | Rejects malformed login details |  | Done |
| FE-003 | Requires a strong matching registration password |  | Done |

#### Mock sign-in service

`frontend/src/auth/mock-auth-service.test.ts`

| ID | Test case | Key | Status |
|---|---|:-:|---|
| FE-004 | Registers an immediately usable regular user |  | Done |
| FE-005 | Blocks duplicate email registration |  | Done |
| FE-006 | Provides role-correct dummy user and admin accounts |  | Done |
| FE-007 | Rejects login for an account that does not exist |  | Done |
| FE-008 | Clears the local session on sign out |  | Done |

#### Login and registration pages

`frontend/src/pages/auth-pages.test.tsx`

| ID | Test case | Key | Status |
|---|---|:-:|---|
| FE-009 | Never offers administrator registration | ⭐ | Done |
| FE-010 | Does not grant admin access based on the selected login mode | ⭐ | Done |
| FE-011 | Does not allow an administrator account through the user login tab | ⭐ | Done |

#### Price form validation

`frontend/src/contributions/schema.test.ts`

| ID | Test case | Key | Status |
|---|---|:-:|---|
| FE-012 | Accepts the backend price ceiling and rejects prices above it |  | Done |
| FE-013 | Accepts the 30-day boundary and rejects older observed dates |  | Not done (failing) |

#### Price submission service

`frontend/src/contributions/service.test.ts`

| ID | Test case | Key | Status |
|---|---|:-:|---|
| FE-014 | Stores local submissions and lists only the current user's records |  | Done |
| FE-015 | Enforces administrator role and a rejection reason in the local adapter |  | Done |
| FE-016 | Loads the canonical public catalogs |  | Done |
| FE-017 | Requests and performs a presigned multipart POST with the file last |  | Done |
| FE-018 | Maps create and list records, including Singapore observed dates |  | Done |
| FE-019 | Sends accepted moderation and exposes backend errors with request IDs |  | Done |
| FE-020 | Refreshes once after a 401 and clears a still-invalid session | ⭐ | Done |

#### Contribute page (prices, photos, admin review)

`frontend/src/pages/contribute.test.tsx`

| ID | Test case | Key | Status |
|---|---|:-:|---|
| FE-021 | Redirects unauthenticated visitors through the existing login route | ⭐ | Done |
| FE-022 | Renders contributor controls without administrator actions |  | Done |
| FE-023 | Renders only the focused administrator review experience |  | Done |
| FE-024 | Shows clear required-field validation |  | Done |
| FE-025 | Validates and previews a selected shelf image |  | Done |
| FE-026 | Submits and immediately renders the backend status | ⭐ | Not done (failing) |
| FE-027 | Shows service failures instead of reporting fake success | ⭐ | Not done (failing) |
| FE-028 | Allows administrators to approve and requires a reason to reject |  | Done |
| FE-029 | Allows administrators to accept flagged submissions |  | Done |

#### Smart Basket comparison (client side)

`frontend/src/basket/compare.test.ts`

| ID | Test case | Key | Status |
|---|---|:-:|---|
| FE-030 | Recommends the cheapest complete store and measures savings against each other store | ⭐ | Done |
| FE-031 | Ranks complete stores first and compares incomplete ones on common items only |  | Done |
| FE-032 | Makes no recommendation when nothing is priced anywhere |  | Done |

#### Smart Basket page

`frontend/src/pages/smart-basket.test.tsx`

| ID | Test case | Key | Status |
|---|---|:-:|---|
| FE-033 | Shows the empty basket without calling the comparison |  | Done |
| FE-034 | Compares the basket and shows the saving against each other supermarket | ⭐ | Done |
| FE-035 | Flags missing prices and labels partial savings |  | Done |
| FE-036 | Shows an error when the comparison fails |  | Done |

## 3. End-to-end API smoke test (dev)

**Run:** `.venv\Scripts\python scripts\smoke_test.py` from `backend/`, with AWS credentials for the team account. It signs up throwaway users, calls the deployed API over HTTPS and deletes everything it created. See [TESTING.md §1.3](../../backend/TESTING.md#13-end-to-end-test-against-dev).
**Last run:** 30 Oct 2026, after deploying the product-request delete endpoint: all 58 checks passed.

| ID | Check | Key | Status |
|---|---|:-:|---|
| E2E-01 | public sign-up is auto-confirmed | ⭐ | Done |
| E2E-02 | new user is in the 'user' group only | ⭐ | Done |
| E2E-03 | profile row created |  | Done |
| E2E-04 | sign-in returns tokens |  | Done |
| E2E-05 | GET /products is public |  | Done |
| E2E-06 | GET /retailers is public |  | Done |
| E2E-07 | POST /basket/compare is public and ranks every store | ⭐ | Done |
| E2E-08 | basket has a recommendation |  | Done |
| E2E-09 | healthier basket swaps to an HCS product |  | Done |
| E2E-10 | invalid basket → 400 with fieldErrors |  | Done |
| E2E-11 | basket CORS preflight allowed |  | Done |
| E2E-12 | no token → 401 | ⭐ | Done |
| E2E-13 | ID token → 401 | ⭐ | Done |
| E2E-14 | garbage token → 401 |  | Done |
| E2E-15 | upload URL without product/store → 400 |  | Done |
| E2E-16 | upload URL for a fake product → 400 |  | Done |
| E2E-17 | upload URL issued |  | Done |
| E2E-18 | photo key is scoped to caller and product |  | Done |
| E2E-19 | browser-style POST to S3 succeeds |  | Done |
| E2E-20 | S3 rejects uploads over 5 MiB | ⭐ | Done |
| E2E-21 | in-range price → 201 accepted | ⭐ | Done |
| E2E-22 | out-of-range price with photo → 201 flagged | ⭐ | Done |
| E2E-23 | contributor gets no evidence photo link |  | Done |
| E2E-24 | photo uploaded for another product → 400 |  | Done |
| E2E-25 | price for a fake product → 400 |  | Done |
| E2E-26 | duplicate → 409 |  | Done |
| E2E-27 | invalid body → 400 with fieldErrors |  | Done |
| E2E-28 | GET /mine returns both submissions |  | Done |
| E2E-29 | GET /mine has no evidence photo links |  | Done |
| E2E-30 | photo is not publicly readable | ⭐ | Done |
| E2E-31 | user token on admin list → 403 | ⭐ | Done |
| E2E-32 | user token on moderate → 403 |  | Done |
| E2E-33 | admin sees flagged submission |  | Done |
| E2E-34 | accepted submission not in flagged queue |  | Done |
| E2E-35 | admin's photoUrl serves the evidence image |  | Done |
| E2E-36 | admin accepts flagged → 200 | ⭐ | Done |
| E2E-37 | second decision → 409 |  | Done |
| E2E-38 | CORS preflight allowed |  | Done |
| E2E-39 | product-image upload URL issued |  | Done |
| E2E-40 | product image goes to the caller's pending folder |  | Done |
| E2E-41 | product image uploaded to S3 |  | Done |
| E2E-42 | product request without a picture → 400 |  | Done |
| E2E-43 | product request → 201 pending | ⭐ | Done |
| E2E-44 | pending product is hidden from the catalog | ⭐ | Done |
| E2E-45 | GET /product-requests/mine shows it with its picture |  | Done |
| E2E-46 | second product request → 201 pending |  | Done |
| E2E-47 | someone else deleting it → 404 | ⭐ | Done |
| E2E-48 | owner deletes a pending request → 204 | ⭐ | Done |
| E2E-49 | deleted request is gone from /mine |  | Done |
| E2E-50 | deleting it again → 404 |  | Done |
| E2E-51 | DELETE CORS preflight allowed |  | Done |
| E2E-52 | user token on product queue → 403 |  | Done |
| E2E-53 | admin sees the product request with submitter and suggested range |  | Done |
| E2E-54 | admin approves → 200 with a productId | ⭐ | Done |
| E2E-55 | approved product is in the catalog with the admin's correction | ⭐ | Done |
| E2E-56 | product imageUrl serves the picture |  | Done |
| E2E-57 | second product decision → 409 |  | Done |
| E2E-58 | deleting an approved request → 409 | ⭐ | Done |

## 4. Smart Basket evaluation (dev)

**Run:** `.venv\Scripts\python scripts\basket_eval.py --env dev --http` from `backend/`. It works out each basket's totals and savings from the product spreadsheet and checks the deployed API's answers against them. Each basket below covers several checks (total per store, recommended store, savings). See [TESTING.md §8](../../backend/TESTING.md#8-smart-basket).
**Last run:** not yet recorded here. A run on 30 Oct 2026 stopped before checking anything because the AWS login session had expired.

| ID | Basket | Key | Status |
|---|---|:-:|---|
| EV-01 | `weekly-staples`: The hand-worked example in TESTING.md: two swaps and one product with no Healthier Choice option. | ⭐ | Not done |
| EV-02 | `breakfast`: Milk, cereal and yoghurt all swap; eggs have no Healthier Choice option. |  | Not done |
| EV-03 | `drinks-and-snacks`: Multi-packs (6 cans, 9 packets, 12 and 20 sachets), all with a healthier option. |  | Not done |
| EV-04 | `already-healthy`: Every product is already Healthier Choice or has no option, so there is no healthier basket. | ⭐ | Not done |
| EV-05 | `household`: Detergent, toilet rolls and eggs: categories with no Healthier Choice products at all. |  | Not done |
| EV-06 | `two-stores`: The weekly staples, but the shopper only shops at FairPrice and Cold Storage. |  | Not done |

## 5. Manual UI checks

**Run:** by hand in the browser against dev, with `VITE_AUTH_MODE=cognito`. These come from the test checklists in the [handoffs](../handoffs/README.md). Some need an admin account ([auth handoff §5](../handoffs/2026-10-24-auth-backend-to-frontend.md#5-admin-accounts-none-exist-yet)).

#### Sign-in (UI)

| ID | Check | Key | Status | Notes |
|---|---|:-:|---|---|
| UI-01 | Register a public user through /register: usable straight away, no admin rights | ⭐ | Not done | Verified on the backend 24 Oct; re-check in the UI |
| UI-02 | User sign-in goes to /contribute | ⭐ | Not done |  |
| UI-03 | Admin mode with a regular account is denied | ⭐ | Not done |  |
| UI-04 | An admin account opens the admin view (token has cognito:groups ["admin"]) | ⭐ | Not done | Verified on the backend 24 Oct with a temporary admin |
| UI-05 | Sign-out, refresh/session restore, wrong password, duplicate registration and rate-limit errors |  | Not done |  |
| UI-06 | No verification code, MFA, password-reset or new-password screens |  | Done | Verified 24 Oct |
| UI-07 | API enforces user/admin/missing/malformed/ID tokens server-side | ⭐ | Done | Covered by the smoke test |
| UI-08 | Production build with VITE_AUTH_MODE=cognito (refuses mock mode) |  | Not done |  |

#### Price upload (UI)

| ID | Check | Key | Status | Notes |
|---|---|:-:|---|---|
| UI-09 | Product and store dropdowns come from the API |  | Not done |  |
| UI-10 | Normal price with a photo (Magnolia Fresh Milk, FairPrice, $3.63) shows accepted | ⭐ | Not done |  |
| UI-11 | Unusual price ($20 for the same milk) shows flagged | ⭐ | Not done |  |
| UI-12 | Submitting the same price again shows the duplicate message |  | Not done |  |
| UI-13 | A GIF, or an image over 5 MB, is blocked by the client |  | Not done |  |
| UI-14 | Admin accepts a flagged price, or rejects it with a reason; contributor sees the new status | ⭐ | Not done |  |
| UI-15 | Deciding the same item in two admin tabs shows "already decided" in the second |  | Not done |  |
| UI-16 | A photo still loads after the page has been open more than 5 minutes |  | Not done |  |
| UI-17 | My submissions shows the photo as attached but not viewable |  | Not done |  |
| UI-18 | Admin's flagged queue shows the evidence photo |  | Not done |  |
| UI-19 | Changing the product after uploading a photo asks for a fresh upload |  | Not done |  |
| UI-20 | Submitting a price without a photo still works |  | Not done |  |

#### New products (UI)

| ID | Check | Key | Status | Notes |
|---|---|:-:|---|---|
| UI-21 | Proposing a product without a picture is blocked (client and server) | ⭐ | Not done | Frontend not built yet |
| UI-22 | Proposing Magnolia Fresh Milk (946 ml) says it's already in the catalog, with a way to price it |  | Not done | Frontend not built yet |
| UI-23 | A valid proposal shows as pending in the contributor's list, and not in search | ⭐ | Not done | Frontend not built yet |
| UI-24 | Admin queue shows it with picture and suggested range; approve with a corrected category | ⭐ | Not done | Frontend not built yet |
| UI-25 | Approved product appears in search with its picture; contributor sees it approved | ⭐ | Not done | Frontend not built yet |
| UI-26 | Reject another proposal with a reason; contributor sees the reason |  | Not done | Frontend not built yet |
| UI-27 | Deciding the same request in two admin tabs shows "already decided" |  | Not done | Frontend not built yet |
| UI-28 | A pending request shows a Delete action |  | Not done | Frontend not built yet |
| UI-29 | Deleting it removes it from the list, and the same product can be proposed again | ⭐ | Not done | Frontend not built yet |
| UI-30 | Approved and rejected requests don't offer Delete | ⭐ | Not done | Frontend not built yet |
| UI-31 | Deleting from a stale tab after an admin approved shows "already approved" |  | Not done | Frontend not built yet |
