# TrolleySaver Database Design (Draft)

**Owner:** Yong Hsien · **Last updated:** 22 Oct 2026 · **Database:** Amazon DynamoDB

## 1. Entity Relationship Diagram

```mermaid
erDiagram
    PRODUCT ||--o{ PRICE_SUBMISSION : "is priced in"
    RETAILER ||--o{ PRICE_SUBMISSION : "is observed at"
    USER ||--o{ PRICE_SUBMISSION : "submits"

    PRODUCT {
        string id PK "UUID"
        string name "Meiji Low Fat Milk"
        string brand "Meiji"
        number packQty "2"
        string packUnit "L, ml, kg, g, pcs"
        string category "milk"
        boolean hcs "Healthier Choice Symbol"
        list dietary "halal, vegetarian - optional"
        list searchTerms "lowfat, lf, hcs, etc"
        number minCents "152 - lowest believable price per pack"
        number maxCents "645 - highest believable price per pack"
    }

    RETAILER {
        string id PK "fairprice"
        string name "FairPrice"
    }

    PRICE_SUBMISSION {
        string productId PK "reference to PRODUCT.id (UUID)"
        string sk PK "retailerId#observedAt#submissionId"
        string retailerId "reference to RETAILER.id - fairprice"
        string userId "reference to USER.userId (Cognito id)"
        number priceCents "395 = regular price of one pack"
        string observedAt "2026-10-18T02:32:00Z"
        string submittedAt "2026-10-18T02:35:00Z"
        string status "accepted, flagged"
        string photoKey "optional - S3 path"
        string confirmedBy "optional - second user"
    }

    USER {
        string userId PK "Cognito user id"
        string displayName "Yong Hsien"
        number submissionCount "12"
        string createdAt "2026-10-18T02:00:00Z"
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
    Q5(["User profile"]) --> US

    PR["<b>product</b><br/>PK: id<br/><i>20 items</i>"]
    RT["<b>retailer</b><br/>PK: id<br/><i>3 items</i>"]
    PS["<b>price-submission</b><br/>PK: productId<br/>SK: retailerId + observedAt + id"]
    G1["<b>GSI ByRetailer</b><br/><i>auto-copy of price-submission</i><br/>PK: retailerId<br/>SK: observedAt"]
    G2["<b>GSI ByUser</b><br/><i>auto-copy of price-submission</i><br/>PK: userId<br/>SK: submittedAt"]
    US["<b>user</b><br/>PK: userId"]

    PS -.-> G1
    PS -.-> G2

    classDef table fill:#e8f1ff,stroke:#3b6fd8,color:#111
    classDef index fill:#fff4dd,stroke:#c98a00,color:#111
    classDef query fill:#f2f2f2,stroke:#888,color:#111
    class PR,RT,PS,US table
    class G1,G2 index
    class Q1,Q2,Q3,Q4,Q5,Q6 query
```

**Notes:** MVP stores **regular shelf prices only** (no promotions, member prices or multi-buy deals) · prices are recorded per retailer (FairPrice, Sheng Siong, Cold Storage), not per branch · prices are in cents (`395` = $3.95) · `flagged` prices are ignored until a second user submits the same price.

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
