# Manual UI test cases

A checklist for testing the TrolleySaver web app by hand in a browser, page by page. Each case says what to do and what you should see, quoting the text on screen. The cases were written from the frontend code (`frontend/src`) on 4 Nov 2026, and updated on 6 Nov for the redesigned Smart basket, enlarging pictures, the review fixes, the deployed site, and then the new look, the log-in window, loading spinners, the Healthier Choice Symbol on the new product form, and modals that keep the page behind them still. On 7–8 Nov they were brought up to date with the redesigned price upload page and "Your submissions" list, the theme toggle, deleting pending prices, and the filters that count their options; every quoted text was checked against the code on 8 Nov.

⭐ marks the **key** cases: the ones that must pass before a demo, a handoff or the final report.

The automated tests (backend, frontend, smoke test) are run by one script instead: see [Running the automated tests](#running-the-automated-tests) at the bottom.

## Before you start

- **Testing the deployed site** ([11. Deployed site](#11-deployed-site)) needs no local setup: open the site URL printed by `python infra\deploy.py` (the stack output `SiteUrl`). Everything below is for running the app locally.
- **Point the app at dev.** In `frontend/.env.local` (copy it from `.env.example`, see [frontend/README.md](../../frontend/README.md#run-it-locally)):
  - `VITE_AUTH_MODE=cognito`, `VITE_PRICE_SUBMISSION_MODE=api`, `VITE_SMART_BASKET_MODE=api`
  - `VITE_API_BASE_URL`, `VITE_AWS_REGION`, `VITE_COGNITO_USER_POOL_ID` and `VITE_COGNITO_CLIENT_ID`, from the dev stack's outputs ([backend/README.md → Environment](../../backend/README.md#environment)). Don't commit these values.

  Then run `npm run dev` in `frontend/` and open `http://localhost:5173`.
- **Accounts:** a contributor account (register one in [2. Register and log in](#2-register-and-log-in)) and an admin account (made with `create_admin.py`, see [backend/TESTING.md §5](../../backend/TESTING.md#5-create-an-admin-account)). Some cases need a second contributor.
- **Screen sizes:** test on desktop (about 1440 px wide) and on a phone width (390 px, using the browser's device toolbar).
- **Test images:** a JPG or PNG under 5 MB, a PNG over 5 MB, a GIF, and an empty (0-byte) `.png` file.
- **Dev is shared with the team.** Use made-up products such as "Test Oat Milk", and delete or reject what you create.

## How to update this file

- **Status:** `Not done`, `Done <date>` (e.g. `Done 5 Nov`), or `Failed <date>`. For a failure, say what happened in **Notes**. A case for a screen that doesn't exist yet is `Not done – frontend not built yet`.
- Update the counts in the summary when you change a status.
- When a page changes, change its cases to match, and add cases for new features.

## Summary

| Section | Cases | Key ⭐ | Done |
|---|--:|--:|--:|
| [1. Navigation and access](#1-navigation-and-access) | 12 | 6 | 0 |
| [2. Register and log in](#2-register-and-log-in) | 17 | 5 | 1 |
| [3. Search & filter](#3-search--filter) | 22 | 8 | 0 |
| [4. Smart Basket](#4-smart-basket) | 23 | 11 | 0 |
| [5. Contributor: submit a price](#5-contributor-submit-a-price) | 28 | 11 | 0 |
| [6. Contributor: new product requests](#6-contributor-new-product-requests) | 26 | 12 | 0 |
| [7. Admin: price review](#7-admin-price-review) | 8 | 4 | 0 |
| [8. Admin: product request review](#8-admin-product-request-review) | 10 | 5 | 0 |
| [9. Price freshness](#9-price-freshness) | 7 | 2 | 0 |
| [10. Known issues](#10-known-issues) | 2 | 0 | 0 |
| [11. Deployed site](#11-deployed-site) | 10 | 6 | 1 |
| [12. Look and feel](#12-look-and-feel) | 11 | 4 | 0 |
| **Total** | **176** | **74** | **2** |

## 1. Navigation and access

| ID | Steps | Expected result | Key | Status | Notes |
|---|---|---|:-:|---|---|
| NAV-01 | Signed out, open `/basket`, then `/search`. | Both pages open without logging in. The dark-green header shows the TrolleySaver logo, "Smart basket", "Search & filter", "Price & image upload" and a light-green "Log in" button. The current page's link is underlined in light green. | ⭐ | Not done | |
| NAV-02 | Signed out, click "Price & image upload" (or open `/contribute`). Log in as a contributor. | The log-in window opens over Smart basket, saying "Log in to share a price. You’ll go straight to Price & image upload afterwards." After logging in you land on `/contribute`. | ⭐ | Not done | |
| NAV-03 | Open `/nothing-here`, then `/app`, then `/admin`. | `/nothing-here` goes to `/basket`. `/app` and `/admin` go to `/contribute` (or to `/login` when signed out). | | Not done | |
| NAV-04 | Log in as a contributor. | The header shows all three links, a chip with your name and "Sign out". The TrolleySaver logo goes to `/basket`. | ⭐ | Not done | |
| NAV-05 | Log in as an admin. | The header shows only "Price & image upload", a chip with your name and "Sign out". The logo goes to `/contribute`. Typing `/basket` or `/search` still opens them. | ⭐ | Not done | |
| NAV-06 | While signed in, open `/login`, then `/register`. | No log-in window opens. A contributor goes to `/basket`, an admin to `/contribute`. | | Not done | |
| NAV-07 | Click "Sign out", then open `/contribute`. | You land on `/basket` and the header shows "Log in". `/contribute` asks you to log in again. | | Not done | |
| NAV-08 | At phone width, tap the menu button ("Open menu"). Choose a link. | A dark-green menu lists the links and "Log in" or "Sign out". Choosing a link opens it and closes the menu. The desktop links are hidden at this width. | | Not done | |
| NAV-09 | At phone width, open every page: Smart basket, Search & filter, the log-in and register windows, and `/contribute` as a contributor and as an admin. | Nothing needs sideways scrolling. Buttons, fields and dialogs fit the screen and can be used; the log-in window fills the screen. On the Smart basket, the basket comes after the product search. | | Not done | |
| NAV-10 | Signed in, refresh `/contribute`. | "Loading your session…" shows briefly, then the same page, still signed in. | ⭐ | Not done | |
| NAV-11 | **Sign-in setup problem.** Delete the `VITE_COGNITO_USER_POOL_ID` value in `.env.local`, restart `npm run dev`, and open `/login`. Then open `/basket`. Put the value back afterwards. | The log-in window shows "Sign-in isn't available", the error message, and "Check the settings in frontend/.env.local, then reload the page." It doesn't stay on "Loading your session…". `/basket` still works. | ⭐ | Not done | Fixed 4 Nov: it used to load forever. |
| NAV-12 | Build in mock mode: set `VITE_AUTH_MODE=mock`, run `npm run build` then `npm run preview`, and open the preview. Set it back afterwards. | The app doesn't start. The browser console shows "Mock authentication is disabled in production. Configure Cognito before building for production." | | Not done | |

## 2. Register and log in

Since 6 Nov, Log in and Register open as a window over the page you're on, and there is one log-in for everyone: the account's role decides where it lands.

| ID | Steps | Expected result | Key | Status | Notes |
|---|---|---|:-:|---|---|
| AUTH-01 | Click "Log in" in the header, switch to "Register", enter a full name, a new email and a strong password twice, then click "Create my account". Log in with the new account. | "Account created. You can log in now." and the window switches to "Log in". After logging in, the window closes and you're still on the page underneath. "Price & image upload" shows "Share a price you spotted", with no admin features. | ⭐ | Not done | |
| AUTH-02 | On Register, click "Create my account" with every field empty. Then try a bad email, a weak password ("password1") and a different confirmation. | Empty: "Enter your full name", "Email is required", "Use at least 8 characters", "Confirm your password". Bad email: "Enter a valid email address". "password1": "Add an uppercase letter". A different confirmation: "Passwords do not match". | | Not done | |
| AUTH-03 | On Register, type a password a character at a time, e.g. `abcdefgh`, then `Abcdefgh`, `Abcdefg1`, `Abcdefg1!`. | Under "Keep your account in good hands", "8+ characters", "Upper & lowercase", "A number" and "A symbol" turn green one by one, and the bar fills to 4 of 4. | | Not done | |
| AUTH-04 | Register again with an email that already has an account. | "An account already exists for this email." | | Not done | |
| AUTH-05 | On Log in, enter a real email with a wrong password. Then an email with no account. | Both show "That email or password is not correct." | ⭐ | Not done | |
| AUTH-06 | On Search, click "Log in" and log in with a **contributor** account. | "Welcome back". The window closes and you stay on Search, signed in; the header shows your name and "Sign out". There's no "Choose your space", user or admin choice anywhere. | ⭐ | Not done | Changed 6 Nov: one log-in for everyone. |
| AUTH-07 | Log in with an **admin** account, using the same form. | "Welcome back", then `/contribute` with "Review price evidence". The header shows only "Price & image upload". | ⭐ | Not done | |
| AUTH-08 | On Search, click "Log in". Close the window with ✕; open it again and press Esc; open it again and click outside it. | The window opens over Search, which stays visible behind it. Each way closes it and leaves you on Search, with the focus back on "Log in". | ⭐ | Not done | |
| AUTH-09 | On Log in, click "Log in" with both fields empty. | "Email is required" and "Password is required". | | Not done | |
| AUTH-10 | Look at the log-in form. | Only "Email address", "Password", the "Log in" button and the "Join the community" link. There's no "Remember me" option and no account type. | | Not done | Removed 4 Nov: it did nothing. |
| AUTH-11 | Enter a wrong password many times in a row. | Eventually "Too many attempts. Please wait a moment and try again." | | Not done | Cognito sets the limit. |
| AUTH-12 | Go through registration and login. | No verification code, MFA, password-reset or new-password screens. | | Done 24 Oct | |
| AUTH-13 | In the window, switch between the "Log in" and "Register" tabs, and use the "Join the community" and "Log in" links. Watch the browser tab. Close the window. | It switches in place without closing. The browser tab reads "Log in · TrolleySaver" or "Register · TrolleySaver", and the page's own title again once the window closes. | | Not done | Added 6 Nov. |
| AUTH-14 | Open the window at 1440 px wide, then narrow the browser below 900 px, then to phone width. At 1440 px, click "Build a smarter basket". | Wide: "Good finds are better shared." on the left, with "Build a smarter basket", "Find your next good buy" and "Spotted a price worth sharing?". Below 900 px only the form shows; at phone width the window fills the screen. The shortcut closes the window and opens Smart basket. | | Not done | Added 6 Nov. |
| AUTH-15 | Open `/login` directly in a new browser tab, then close the window. | The window opens over Smart basket. Closing it leaves you on `/basket`. | | Not done | Added 6 Nov. |
| AUTH-16 | In Register, paste 100 characters into "Full name" and 300 into "Email address". | "Full name" stops at 80 characters and "Email address" at 254. The password boxes stop at 256. | | Not done | Added 6 Nov (security hardening). |
| AUTH-17 | In the browser console, run `copy('Alex\u202eTan')`, then paste it into "Full name" (the text has a hidden right-to-left override in it). Fill in the rest and click "Create my account". | "Your name can't contain hidden or control characters", and no account is created. | | Not done | Added 6 Nov. The sign-up trigger refuses it too if the form is bypassed. |

## 3. Search & filter

| ID | Steps | Expected result | Key | Status | Notes |
|---|---|---|:-:|---|---|
| SRCH-01 | Signed out, open `/search`. | "Search and filter groceries", a count like "24 of 24 products", and a card per product: its picture or category icon on a white tile, the name, brand · pack size (e.g. "6 × 180 ml"), and under a thin line the lowest price, e.g. "Lowest $3.63 at FairPrice". Healthier Choice products have a "Healthier Choice" badge with a leaf. | ⭐ | Not done | |
| SRCH-02 | Type "milk" in "Search product or brand". Then "magnolia milk". | About a third of a second after you stop typing, a spinner and "Updating…" show beside the count and the cards fade, then e.g. "5 of 24 products", with only matching products. "magnolia milk" shows only products matching **both** words. | ⭐ | Not done | |
| SRCH-03 | Turn on the "Healthier Choice only" switch beside "Filters", then turn it off. Also choose a Type in Filters with the switch on. | On: only products with the "Healthier Choice" badge. Off: everything again. Choosing a Type keeps the switch on, and the two combine. There's no row of quick filter chips (All, Cereal, Milk…). | ⭐ | Not done | Changed 7 Nov: the hand-picked quick filters were removed, and Healthier Choice became a switch. |
| SRCH-04 | Click "Filters". Choose a Type and a Brand, then a Dietary option. | The panel has "Type", "Brand", "Dietary" and "Lowest price range ($)" with "From" and "To". Each choice narrows the results. The button reads "Filters (2)" after Type and Brand. | | Not done | Changed 7 Nov: the count covers the panel's filters (Type, Brand, Dietary, each price box). The Healthier Choice switch shows its own state and isn't counted. |
| SRCH-05 | In the price range, enter From `2` and To `5`. | Only products whose lowest current price is $2.00 to $5.00 inclusive. Products with no current price disappear. | ⭐ | Not done | |
| SRCH-06 | Enter From `5` and To `2`. Then From `-1`. | "Minimum price must not be greater than maximum price." Then "Enter a valid minimum price of 0 or more." The results don't change while a message shows. | | Not done | |
| SRCH-07 | With a search, the Healthier Choice switch on and panel filters set, click "Clear search and filters". | The search box, the switch, Type, Brand, Dietary and both price boxes reset, and the whole catalog shows. | | Not done | |
| SRCH-08 | Search for "zzzz". | "No matching products", "Try a different search or clear some filters.", and a "Clear search and filters" button that resets everything. | | Not done | |
| SRCH-09 | Click a product's name. Close the dialog with ✕, then reopen it and press Esc, then reopen it and click outside it. | A dialog with the name, "Current retailer prices" (every store, each with its price and "Price date YYYY-MM-DD · N submissions", or "No current price"), and "Product information" (Category, Pack size, Healthier Choice Yes/No, Dietary). All three ways close it. | ⭐ | Not done | Since 6 Nov the store names come from the catalogue. |
| SRCH-10 | Find a product with no current price (e.g. one approved today). | Its card says "No current price available". | | Not done | |
| SRCH-11 | Click "Add to basket" on a card twice, then open Smart basket. | The button changes to "Add to basket (1)", then "Add to basket (2)". The basket has the product with quantity 2. At 99 the button is disabled. | ⭐ | Not done | |
| SRCH-12 | Look at a product published from a product request, and at a product the team loaded. | The published product shows its picture. The team's products show their category icon (milk carton, bread, egg…). | ⭐ | Not done | |
| SRCH-13 | Turn on "Offline" in the browser's network tools, change a filter, then go back online and change it again. | Offline: "Catalogue unavailable" with the error. Back online, results return. | | Not done | |
| SRCH-14 | Click a product's picture on its card. Close it with ✕, Esc, and by clicking outside it. Then open the product's details and click the picture there. | The picture opens large with the product's name, from the card and from the details. All three ways close it. | | Not done | Added 5 Nov. |
| SRCH-15 | Click the category icon of a product the team loaded (no picture). | The enlarged view shows the same category icon, not a broken image. | | Not done | |
| SRCH-16 | In the network tools, set throttling to "Slow 4G" (or "3G"), then reload `/search`. Turn throttling off afterwards. | While the catalogue loads: a spinner beside "Loading…" at the top, and a large spinner with "Loading products…" where the cards go. | | Not done | Added 6 Nov. |
| SRCH-17 | Paste 150 characters into "Search product or brand". | The box stops at 100 characters and results still load. There's no "Catalogue unavailable". | | Not done | Added 6 Nov. |
| SRCH-18 | Find a Healthier Choice product with a long name (or look at one at phone width), next to a product that isn't. | The "Healthier Choice" pill sits first among the card's labels (with e.g. "Soft Drinks" and "Halal"), in green. The pictures and names of cards in the same row start at the same height, and "Add to basket" sits bottom-right on every card. | | Not done | Changed 7 Nov: the pill used to sit above the name and push it down. |
| SRCH-19 | Open Filters and type `3.639` into "From". | The box shows `3.63`: a third decimal place can't be entered. | | Not done | Added 7 Nov. |
| SRCH-20 | Click "Filters" and open "Type", "Brand" and "Dietary". Choose a brand, then open "Type" again. Turn on "Healthier Choice only" and open them again. | Each option shows how many products it would give, e.g. "Milk (5)". Options that would give nothing aren't listed. Choosing a brand, or turning on the switch, narrows the other lists and their counts. | ⭐ | Not done | Added 8 Nov. |
| SRCH-21 | Set a Type, a Brand, the Healthier Choice switch and a price range. Look under the filters, then click each chip. | An "Applied filters" row shows a chip for each one: "Type: …", "Brand: …", "Healthier Choice only", "Price …". Clicking a chip removes just that filter, and the results update. | | Not done | Added 8 Nov. |
| SRCH-22 | Choose a Type and a Brand that go together (e.g. Milk and Magnolia), then search for a word that matches neither (e.g. "rice"). | "No matching products" and "Type: Milk and Brand: Magnolia don’t go together. Clear one to see what’s available.", with "Clear type", "Clear brand" and "Clear search and filters" buttons. Both pickers are outlined in amber with "Nothing fits your other filters". Each button clears what it says. | | Not done | Added 8 Nov. |

## 4. Smart Basket

Rewritten 6 Nov for the redesigned page (pictures, Healthier options, per-account baskets). Open `/basket`; "Reset" first if the basket isn't empty. Most cases need products priced at every store, and BSK-07 and BSK-08 need one that isn't (ask the backend team if dev has none).

| ID | Steps | Expected result | Key | Status | Notes |
|---|---|---|:-:|---|---|
| BSK-01 | Open `/basket` with an empty basket. Click "Browse groceries". | "Smart basket comparison", "Your basket is empty" and "Add groceries to compare the full basket total at every supermarket." "Price per item" says "Add items to compare prices at each store." and the savings box says "Add groceries to see what you could save." "Browse groceries" puts the cursor in the search box. | | Not done | |
| BSK-02 | Under "Add groceries", type "milk" in "Search by product, brand or category" and click "Add" on one. Then search "zzzz". | Only matching products are listed. The product joins "Your basket" ("1 product · 1 pack") and its button reads "Add (1)". "zzzz" shows "No products match “zzzz”." | ⭐ | Not done | |
| BSK-03 | Choose a product type in "All product types", then open "All brands". Set both back. Then choose a brand first and open the product types. Type a search too. | Each narrows the list, and each picker only offers what the search and the other picker leave, each with its count, e.g. "Milk (4)". A choice that no longer fits anything (after changing the search) is outlined in amber, with "Nothing fits your other filters" under it. With nothing left: "No products match these filters." | | Not done | Changed 7 Nov: the pickers count their options. |
| BSK-04 | Use + and − on a basket item, then press its bin. Add a few items and click "Reset". | + and − change the quantity and the totals; − stops at 1. The bin ("Remove {product} from basket") removes the whole line, at any quantity. + stops at 99. "Reset" empties the basket. | | Not done | Changed 7 Nov: the bin is always there, beside the quantity. |
| BSK-05 | Add three or more products that every store prices. | "Compare by retailer" shows a card per store with its total. The cheapest has a "Cheapest" badge and "Lowest total"; the others show "+$X.XX more" (or "Same total"). Below the items: "Total at {store} · cheapest". The savings box at the top shows "Save up to $X.XX at {cheapest store} instead of {dearest store}". | ⭐ | Not done | |
| BSK-06 | Click another store's card. Then press the arrow keys. | The card is selected, each item's price and the total switch to that store ("Total at {store}"), and the line above the cards reads "N priced · N missing at {store}". The arrow keys move between the cards in the same way, wrapping round. | ⭐ | Not done | |
| BSK-07 | Add a product that one store has no price for. | That store's card shows "N priced · N missing" in amber, and isn't "Cheapest" over a store that has everything. If no store has every item: "No single store has a price for every item yet. Totals only include the items each store prices." With that store selected the item shows "No price" and the total reads "Total for priced items at {store}". | ⭐ | Not done | |
| BSK-08 | Make a basket of only products that no store prices (e.g. one approved today). | Every card shows "0 priced · N missing" and none says "Cheapest". The items show "No price", and the savings box says "Savings show once two stores price every item." | | Not done | |
| BSK-09 | With a priced basket, look at "Price per item". | Each item lists every store's line total ("No price" where missing), with the lowest one highlighted. | | Not done | |
| BSK-10 | Add a product that isn't Healthier Choice but has a Healthier Choice product in its category (e.g. white bread). Dismiss the note. | A note: "1 item has a Healthier Choice alternative. Tap Healthier options under an item to compare and swap." The item has a "Healthier options (N)" button. ✕ dismisses the note. | | Not done | |
| BSK-11 | Click "Healthier options (N)". Switch between "Lowest price" and "Best unit price". | "Healthier choices", "{category} · prices at {store}", and "In your basket" with your product and its price. Each option shows its price at the selected store, the difference ("Save $X.XX", "+$X.XX" or "Same price") and its price per 100 g/ml. "Lowest price" puts the cheapest first with a "Cheapest" badge; "Best unit price" puts the best value per 100 g/ml first with "Best value", and items sold in pieces last. An option with no price at that store reads "No price at {store}" and its "Swap" is disabled. | ⭐ | Not done | |
| BSK-12 | Click "Swap" on an option. Then click "Undo" in the message, swap again and use "Undo" under the item instead. | The item is replaced in the same place with the same quantity. The item shows "Swapped from {original}" and a message says "Swapped to {product}". Either "Undo" puts the original back. The Healthier Choice count under the total updates. | ⭐ | Not done | |
| BSK-13 | Put both a non-Healthier product and one of its Healthier options in the basket, then swap the first for the second. Undo it. Swap again, then change the merged quantity. | The two lines merge into one (quantities added, at most 99). "Undo" restores both lines as they were. After changing the merged quantity, "Undo" is no longer offered. | | Not done | |
| BSK-14 | Click a product's picture (search list, basket or Healthier choices). Close it with ✕, then with Esc, then by clicking outside the picture. | The picture opens large with the product's name. All three ways close it. Products without a picture show their category icon on a white tile, which can't be enlarged. | | Not done | Added 5 Nov. |
| BSK-15 | Add items, reload the page, then close the tab and reopen `/basket`. Add an item on Search and come back. | The basket is still there each time. Items added on Search appear here with the same quantities, and Search's "Add to basket (N)" matches. | ⭐ | Not done | |
| BSK-16 | Signed out, add an item. Log in as a contributor and add a different item. Sign out, then log in again. | Signed in, you see that account's basket, not the signed-out one. Signing out shows the signed-out basket again, and logging back in brings back the account's basket. Items added while the page is still loading the session are kept. | ⭐ | Not done | Added 6 Nov: each account keeps its own basket in this browser. |
| BSK-17 | Add items. In the browser's network tools, right-click a request to the API and choose "Block request domain", then reload. Unblock it and reload again. | Blocked: an error message at the top, and the basket may look empty, with "No store prices yet" rather than "Comparing store prices…". Unblocked: the basket is back, unchanged. A failed load never wipes the saved basket. | | Not done | "Offline" mode would also block the dev server, so block only the API. |
| BSK-18 | Add a product with the Healthier Choice Symbol. | It shows a "Healthier Choice" badge with a leaf in the search list and in the basket. | | Not done | |
| BSK-19 | **API mode only.** Add a product that has a Healthier Choice alternative (e.g. white bread), one that is already Healthier Choice, and one with no alternative. Click "Swap N items". Then "Undo" under one item. | Under the store cards: "Healthier basket at {store}", "Swaps in {products}." and "1 item is already Healthier Choice.", its total, and "$X.XX more (N%)" (or "$X.XX less", or "Same as your basket"). The button swaps every item listed at once; each shows "Swapped from …", and the healthier basket line goes. "Undo" puts back just that item. | ⭐ | Not done | Added 6 Nov. The local demo mode has no healthier basket. |
| BSK-20 | Under "Add groceries", clear the search so the whole catalogue is listed. | The list fades out at its bottom edge, and under it reads "N products · scroll the list for more". | | Not done | Added 6 Nov. |
| BSK-21 | Under "Add groceries", type a search, and choose a product type and a brand. Click "Reset filters". Then search for "zzzz" and click "Clear search and filters". | "Reset filters" is greyed out until a type or brand is chosen. It sets both pickers back to "All" and keeps the search. "zzzz" shows "No products match “zzzz”." with a "Clear search and filters" button, which empties the search and both pickers, and the whole catalog shows. | ⭐ | Not done | Added 7 Nov; updated 8 Nov for the "Reset filters" button. |
| BSK-22 | Put 3 of a product in the basket and press its bin. | The whole line goes at once, and the totals update. | ⭐ | Not done | Added 7 Nov. |
| BSK-23 | Under "Add groceries", find a Healthier Choice product with a long name. | The "Healthier Choice" pill sits under the product's details, so the name starts level with the picture, as on rows without it. | | Not done | Changed 7 Nov: it used to sit above the name. |

## 5. Contributor: submit a price

Log in as a contributor and open `/contribute`.

| ID | Steps | Expected result | Key | Status | Notes |
|---|---|---|:-:|---|---|
| PRC-01 | Look at the page. | "Share a price you spotted" with one line under it. A card with "Existing product" and "New product" tabs (Existing chosen) and "Where and how much"; a "Photos" card with "Price photo" (Optional); a bar with the review rules, "Clear" and "Submit price"; then "Your submissions" with "All", "Prices" and "New products" filters. There is no pop-up and no "From shelf to review" card. Prices are written "$3.50", with no "SGD". | ⭐ | Not done | Changed 7 Nov: redesigned page. |
| PRC-02 | Type "magn" in "Product". Pick one with the arrow keys and Enter. Then type "zzzz", and press Esc. | A list of matching products, each with its category icon and type. The hint reads "Showing N of 24 products." The chosen product fills the box. "zzzz" shows "No product matches “zzzz”." and an "Add “zzzz” as a new product" button. Esc closes the list. | ⭐ | Not done | Changed 7 Nov: redesigned page. |
| PRC-03 | Choose a milk product. Set "Type (optional)" to Milk, then to "All types", then to Bread. Click "Submit price". | Milk and "All types" keep the product in the box. Bread empties the box, and submitting says "Choose a product". | ⭐ | Not done | Fixed 4 Nov: the box used to keep showing the name after the choice was cleared. |
| PRC-04 | Click "Submit price" with nothing filled in. | "Choose a product", "Choose a store" and "Price must be greater than $0". The price box starts empty (showing "0.00") and the date stays at today. | | Not done | |
| PRC-05 | Enter prices `0`, `1000.01`, then `1000`. | "Price must be greater than $0", then "Price must be $1,000 or less". `1000` is allowed. | | Not done | |
| PRC-06 | Open the "Date seen" picker. Then type tomorrow's date, then a date 31 days ago. | The picker only offers the last 30 days up to today ("Within the last 30 days" shows under it). Typed dates give "Observed date cannot be in the future" and "Observed date must be within the last 30 days". | | Not done | |
| PRC-07 | Submit a usual price with no photo: Magnolia Fresh Milk, FairPrice, $3.63, today. | A "Price accepted. It shows on TrolleySaver after the nightly update." message, and the form clears. The price is first in "Your submissions" with a "Price" tag, an "Accepted" badge, "Seen {date}", "No image" and "Sent {time}". The count beside "Your submissions" goes up. | ⭐ | Not done | Changed 7 Nov: redesigned page. |
| PRC-08 | Submit an unusual price with a photo: the same milk at $20 at another store. | A "Price sent to an admin to check, as it's far from the usual range." message. It shows "Pending review", with your photo as the row's picture, "This price is far from the usual range, so an admin checks it first." and a red "Delete" button. | ⭐ | Not done | Changed 7 Nov: redesigned page. |
| PRC-09 | Click "Add a shelf label or receipt" and choose a JPG under 5 MB. Click "Remove". Then Tab to the photo area and press Enter. | "Preparing image…" briefly, then a preview of the photo; "Remove" clears it. Enter opens the file picker. | | Not done | Changed 7 Nov. |
| PRC-10 | Choose a GIF (pick "All files" in the picker), then the empty PNG, then the PNG over 5 MB. | "Choose a JPG or PNG image", "Choose a non-empty image", then "Image must be 5 MB or smaller". "Submit price" is disabled while a message shows. | | Not done | |
| PRC-11 | Submit a price with a photo of a few MB. | "Uploading photo" with a percentage bar while it uploads, and the button reads "Sending…". | | Not done | Changed 7 Nov. |
| PRC-12 | Submit the same product and store as PRC-07 again the same day, first at the same price, then at a different one. | Both times: "You've already submitted a price for this product at this store today." | ⭐ | Not done | Changed 7 Nov: one price per product, store and day, whatever the price. |
| PRC-13 | Submit more than 30 prices within an hour. | "You can submit up to 30 prices per hour. Please try again later." | | Not done | Slow to set up. Run it last. |
| PRC-14 | Fill in the form, choose a type filter and a photo, then click "Clear". | Every field, the type filter and the photo reset. | | Not done | |
| PRC-15 | On a pending (flagged) price, click the red "Delete" and cancel. Click it again and confirm. Then submit a price for the same product and store again. | The confirmation reads "Delete this price submission? Its photo will be removed too. This cannot be undone." Cancel changes nothing. Confirm shows "Deleting…", then the row disappears, and the new price is accepted. Accepted and rejected prices have no Delete button. | ⭐ | Not done | Changed 7 Nov: redesigned page. |
| PRC-16 | After an admin rejects your $20 price (ADP-04), reload. Do the same after an admin accepts one (ADP-03). | Rejected: a "Rejected" badge and "Rejection reason: {reason}". Accepted: an "Accepted" badge. | ⭐ | Not done | |
| PRC-17 | **Missing API address.** Delete the `VITE_API_BASE_URL` value in `.env.local`, restart `npm run dev` and open `/contribute`. Put it back afterwards. | The header shows as normal, with "Price submissions are not configured. Set VITE_API_BASE_URL in frontend/.env.local, or set VITE_PRICE_SUBMISSION_MODE=local." The page isn't blank. | | Not done | Fixed 4 Nov: the page used to be blank. |
| PRC-18 | In the afternoon, submit a usual price with the **earliest** date the picker allows (30 days ago). Do the same in the "New product" tab. | Both are accepted, any time of day. | | Not done | Fixed 6 Nov (backend): after 00:05 the earliest date used to be refused with "Observed date must be within the last 30 days". |
| PRC-19 | Choose a photo, then in the browser's network tools block requests to `*.amazonaws.com` (the photo bucket) and submit. Unblock afterwards. | "The photo upload failed. Check your connection and try again." Nothing is saved, and submitting again after unblocking works. | | Not done | The server's own check for a photo that never arrived (`PHOTO_NOT_FOUND`) can't be reached from the UI. The smoke test covers it ("photo that was never uploaded"). |
| PRC-20 | Enter the price `3.635` and submit. Then `3.6`. | `3.635`: "Enter the price in dollars and cents, e.g. 3.63". `3.6` is accepted as $3.60. | ⭐ | Not done | Added 6 Nov: it used to be rounded silently. |
| PRC-21 | Rename a text file to `shelf.png` and choose it as the price photo. | "This file isn't a readable JPG or PNG image", no preview, and "Submit price" is disabled. | | Not done | Added 6 Nov. |
| PRC-22 | Take a photo with a phone that records location (check it has GPS with any EXIF viewer). Submit an unusual price with it. As an admin, open the flagged price, save the evidence photo and check it in the EXIF viewer. Also try a photo over 2560 px wide. | The saved photo has no GPS or other EXIF data. A wide photo comes back at most 2560 px on its long side, the right way up. | ⭐ | Not done | Added 6 Nov: the browser redraws every photo before upload. |
| PRC-23 | In "Your submissions", click the picture of a price you sent with a photo. Close it with ✕, Esc, or by clicking outside. | Your photo opens large, titled "Price evidence for {product}". All three ways close it. A price without a photo shows a dashed box saying "No image" instead, which doesn't open. | | Not done | Changed 7 Nov: redesigned page. |
| PRC-24 | Open `/contribute` in two tabs. As an admin, accept a pending price. In the tab that hasn't refreshed, delete it. | "This submission is already accepted.", and the list refreshes, showing it accepted without a delete button. | | Not done | Added 7 Nov. |
| PRC-25 | Have an admin reject one of your prices (ADP-04), then submit a corrected price for the same product and store that day. | It's accepted: a rejected price doesn't count toward one-a-day. | | Not done | Added 7 Nov. |
| PRC-26 | With prices and new products in your list, click "Prices", then "New products", then "All". | Each filter shows only its kind, with its count beside it, newest first. A filter with nothing in it says "Nothing here yet". | | Not done | Added 7 Nov. |
| PRC-27 | Choose a product, store and price. Switch to the "New product" tab and back. Then type a name that isn't in the catalog and click "Add “{name}” as a new product". | Store, price, date and photo keep their values both ways, and the chosen product comes back. The button switches to "New product" with the typed name in "Product name", ready to type. | ⭐ | Not done | Added 7 Nov. |
| PRC-28 | With some pending and some decided items in "Your submissions", turn on "Pending only". Switch between "All", "Prices" and "New products". Turn it off. | Only items still waiting for an admin are listed (flagged prices and pending new products), and the counts beside the filters count only those. With nothing pending: "Nothing waiting for review" and "An admin has already checked everything here. Turn off Pending only to see it." Off: everything again. | | Not done | Added 8 Nov. |

## 6. Contributor: new product requests

Log in as a contributor, open `/contribute` and choose the "New product" tab. Use a made-up product, and delete it or have it rejected afterwards.

| ID | Steps | Expected result | Key | Status | Notes |
|---|---|---|:-:|---|---|
| NPR-01 | Choose the "New product" tab, then "Existing product", then "New product" again. Also focus a tab and press the arrow keys. | "New product" shows "Product name", "Brand" and "Category" (both with suggestions), "Pack quantity", "Pack unit" (ml, L, g, kg, pcs, rolls), "Units per pack", and "Does it have any of these labels?" with "Healthier Choice Symbol" (the Health Promotion Board symbol beside it) and the dietary tags. "Photos" gains "Product picture" (Required), and the button reads "Submit product for review". The arrow keys move between the tabs. | ⭐ | Not done | Changed 7 Nov: redesigned page. Tabs replace the "Upload a new product" pop-up. |
| NPR-02 | Fill in every field correctly, but add no product picture. Submit. | "Add a picture of the pack. Every new product needs one." under "Product picture". | ⭐ | Not done | Changed 7 Nov. |
| NPR-03 | Fill in a store, price and date, then Brand and Category. Set Product name to "x", leave Pack quantity empty, and set Units per pack to `1.5`. Submit. | One message: "Product name must be 2–120 characters; Pack quantity must be more than 0 and at most 100000; Units per pack must be a whole number from 1 to 100". There are no field codes (like `packQty:`) and no "Too small" or "Invalid input". | ⭐ | Not done | Fixed 4 Nov: it used to show the validation library's own messages. |
| NPR-04 | With valid product fields, leave Store empty and set the price to `0`. Submit. | "Choose a store" under Store and "Price must be greater than $0" under Price. | | Not done | Changed 7 Nov. |
| NPR-05 | Tick five dietary tags, then untick one. | With five ticked, the other tags are disabled ("Choose up to five dietary tags."). Unticking one enables them again. | | Not done | |
| NPR-06 | In either photo box ("Product picture" or "Price photo"), choose a GIF, then the empty PNG, then the PNG over 5 MB, then a valid JPG. Click "Remove". | "Choose a JPG or PNG image", "Choose a non-empty image", "Image must be 5 MB or smaller". The JPG shows a preview and a "Remove" button, which clears it. | | Not done | Changed 7 Nov. |
| NPR-07 | Propose a valid made-up product: "Test Oat Milk", brand "Test", category "plant milk", 1 L, 1 per pack, FairPrice, $5.45, today, with a product picture. | The button reads "Sending…", then a "New product sent for review" message and the form clears. "Your submissions" shows "Test Oat Milk" with a "New product" tag, "Pending review", "1 L", "FairPrice", $5.45, your picture, and a red "Delete" button. | ⭐ | Not done | Changed 7 Nov: redesigned page. |
| NPR-08 | Look for the pending product on Search and in the Smart basket search. | It isn't there until an admin approves it. | ⭐ | Not done | |
| NPR-09 | Propose a product that's in the catalog: "Magnolia Fresh Milk", brand "Magnolia", 946 ml, 1 per pack, with a store, price and picture. | "This product is already in the catalog. Submit a price for it instead. It’s now selected below, with your store, price and photos kept." The form switches to "Existing product" with Magnolia Fresh Milk chosen, and "Submit price" sends a price for it. | ⭐ | Not done | Changed 7 Nov: redesigned page. |
| NPR-10 | Propose the same as NPR-09, but with Units per pack `6`. Delete it afterwards. | It's accepted as a pending request. A pack of 6 is a different product from a single one. | | Not done | Fixed 4 Nov (backend): it used to be refused as already in the catalog. |
| NPR-11 | As a **second** contributor, propose the same product as a pending request from NPR-07. | "Someone has already proposed this product. It is waiting for an admin." | | Not done | |
| NPR-12 | On a pending request, click the red "Delete" and cancel. Click it again and confirm. Propose the same product again. | The confirmation reads "Delete this request? Its product picture and price evidence photo will be removed too. This cannot be undone." Cancel changes nothing. Confirm shows "Deleting…", then the request disappears. Proposing it again works. | ⭐ | Not done | Changed 7 Nov: redesigned page. |
| NPR-13 | Open `/contribute` in two tabs. Delete a pending request in the first, then click its Delete button in the second. | The second tab says "This request no longer exists." and its list refreshes. | | Not done | |
| NPR-14 | Open `/contribute` in two tabs. An admin approves the request. Click Delete on it in the tab that hasn't refreshed. | "This product request is already approved." The list refreshes, showing it approved. | | Not done | |
| NPR-15 | After an admin approves your request (ADR-03), look at it in your list. | An "Added" badge and "Added to the catalog. Reload Search or Smart Basket to see it; its price shows after the nightly update." There's no Delete button. | ⭐ | Not done | Changed 7 Nov: redesigned page. |
| NPR-16 | After an admin rejects your request (ADR-05), look at it in your list. | A "Rejected" badge and "Rejection reason: {reason}". There's no Delete button. | ⭐ | Not done | Changed 7 Nov: redesigned page. |
| NPR-17 | Open `/contribute` and watch "Your submissions" as the page loads. Then click "Refresh". | While it loads: a spinner and "Loading your submissions…", never "Nothing here yet" for an account that has submissions. With none: "Nothing here yet" and "Prices and new products you send will appear here." On refresh the button's icon spins and the button is disabled until the list comes back; anything already listed stays on screen, faded, meanwhile. | | Not done | Changed 7 Nov: one list for prices and new products. |
| NPR-18 | Propose an 11th product within 24 hours. | "You can propose up to 10 new products a day. Please try again tomorrow." | | Not done | Delete the test requests afterwards. |
| NPR-19 | In the "New product" tab, click the Healthier Choice Symbol picture, then click it again. As an admin, open a request's corrections. | Clicking the symbol ticks and unticks "Healthier Choice Symbol". The admin's correction form shows the same symbol. | | Not done | Added 6 Nov. |
| NPR-20 | In the "New product" tab, open the browser console, run `copy('Oat\u200bMilk')`, then paste it into "Product name" (it has a zero-width space). Fill in the rest and submit. | "Product name can't contain hidden or control characters". | | Not done | Added 6 Nov. Brand, Category and dietary tags have the same rule. |
| NPR-21 | Choose a renamed text file (`pack.png`) as the product picture. | "This file isn't a readable JPG or PNG image", and no preview. | | Not done | Added 6 Nov. |
| NPR-22 | Propose a product using a phone photo with GPS as its picture. After an admin approves it, open its picture on Search (open the image in a new tab and save it) and check it in an EXIF viewer. | The published picture has no GPS or other EXIF data. | ⭐ | Not done | Added 6 Nov. Product pictures are public. |
| NPR-23 | Propose a product with both a product picture and a price evidence photo. Look at it in "Your submissions". | The row's picture is the product picture, and under its details a smaller "Your price photo"; both enlarge when clicked. A request without evidence shows only the product picture. | | Not done | Changed 7 Nov: redesigned page. |
| NPR-24 | Click "Category" without typing. Then type "co". Then change it to "milk". | A list styled like the rest of the site (not the browser's own) with every category in the catalog, A to Z, written like "Soft Drinks" and "Toilet Rolls" (not lower case), each with its number of products. "co" leaves Coffee and Cookies, with "Co" in bold, under a "New category: “co”" row with a green + and "New to the catalogue. It’s added when the product is approved." With "milk" there's no New row, and Milk has a tick. | ⭐ | Not done | Added 8 Nov. Replaces the browser's own suggestion list. |
| NPR-25 | Click "Brand" and type "nestle". Press ↓ and Enter. Then type "Test Brand" and click its "New brand" row. | The catalog's brands, spelled as they are there (e.g. "Coca-Cola", "NUYOLK"), each with its number of products. "nestle" finds "Nestlé": accents don't matter. Enter fills in "Nestlé" and doesn't send the form. The New row reads "New brand: “Test Brand”" and "Spell it as it’s printed on the pack.", and clicking it keeps "Test Brand". | ⭐ | Not done | Added 8 Nov. |
| NPR-26 | Open Category's list and press Esc. Open it again and press Tab. Repeat at phone width and in dark mode. As an admin, open a pending request's corrections. | Esc closes the list and keeps what you typed. Tab closes it and moves to "Pack quantity". At phone width the list fits under the field and scrolls inside itself; in dark mode it's dark, with readable text. The admin's correction form has the same Brand and Category lists. | | Not done | Added 8 Nov. |

## 7. Admin: price review

Log in as an admin. You need a flagged price from PRC-08.

| ID | Steps | Expected result | Key | Status | Notes |
|---|---|---|:-:|---|---|
| ADP-01 | Open `/contribute`. | "Review price evidence" (no small label above it), and a count of flagged prices with "Awaiting review". Then "Review new product requests" and "Products and prices awaiting review" ("Administrator only"). There's no price form. | ⭐ | Not done | |
| ADP-02 | Look at a flagged price. | The photo, "Price evidence" and "Help shoppers trust this price" (or "No image" when none was attached). Then the product, "Pending review", the price (e.g. "$20.00"), the store, the observed date, "Submitted by {name} · {email}", "Submitted at" and "Evidence file {file name} · {size} MB". | ⭐ | Not done | |
| ADP-03 | Click "Accept". | A "Flagged price accepted" message. The card disappears and the count goes down. The contributor sees "Accepted" (PRC-16). | ⭐ | Not done | |
| ADP-04 | Click "Reject", then "Confirm rejection" with no reason. Type a reason and confirm. Also try "Cancel". | A "Reason for rejection" box ("Explain what needs to be corrected"). No reason: "Enter a reason before rejecting this submission." With a reason: a "Flagged price rejected" message, and the card disappears. "Cancel" closes the box. | ⭐ | Not done | |
| ADP-05 | Open the queue in two admin tabs. Accept a price in the first, then accept the same one in the second. | "This submission is already accepted." The second tab's queue refreshes. | | Not done | |
| ADP-06 | Decide every flagged price. | "Review queue is clear" and "New submissions will appear here." The count shows 0. | | Not done | |
| ADP-07 | Leave the queue open for more than 5 minutes (the photo link's lifetime), then reload a photo, e.g. by scrolling to one that hadn't loaded. | The photo still loads. If a link has expired, the page fetches fresh links once. | | Not done | |
| ADP-08 | Click "Reject" on a flagged price. In the browser console, run `copy('Blurry\u202ephoto')`, then paste it into "Reason for rejection", then click "Confirm rejection". | "The reason can't contain hidden or control characters", and the price stays in the queue. Line breaks in a reason are fine. | | Not done | Added 6 Nov. Product request rejections have the same rule. |

## 8. Admin: product request review

Log in as an admin. You need a pending request from NPR-07.

| ID | Steps | Expected result | Key | Status | Notes |
|---|---|---|:-:|---|---|
| ADR-01 | Look at "Review new product requests". | A "Request status" list (pending, approved, rejected) and "Refresh request queue". Each pending request shows "{name} · pending" and "{submitter} {email} · {store} · $X.XX · observed YYYY-MM-DD", the product picture, the evidence photo if there is one, and the editable product fields. Then "Suggested range: {min}–{max} cents. Review this range before approval; it applies across stores.", "Minimum cents" and "Maximum cents" filled in, "Search terms (comma separated)", a review checkbox, "Reason for rejection", "Approve product" and "Reject product". With none pending: "No pending product requests." | ⭐ | Not done | The queue reloads itself every 4 minutes, so picture links stay fresh. |
| ADR-02 | Look at "Approve product" before and after ticking "I reviewed the packaging, product fields, HCS and dietary claims, and price range…". | Disabled until the box is ticked. | ⭐ | Not done | |
| ADR-03 | Change the Category (e.g. "plant milk" to "milk"), tick the box and click "Approve product". Set "Request status" to approved. Reload Search. | The request leaves the pending list, and shows under approved as "{name} · approved". On Search the product appears with its picture and the corrected category. The contributor sees it approved (NPR-15). | ⭐ | Not done | |
| ADR-04 | Tick the box, then try to approve with Minimum cents `500` and Maximum cents `100`. Then with search terms `oat,,soy`. Then with an empty Product name. | "Maximum cents must not be less than minimum cents", then "Each search term must be 1–30 characters (check for a stray comma)", then "Product name must be 2–120 characters". Nothing is approved. | | Not done | Fixed 4 Nov: these used to be the validation library's own messages. |
| ADR-05 | Click "Reject product" with no reason. Type a reason and reject. Set "Request status" to rejected. | No reason: "Enter a reason of 1–500 characters before rejecting." With a reason: the request leaves the pending list, and shows under rejected with "Rejection reason: {reason}". The contributor sees it (NPR-16). | ⭐ | Not done | |
| ADR-06 | Open the queue in two admin tabs. Approve a request in the first, then approve or reject it in the second. | "This product request is already approved." The second tab's queue refreshes. | | Not done | |
| ADR-07 | Open the queue. The contributor deletes the request (NPR-12). Then approve it in the admin tab. | "This product request could not be found." | | Not done | |
| ADR-08 | Set "Request status" to approved, then to rejected. | Each lists only those requests, with no editing controls. | | Not done | |
| ADR-09 | Look for the product approved in ADR-03 on Search and in the Smart basket, the same day and after the next 00:05 run. | The same day: "No current price available". After the run: its first price at the contributor's store. | ⭐ | Not done | To see it sooner, ask the backend team to run the price job for today. |
| ADR-10 | Approve a request whose price was seen more than 30 days ago. Then reject it. | Approving says "This request's price was seen more than 30 days ago, so it can't be published as a current price. Reject it and ask the contributor for a fresh one." The request stays pending, and rejecting it works. | | Not done | Added 6 Nov. To set one up, propose a product with the earliest date the picker allows and approve it the next day, or ask the backend team to back-date a test request. |

## 9. Price freshness

The first three cases check the dates the app has always shown. The rest check "Prices updated …" on Search & filter, which shows each product's `priceUpdatedAt` (see the [4 Nov handoff](../handoffs/2026-11-04-price-updated-backend-to-frontend.md)).

| ID | Steps | Expected result | Key | Status | Notes |
|---|---|---|:-:|---|---|
| FRESH-01 | Submit an accepted price for a product, then open its Search details the same day and after the next 00:05 run. | The same day, its store price and "Price date" are unchanged. After the run, that store's price is the day's average and "Price date" is the submission day. | ⭐ | Not done | |
| FRESH-02 | Find a product whose newest price at one store is more than 30 days old (ask the backend team if there's none). Look at it in Search's details and in the Smart basket. | A price older than 30 days counts as missing: Search shows "No current price" for that store, and the Smart basket shows "No price" there and counts the item as missing. | | Not done | Updated 6 Nov: the "Best single store" text it used to check is gone from the redesigned Smart basket. |
| FRESH-03 | Submit an accepted price. | The message says "It shows on TrolleySaver after the nightly update", and Search and the Smart basket don't change until after 00:05. | | Not done | |
| FRESH-04 | On Search, look at a priced product's card, then open its details. | Under the price, the card shows "Prices updated {day month}, {time}" in Singapore time, e.g. "Prices updated 4 Nov, 12:05 am". The details show the same line under "Current retailer prices". | ⭐ | Not done | |
| FRESH-05 | Look at a product that has never been priced (e.g. one approved today), then open its details. | The card says "No current price available", with no "Prices updated" line. The details say "No prices yet". | | Not done | |
| FRESH-06 | Note two products' "Prices updated" times. Submit an accepted price for one, then check both after the next 00:05 run. | Only the product that got a new price shows a new time. The other keeps its old one. | | Not done | |
| FRESH-07 | Change your computer's time zone and reload Search. | The "Prices updated" times don't change. | | Not done | |

## 10. Known issues

Found by reading the code, and not fixed yet. Each case says what should happen. Once it's fixed, move the case to its page's section.

| ID | Steps | Expected result | Key | Status | Notes |
|---|---|---|:-:|---|---|
| KI-01 | Look for a way to reach `/unauthorized` ("Access not available"). | A signed-in user who opens a page their role can't use is sent there. | | Not done | **Open** (checked 6 Nov). Nothing sends anyone there: no route is limited to one role, so the page can't be reached. Either add a role check that uses it, or remove it. |
| KI-02 | Set `VITE_SMART_BASKET_MODE=local` (the default for `npm run dev` when it isn't set) while Search uses the API. Add products on Search, then open the Smart basket. | The products added on Search are in the basket. | | Not done | **Open** (checked 6 Nov). The local basket only knows its built-in sample products, so it drops the ones added from Search and saves the basket without them. Workaround: use `VITE_SMART_BASKET_MODE=api`, as in [Before you start](#before-you-start). |

## 11. Deployed site

The site on CloudFront (`SiteUrl`, currently https://d2xn4fxnysvlr5.cloudfront.net), built by `python infra\deploy.py` against the dev stack. Keep the browser's developer console open: it must show no CORS, Content-Security-Policy, mixed-content or "Failed to load resource" errors. See [docs/deployment.md](../deployment.md).

| ID | Steps | Expected result | Key | Status | Notes |
|---|---|---|:-:|---|---|
| DEP-01 | Open the site URL. Then try it with `http://` instead of `https://`. | The Smart basket opens over HTTPS (padlock in the address bar). `http://` redirects to `https://`. | ⭐ | Done 6 Nov | Checked with curl: `http://…/search` → 301 to `https://…/search`, which returns the app. Still worth a look in a browser. |
| DEP-02 | Open `{site}/search` directly, then reload. Do the same for `{site}/contribute` and `{site}/nothing-here`. | `/search` opens and survives a reload. `/contribute` asks you to log in, then opens. `/nothing-here` goes to `/basket`. Never an "AccessDenied" XML page. | ⭐ | Not done | Reloading a page other than `/` relies on CloudFront's fallback to `index.html`. 6 Nov: `/search` and `/contribute` return the app (checked by `infra/deploy.py`); the in-browser redirects still need a browser. |
| DEP-03 | On Search, look at the catalog and at Magnolia Fresh Milk. | The dev catalog with prices loads, and the milk shows its picture. | ⭐ | Not done | |
| DEP-04 | Register a new account on the site, log in as a contributor, sign out, then log in as an admin with the same form. | The same results as AUTH-01 and AUTH-07, against the dev Cognito user pool. | ⭐ | Not done | |
| DEP-05 | As a contributor, submit a price **with a photo**, then an unusual one with a photo. As an admin, open the flagged one. | Both are saved (accepted, then pending review), with no CORS error in the console. The admin sees the photo. | ⭐ | Not done | Proves the photo bucket accepts uploads from the site's address. 6 Nov: the smoke test confirmed the bucket's CORS answer for the site ("photo bucket accepts uploads from the deployed site"). |
| DEP-06 | Propose a new product with a picture from the site. As an admin, open it in the review queue, then reject it. | It appears pending with its picture, in your list and in the admin queue. | | Not done | |
| DEP-07 | Build a Smart basket and open Healthier options. | Prices and swaps work as in §4. | | Not done | |
| DEP-08 | Note something visible, redeploy the frontend with a change (`python infra\deploy.py --frontend-only`), then reload the open tab normally. | The reload shows the new version, without clearing the cache. | | Not done | `index.html` is never cached; the other files have new names each build. |
| DEP-09 | In the developer tools' Network tab, select the page's first request (the document) and look at its response headers. | `content-security-policy` (starting `default-src 'self'; script-src 'self'`), `strict-transport-security`, `x-content-type-options: nosniff`, `x-frame-options: DENY`, `referrer-policy: strict-origin-when-cross-origin`, `permissions-policy` and `cross-origin-opener-policy: same-origin`. | | Not done | Changed 6 Nov: the site now has its own headers policy with a CSP (was Done 6 Nov with the AWS managed policy). |
| DEP-10 | With the console open, go through every page: Smart basket, Search (open a product with a picture, and enlarge it), log in, Price & image upload (choose a photo and submit), the "New product" tab (with a picture), and as an admin both review queues (evidence photos). | Everything works, and the console shows no `Refused to load`, `Refused to connect` or other Content-Security-Policy errors. | ⭐ | Not done | Added 6 Nov. A CSP error names the blocked host; add it to `FrontendSecurityHeaders` in `backend/template.yaml` only if it's meant to be used. |


## 12. Look and feel

The 6 Nov redesign, from the UI wireframes: logo green, a dark-green header band, solid cards and rounded headings.

| ID | Steps | Expected result | Key | Status | Notes |
|---|---|---|:-:|---|---|
| LOOK-01 | Open each page. | The header is a dark-green band with the trolley logo and "Trolley" in white, "Saver" in light green. Pages sit on a plain light background, with white cards and a thin border (no see-through panels or moving background). Buttons and highlights are the logo's green. | ⭐ | Not done | |
| LOOK-02 | Look at the browser tab on each page. | The trolley icon, and the page's name: "Smart basket · TrolleySaver", "Search & filter · TrolleySaver", "Price & image upload · TrolleySaver", and "Review price evidence · TrolleySaver" for an admin. | ⭐ | Not done | |
| LOOK-03 | Switch the computer or phone to dark mode and open each page. | The pages turn dark. "Trolley" in the logo turns near-white. Amber and green status text is easy to read. Product pictures and black category icons sit on white tiles and stay visible. | | Not done | Dark mode never switched on before 6 Nov. |
| LOOK-04 | In dark mode, press Tab through the buttons and fields on Search and in the log-in window. | Each control shows a green focus ring, with no white halo around it. | | Not done | |
| LOOK-05 | Compare the pages. | Every page title has the same size and style, with no small uppercase label above it. Prices are written the same way everywhere ("$2.88"). The "Healthier Choice" badge and the drop-downs look the same on every page. | | Not done | |
| LOOK-06 | On an Android phone, open the site in Chrome. | The browser's address bar is dark green. | | Not done | |
| LOOK-07 | Paste the site's link into a chat app that shows previews. | The preview reads "Compare grocery prices at FairPrice, Sheng Siong and Cold Storage, find the cheapest store for your whole basket, and share prices you spot." | | Not done | |
| LOOK-08 | In a browser without Inter or Nunito installed (e.g. a phone), open the site. In the network tools, filter by "Font". | Text is in Inter, and headings, product names and prices in the rounded Nunito. The font files load from the site itself. | | Not done | Both fonts are bundled since 6 Nov. |
| LOOK-09 | On a page long enough to scroll, open each window in turn: Log in, Register, an enlarged photo in "Your submissions", a product's details and enlarged picture on Search, and Healthier choices and an enlarged picture on Smart basket. Scroll with the mouse wheel or a finger, inside the window and over the dimmed page, including past the end of the window's content. | The page behind never moves; only the window's own content scrolls. Closing the window leaves the page where it was, without jumping sideways. | ⭐ | Not done | Added 6 Nov. |
| LOOK-10 | Click the moon button in the header (beside "Log in", or beside the menu button on a phone). Then the sun button. | The moon ("Switch to dark mode") turns every page dark, including toasts. The sun ("Switch to light mode") turns it back. | ⭐ | Not done | Added 7 Nov. |
| LOOK-11 | Choose dark with the toggle, reload, and open the site in a new tab. Then clear the site's data and set your computer to dark mode. | The choice stays after a reload and in new tabs. With no choice saved, the site follows the computer's setting, with no light flash while it loads. | | Not done | Added 7 Nov. |

## Running the automated tests

One script runs every automated suite and prints a table of what passed. Run it from the repository root (any Python 3):

```powershell
python tests\run_all.py
```

- **By default** it runs the backend unit tests (`pytest`), the frontend unit tests (`npm test`) and the template check (`sam validate --lint`). Nothing is sent to AWS.
- **`--aws`** also runs the end-to-end smoke test and the Smart Basket evaluation against dev. They need valid keys for the team account: set `$env:AWS_PROFILE = "<your profile>"` and `$env:AWS_REGION = "ap-southeast-1"` first, and check them with `aws sts get-caller-identity`. The keys are temporary and copied from the AWS access portal; when they expire, copy fresh ones as in [docs/deployment.md §2](../deployment.md#2-one-time-setup). `aws sso login` doesn't apply to these keys.
- **`--only backend,frontend`** runs just the named suites (backend, frontend, lint, smoke, basket).
- A suite whose tool isn't installed shows `Skipped` with what to set up. For example, the frontend tests need `npm ci` in `frontend/` once.
- The script exits with an error if any suite failed.

Each suite on its own, and what to expect, is in [backend/TESTING.md part 1](../../backend/TESTING.md#1-automated-checks-5-min).
