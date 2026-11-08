# Handoffs

Notes passed between team members when one person's work becomes someone else's starting point.

**Naming:** `<YYYY-MM-DD>-<feature>-<from>-to-<to>.md`, e.g. `2026-10-24-price-upload-backend-to-frontend.md`. One feature per file by default; related work handed over together may use one consolidated document. The date is when the handoff was written, so the folder reads oldest first and each request sits just before its reply. A later handoff on the same feature gets a new file with a new date, rather than an edit to the old one.

Each handoff is kept as it was written; later changes get a newer handoff. The statuses below were last checked on 8 Nov 2026, at the feature freeze.

| Date | Feature | From → to | Document | Status |
|---|---|---|---|---|
| 21 Oct 2026 | Auth (login, roles) | frontend → backend | [2026-10-21-auth-frontend-to-backend.md](2026-10-21-auth-frontend-to-backend.md) | Implemented |
| 23 Oct 2026 | Feature pages (Smart Basket, Search, Price Upload) | frontend shell → feature developers | [2026-10-23-frontend-feature-pages.md](2026-10-23-frontend-feature-pages.md) | Done: all three pages built and deployed |
| 23 Oct 2026 | Price & image upload | frontend → backend | [2026-10-23-price-upload-frontend-to-backend.md](2026-10-23-price-upload-frontend-to-backend.md) | Implemented, with changes |
| 24 Oct 2026 | Auth (login, roles) | backend → frontend | [2026-10-24-auth-backend-to-frontend.md](2026-10-24-auth-backend-to-frontend.md) | Done: Cognito sign-in is in use on the deployed site |
| 24 Oct 2026 | Price & image upload | backend → frontend | [2026-10-24-price-upload-backend-to-frontend.md](2026-10-24-price-upload-backend-to-frontend.md) | Done: in use on the deployed site |
| 24 Oct 2026 | Smart Basket | backend → frontend | [2026-10-24-smart-basket-backend-to-frontend.md](2026-10-24-smart-basket-backend-to-frontend.md) | Done: page built and deployed |
| 25 Oct 2026 | Auth, API and price upload integration | frontend → team | [2026-10-25-frontend-integration-findings.md](2026-10-25-frontend-integration-findings.md) | **Complete** |
| 27 Oct 2026 | Search & filter | backend → frontend | [2026-10-27-search-backend-to-frontend.md](2026-10-27-search-backend-to-frontend.md) | Done: Search uses `GET /products/search` |
| 29 Oct 2026 | Price & image upload (changes) | backend → frontend | [2026-10-29-price-upload-backend-to-frontend.md](2026-10-29-price-upload-backend-to-frontend.md) | Done: deployed |
| 29 Oct 2026 | New product requests | backend → frontend | [2026-10-29-new-product-backend-to-frontend.md](2026-10-29-new-product-backend-to-frontend.md) | Done: deployed |
| 30 Oct 2026 | Deleting a pending product request | backend → frontend | [2026-10-30-new-product-delete-backend-to-frontend.md](2026-10-30-new-product-delete-backend-to-frontend.md) | Done: deployed |
| 3 Nov 2026 | Backend integration, product requests and auth spacing | frontend → backend | [2026-11-03-frontend-integration-frontend-to-backend.md](2026-11-03-frontend-integration-frontend-to-backend.md) | Implemented locally; remaining policy/security/rollout actions documented |
| 4 Nov 2026 | When a product's prices were last updated (`priceUpdatedAt`) | backend → frontend | [2026-11-04-price-updated-backend-to-frontend.md](2026-11-04-price-updated-backend-to-frontend.md) | Search & filter shows it; Smart Basket optional |
| 6 Nov 2026 | The deployed web app (CloudFront), CI and review fixes | backend → frontend | [2026-11-06-deployed-site-backend-to-frontend.md](2026-11-06-deployed-site-backend-to-frontend.md) | Deployed; manual checks in test-cases §11 still to do |
| 6 Nov 2026 | Security hardening (CSP, photo checks, input rules, limits) | backend → frontend | [2026-11-06-security-hardening-backend-to-frontend.md](2026-11-06-security-hardening-backend-to-frontend.md) | Deployed; manual checks in test-cases §5, §6 and §11 still to do |
| 7 Nov 2026 | Basket, Search, theme toggle and price-submission enhancements | backend → frontend | [2026-11-07-enhancements-backend-to-frontend.md](2026-11-07-enhancements-backend-to-frontend.md) | Deployed; the two submission lists have since been merged into one (7 Nov). Manual checks still to do |

The API contract that the backend → frontend handoffs rely on is in [../api/README.md](../api/README.md).
