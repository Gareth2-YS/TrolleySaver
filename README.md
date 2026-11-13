# TrolleySaver

A grocery price comparison web app for Singapore. Shoppers build a basket and see what it costs at FairPrice, Sheng Siong and Cold Storage, with a Healthier Choice version beside it, or search the catalogue with filters. Signed-in contributors share shelf prices, with an optional photo, and propose products the catalogue doesn't have yet. Admins review unusual prices and new products.

**Live (dev):** https://d8baodjze1mmt.cloudfront.net/

## Tech stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, react-hook-form + zod, AWS Amplify JS (Cognito sign-in), Vitest.
- **Backend:** AWS SAM: API Gateway (REST, Cognito authorizer), 13 Lambda functions (Python 3.12, arm64), DynamoDB (6 tables, on demand), S3 (private photo bucket, presigned uploads and links), Cognito user pool, EventBridge Scheduler (nightly price job).
- **Hosting:** the built site in a private S3 bucket behind CloudFront (Origin Access Control, security headers).
- **CI:** GitHub Actions runs the tests, lint, typecheck, build and template lint on every push. It doesn't deploy.

## Repository layout

```
backend/            AWS SAM stack and Lambda code
  lambdas/handlers/   one module per Lambda function
  lambdas/common/     shared logic (validation, pricing, basket, search, DynamoDB helpers)
  scripts/            seed, smoke test, basket evaluation, admin and invoke tools
  tests/              pytest unit tests (moto)
  template.yaml       every AWS resource
frontend/           React web app
  src/pages/          one file per page (search, smart basket, price upload, admin review, log in)
  src/components/     shared UI (layout, ui primitives, contribute, auth)
  src/contributions/  price and product-request services (API and local mode)
  src/basket/         Smart Basket services
  src/auth/           Cognito and mock sign-in
  src/lib/            formatting, theme, text checks, suggestions
  assets/             category icons and brand images
infra/deploy.py     one-command deploy
tests/run_all.py    one command for every test suite
docs/               architecture, API reference, deployment, manual test cases
data/               the product spreadsheet the catalogue was loaded from
```

## Prerequisites

- **Node.js 22** (the version CI uses) and npm.
- **Python 3.12** (the Lambda runtime) for the backend tests and scripts; `infra/deploy.py` and `tests/run_all.py` run on any Python 3.
- **AWS CLI v2** and **AWS SAM CLI**, only for deploying or the checks against dev (`winget install Amazon.SAM-CLI`).
- Backend test environment, once: `cd backend; python -m venv .venv; .venv\Scripts\python -m pip install -r requirements-dev.txt`

## Run locally

**(a) Local mode, no AWS.** Mock sign-in, and prices and requests kept in the browser:

```powershell
cd frontend;
Copy-Item .env.example .env.local;
npm ci;
npm run dev
```

`.env.example` already sets `VITE_AUTH_MODE=mock`, `VITE_PRICE_SUBMISSION_MODE=local` and `VITE_SMART_BASKET_MODE=local`. Open http://localhost:5173 and log in as `user@trolleysaver.local` / `User123!` or `admin@trolleysaver.local` / `Admin123!`. Search & filter always calls the API, so it needs `VITE_API_BASE_URL` even in local mode.

**(b) Against the deployed dev API.** Put these in `frontend/.env.local` (git-ignored), with the values from the `trolleysaver-dev` stack's outputs (`ApiUrl`, `UserPoolId`, `UserPoolClientId`):

```
VITE_AUTH_MODE=cognito
VITE_PRICE_SUBMISSION_MODE=api
VITE_SMART_BASKET_MODE=api
VITE_AWS_REGION=ap-southeast-1
VITE_COGNITO_USER_POOL_ID=<UserPoolId>
VITE_COGNITO_CLIENT_ID=<UserPoolClientId>
VITE_API_BASE_URL=<ApiUrl>
```

```powershell
aws cloudformation describe-stacks --stack-name trolleysaver-dev --region ap-southeast-1 --query "Stacks[0].Outputs" --output table
```

Then run `npm run dev` in `frontend/`. Vite only reads `.env.local` at startup.

## Tests

```powershell
python tests\run_all.py
```

Runs the backend unit tests (pytest), the frontend unit tests (Vitest) and the template lint, then prints one summary. `--aws` also runs the end-to-end smoke test and the Smart Basket evaluation against dev (needs AWS credentials); `--only backend,lint` picks suites. Manual UI checks: [docs/qa/test-cases.md](docs/qa/test-cases.md).

## Deploy

```powershell
python infra\deploy.py --profile <profile>
```

Tests, deploys the stack with SAM, builds the web app with the stack's settings, uploads it and clears CloudFront's cache. Flags: `--skip-tests`, `--backend-only` or `--frontend-only`, `--smoke` (run the end-to-end smoke test at the end; off by default), `--env` (default `dev`), `--region` (default `ap-southeast-1`). See [docs/deployment.md](docs/deployment.md).

## API

16 routes. Public routes need no sign-in; the others need a Cognito access token, and admin routes also check the `admin` group in the Lambda. Full reference: [docs/api/README.md](docs/api/README.md).

| Method | Path | Lambda | Access |
|---|---|---|---|
| GET | `/products` | `catalog` | Public |
| GET | `/retailers` | `catalog` | Public |
| GET | `/products/search` | `search` | Public |
| POST | `/basket/compare` | `basket` | Public |
| POST | `/price-submissions/image-upload-url` | `upload-url` | Signed in |
| POST | `/price-submissions` | `create-submission` | Signed in |
| GET | `/price-submissions/mine` | `my-submissions` | Signed in |
| DELETE | `/price-submissions/{id}` | `delete-submission` | Signed in (own, pending) |
| POST | `/product-requests/image-upload-url` | `product-requests` | Signed in |
| POST | `/product-requests` | `product-requests` | Signed in |
| GET | `/product-requests/mine` | `product-requests` | Signed in |
| DELETE | `/product-requests/{id}` | `product-requests` | Signed in (own, pending) |
| GET | `/admin/price-submissions` | `admin-submissions` | Admin |
| PATCH | `/admin/price-submissions/{id}` | `admin-submissions` | Admin |
| GET | `/admin/product-requests` | `admin-product-requests` | Admin |
| PATCH | `/admin/product-requests/{id}` | `admin-product-requests` | Admin |

The other three Lambdas have no route: `cognito-pre-signup` and `cognito-post-confirmation` (Cognito triggers) and `price-aggregator` (nightly at 00:05 SGT).
