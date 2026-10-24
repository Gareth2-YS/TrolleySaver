# TrolleySaver Database Design (Draft)

**Owner:** Yong Hsien · **Last updated:** 24 Oct 2026 · **Database:** Amazon DynamoDB

## 1. Entity Relationship Diagram

```mermaid
erDiagram
    PRODUCT ||--o{ PRICE_SUBMISSION : "is priced in"
    RETAILER ||--o{ PRICE_SUBMISSION : "is observed at"
    USER ||--o{ PRICE_SUBMISSION : "submits"
    USER |o--o{ PRICE_SUBMISSION : "reviews (admin)"

    PRODUCT {
        string id PK "UUID"
        string name "Meiji Low Fat Milk"
        string brand "Meiji"
        number packQty "2 - size of one unit"
        string packUnit "L, ml, kg, g, pcs, rolls"
        number packCount "6 - units per pack, e.g. 6 x 180 ml cans"
        string category "milk"
        boolean hcs "Healthier Choice Symbol"
        list dietary "halal, vegetarian - optional"
        list searchTerms "lowfat, lf, hcs, etc"
        number minCents "152 - lowest believable price per pack"
        number maxCents "645 - highest believable price per pack"
    }

    RETAILER {
        string id PK "fairprice, shengsiong, coldstorage"
        string name "FairPrice"
    }

    PRICE_SUBMISSION {
        string productId PK "reference to PRODUCT.id (UUID)"
        string sk PK "retailerId#observedAt#submissionId"
        string submissionId "UUID"
        string retailerId "reference to RETAILER.id - fairprice"
        string userId "reference to USER.userId (Cognito sub)"
        number priceCents "395 = regular price of one pack"
        string observedAt "2026-10-18T02:32:00.000Z"
        string submittedAt "2026-10-18T02:35:00.000Z"
        string status "accepted, flagged, rejected"
        string photoKey "optional - S3 key"
        string photoContentType "optional - image/jpeg or image/png"
        number photoSizeBytes "optional - 1830042"
        string reviewedAt "optional - when an admin decided"
        string reviewedBy "optional - admin's USER.userId"
        string rejectionReason "optional - required when rejected"
    }

    USER {
        string userId PK "Cognito sub"
        string displayName "Yong Hsien"
        string email "yh@example.com"
        number submissionCount "12"
        string createdAt "2026-10-18T02:00:00.000Z"
    }
```

## 2. DynamoDB Tables and Indexes

One table per entity, named `trolleysaver-<env>-<entity>` (e.g. `trolleysaver-dev-price-submission`).

```mermaid
flowchart LR
    Q4(["Dropdowns, search,<br/>healthier options"]) --> PR
    Q6(["Retailer list"]) --> RT
    Q1(["All prices for a product"]) --> PS
    Q2(["All prices at a retailer"]) --> G1
    Q3(["My submissions,<br/>rate limit"]) --> G2
    Q7(["Admin review queue<br/>(flagged prices)"]) --> G3
    Q5(["User profile"]) --> US

    PR["<b>product</b><br/>PK: id<br/><i>24 items</i>"]
    RT["<b>retailer</b><br/>PK: id<br/><i>3 items</i>"]
    PS["<b>price-submission</b><br/>PK: productId<br/>SK: retailerId + observedAt + id"]
    G1["<b>GSI ByRetailer</b><br/><i>auto-copy of price-submission</i><br/>PK: retailerId<br/>SK: observedAt"]
    G2["<b>GSI ByUser</b><br/><i>auto-copy of price-submission</i><br/>PK: userId<br/>SK: submittedAt"]
    G3["<b>GSI ByStatus</b><br/><i>auto-copy of price-submission</i><br/>PK: status<br/>SK: submittedAt"]
    US["<b>user</b><br/>PK: userId"]

    PS -.-> G1
    PS -.-> G2
    PS -.-> G3

    classDef table fill:#e8f1ff,stroke:#3b6fd8,color:#111
    classDef index fill:#fff4dd,stroke:#c98a00,color:#111
    classDef query fill:#f2f2f2,stroke:#888,color:#111
    class PR,RT,PS,US table
    class G1,G2,G3 index
    class Q1,Q2,Q3,Q4,Q5,Q6,Q7 query
```

**Notes:**
- **Regular shelf prices only.** Promotions, member prices and multi-buy deals are not tracked. There are no price-type, offer-condition or offer-end-date fields, and promo rows in the data spreadsheet are not loaded.
- Prices are recorded per retailer (FairPrice, Sheng Siong, Cold Storage), not per branch. Retailer ids are `fairprice`, `shengsiong` and `coldstorage`.
- Prices are in cents (`395` = $3.95). Timestamps are UTC ISO 8601 with milliseconds.

## 3. Price status and moderation

Moderation is **reactive**: admins only look at prices that look wrong.

```mermaid
stateDiagram-v2
    [*] --> accepted: price within minCents..maxCents
    [*] --> flagged: price outside the range
    flagged --> accepted: admin accepts
    flagged --> rejected: admin rejects (reason required)
```

- On submission, the backend compares `priceCents` with the product's `minCents`/`maxCents`. In-range prices are saved as `accepted` and can be used straight away. Out-of-range prices are saved as `flagged`.
- Admins (Cognito group `admin`) list flagged prices through the `ByStatus` index and move each one to `accepted` or `rejected`. A decision can only be made once, and a second admin decision is refused.
- Only `accepted` prices should be used for search, comparison and the smart basket. `flagged` and `rejected` prices are ignored.
- Letting users flag each other's submissions is a possible future feature and is not part of this design.

## 4. Other rules enforced by the backend

- `productId` and `retailerId` must exist before a submission is saved.
- Rate limit: 30 submissions per user per hour, counted with the `ByUser` index.
- Duplicates: the same user, product, retailer and price on the same Singapore calendar day is refused.
- `observedAt` cannot be in the future or more than 30 days old.
- `photoKey` must point at an object the same user uploaded (`price-evidence/<userId>/…`), which must be a JPEG or PNG of at most 5 MiB.
- The `user` row is created at sign-up. `submissionCount` goes up by one with each submission.
- Seed prices loaded from the data spreadsheet use `userId = "seed-team"` and `status = "accepted"`.

## Abbreviations

| Abbreviation | Meaning |
| --- | --- |
| PK | Primary key. In the ER diagram it marks the fields that make up a record's key. In the DynamoDB diagram it means **partition key**, the field that groups records together |
| SK / `sk` | Sort key: orders records within a partition and keeps each one unique. In `price-submission`, `sk` = `retailerId#observedAt#submissionId` |
| Reference | Not an abbreviation, but worth noting: a field that stores another item's id (e.g. `retailerId` → RETAILER). DynamoDB has no foreign keys or joins, so nothing enforces these links; the backend checks the id exists before saving |
| GSI | Global Secondary Index: an automatically kept copy of a table, organised by a different key so it can be searched another way |
| HCS / `hcs` | Healthier Choice Symbol: the Health Promotion Board label for healthier products |
| UUID | Universally Unique Identifier: a randomly generated id, e.g. `9f1c2b7e-…` |
| S3 | Amazon Simple Storage Service: where shelf-tag photos are stored |
| L, ml, kg, g, pcs | Litres, millilitres, kilograms, grams, pieces (`packUnit` values) |
