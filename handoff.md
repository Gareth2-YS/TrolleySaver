# Authentication frontend → backend/Cognito handoff

## Scope and flow

The React frontend implements a deliberately simple authentication flow: public user registration, direct user/admin sign-in, sign-out, session restoration, public Smart Basket/Search routes, and a protected contribution route. The feature routes intentionally contain only the shared header until their owners implement them. Password recovery, email verification, MFA/2FA, temporary-password changes, and other sign-in challenges are intentionally out of scope.

Public registration always sends only `fullName`, `email`, and `password`. It contains no role field and always represents a regular user. Choosing **Admin** on the login form only expresses the destination the user is trying to reach; authorization still comes from signed Cognito claims. If the session lacks the `admin` group, the frontend signs out that attempted admin session and denies access.

## Cognito configuration expected

Please provide a Cognito User Pool and a public app client suitable for a browser application:

- Sign-in alias: email.
- Required standard attribute: email. The frontend also sends the standard `name` attribute.
- Self-service sign-up enabled for regular users, with accounts automatically confirmed by an approved Cognito trigger. The product flow must not ask users for an email verification code.
- Password policy coordinated with the UI: at least 8 characters with uppercase, lowercase, number, and symbol.
- App client with no client secret (a browser cannot protect one).
- Authentication flows compatible with Amplify `signIn` (SRP/user password as agreed by the team) and able to complete without a follow-up challenge.
- Token revocation enabled and access/ID token lifetimes agreed with the backend.
- MFA/2FA disabled for this iteration. Do not require SMS, email, or TOTP sign-in challenges.
- Self-service password recovery is not expected by the frontend for this iteration.
- Two Cognito groups named exactly `admin` and `user`.

After sign-up, an AWS-controlled workflow must auto-confirm the account and assign it to the `user` group if the group is needed as an explicit claim. This can be a secure pre-sign-up/post-confirmation Lambda or backend administrative workflow. Do not accept any client-supplied role/group value.

## Initial administrators

The backend/infrastructure owner must securely provision **2–3 initial administrator accounts** and assign them to the `admin` Cognito group. Use infrastructure automation or Cognito admin APIs. Set a permanent password before handoff so the frontend does not receive a forced-password-change challenge, and deliver credentials through an approved secure channel. MFA is omitted for this iteration.

Administrator accounts must never be created or promoted through public registration. Client requests and UI controls are attacker-controlled; accepting a public role value would allow privilege escalation. The backend remains the authority even if the frontend hides admin-only controls.

## Values the frontend needs

Provide these non-secret build-time values:

```env
VITE_AUTH_MODE=cognito
VITE_AWS_REGION=ap-southeast-1
VITE_COGNITO_USER_POOL_ID=<user-pool-id>
VITE_COGNITO_CLIENT_ID=<public-app-client-id>
VITE_API_BASE_URL=<backend-base-url>
```

Do not provide a client secret or commit deployed environment values. The bundled dummy user and administrator exist only inside the development mock adapter and are never part of a Cognito build.

## Tokens and backend authorization

The frontend obtains the access token through Amplify `fetchAuthSession()` and exposes it via `authService.getAccessToken()`. API requests should send:

```http
Authorization: Bearer <Cognito access token>
```

The backend must independently validate the JWT signature against the User Pool JWKS, issuer, expiry, token use, and expected app-client/audience fields. It must enforce authorization on every protected endpoint, including checking the `cognito:groups` claim for `admin`. Never rely on the selected login tab, route, UI visibility, or unverified decoded claims.

The frontend currently derives display/navigation role from the access token's `cognito:groups`: `admin` wins when present; otherwise it falls back to `user`. Confirm with the backend whether accounts should belong to exactly one group.

## Integration test checklist

1. Create a public user through `/register`; verify that the account is immediately usable and has no admin membership.
2. Sign in through User mode and verify navigation to `/contribute`.
3. Select Admin mode with the regular account; verify access is denied and the protected contribution workspace does not open.
4. Sign in with each provisioned administrator; verify the access token contains `cognito:groups: ["admin"]` and the protected `/contribute` route opens.
5. Exercise sign-out, browser refresh/session restoration, invalid credentials, duplicate registration, and rate-limit errors.
6. Confirm registration and login complete without verification, MFA/2FA, password-reset, or new-password challenge screens.
7. Call user and admin API endpoints with a valid user token, valid admin token, expired token, ID token in place of access token, malformed token, and no token. Confirm server-side enforcement in every case.
8. Build with `VITE_AUTH_MODE=cognito`; a production app intentionally refuses to start when mock mode is selected.

## Decisions to coordinate

- Exact access/ID token lifetimes and refresh-session policy.
- Whether the `user` group is explicitly attached or implied by absence of `admin`.
- The Cognito trigger/workflow that auto-confirms ordinary users and assigns them to the `user` group.
- API CORS origins and final `VITE_API_BASE_URL` values per environment.
- Standard error contract for authenticated API requests and the desired UX for revoked/expired sessions.

