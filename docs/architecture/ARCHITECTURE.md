# TrolleySaver Architecture

**Status:** Draft · **Last updated:** 18 Oct 2026

How TrolleySaver's cloud components fit together. It builds on the Preliminary Report's architecture. The data model is in [database-design.md](database-design.md).

Labels used below: **Decided** = in the Preliminary Report or agreed by the team. **Proposed** = suggested and awaiting team agreement.

---

## 1. Overview

```
                         +---------------------------+
                         |        Web browser        |
                         |  Shoppers, Contributors   |
                         +-----+-------+-------+-----+
                               |       |       |
              static site,     |       | REST  |  sign-up / login
              photos           |       | + JWT |
                               v       v       v
                   +-----------+  +----+-----+  +-----------+
                   | CloudFront|  |   API    |->|  Cognito  |
                   |   (CDN)   |  | Gateway  |  | User Pool |
                   +-----+-----+  +----+-----+  +-----------+
                         |             |  verifies JWT via
                         v             v  Cognito authorizer
                   +-----------+  +----------+
                   |    S3     |  |  Lambda  |  Python
                   | frontend  |  | (backend)|
                   | + photos  |  +----+-----+
                   | (private) |       |
                   +-----^-----+       v
                         |       +-----------+
       presigned PUT URL |       | DynamoDB  |  Catalog, PriceSubmissions,
       (photo upload) ---+       |           |  Users
                                 +-----------+
```

---

## 2. Components

| Component | Service | Role | Status |
|---|---|---|---|
| Frontend hosting | S3 + CloudFront | Static web app, served via CDN | Decided |
| Photo storage | S3 (private) | Shelf-tag photos; accessed only via CloudFront or presigned URLs | Decided |
| Auth | Cognito User Pool | Sign-up/login; user id (`sub`) attached to every submission | Decided |
| API | API Gateway (REST) | Routing, request validation, Cognito authorizer | Decided |
| Backend | Lambda | Search, submissions, price lookup, basket optimisation | Decided |
| Backend language | Python 3.12 | Lambda runtime | Proposed |
| Database | DynamoDB | 3 tables + 2 GSIs. See [database-design.md](database-design.md) | Decided (design is a draft) |
| Infrastructure as code | AWS SAM (`template.yaml`) | Tables, Lambdas, API, deployed per environment | Proposed |
| Capacity | DynamoDB on-demand + AWS Budgets alarm | Avoid throttling during stress tests; cap spend | Proposed (Xinpeng) |
| Region | ap-southeast-1 | All users in Singapore | Decided |

---

## 3. Key request flows

### 3.1 Contributor submits a price (with optional photo)

```
  Browser            API Gateway       Lambda                 S3          DynamoDB
     |                    |               |                     |               |
     |-- 1. request upload URL (JWT) ---->|                     |               |
     |<------------- presigned PUT URL ---|                     |               |
     |-- 2. PUT photo directly ------------------------------->|               |
     |                    |               |                     |               |
     |-- 3. POST /submissions (JWT, photoKey) ->|              |               |
     |                    |-- verify JWT, |                     |               |
     |                    |   invoke ---->| validate, rate-limit, duplicate,    |
     |                    |               | flag/confirm  ---------------------->|
     |<--------- 201 accepted / flagged --|                     |               |
```

- The photo goes **straight from the browser to S3** through a short-lived presigned URL, so images never pass through Lambda or DynamoDB. Proposed.
- Validation: reject missing or invalid fields, duplicates and users over the rate limit; save out-of-range prices as `flagged` until a second user confirms them.

### 3.2 Shopper plans a basket

```
  Browser --> API Gateway --> Basket Lambda
                                  |
                                  | getEligiblePrices(items, branches, memberships, now)
                                  |   = 1 DynamoDB Query per product (parallel)
                                  v
                         total per branch, apply deals,
                         list unpriced items, rank branches
                                  |
  Browser <-----------------------+  recommended branch + per-item breakdown
```

- Price selection (freshness, sibling fallback, membership and quantity rules) is owned by the data layer (Yong Hsien). Totalling and ranking are owned by Backend Dev 2 (Gareth). The two meet at `getEligiblePrices`, which returns one entry per product and branch with the regular price, eligible offers and a source label (`exact`, `sibling` or `none`).

---

## 4. Environments

| Environment | Purpose | Notes |
|---|---|---|
| dev | Day-to-day development | Can be torn down and recreated |
| staging | Integration and QA stress testing | Mirrors prod settings |
| prod | User evaluation and final demo | Seeded catalog; real contributor data |

Set up by the Cloud Engineer (Xinpeng). With SAM, each environment is one stack deployed with a different `Env` parameter, e.g. table `trolleysaver-dev-catalog`. Proposed.

---

## 5. Security and abuse prevention

- **Every write requires a Cognito login.** The backend takes the user id from the verified token, never from the request body.
- **S3 buckets are private.** Photos are reached only through CloudFront or presigned URLs.
- **Uploads are limited** in size and file type. Proposed: JPEG/PNG, at most 5 MB, enforced in the presigned URL conditions.
- **Per-user rate limit** on submissions. Proposed: 30 per hour.
- **Bad data is flagged, not trusted.** See the flagging rule in [database-design.md](database-design.md).

---

## 6. Cost notes (for the cloud vs. on-premise comparison)

- Everything is serverless, so with no traffic the only costs are S3 storage and DynamoDB storage, both near zero at PoC size.
- Per-request DynamoDB usage: a basket uses at most 10 Queries; a submission uses 2 Queries and 2–3 writes.
- Set an AWS Budgets alarm on the account before stress testing.
