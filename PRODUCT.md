# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary: the planning shopper at home.** A Singapore household member building a grocery basket before a shopping trip, on a laptop or phone, deciding which of the three supermarkets to go to. They want one clear answer ("go to this store, it saves you $X") and are open to swapping in healthier products when the cost difference is shown.

**Secondary (confirmed roles in the product):**
- **Contributors:** signed-in users who submit shelf-tag prices, optionally with a photo as evidence, and propose products missing from the catalogue.
- **Admins:** moderate flagged price submissions and approve or reject new product requests.

**Evaluators:** the CS5224 teaching team, who judge the working demo, reports and presentation.

## Product Purpose

TrolleySaver compares grocery prices across FairPrice, Sheng Siong and Cold Storage so a shopper can see which store is cheapest for their *whole basket*, next to a healthier version of that basket and what it would cost. Prices come from the community and are checked before they count.

Right now success means a working, credible CS5224 course demo on AWS. The pilot scope (3 retailers, a small seeded catalogue of roughly two dozen products) is enough; a public launch is not a goal.

## Positioning

Three mechanisms together, none of which a typical single-item price site can truthfully claim:

1. **Whole-basket comparison.** The full basket is priced at every store, the stores are ranked, and the savings are shown. Partial comparisons are labelled honestly (e.g. "on the 2 items both stores price").
2. **Healthier basket with a cost delta.** Each product is swapped for a Healthier Choice Symbol (HCS) product where its category has one, and the extra (or saved) cost against the cheapest basket is shown.
3. **Crowdsourced, photo-verified prices.** Shelf-tag submissions are range-checked, rate-limited, de-duplicated and backed by photo evidence. Outliers are flagged for admin review. Accepted prices are averaged nightly into each store's current price.

## Operating Context

- **Smart Basket** (`/basket`, public, the default route): pick groceries, compare the cheapest store and the healthier basket, and see per-store shopping lists, unpriced items and savings.
- **Search & Filter** (`/search`, public): find products by name or brand; filter by category, brand, dietary option, Healthier Choice and price; open a product to see each store's price.
- **Contribute** (`/contribute`, sign-in required): submit a price with an optional shelf-tag photo, see your own submissions, and request a new product. Admins get the moderation queues here too.
- **Auth:** email sign-up through Cognito (confirmed automatically); `user` and `admin` groups.
- Prices update once a day: a scheduled job at 00:05 SGT averages the previous day's accepted submissions per product and store.
- All users are in Singapore; prices are in SGD.

## Capabilities and Constraints

- **Stack (existing):** React + TypeScript + Vite + Tailwind (shadcn-style UI primitives, Radix, lucide icons, motion) in `frontend/`. Serverless AWS backend in `backend/` (API Gateway, Python 3.12 Lambdas, DynamoDB, S3, Cognito, EventBridge), deployed with SAM to ap-southeast-1. Frontend hosting on S3 + CloudFront is decided but not built; the frontend runs locally for now.
- **Retailers:** FairPrice, Sheng Siong, Cold Storage. Prices are per retailer, not per branch.
- **Terminology:** *Healthier Choice* / HCS (Healthier Choice Symbol); *retailer* / store; *price submission* with status `accepted`, `flagged` or `rejected`; *product request* with status `pending`, `approved` or `rejected`; *shelf-tag photo* / evidence; *Smart Basket*; *healthier basket*.
- **Data honesty:** a price can be missing for a store. Unpriced items and partial comparisons must be shown as such, never filled in or hidden. The healthier basket can be cheaper than the cheapest basket, so the delta can be negative.
- Money is handled in whole cents. Evidence photos are private (admins see them through short-lived signed links). Product pictures are optional; category icons are the fallback.
- **Undecided:** per-branch pricing, promotions and member prices, and staleness rules appear in early design notes but are not in the built product. Don't present them as features.

## Brand Commitments

- Name: **TrolleySaver** (one word, capital T and S).
- The current wordmark pairs the name with a shopping-cart icon (`frontend/src/components/auth/brand.tsx`). This is incumbent, not a binding commitment the user has confirmed.

## Evidence on Hand

- Seed catalogue and ground-truth prices: `data/products 241026.xlsx` (loaded by `backend/scripts/seed_catalog.py`).
- Category icons: `frontend/assets/product-icons/*.svg`.
- UX wireframes and reference captures: `docs/ux/trolleysaver-four-wireframes.html`, `docs/ux/search-filter-reference.png`, `docs/ux/smart-basket-reference.png`.
- Course documents: `docs/Preliminary Report.pdf`, `docs/Project Specification.pdf`.
- **Absent, do not fabricate:** testimonials, user counts, real usage or savings statistics, press, partnerships or endorsements from the retailers or the Health Promotion Board, pricing tiers, and claims of a public launch.

## Product Principles

1. **One clear answer first.** Lead with the cheapest store for the whole basket and the saving; per-item detail supports that answer.
2. **Health is an informed trade-off, not a lecture.** Show the healthier basket next to the cheapest one with its real cost difference, and let the shopper choose.
3. **Never overstate the data.** Label missing prices, partial comparisons and community-sourced figures plainly. A credible, honest comparison beats a complete-looking one.
4. **Contributing should be quick and worth trusting.** Submitting a price takes seconds; the checks that keep the data honest are visible and fair.
5. **Demo-credible at pilot scale.** Everything shown must actually work end to end on the small catalogue. Don't add features that only exist as mock-ups.
