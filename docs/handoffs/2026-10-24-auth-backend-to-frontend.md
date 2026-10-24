# Auth: backend → frontend handoff

**Date:** 24 Oct 2026 · **From:** Gareth (backend) · **To:** frontend developer · **Status:** deployed to `dev`

This is the backend's reply to [2026-10-21-auth-frontend-to-backend.md](2026-10-21-auth-frontend-to-backend.md). Cognito is set up the way that handoff asked for. The frontend's existing Cognito adapter works against it, with **one small change**. Contract details are in the [API reference](../api/README.md#2-authentication).

## 1. Connect the frontend

In `frontend/.env.local` (gitignored):

```env
VITE_AUTH_MODE=cognito
VITE_AWS_REGION=ap-southeast-1
VITE_COGNITO_USER_POOL_ID=<UserPoolId>
VITE_COGNITO_CLIENT_ID=<UserPoolClientId>
VITE_API_BASE_URL=<ApiUrl>
```

Use the **`dev`** environment, the only one deployed. Get the values from Gareth, or from `aws cloudformation describe-stacks --stack-name trolleysaver-dev --query "Stacks[0].Outputs"`. Don't commit them.

Each environment has its own user pool. If a staging or production environment is added later, accounts won't carry over to it.

## 2. The one change needed

The **access token has no `name` claim**, so `getCurrentUser()` in `frontend/src/auth/cognito-auth-service.ts` currently always returns `name: undefined`. Read the name from the ID token instead, and keep reading groups from the access token:

```ts
const name = session.tokens?.idToken?.payload.name
```

Everything else in the adapter was checked against the real pool with the same Amplify version (6.22.2):
- `signUp` returns `isSignUpComplete: true`
- `signIn` returns `isSignedIn: true` with no extra step
- `cognito:groups` is `["user"]` for a new account
- the API accepts the access token from `getAccessToken()`

## 3. Answers to "Decisions to coordinate"

| Question | Decision |
|---|---|
| Token lifetimes and refresh | Access and ID tokens last 60 minutes, refresh tokens 30 days. Token revocation is on, so `signOut()` revokes the refresh token. Amplify refreshes on its own; no frontend work needed. |
| Is the `user` group explicit? | **Yes.** A sign-up trigger adds every self-registered account to `user`. Admins are in `admin` only. Each account is in exactly one group, so the existing "admin wins" logic is correct. |
| Auto-confirm workflow | A Cognito **PreSignUp** Lambda auto-confirms and auto-verifies email. A **PostConfirmation** Lambda adds the account to the `user` group and creates its profile row (display name, email, submission count). Clients can't choose a group. |
| CORS origins and API URL per environment | `dev` allows `http://localhost:5173` only. The production origin gets added once frontend hosting exists; ask Gareth when you need another origin. |
| Error contract and expired or revoked sessions | See [API reference §5](../api/README.md#5-errors). An expired, revoked or invalid token gets `401 {"message": "…"}` from API Gateway. Treat any 401 as "session ended": try `fetchAuthSession()` once, then send the user to log in. |

## 4. Cognito details the UI should know

- **Password policy:** 8+ characters with upper case, lower case, a number and a symbol. This matches `frontend/src/auth/schemas.ts`. If the client check is ever bypassed, Cognito returns `InvalidPasswordException`. `errors.ts` has no friendly message for it yet, so its raw message is shown.
- **Hidden user existence:** a wrong email and a wrong password both return `NotAuthorizedException` ("Incorrect username or password."). `UserNotFoundException` is never returned. `errors.ts` already maps both to the same message.
- **Duplicate registration** returns `UsernameExistsException`, which is already mapped.
- **Sign-in flows:** SRP (Amplify's default) and `USER_PASSWORD_AUTH` are enabled. There's no MFA, email code or forced password change.

## 5. Admin accounts: none exist yet

**I haven't created any admin accounts.** [2026-10-21-auth-frontend-to-backend.md](2026-10-21-auth-frontend-to-backend.md) asked for 2–3 to be ready at handoff. Instead, please create one yourself when you need it, for example to build or test the admin review page. Admin accounts can't be created through `/register`, by design.

You need Python 3 and access to the team's AWS account. If you don't have AWS access, ask someone on the team who does to do this for you. In PowerShell, starting from the repository root:

1. Go to the backend folder: `cd backend`.
2. First time only, create the Python environment:

   ```powershell
   python -m venv .venv; .venv\Scripts\python -m pip install -r requirements-dev.txt
   ```

3. Check your AWS credentials. `aws sts get-caller-identity` should print the team's account (`158670174505`). If it errors, refresh your credentials ([backend/TESTING.md §0.4](../../backend/TESTING.md#04-check-your-aws-credentials)).
4. Create the account:

   ```powershell
   .venv\Scripts\python scripts\create_admin.py --env dev --email you@example.com --name "Your Name"
   ```

The script:
1. Asks for a password twice. It needs 8+ characters, with upper case, lower case, a number and a symbol.
2. Creates the account with that password, so no password change is forced at first sign-in.
3. Adds the account to the `admin` group.
4. Prints `you@example.com is an admin`.

No email is sent, so any address works as the login name. Then sign in on the **Admin** tab of `/login`.

⚠️ **Don't create admins in the AWS console.** The console only sets a temporary password. Cognito then forces a password change at first sign-in, which the frontend rejects ("This Cognito client must use direct sign-in…"). Console-made accounts also don't get a profile row.

To list or remove admins, see [backend/TESTING.md §5](../../backend/TESTING.md#5-create-an-admin-account).

## 6. Status of the original integration checklist

| # | Check | Status |
|---|---|---|
| 1 | Public registration works immediately and has no admin membership | ✅ Verified on the backend (API and Amplify). Re-check in the UI. |
| 2 | User sign-in goes to `/contribute` | Frontend to verify |
| 3 | Admin mode with a regular account is denied | Frontend to verify; the token carries `["user"]` only |
| 4 | Admin access token contains `cognito:groups: ["admin"]` | ✅ Verified with a temporary admin (since deleted). Re-check with your own admin account (section 5). |
| 5 | Sign-out, refresh, invalid credentials, duplicate registration, rate limits | Frontend to verify (error names above) |
| 6 | No verification, MFA, reset or new-password challenge | ✅ Verified |
| 7 | API calls with user, admin, malformed, missing and ID tokens are enforced server-side | ✅ Verified by `backend/scripts/smoke_test.py` |
| 8 | Production build with `VITE_AUTH_MODE=cognito` | Frontend to verify |