## Price and Image Upload Backend Handoff

### Scope and current frontend behavior

The protected `/contribute` route now has two role-specific experiences selected from the authenticated Cognito/mock role:

- Contributors can select a product and store, enter a price in SGD and observed date, optionally select a shelf-tag image, preview it, and submit it for review. The contributor can see their own recent submissions and each submission's `pending`, `approved`, or `rejected` status.
- Administrators see only a pending moderation queue. They can inspect price details, contributor details, timestamps, and image evidence, then approve or reject. Rejection currently requires a reason so this decision can be represented cleanly in the eventual API.
- Promotion date, promotion end date, price type, offer conditions, and other promotion-specific controls are intentionally absent.
- Both experiences include loading, empty, success, validation, upload-progress, and error states. The frontend obtains the access token through the existing `getAccessToken()` auth-context pattern before each service operation.

No AWS integration or production backend has been implemented. The frontend service contract is in `frontend/src/contributions/types.ts`; the replaceable adapter is selected in `frontend/src/contributions/service.ts`.

### Local/mock-only behavior

When `VITE_PRICE_SUBMISSION_MODE=local`, the following development-only behavior applies. The mode is selected through local environment configuration and documented here; the contribution workspace does not display a persistent environment banner.

- Submission records are stored under `trolleysaver.local.price-submissions.v1` in browser `localStorage`.
- Selected image previews and simulated uploaded images use browser object URLs. These URLs are temporary, browser-tab-local references and may not survive a full page/browser restart even though the metadata record remains in `localStorage`.
- Upload progress, the upload target, approval, rejection, and persistence are simulations for frontend demonstration only.
- Nothing is uploaded to S3, written to DynamoDB, sent to an API, or made public.
- The local adapter still requires a non-empty token and checks the administrator role for list/moderation operations, but this is not a security boundary. Production authorization must be enforced by the backend.

When `VITE_PRICE_SUBMISSION_MODE=api`, the current adapter deliberately returns an explicit “production API not connected” error. It never reports fake production success.

### Expected production operations

The backend team can replace the adapter without changing the page components by implementing the existing `SubmissionService` operations:

1. **Request an image-upload URL** — authenticated contributor operation.

   Suggested `POST /price-submissions/image-upload-url` request:

   ```json
   {
     "fileName": "shelf-label.jpg",
     "contentType": "image/jpeg",
     "sizeBytes": 1830042
   }
   ```

   Suggested response:

   ```json
   {
     "uploadUrl": "<short-lived-presigned-s3-put-url>",
     "photoKey": "price-evidence/<user-id>/<uuid>.jpg",
     "expiresAt": "2026-10-21T15:15:00Z",
     "requiredHeaders": { "Content-Type": "image/jpeg" }
   }
   ```

2. **Upload the image directly to private S3** — the browser sends the bytes to `uploadUrl` using the exact required method and headers. A successful S3 response is followed by metadata submission. Do not send the presigned URL itself to DynamoDB.

3. **Create a price submission** — authenticated contributor operation.

   Suggested `POST /price-submissions` request:

   ```json
   {
     "productId": "gardenia-white-600g",
     "storeId": "fairprice",
     "price": 2.8,
     "currency": "SGD",
     "observedDate": "2026-10-19",
     "photoKey": "price-evidence/<user-id>/<uuid>.jpg"
   }
   ```

   The backend should derive `submitterId`, display/email claims as appropriate, `status`, `submittedAt`, and server-owned review fields rather than trusting client values. Suggested response: the complete submission record shown in the DynamoDB section below.

4. **List the current contributor's submissions** — suggested `GET /price-submissions/mine`; return the caller's submissions newest first. Include all relevant statuses so contributors can understand moderation outcomes. If evidence thumbnails are returned, use short-lived authenticated/presigned read URLs rather than public S3 URLs.

5. **List pending submissions for administrators** — suggested `GET /admin/price-submissions?status=pending`; return pending records newest first with submitter and evidence information required for review.

6. **Approve or reject a submission** — suggested `PATCH /admin/price-submissions/{submissionId}` request:

   ```json
   { "decision": "approved" }
   ```

   or:

   ```json
   { "decision": "rejected", "reason": "Shelf label is unreadable" }
   ```

   Return the updated record. Moderation should be idempotent or return a clear conflict when another administrator has already decided it. Approval is the point at which a price may become eligible for public/search use; that publication behavior belongs to the backend and is not implemented here.

For API errors, use a stable shape such as `{ "code": "IMAGE_TOO_LARGE", "message": "...", "fieldErrors": { "photo": "..." }, "requestId": "..." }` with appropriate HTTP status codes. The frontend needs distinguishable authentication/authorization, validation, conflict, upload, and transient server errors.

