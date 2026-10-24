# Handoffs

Notes passed between team members when one person's work becomes someone else's starting point.

**Naming:** `<YYYY-MM-DD>-<feature>-<from>-to-<to>.md`, e.g. `2026-10-24-price-upload-backend-to-frontend.md`. One feature per file. The date is when the handoff was written, so the folder reads oldest first and each request sits just before its reply. A later handoff on the same feature gets a new file with a new date, rather than an edit to the old one.

| Date | Feature | From → to | Document | Status |
|---|---|---|---|---|
| 21 Oct 2026 | Auth (login, roles) | frontend → backend | [2026-10-21-auth-frontend-to-backend.md](2026-10-21-auth-frontend-to-backend.md) | Implemented |
| 23 Oct 2026 | Feature pages (Smart Basket, Search, Price Upload) | frontend shell → feature developers | [2026-10-23-frontend-feature-pages.md](2026-10-23-frontend-feature-pages.md) | Price Upload integrated; Smart Basket and Search remain separate features |
| 23 Oct 2026 | Price & image upload | frontend → backend | [2026-10-23-price-upload-frontend-to-backend.md](2026-10-23-price-upload-frontend-to-backend.md) | Implemented, with changes |
| 24 Oct 2026 | Auth (login, roles) | backend → frontend | [2026-10-24-auth-backend-to-frontend.md](2026-10-24-auth-backend-to-frontend.md) | Integrated and verified on `dev` |
| 24 Oct 2026 | Price & image upload | backend → frontend | [2026-10-24-price-upload-backend-to-frontend.md](2026-10-24-price-upload-backend-to-frontend.md) | Integrated and verified on `dev` |
| 25 Oct 2026 | Auth, API and price upload integration | frontend → team | [2026-10-25-frontend-integration-findings.md](2026-10-25-frontend-integration-findings.md) | **Complete** |

The API contract that both backend → frontend handoffs rely on is in [../api/README.md](../api/README.md).
