# Daily Updates

Newest entry first. Each entry covers: **Done**, **Decisions**, **Next**, **Blockers / Needs from others**.

---

## 18 Oct 2026 (Sat): Yong Hsien

**Done**
- Read the Preliminary Report and Project Specification and listed every way the app needs to read or write data.
- Drafted the database design: [database-design.md](../architecture/database-design.md).
- Drafted the system architecture: [ARCHITECTURE.md](../architecture/ARCHITECTURE.md).
- Set up a local Python environment for backend work (not yet used for code).

**Decisions (draft, open for team comments)**
- Pilot: 3 retailers × 2 branches = 6 branches; 10 products = 5 categories × (regular + Healthier Choice).
- 3 DynamoDB tables (`Catalog`, `PriceSubmissions`, `Users`) + 2 indexes (by branch, by user).
- Prices recorded per branch; a missing price is borrowed from the other branch of the same retailer and labelled.
- Deals stored as structured fields (`minQty` + total `priceCents`); money in whole cents.
- Out-of-range prices are flagged and ignored until a second user confirms the same price.
- Staleness: regular 30 days; promo/member 7 days or the offer end date.
- Proposed: Python Lambdas, AWS SAM for infrastructure, DynamoDB on-demand + budget alarm.

**Next**
- Collect team feedback on the database design.
- Once products and branches are agreed: create the seed catalog and price ranges.
- Build the tables locally and start on the submission and price-lookup logic.
---

<!-- Template: copy for a new day

## DD Mon YYYY (Day): Name

**Done**
-

**Decisions**
-

**Next**
-

**Blockers / Needs from others**
-

-->