### DynamoDB ownership and suggested record

Price submission metadata belongs in DynamoDB. A suggested record is:

```json
{
  "submissionId": "uuid",
  "productId": "gardenia-white-600g",
  "storeId": "fairprice",
  "price": 2.8,
  "currency": "SGD",
  "observedDate": "2026-10-19",
  "status": "pending",
  "submitterId": "cognito-sub",
  "submitterName": "Alex Tan",
  "submitterEmail": "alex@example.com",
  "submittedAt": "2026-10-21T15:00:00Z",
  "photoKey": "price-evidence/<user-id>/<uuid>.jpg",
  "photoContentType": "image/jpeg",
  "photoSizeBytes": 1830042,
  "reviewedAt": null,
  "reviewedBy": null,
  "rejectionReason": null
}
```

Persist money using an agreed exact representation—prefer integer cents (for example `priceCents: 280`) if the backend team wants to avoid decimal ambiguity. Product/store display names in the frontend are temporary catalogue labels; the backend should decide whether responses hydrate canonical names or return IDs for a catalogue lookup.

Expected statuses are exactly `pending`, `approved`, and `rejected` for this iteration. Status transitions should be server-controlled: create as `pending`; administrators may transition a pending record to `approved` or `rejected`. Decide whether re-review is allowed before exposing another transition.

The DynamoDB record references evidence only by the stable S3 `photoKey` plus safe metadata. Do not store image bytes, a presigned URL, a browser object URL, or a public URL in DynamoDB.

### Private S3 ownership and image constraints

Shelf-tag image bytes belong in a private S3 bucket. They must not be publicly readable. The backend should generate short-lived, user-scoped presigned PUT URLs after validating the requested content type and size, and short-lived read URLs (or an authenticated image proxy) for authorized contributor/admin display.

The current frontend accepts:

- `image/jpeg` (`.jpg`/`.jpeg`)
- `image/png` (`.png`)
- Maximum file size: 5 MiB (`5 * 1024 * 1024` bytes)
- One optional image per submission

The backend must repeat these checks; client validation can be bypassed. Also verify the actual uploaded object/content, restrict object keys to a server-generated prefix, reject unexpected metadata, consider malware/content scanning, configure lifecycle cleanup for abandoned presigned uploads, and decide evidence retention after moderation. CORS should permit only required upload/read methods and deployed frontend origins.

### Authentication and authorization

Every API request above should receive `Authorization: Bearer <Cognito access token>` using the existing frontend token accessor. Apply the JWT validation requirements in the earlier Cognito section.

- Contributors: request an upload target, create submissions, and list only their own submissions.
- Administrators (`cognito:groups` contains `admin`): list the review queue and approve/reject submissions.
- A user must never be able to choose another `submitterId`, read another contributor's private submissions/evidence, or call moderation endpoints.
- An administrator UI role is not authorization. Enforce all object-level access and status transitions in the API/Lambda layer.
- Presigned S3 access should be narrowly scoped to one generated object key, expected content type/size policy, and a short expiry.

### Ownership split

Frontend owns forms, client-side validation, image preview, local adapter and mock progress, loading/error/empty/success states, authenticated token retrieval, and role-specific presentation.

The backend/AWS team owns API Gateway/routes, Lambda/business logic, DynamoDB tables/indexes and persistence, the private S3 bucket, presigned upload/read URLs, JWT and role authorization enforcement, moderation concurrency/persistence, image validation/scanning/retention, CORS, monitoring, and deployment configuration.

### Future configuration

The frontend currently recognizes:

```env
VITE_PRICE_SUBMISSION_MODE=local # local | api
VITE_API_BASE_URL=<backend-base-url>
```

Use `local` only for browser-local development/testing. The production adapter still needs to be implemented and should use `VITE_API_BASE_URL` plus `getAccessToken()`. If the backend chooses non-default endpoint paths, upload methods, or required S3 headers, either add explicit non-secret configuration or normalize them behind the service adapter—do not leak infrastructure details through presentational components.

### Assumptions and unresolved decisions

- The current frontend supports store-level pricing only and sends `storeId`; there is no branch selector or `branchId`. If branch-level pricing is added later, define the scope and branch contract explicitly instead of inferring it from store data.
- Product and store options are temporary frontend catalogue constants. Confirm the source and API for canonical IDs/names before production integration.
- Confirm whether contributor name/email should be denormalized into each record or resolved from the user profile at read time.
- Confirm whether an image becomes immutable once submitted and whether contributors may edit/withdraw pending records. The current UI does neither.
- Confirm moderation concurrency behavior, evidence retention, audit requirements, and whether rejection reasons are mandatory. The current UI requires a reason.
- Confirm whether approved submissions directly update the public price dataset or feed a separate publishing/quality workflow.
