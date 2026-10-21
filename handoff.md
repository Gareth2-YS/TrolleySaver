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
