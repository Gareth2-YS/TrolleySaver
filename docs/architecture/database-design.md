# TrolleySaver Database Design (Draft)

**Owner:** Yong Hsien · **Last updated:** 19 Oct 2026 · **Database:** Amazon DynamoDB

## 1. Entity Relationship Diagram

```mermaid
erDiagram
    PRODUCT ||--o{ PRICE_SUBMISSION : "is priced in"
    RETAILER ||--o{ PRICE_SUBMISSION : "is observed at"
    USER ||--o{ PRICE_SUBMISSION : "submits"
    USER }o--o{ RETAILER : "is member of"

    PRODUCT {
        string type PK "PRODUCT"
        string id PK "UUID"
        string name "Meiji Low Fat Milk"
        string brand "Meiji"
        number packQty "2"
        string packUnit "L, ml, kg, g, pcs"
        string category "milk"
        boolean hcs "Healthier Choice Symbol"
        list searchTerms "lowfat, lf, hcs, etc"
        number minCents "152 - lowest normal unit price"
        number maxCents "645 - highest normal unit price"
    }

    RETAILER {
        string type PK "RETAILER"
        string id PK "fairprice"
        string name "FairPrice"
        string membershipName "Linkpoints"
    }

    PRICE_SUBMISSION {
        string productId PK, FK "UUID of the product"
        string sk PK "retailerId#observedAt#submissionId"
        string retailerId FK "fairprice"
        string userId FK "Cognito user id"
        string priceType "regular, promo, member"
        number minQty "2"
        number priceCents "500 = 2 for 5 dollars"
        string observedAt "2026-10-18T02:32:00Z"
        string submittedAt "2026-10-18T02:35:00Z"
        string status "accepted, flagged"
        string conditionNote "optional"
        string offerEndDate "optional"
        string photoKey "optional - S3 path"
        string confirmedBy "optional - second user"
    }

    USER {
        string userId PK "Cognito user id"
        string displayName "Yong Hsien"
        list memberships "fairprice, shengsiong - any number of retailer ids"
        number submissionCount "12"
        string createdAt "2026-10-18T02:00:00Z"
    }
```

## 2. DynamoDB Tables and Indexes

```mermaid
flowchart LR
    Q4(["Dropdowns, search,<br/>healthier options"]) --> CAT
    Q1(["All prices for a product"]) --> PS
    Q2(["All prices at a retailer"]) --> G1
    Q3(["My submissions,<br/>rate limit"]) --> G2
    Q5(["Memberships"]) --> US

    CAT["<b>Catalog</b><br/>PK: type<br/>SK: id<br/><i>20 products, 3 retailers</i>"]
    PS["<b>PriceSubmissions</b><br/>PK: productId<br/>SK: retailerId + observedAt + id"]
    G1["<b>GSI ByRetailer</b><br/><i>auto-copy of PriceSubmissions</i><br/>PK: retailerId<br/>SK: observedAt"]
    G2["<b>GSI ByUser</b><br/><i>auto-copy of PriceSubmissions</i><br/>PK: userId<br/>SK: submittedAt"]
    US["<b>Users</b><br/>PK: userId"]

    PS -.-> G1
    PS -.-> G2

    classDef table fill:#e8f1ff,stroke:#3b6fd8,color:#111
    classDef index fill:#fff4dd,stroke:#c98a00,color:#111
    classDef query fill:#f2f2f2,stroke:#888,color:#111
    class CAT,PS,US table
    class G1,G2 index
    class Q1,Q2,Q3,Q4,Q5 query
```

**Notes:** prices are recorded per retailer (FairPrice, Sheng Siong, Cold Storage), not per branch · prices are in cents (`395` = $3.95) · `flagged` prices are ignored until a second user submits the same price.

## Abbreviations

| Abbreviation | Meaning |
| --- | --- |
| PK | Primary key. In the ER diagram it marks the fields that make up a record's key. In the DynamoDB diagram it means **partition key**, the field that groups records together |
| SK / `sk` | Sort key: orders records within a partition and keeps each one unique. In PriceSubmissions, `sk` = `retailerId#observedAt#submissionId` |
| FK | Foreign key: a field that refers to a record in another entity (e.g. `retailerId` → RETAILER) |
| GSI | Global Secondary Index: an automatically kept copy of a table, organised by a different key so it can be searched another way |
| HCS / `hcs` | Healthier Choice Symbol: the Health Promotion Board label for healthier products |
| UUID | Universally Unique Identifier: a randomly generated id, e.g. `9f1c2b7e-…` |
| S3 | Amazon Simple Storage Service: where shelf-tag photos are stored |
| L, ml, kg, g, pcs | Litres, millilitres, kilograms, grams, pieces (`packUnit` values) |
