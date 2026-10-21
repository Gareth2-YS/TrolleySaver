# Feature implementation handoff

## Purpose

Authentication and the shared application shell are ready. The three product routes intentionally render only the shared header so feature owners can take over without deleting placeholder implementation. This document explains where to resume.

## Routes and access

| Feature | Route | Access | Current state |
| --- | --- | --- | --- |
| Smart Basket | `/basket` | Public | Header only |
| Search & Filter | `/search` | Public | Header only |
| Price & Image Upload | `/contribute` | Signed-in user or admin | Header only |

Smart Basket and Search must remain usable without an account. Price/Image Upload remains protected by `ProtectedRoute`; unauthenticated visitors are sent to login and returned to `/contribute` afterward.

## Starting points

- `frontend/src/pages/smart-basket.tsx`
- `frontend/src/pages/search-products.tsx`
- `frontend/src/pages/contribute.tsx`
- Shared header/navigation: `frontend/src/components/layout/app-shell.tsx`
- Route definitions: `frontend/src/app.tsx`
- Session and role data: `frontend/src/auth/auth-context.tsx`

Do not duplicate or replace the shared header. Render each feature inside `AppShell` and preserve its responsive mobile navigation.

## UX references

The guiding source is `docs/ux/trolleysaver-four-wireframes.html`. Supporting captures are catalogued in `docs/ux/README.md`:

- `docs/ux/smart-basket-reference.png`
- `docs/ux/search-filter-reference.png`

Preserve the wireframe's typography, dark-green/off-white palette, fine borders, rounded controls, compact spacing, and clear hierarchy. The shell already provides a restrained aurora background and glass treatment. Use glassmorphism and bento grids only where they clarify grouping—for example basket/price comparison panels—not on every element.

## Feature expectations

### 1. Smart Basket

- Add/remove products and adjust quantities.
- Compare complete basket totals across stores.
- Clearly identify missing prices and coverage.
- Offer healthier alternatives without forcing a substitution.
- Keep basket access public. Decide with the backend whether anonymous baskets live in local storage and migrate after login.

### 2. Search & Filter

- Search by product and brand.
- Filter by category and Healthier Choice status.
- Show clear loading, results, empty, and error states.
- Add products to the anonymous/public basket.
- Keep query/filter state URL-friendly where practical.

### 3. Price & Image Upload

- Require an authenticated session.
- User view: select product/store/branch, enter price details, and optionally upload shelf-tag evidence.
- Admin view: show the approval queue and moderation actions based on the authenticated `admin` group claim.
- Never infer admin rights from a UI control; use the role exposed by the auth context and rely on backend authorization.
- Validate image type/size before upload and preserve accessible form labels and errors.

## Backend/API coordination

Before wiring data, agree on contracts for product search, baskets, price comparisons, price submissions, evidence upload, and admin decisions. Authenticated requests should obtain a token with `getAccessToken()` and send `Authorization: Bearer <access-token>`. The backend must enforce all permissions.

Avoid implementing fake production data inside the feature pages. Local fixtures should be isolated and clearly identified as development-only.

## Testing expectations

- Unit-test calculations, schemas, and reducers.
- Component-test loading, empty, populated, validation, and error states.
- Verify public routes work without a session.
- Verify `/contribute` redirects anonymous users to login and returns them after authentication.
- Verify user/admin contribution views are selected from the real session role.
- Check desktop and mobile layouts against the UX references.

Run before handoff:

```powershell
cd frontend
npm run test
npm run typecheck
npm run lint
npm run build
```
