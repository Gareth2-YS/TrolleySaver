# TrolleySaver authentication frontend

## Local UI

```powershell
cd frontend
Copy-Item .env.example .env.local
npm install
npm run dev
```

`VITE_AUTH_MODE` accepts `mock` or `cognito`:

- Use `mock` for the current local dummy-user and dummy-admin login.
- Use `cognito` after the AWS Cognito values have been supplied.

The active frontend environment file is `frontend/.env.local`. Vite is run from
the `frontend` directory, so a repository-root `.env` file is not used by this
app. Lines beginning with `#` are comments and are ignored.

Open `http://localhost:5173`. Smart Basket and Search are public. Price & Image Upload requires login. Local mock mode includes:

- User: `user@trolleysaver.local` / `User123!`
- Admin: `admin@trolleysaver.local` / `Admin123!`

Type either dummy account into the normal login form. New registrations are immediately usable, always receive the `user` role, and duplicate emails are rejected. These credentials exist only in the local mock adapter.

Price & Image Upload is implemented for local development testing. Contributors can validate and submit price details with optional shelf-tag evidence, then immediately see the pending record. Administrators receive a focused local moderation queue. In local mode, metadata is stored in browser `localStorage`, image references use temporary object URLs, and no data is sent to AWS.

Set `VITE_PRICE_SUBMISSION_MODE=local` for this demonstration flow. `api` is reserved for the future production adapter and currently shows an explicit unavailable-integration error instead of fake success. Smart Basket and Search & Filter remain untouched placeholders.

## Quality checks

```powershell
npm run test
npm run typecheck
npm run lint
npm run build
```

For real Cognito, change `VITE_AUTH_MODE` to `cognito` and fill in the non-secret AWS values. See the repository root `handoff.md` for the integration contract.
