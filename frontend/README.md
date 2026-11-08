# TrolleySaver frontend

The web app: React and TypeScript, built with Vite and styled with Tailwind CSS. Sign-in uses AWS Amplify with Cognito.

## Run it locally

```powershell
cd frontend;
Copy-Item .env.example .env.local;
npm ci;
npm run dev
```

Open `http://localhost:5173`. With the example settings, everything runs in the browser with no AWS. Use the demo accounts in the normal log-in window:
- contributor: `user@trolleysaver.local` / `User123!`
- admin: `admin@trolleysaver.local` / `Admin123!`

New registrations work straight away, always as contributors. The demo accounts and anything saved in local mode exist only in this browser.

## Settings (`frontend/.env.local`)

Vite reads `frontend/.env.local`; a `.env` at the repository root isn't used. Restart `npm run dev` after changing it.

| Setting | Values | What it does |
|---|---|---|
| `VITE_AUTH_MODE` | `mock` (default) or `cognito` | Demo accounts in the browser, or real sign-in with the dev Cognito user pool |
| `VITE_PRICE_SUBMISSION_MODE` | `local` or `api` | Price & image upload saves in this browser, or sends to the API |
| `VITE_SMART_BASKET_MODE` | `local` or `api` | The basket compares against sample prices from `data/`, or the API's daily prices |
| `VITE_API_BASE_URL` | the stack output `ApiUrl`, no trailing slash | Needed for any `api` mode. Search & filter always uses it. |
| `VITE_AWS_REGION`, `VITE_COGNITO_USER_POOL_ID`, `VITE_COGNITO_CLIENT_ID` | the stack outputs | Needed for `cognito` |

**To work against dev,** set both modes to `api` and `VITE_AUTH_MODE=cognito`, and fill in the values from the dev stack's outputs ([backend/README.md → Environment](../backend/README.md#environment)). They aren't secret, but don't commit them. Use the same mode for the basket and price uploads; mixing `local` and `api` empties the basket ([test-cases KI-02](../docs/qa/test-cases.md#10-known-issues)).

## Pages

| Path | Who | What it is |
|---|---|---|
| `/basket` | everyone | Smart basket: compare a whole basket's cost at each store, and swap items for Healthier Choice ones |
| `/search` | everyone | Search & filter the catalogue, with each product's store prices |
| `/contribute` | contributors | Share a price or a new product, and see "Your submissions" |
| `/contribute` | admins | Review flagged prices and new product requests |
| `/login`, `/register` | signed out | The log-in and register window, over the page you were on |

The header's sun/moon button switches light and dark mode ([src/lib/theme.ts](src/lib/theme.ts)).

## Code layout (`src/`)

| Folder | Holds |
|---|---|
| `pages/` | One file per page, with its tests beside it |
| `components/` | Shared pieces: the header (`layout/`), log-in fields (`auth/`), the price upload page's parts (`contribute/`), and plain UI controls (`ui/`) |
| `auth/`, `basket/`, `contributions/` | The services behind sign-in, the basket and price uploads, each with a local and an API version |
| `lib/` | Helpers: price and date formatting, filter counts, text checks, the theme |

## Checks

```powershell
npm test;
npm run typecheck;
npm run lint;
npm run build
```

CI runs all four on every push, and `npm run lint` must pass with no warnings. `python tests\run_all.py` from the repository root runs these tests along with the backend's.

## The deployed site

`python infra\deploy.py` from the repository root builds the app with Cognito sign-in and API mode, using the stack's own settings (not `.env.local`), and publishes it to CloudFront. See [docs/deployment.md](../docs/deployment.md).

The site has a Content-Security-Policy. Anything new loaded from another site (a font, an image CDN, another API) must be added to it, or browsers block it ([deployment.md → Security headers](../docs/deployment.md#security-headers)). The API contract is in [docs/api/README.md](../docs/api/README.md).
