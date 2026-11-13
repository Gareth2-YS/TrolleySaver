# The web app is deployed: backend → frontend handoff

**Date:** 6 Nov 2026 · **From:** Gareth (backend) · **To:** frontend developers · **Status:** deployed to `dev` on 6 Nov; all 64 smoke checks pass, and HTTPS, security headers and deep links were checked

The React app now runs on AWS at **https://d8baodjze1mmt.cloudfront.net/**, served by CloudFront from a private S3 bucket, against the `dev` backend. Everything about how it gets there is in [docs/deployment.md](../deployment.md).

## 1. What changes for you

- **Publishing:** `python infra\deploy.py --profile <profile>` from the repository root. It runs the tests, deploys the stack, builds the app and uploads it. Use `--frontend-only` to publish just a frontend change, which is much quicker. Nobody needs to copy files into S3 by hand.
- **The deployed build:**
  - It always uses Cognito sign-in, API mode for price submissions and the Smart Basket, and the dev stack's API URL and Cognito ids.
  - The deploy script sets these at build time. **Your `frontend/.env.local` doesn't affect it**, and nothing in it needs to change for local work.
- **CORS:**
  - The API and the photo bucket accept both `http://localhost:5173` (local dev) and the site's address.
  - API responses now name the caller's origin rather than always `localhost`.
  - Local development works exactly as before.
- **Deep links work:** reloading `/search` or `/contribute` on the site serves the app, and the router shows the page.
- **Caching:** `index.html` is never cached, and the hashed files in `assets/` are cached for a year. A normal reload after a deploy shows the new version. Don't add un-hashed files under `public/` that change between deploys; if you need one, tell me, so it gets a short cache.
- **CI:** [.github/workflows/ci.yml](../../.github/workflows/ci.yml) now runs `npm ci`, `lint`, `typecheck`, `test` and `build` on every push and pull request, along with the backend tests and the template lint. **`npm run lint` has to pass**, so remove unused imports before pushing.

## 2. Other frontend changes made during the 6 Nov review

- **`package.json`:** every `"latest"` is now pinned to the version already in `package-lock.json` (`^x.y.z`). Nothing installed changed, but an `npm install` can no longer pull in new major versions unexpectedly.
- **Tests:** the timeouts are longer (Vitest 15 s per test; Testing Library's `findBy` 5 s), because 4 page tests timed out on a busy machine.
  - New tests in `smart-basket.test.tsx`: no prices at any store, the unit-price sort, a disabled Swap, the store picker's arrow keys, the per-item highlight, and enlarging a picture.
  - New tests in `search-products.test.tsx`: enlarging a picture from the card and the details, and the category icon in the enlarged view.
- **Cleanup:** 3 unused imports were removed from `smart-basket.tsx`, and the commented-out old code from `search-products.tsx`. No behaviour changed.
- **Manual test cases:** in [docs/qa/test-cases.md](../qa/test-cases.md), §4 Smart Basket was rewritten for the redesigned page. There's a new **§11 Deployed site**, and new cases for enlarging pictures and the review fixes.

## 3. Backend fixes you might notice

- **Observed dates:** the earliest date the price forms allow (30 days ago) is now accepted all day. Before, it was refused after 00:05.
- **Old requests can't be approved:** approving a product request whose price is over 30 days old now returns `409 OBSERVATION_TOO_OLD` with a message for the admin. The review page already shows server messages.
- **Missing uploads:** a photo that never reached S3 now gives `400 PHOTO_NOT_FOUND` ("upload the image again") instead of a 500.
- **Bad page tokens:** a `nextToken` that doesn't belong to the list gives `400 INVALID_PAGE_TOKEN` instead of a 500.

## 4. Please check

The site, in the cases of [test-cases.md §11](../qa/test-cases.md#11-deployed-site):
- it loads over HTTPS
- deep links and reloads work
- sign-in works
- a price photo uploads with no CORS error
- after a redeploy, a reload shows the new version
