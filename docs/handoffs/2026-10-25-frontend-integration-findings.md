# Frontend integration findings

**Date:** 24 Oct 2026 · **Environment:** `dev`

## Verified against implementation

- The Lambda handlers, unit tests, API reference and SAM template agree on the deployed contract: canonical catalog ids, integer cents, Singapore observed dates, presigned multipart POST uploads, and `accepted` / `flagged` / `rejected` moderation.
- A read-only request to the configured `dev` API returned two products with UUID ids and the three documented retailers (`coldstorage`, `fairprice`, `shengsiong`).
- A live preflight from `http://localhost:5173` returned status 200 with that origin and `GET,POST,PATCH,OPTIONS` plus `Authorization,Content-Type`.
- AWS identity was confirmed as team account `158670174505`. CloudFormation stack `trolleysaver-dev` was `CREATE_COMPLETE`, and its region, user pool, app client and API outputs matched `frontend/.env.local` exactly.
- The repository smoke test passed all 27 live checks with disposable data: public registration and login, group assignment, profile creation, access-token enforcement, multipart photo upload and size rejection, accepted and flagged submissions, duplicate and validation errors, own submissions, signed/private photo access, admin role enforcement, flagged queue, moderation and conflict handling, and CORS.
- A separate disposable auth-lifecycle check confirmed that the display name is in the ID token, the `user` role is in the access token, refresh-token session restoration works, and a revoked refresh token is rejected.
- Post-test checks found zero Cognito users, zero disposable profiles and zero uploaded evidence objects; the smoke test also removed its submissions.
- The frontend owner subsequently completed a manual `dev` integration pass and confirmed Cognito, the authenticated API flow and S3 photo handling work from the application.

## Deferred hosting setup (not an integration blocker)

The API and S3 bucket currently allow only `http://localhost:5173`. This is correct for local integration, but any hosted frontend will be blocked by browser CORS until its exact origin is added to the SAM `AllowedOrigin` deployment parameter and the `dev` stack is redeployed.

No application or infrastructure was deployed or changed by this integration. The only automated AWS mutations were disposable smoke-test users, profiles, submissions and photos, all removed by the test and independently checked afterward.

## Completion and ownership

The auth, contribution, moderation, API and S3 frontend integration is **complete and verified on `dev`**. There is no remaining implementation or setup step for this feature beyond reviewing and committing the working-tree changes.

The following items are intentionally outside this handoff rather than blockers:

- Add the eventual hosted frontend origin to API Gateway and S3 CORS when a hosting URL exists; this belongs to the hosting/deployment work.
- The hourly 429 limit was not deliberately exhausted live because that requires more than 30 submissions. Its UI handling uses the verified common API error path.
- Smart Basket, Search, hosting, password recovery and other product expansion are subsequent frontend/backend features owned separately.
