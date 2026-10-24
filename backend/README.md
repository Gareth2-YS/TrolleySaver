# TrolleySaver backend

Serverless backend for **login** (Cognito) and **community price & photo submissions** (API Gateway → Lambda → DynamoDB, with photos in private S3). Everything is defined in [template.yaml](template.yaml) (AWS SAM) and deployed as the **`trolleysaver-dev`** stack.

| Looking for | Go to |
|---|---|
| **How to test it, step by step** | [TESTING.md](TESTING.md) |
| Endpoints, request/response shapes, error codes | [docs/api/README.md](../docs/api/README.md) |
| How the pieces fit together | [docs/architecture/ARCHITECTURE.md](../docs/architecture/ARCHITECTURE.md) |
| Tables, fields, indexes, moderation rules | [docs/architecture/database-design.md](../docs/architecture/database-design.md) |
| What the frontend needs to change | [docs/handoffs/](../docs/handoffs/README.md) |

## Layout

| Path | What it is |
|---|---|
| `template.yaml` | Cognito pool, client, groups and triggers; photo bucket; DynamoDB tables (only for new environments); REST API; Lambdas |
| `samconfig.toml` | Deploy settings for `dev` |
| `lambdas/common/` | Shared helpers: HTTP responses and errors, caller identity, DynamoDB/S3 handles, validation |
| `lambdas/handlers/` | One module per Lambda |
| `scripts/seed_catalog.py` | Loads the product spreadsheet into the tables. Never replaces existing data. |
| `scripts/create_admin.py` | Creates an admin account |
| `scripts/invoke.py` | Calls any Lambda directly as any user, without Cognito |
| `scripts/smoke_test.py` | 27 end-to-end checks over real HTTP; cleans up after itself |
| `tests/` | Unit tests (pytest + moto, no AWS needed) |

## Setup

Step by step, with what you should see after each step: [TESTING.md §0](TESTING.md#0-set-up-your-terminal). In short, from the `backend` folder:

1. Create the Python environment (first time only): `python -m venv .venv`, then `.venv\Scripts\python -m pip install -r requirements-dev.txt`.
2. Install the SAM CLI once with `winget install Amazon.SAM-CLI`, then open a new terminal.
3. Check your AWS credentials with `aws sts get-caller-identity`. If it errors, refresh them ([TESTING.md §0.4](TESTING.md#04-check-your-aws-credentials)).

## Environment

There's one environment, **dev** (stack `trolleysaver-dev`). It runs on the hand-made `trolleysaver-dev-*` tables, which the stack doesn't own (`CreateTables=false`). The stack owns its own Cognito user pool, API, Lambdas and photo bucket.

```powershell
aws cloudformation describe-stacks --stack-name trolleysaver-dev --query "Stacks[0].Outputs" --output table
```

Frontend values from the outputs: `ApiUrl` → `VITE_API_BASE_URL`, `UserPoolId` → `VITE_COGNITO_USER_POOL_ID`, `UserPoolClientId` → `VITE_COGNITO_CLIENT_ID`.

- **Indexes on the dev tables are managed by hand.** The `ByStatus` index on `trolleysaver-dev-price-submission` was added that way on 24 Oct 2026. A new index has to be added to dev the same way, as well as to `template.yaml`.
- **A new environment** (e.g. staging): copy the `[dev.*]` sections in `samconfig.toml` with a new stack name and `Env=<name> CreateTables=true`, so the stack creates its own tables.

## Everyday commands

Run these from the `backend` folder:

| Command | What it does |
|---|---|
| `.venv\Scripts\python -m pytest` | Unit tests (no AWS) |
| `sam validate --lint` | Checks the template |
| `sam deploy --config-env dev` | Deploys code or infrastructure changes |
| `.venv\Scripts\python scripts\smoke_test.py` | End-to-end check of the deployed stack |
| `.venv\Scripts\python scripts\seed_catalog.py --env dev --dry-run` | Shows what the spreadsheet would add |
| `.venv\Scripts\python scripts\create_admin.py --env dev --email you@example.com --name "Your Name"` | Creates an admin account |
| `.venv\Scripts\python scripts\invoke.py mine --as admin` | Calls a Lambda as anyone ([TESTING.md part 3](TESTING.md#3-call-each-lambda-directly-no-login)) |

- **No `sam build` is needed.** The Lambdas only use the standard library and boto3 (already in the Lambda runtime), so `sam deploy` zips `lambdas/` as-is.
- **The seed script is additive.** Existing products are matched by name and kept as they are, with their ids reused. Existing retailers are skipped. A seed price is only added where that product and store don't have one yet.

## Authentication in brief

- **Sign-up:** public sign-ups are confirmed automatically by the **PreSignUp** trigger. The **PostConfirmation** trigger then adds the user to `user` and creates their profile row.
- **Admins:** created only by `scripts/create_admin.py` ([TESTING.md §5](TESTING.md#5-create-an-admin-account)).
- **Tokens:** API Gateway's Cognito authorizer requires the scope `aws.cognito.signin.user.admin`, so it accepts **access tokens** and rejects ID tokens.
- **Identity:** Lambdas take the user id from the verified `sub` claim and check `cognito:groups` for `admin`.

## Tearing down

`sam delete --stack-name trolleysaver-dev` removes the dev Cognito pool, with every account in it, plus the API, Lambdas and photo bucket. Empty the bucket first with `aws s3 rm s3://trolleysaver-dev-photos-<account-id> --recursive`. The dev tables and their data are left alone, because the stack doesn't own them.
