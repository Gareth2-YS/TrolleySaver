# TrolleySaver

A grocery price comparison web app for Singapore. Shoppers build a basket and see what it costs at FairPrice, Sheng Siong and Cold Storage, or search the catalogue with filters. Signed-in contributors share shelf prices, with an optional photo, and propose products the catalogue doesn't have yet. Admins review unusual prices and new products.

## What's in the repository

| Folder | What it holds |
|---|---|
| [frontend/](frontend/README.md) | The React web app (TypeScript, Vite, Tailwind CSS) |
| [backend/](backend/README.md) | The AWS stack in one SAM template: Lambda functions (Python), API Gateway, Cognito, DynamoDB, S3 and the CloudFront site |
| [infra/deploy.py](docs/deployment.md) | One command that tests, deploys the stack and publishes the web app |
| [tests/run_all.py](tests/run_all.py) | One command that runs every test suite and prints a summary |
| `data/` | The product spreadsheet the catalogue was loaded from |
| [docs/](docs/README.md) | Architecture, API reference, deployment, handoffs and the manual test cases |

## Common tasks

Run each command from the repository root.

| Task | Command | More |
|---|---|---|
| Run the app on your machine | `cd frontend; npm ci; npm run dev` | [frontend/README.md](frontend/README.md) |
| Run every automated test | `python tests\run_all.py` (add `--aws` for the checks against dev) | [backend/TESTING.md](backend/TESTING.md) |
| Deploy to AWS | `python infra\deploy.py --profile <your profile>` | [docs/deployment.md](docs/deployment.md) |
| Test the UI by hand | Follow the checklist | [docs/qa/test-cases.md](docs/qa/test-cases.md) |
