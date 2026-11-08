# What I found: frontend polish review

**Reviewed:** `main` at b59fe7d (after PR #15) · **Date:** 6 Nov 2026
**Pages:** Smart Basket · Search · Contribute (contributor + admin) · Log in · Register

> **Status, 8 Nov:** findings 1–17 were addressed in the 6 Nov redesign ("Revamped UI and added enhancements") and the changes since. For example, dark mode now switches on, there's a light/dark toggle, the fonts are bundled, store names come from the catalogue, and "Potential savings, up to —" is gone. The data item under "Outside this pass" is separate and not checked here. Kept as a record of the review.

The findings are grouped in the order I'd fix them. File paths are relative to the repository root.

## Broken or misleading (5)

1. **Dark-mode colours never switch on.**
   Tailwind is set to class-based dark mode (`darkMode: ["class"]`), but the theme follows the system setting (`prefers-color-scheme`). Every `dark:` class does nothing. Amber and green status text stays at its light-mode shade, about 3:1 contrast on dark cards.
   - [frontend/tailwind.config.ts](../../frontend/tailwind.config.ts)
   - [frontend/src/pages/smart-basket.tsx:638](../../frontend/src/pages/smart-basket.tsx#L638) and [:646](../../frontend/src/pages/smart-basket.tsx#L646)
   - [frontend/src/pages/contribute.tsx:60-62](../../frontend/src/pages/contribute.tsx#L60-L62) and [:557](../../frontend/src/pages/contribute.tsx#L557)

2. **Category icons vanish in dark mode.**
   The fallback product icons are drawn in solid black lines, so they disappear on dark panels.
   - [frontend/assets/product-icons/](../../frontend/assets/product-icons/)
   - [frontend/src/pages/search-products.tsx](../../frontend/src/pages/search-products.tsx)

3. **"Potential savings, up to —"**
   The savings tile shows a dash before anything has been compared, and the label reads backwards.
   - [frontend/src/pages/smart-basket.tsx:512-520](../../frontend/src/pages/smart-basket.tsx#L512-L520)

4. **White halo around focus rings.**
   Buttons and inputs use `ring-offset` without an offset colour, so keyboard focus shows a white ring on dark surfaces.
   - [frontend/src/components/ui/button.tsx](../../frontend/src/components/ui/button.tsx)
   - [frontend/src/components/ui/input.tsx](../../frontend/src/components/ui/input.tsx)

5. **A page inside a page.**
   The "submissions not configured" fallback puts a second `<main>` inside the app shell's `<main>`.
   - [frontend/src/pages/contribute.tsx:762](../../frontend/src/pages/contribute.tsx#L762)

## Pages that drifted apart (6)

6. **Smart Basket doesn't look like the other pages.**
   It uses solid cards; Search, Contribute and Log in use the glass panels (`.glass-panel`).

7. **Three ways of writing a price.**
   Smart Basket shows "$2.88" (formatted with `Intl.NumberFormat`). Search and Contribute build the string by hand (`$` + `toFixed(2)`), and Contribute adds "SGD". Fix: one shared formatter.

8. **Three Healthier Choice badges.**
   Each page styles its own. Fix: one badge, with the leaf icon the swap dialog already uses.

9. **Three page-heading styles.**
   They mix bold and semibold, use different sizes, and some have small uppercase labels above the heading ("Contributor workspace", "Administrator workspace", "A little help with the everyday shop"). Fix: one page header for every page.

10. **Three drop-down styles.**
    Smart Basket filters, Search filters and the Contribute form each style `select` differently.

11. **Product suggestions have no background.**
    `bg-popover` isn't a defined colour in the Tailwind config, so the Contribute product list sits straight on the glass.
    - [frontend/src/pages/contribute.tsx:444](../../frontend/src/pages/contribute.tsx#L444)

## Finishing (6)

12. **Basket rows without a photo show a gap.**
    Search falls back to the category icon. Smart Basket and the swap dialog show nothing, so rows don't line up.

13. **The groceries list cuts a row in half.**
    Nothing says the list scrolls. Fix: a soft fade at the bottom edge and a product count.

14. **Search cards nest a box in a box.**
    The price sits in its own bordered box inside the card, with a tall gap above the tags.

15. **Inter is named but never loaded.**
    Anyone without Inter installed gets Segoe UI or the system font. Fix: bundle it with the app.

16. **Browser defaults left in place.**
    Scrollbars, the text caret and number-field spinners ignore the palette.

17. **Retailer names hard-coded in Search.**
    Smart Basket uses the names from the API. Search keeps its own `RETAILER_NAMES` list, which will drift.
    - [frontend/src/pages/search-products.tsx:63-67](../../frontend/src/pages/search-products.tsx#L63-L67)

## Outside this pass

- **Data:** the catalogue spells one brand "Chew'S". That's a data fix on the backend side, not part of the frontend polish.
