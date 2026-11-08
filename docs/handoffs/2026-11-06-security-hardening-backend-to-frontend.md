# Security hardening: backend → frontend handoff

**Date:** 6 Nov 2026 · **From:** Gareth (backend) · **To:** frontend developers · **Status:** deployed to `dev`; **please check the site** (§4)

The site, the API and the input fields were hardened on 6 Nov. Most of it needs nothing from you, but four things change how new frontend code must be written (§1). The full list is in [docs/deployment.md → Security headers](../deployment.md#security-headers) and [Limits on abuse](../deployment.md#limits-on-abuse).

## 1. What changes for you

1. **The deployed site has a Content-Security-Policy.**
   - It only loads code, styles, images and fonts from places it lists, and only talks to the API, Cognito and the photo bucket.
   - **Inline `<script>` and `eval` are blocked.** Inline styles are allowed.
   - Before using anything new from another site (a font CDN, analytics, a map, another API), add its host to `FrontendSecurityHeaders` in [backend/template.yaml](../../backend/template.yaml), or tell me. Otherwise browsers block it.
   - `npm run dev` sends no CSP, so check new features on the deployed site with the console open. A blocked request shows as `Refused to load …` or `Refused to connect …`, naming the directive.
2. **Every photo is redrawn in the browser before upload.**
   - `prepareImage` in [frontend/src/contributions/image.ts](../../frontend/src/contributions/image.ts) decodes the file and redraws it on a canvas, so its metadata, including the GPS location phones record, is never uploaded. Product pictures are public.
   - It also refuses files that aren't really images ("This file isn't a readable JPG or PNG image"), and scales photos down to 2560 px on the long side.
   - The price form and "Upload a new product" already use it. **Any new upload must go through it too.**
3. **Text can't contain hidden characters.**
   - The API refuses names, brands, categories, tags, search terms and reasons that contain control or invisible formatting characters, such as a zero-width space or a right-to-left override. These can disguise text and slip past the duplicate check. `fieldErrors` says "Must not contain hidden or control characters".
   - The forms check first with `hasHiddenCharacters` in [frontend/src/lib/text.ts](../../frontend/src/lib/text.ts). Use it for any new text field that other people will see.
4. **New errors to handle:**

   | Response | When | Show |
   |---|---|---|
   | `429 UPLOAD_RATE_LIMITED` | More than 60 photo upload links in an hour, for one person | `message` |
   | `429` with `{"message": "Too Many Requests"}` | The API's overall throttle (20 requests a second, bursts of 40) | "Too many requests. Please wait a moment and try again." |
   | `400 INVALID_PHOTO` | An uploaded file isn't the JPG or PNG it claims to be | `message` |

   The existing pages already show the server's `message` for these. The throttle's 429 comes from API Gateway, so it has no `code`.

## 2. Field changes already made

- **Prices** must be whole cents: `3.635` gives "Enter the price in dollars and cents, e.g. 3.63" instead of being rounded.
- **Length limits** (`maxLength`), matching the backend:
  - search boxes on Search, the Smart Basket and the price form: 100
  - full name: 80
  - email: 254
  - password: 256
  - admin search terms: 320
- **Sign-up:** the Cognito sign-up trigger now applies the registration form's name rules (2–80 characters, no hidden characters), so they hold even for someone calling Cognito directly. Its message is shown as it is (`auth/errors.ts` strips Cognito's "PreSignUp failed with error" prefix).
- **Rejection reasons** are checked for hidden characters before they're sent. Line breaks are fine.

## 3. Backend changes you might notice

- API responses now carry `X-Content-Type-Options: nosniff` and `Cache-Control: no-store`.
- `GET /products/search` refuses `category`, `brand` or `dietary` over 100 characters, like `q`.
- Tables the template creates now have point-in-time recovery. **Correction, 8 Nov:** dev's hand-made tables don't have it yet; turning it on is in [deployment.md §8](../deployment.md#8-known-limitations).

## 4. Please check

On the deployed site, with the browser console open, run these cases in [docs/qa/test-cases.md](../qa/test-cases.md):
- **DEP-10:** every page works, with no Content-Security-Policy errors.
- **DEP-09:** the new response headers are present.
- **PRC-22** and **NPR-22:** a phone photo with GPS uploads without its location.
- **PRC-20**, **PRC-21**, **NPR-20**, **NPR-21**, **AUTH-16**, **AUTH-17**, **SRCH-17**, **ADP-08:** the field rules.

**Automated coverage:**
- Backend (282 unit tests): `tests/test_upload_url.py`, `test_create_submission.py`, `test_product_requests.py`, `test_cognito_triggers.py`, `test_validation.py`, `test_cors.py`, `test_search.py`.
- Frontend: `lib/text.test.ts`, `contributions/image.test.ts`, and the schema and page tests.
- The smoke test checks the response headers and that a fake PNG is refused and deleted.
