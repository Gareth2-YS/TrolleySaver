# Manual UI test cases

A checklist for testing the TrolleySaver web app by hand in a browser, page by page. Each case says what to do and what you should see, quoting the text on screen. The cases were written from the frontend code (`frontend/src`) on 4 Nov 2026, and updated on 6 Nov for the redesigned Smart basket, enlarging pictures, the review fixes and the deployed site.

⭐ marks the **key** cases: the ones that must pass before a demo, a handoff or the final report.

The automated tests (backend, frontend, smoke test) are run by one script instead: see [Running the automated tests](#running-the-automated-tests) at the bottom.

## Before you start

- **Testing the deployed site** ([11. Deployed site](#11-deployed-site)) needs no local setup: open the site URL printed by `python infra\deploy.py` (the stack output `SiteUrl`). Everything below is for running the app locally.
- **Point the app at dev.** In `frontend/.env.local` (copy it from `.env.example`, see [frontend/README.md](../../frontend/README.md#local-ui)):
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
| [2. Register and log in](#2-register-and-log-in) | 12 | 5 | 1 |
| [3. Search & filter](#3-search--filter) | 15 | 6 | 0 |
| [4. Smart Basket](#4-smart-basket) | 18 | 8 | 0 |
| [5. Contributor: submit a price](#5-contributor-submit-a-price) | 19 | 6 | 0 |
| [6. Contributor: new product requests](#6-contributor-new-product-requests) | 18 | 9 | 0 |
| [7. Admin: price review](#7-admin-price-review) | 7 | 4 | 0 |
| [8. Admin: product request review](#8-admin-product-request-review) | 10 | 5 | 0 |
| [9. Price freshness](#9-price-freshness) | 7 | 2 | 0 |
| [10. Known issues](#10-known-issues) | 2 | 0 | 0 |
| [11. Deployed site](#11-deployed-site) | 9 | 5 | 2 |
| **Total** | **129** | **56** | **3** |

## 1. Navigation and access

| ID | Steps | Expected result | Key | Status | Notes |
|---|---|---|:-:|---|---|
| NAV-01 | Signed out, open `/basket`, then `/search`. | Both pages open without logging in. The header shows "Smart basket", "Search & filter", "Price & image upload" and a "Log in" button. The current page's link is underlined. | ⭐ | Not done | |
| NAV-02 | Signed out, click "Price & image upload" (or open `/contribute`). Log in as a contributor. | You're sent to `/login`. After logging in you land back on `/contribute`. | ⭐ | Not done | |
| NAV-03 | Open `/nothing-here`, then `/app`, then `/admin`. | `/nothing-here` goes to `/basket`. `/app` and `/admin` go to `/contribute` (or to `/login` when signed out). | | Not done | |
| NAV-04 | Log in as a contributor. | The header shows all three links, a "user" chip and "Sign out". The TrolleySaver logo goes to `/basket`. | ⭐ | Not done | |
| NAV-05 | Log in as an admin. | The header shows only "Price & image upload", an "admin" chip and "Sign out". The logo goes to `/contribute`. Typing `/basket` or `/search` still opens them. | ⭐ | Not done | |
| NAV-06 | While signed in, open `/login`, then `/register`. | Both go straight to `/contribute`. | | Not done | |
| NAV-07 | Click "Sign out", then open `/contribute`. | You land on `/basket` and the header shows "Log in". `/contribute` asks you to log in again. | | Not done | |
| NAV-08 | At phone width, tap the menu button ("Toggle navigation"). Choose a link. | The menu lists the links and "Log in" or "Sign out". Choosing a link opens it and closes the menu. The desktop links are hidden at this width. | | Not done | |
| NAV-09 | At phone width, open every page: Smart basket, Search & filter, Log in, Register, and `/contribute` as a contributor and as an admin. | Nothing needs sideways scrolling. Buttons, fields and dialogs fit the screen and can be used. On the Smart basket, the basket comes after the product search. | | Not done | |
| NAV-10 | Signed in, refresh `/contribute`. | "Loading your session…" shows briefly, then the same page, still signed in. | ⭐ | Not done | |
| NAV-11 | **Sign-in setup problem.** Delete the `VITE_COGNITO_USER_POOL_ID` value in `.env.local`, restart `npm run dev`, and open `/login`. Then open `/basket`. Put the value back afterwards. | `/login` shows "Sign-in isn't available", the error message, and "Check the settings in frontend/.env.local, then reload the page." It doesn't stay on "Loading your session…". `/basket` still works. | ⭐ | Not done | Fixed 4 Nov: it used to load forever. |
| NAV-12 | Build in mock mode: set `VITE_AUTH_MODE=mock`, run `npm run build` then `npm run preview`, and open the preview. Set it back afterwards. | The app doesn't start. The browser console shows "Mock authentication is disabled in production. Configure Cognito before building for production." | | Not done | |

## 2. Register and log in

| ID | Steps | Expected result | Key | Status | Notes |
|---|---|---|:-:|---|---|
| AUTH-01 | On `/register`, enter a full name, a new email and a strong password twice, then click "Create my account". Log in with the new account. | A "Account created. You can log in now." message, and you land on `/login`. After logging in: "Contributor workspace", "Share a price you spotted", with no admin features. | ⭐ | Not done | |
| AUTH-02 | On `/register`, click "Create my account" with every field empty. Then try a bad email, a weak password ("password1") and a different confirmation. | Empty: "Enter your full name", "Email is required", "Use at least 8 characters", "Confirm your password". Bad email: "Enter a valid email address". "password1": "Add an uppercase letter". A different confirmation: "Passwords do not match". | | Not done | |
| AUTH-03 | On `/register`, type a password a character at a time, e.g. `abcdefgh`, then `Abcdefgh`, `Abcdefg1`, `Abcdefg1!`. | Under "Keep your account in good hands", "8+ characters", "Upper & lowercase", "A number" and "A symbol" turn green one by one, and the bar fills to 4 of 4. | | Not done | |
| AUTH-04 | Register again with an email that already has an account. | "An account already exists for this email." | | Not done | |
| AUTH-05 | On `/login`, enter a real email with a wrong password. Then an email with no account. | Both show "That email or password is not correct." | ⭐ | Not done | |
| AUTH-06 | On `/login`, choose "admin" under "Choose your space", then log in with a **contributor** account. | "This account does not have administrator access." You stay signed out. | ⭐ | Not done | |
| AUTH-07 | On `/login`, keep "user" selected and log in with an **admin** account. | "Administrator accounts must log in through the Admin tab." You stay signed out. | ⭐ | Not done | |
| AUTH-08 | Choose "admin" and log in with an admin account. | The button reads "Log in to review" and an explanation appears above the form. A "Welcome back" message, then `/contribute` with "Administrator workspace" and "Review price evidence". | ⭐ | Not done | |
| AUTH-09 | On `/login`, click "Log in & start sharing" with both fields empty. | "Email is required" and "Password is required". | | Not done | |
| AUTH-10 | Look at the `/login` form. | Only "Email address", "Password", the log-in button and the "Join the community" link. There's no "Remember me" option. | | Not done | Removed 4 Nov: it did nothing. |
| AUTH-11 | Enter a wrong password many times in a row. | Eventually "Too many attempts. Please wait a moment and try again." | | Not done | Cognito sets the limit. |
| AUTH-12 | Go through registration and login. | No verification code, MFA, password-reset or new-password screens. | | Done 24 Oct | |

## 3. Search & filter

| ID | Steps | Expected result | Key | Status | Notes |
|---|---|---|:-:|---|---|
| SRCH-01 | Signed out, open `/search`. | "Search and filter groceries", a count like "24 of 24 products", and a card per product: name, brand · pack size (e.g. "6 × 180 ml"), and the lowest price, e.g. "$3.63 at FairPrice". Healthier Choice products have a "Healthier Choice" badge. | ⭐ | Not done | |
| SRCH-02 | Type "milk" in "Search product or brand". Then "magnolia milk". | About a third of a second after you stop typing, the count shows "Updating…", then e.g. "5 of 24 products", with only matching products. "magnolia milk" shows only products matching **both** words. | ⭐ | Not done | |
| SRCH-03 | Click the quick filters: a category (e.g. "Milk"), the same one again, then "Healthier Choice", then "All". | A category shows only that type, and clicking it again shows everything. "Healthier Choice" shows only products with the badge and clears the category (and the other way round). "All" clears both. Only categories in the catalog appear among "Cereal", "Milk", "Soft Drinks", "Cookies" and "Toilet Rolls". | | Not done | |
| SRCH-04 | Click "Filters". Choose a Type and a Brand, then a Dietary option. | The panel has "Type", "Brand", "Dietary" and "Lowest price range ($)" with "From" and "To". Each choice narrows the results. The button reads "Filters (2)" after Type and Brand. | | Not done | The count includes Type, Healthier Choice and Brand only: Dietary and the price range don't add to it. |
| SRCH-05 | In the price range, enter From `2` and To `5`. | Only products whose lowest current price is $2.00 to $5.00 inclusive. Products with no current price disappear. | ⭐ | Not done | |
| SRCH-06 | Enter From `5` and To `2`. Then From `-1`. | "Minimum price must not be greater than maximum price." Then "Enter a valid minimum price of 0 or more." The results don't change while a message shows. | | Not done | |
| SRCH-07 | With a search, a quick filter and panel filters set, click "Clear search and filters". | The search box, quick filters, Type, Brand, Dietary and both price boxes reset, and the whole catalog shows. | | Not done | |
| SRCH-08 | Search for "zzzz". | "No matching products", "Try a different search or clear some filters.", and a "Clear search and filters" button that resets everything. | | Not done | |
| SRCH-09 | Click a product's name. Close the dialog with ✕, then reopen it and press Esc, then reopen it and click outside it. | A dialog with the name, "Current retailer prices" (each store's price with "Price date YYYY-MM-DD · N submissions", or "No current price"), and "Product information" (Category, Pack size, Healthier Choice Yes/No, Dietary). All three ways close it. | ⭐ | Not done | |
| SRCH-10 | Find a product with no current price (e.g. one approved today). | Its card says "No current price available". | | Not done | |
| SRCH-11 | Click "Add to basket" on a card twice, then open Smart basket. | The button changes to "Add to basket (1)", then "Add to basket (2)". The basket has the product with quantity 2. At 99 the button is disabled. | ⭐ | Not done | |
| SRCH-12 | Look at a product published from a product request, and at a product the team loaded. | The published product shows its picture. The team's products show their category icon (milk carton, bread, egg…). | ⭐ | Not done | |
| SRCH-13 | Turn on "Offline" in the browser's network tools, change a filter, then go back online and change it again. | Offline: "Catalogue unavailable" with the error. Back online, results return. | | Not done | |
| SRCH-14 | Click a product's picture on its card. Close it with ✕, Esc, and by clicking outside it. Then open the product's details and click the picture there. | The picture opens large with the product's name, from the card and from the details. All three ways close it. | | Not done | Added 5 Nov. |
| SRCH-15 | Click the category icon of a product the team loaded (no picture). | The enlarged view shows the same category icon, not a broken image. | | Not done | |

## 4. Smart Basket

Rewritten 6 Nov for the redesigned page (pictures, Healthier options, per-account baskets). Open `/basket`; "Reset" first if the basket isn't empty. Most cases need products priced at every store, and BSK-07 and BSK-08 need one that isn't (ask the backend team if dev has none).

| ID | Steps | Expected result | Key | Status | Notes |
|---|---|---|:-:|---|---|
| BSK-01 | Open `/basket` with an empty basket. Click "Browse groceries". | "Smart basket comparison", "Your basket is empty" and "Add groceries to compare the full basket total at every supermarket." "Price per item" says "Add items to compare prices at each store." and "Potential savings, up to" shows "—". "Browse groceries" puts the cursor in the search box. | | Not done | |
| BSK-02 | Under "Add groceries", type "milk" in "Search by product, brand or category" and click "Add" on one. Then search "zzzz". | Only matching products are listed. The product joins "Your basket" ("1 product · 1 pack") and its button reads "Add (1)". "zzzz" shows "No products match “zzzz”." | ⭐ | Not done | |
| BSK-03 | Choose a product type in "All product types", then a brand in "All brands". Set both back. | Each narrows the list (both together narrow further). With nothing left: "No products match these filters." | | Not done | |
| BSK-04 | Use + and − on a basket item, press the bin at quantity 1, then add a few items and click "Reset". | + and − change the quantity and the totals. At 1 the − button is a bin ("Remove {product}") that removes the item. + stops at 99. "Reset" empties the basket. | | Not done | |
| BSK-05 | Add three or more products that every store prices. | "Compare by retailer" shows a card per store with its total. The cheapest has a "Cheapest" badge and "Lowest total"; the others show "+$X.XX more" (or "Same total"). Below the items: "Total at {store} · cheapest". The top of the page shows "Potential savings, up to" an amount. | ⭐ | Not done | |
| BSK-06 | Click another store's card. Then press the arrow keys. | The card is selected, each item's price and the total switch to that store ("Total at {store}"), and the line above the cards reads "N priced · N missing at {store}". The arrow keys move between the cards in the same way, wrapping round. | ⭐ | Not done | |
| BSK-07 | Add a product that one store has no price for. | That store's card shows "N priced · N missing" in amber, and isn't "Cheapest" over a store that has everything. If no store has every item: "No single store has a price for every item yet. Totals only include the items each store prices." With that store selected the item shows "No price" and the total reads "Total for priced items at {store}". | ⭐ | Not done | |
| BSK-08 | Make a basket of only products that no store prices (e.g. one approved today). | Every card shows "0 priced · N missing" and none says "Cheapest". The items show "No price", and "Potential savings, up to" stays "—". | | Not done | |
| BSK-09 | With a priced basket, look at "Price per item". | Each item lists every store's line total ("No price" where missing), with the lowest one highlighted. | | Not done | |
| BSK-10 | Add a product that isn't Healthier Choice but has a Healthier Choice product in its category (e.g. white bread). Dismiss the note. | A note: "1 item has a Healthier Choice alternative. Tap Healthier options under an item to compare and swap." The item has a "Healthier options (N)" button. ✕ dismisses the note. | | Not done | |
| BSK-11 | Click "Healthier options (N)". Switch between "Lowest price" and "Best unit price". | "Healthier choices", "{category} · prices at {store}", and "In your basket" with your product and its price. Each option shows its price at the selected store, the difference ("Save $X.XX", "+$X.XX" or "Same price") and its price per 100 g/ml. "Lowest price" puts the cheapest first with a "Cheapest" badge; "Best unit price" puts the best value per 100 g/ml first with "Best value", and items sold in pieces last. An option with no price at that store reads "No price at {store}" and its "Swap" is disabled. | ⭐ | Not done | |
| BSK-12 | Click "Swap" on an option. Then click "Undo" in the message, swap again and use "Undo" under the item instead. | The item is replaced in the same place with the same quantity. The item shows "Swapped from {original}" and a message says "Swapped to {product}". Either "Undo" puts the original back. The Healthier Choice count under the total updates. | ⭐ | Not done | |
| BSK-13 | Put both a non-Healthier product and one of its Healthier options in the basket, then swap the first for the second. Undo it. Swap again, then change the merged quantity. | The two lines merge into one (quantities added, at most 99). "Undo" restores both lines as they were. After changing the merged quantity, "Undo" is no longer offered. | | Not done | |
| BSK-14 | Click a product's picture (search list, basket or Healthier choices). Close it with ✕, then with Esc, then by clicking outside the picture. | The picture opens large with the product's name. All three ways close it. Products without a picture show no picture and can't be enlarged. | | Not done | Added 5 Nov. |
| BSK-15 | Add items, reload the page, then close the tab and reopen `/basket`. Add an item on Search and come back. | The basket is still there each time. Items added on Search appear here with the same quantities, and Search's "Add to basket (N)" matches. | ⭐ | Not done | |
| BSK-16 | Signed out, add an item. Log in as a contributor and add a different item. Sign out, then log in again. | Signed in, you see that account's basket, not the signed-out one. Signing out shows the signed-out basket again, and logging back in brings back the account's basket. Items added while the page is still loading the session are kept. | ⭐ | Not done | Added 6 Nov: each account keeps its own basket in this browser. |
| BSK-17 | Add items. In the browser's network tools, right-click a request to the API and choose "Block request domain", then reload. Unblock it and reload again. | Blocked: an error message at the top, and the basket may look empty, with "No store prices yet" rather than "Comparing store prices…". Unblocked: the basket is back, unchanged. A failed load never wipes the saved basket. | | Not done | "Offline" mode would also block the dev server, so block only the API. |
| BSK-18 | Add a product with the Healthier Choice Symbol. | It shows a "Healthier Choice" badge in the search list and in the basket. | | Not done | |

## 5. Contributor: submit a price

Log in as a contributor and open `/contribute`.

| ID | Steps | Expected result | Key | Status | Notes |
|---|---|---|:-:|---|---|
| PRC-01 | Look at the page. | "Contributor workspace", "Share a price you spotted", a "Found something new?" panel with "Upload a new product", "Price details", "Show the price you spotted" with "Photo optional", then "Your product submissions" and "Your price submissions". | ⭐ | Not done | |
| PRC-02 | Type "magn" in "Product · search by name or brand". Pick one with the arrow keys and Enter. Then type "zzzz", and press Esc. | A list of matching products, each with its type. The hint reads "Showing N of 24 products. Select a suggestion from the list." The chosen product fills the box. "zzzz" shows "No products match. Try another name or product type." Esc closes the list. | ⭐ | Not done | |
| PRC-03 | Choose a milk product. Set "Optional type filter" to Milk, then to "All types", then to Bread. Click "Submit price". | Milk and "All types" keep the product in the box. Bread empties the box, and submitting says "Choose a product". | ⭐ | Not done | Fixed 4 Nov: the box used to keep showing the name after the choice was cleared. |
| PRC-04 | Click "Submit price" with nothing filled in. | "Choose a product", "Choose a store" and "Price must be greater than $0". The date stays at today. | | Not done | |
| PRC-05 | Enter prices `0`, `1000.01`, then `1000`. | "Price must be greater than $0", then "Price must be $1,000 or less". `1000` is allowed. | | Not done | |
| PRC-06 | Open the date picker. Then type tomorrow's date, then a date 31 days ago. | The picker only offers the last 30 days up to today. Typed dates give "Observed date cannot be in the future" and "Observed date must be within the last 30 days". | | Not done | |
| PRC-07 | Submit a usual price with no photo: Magnolia Fresh Milk, FairPrice, $3.63, today. | A "Price accepted; public prices update after nightly aggregation" message, and the form clears. The price is first in "Your price submissions" with an "Accepted" badge, "Observed {date}" and "Submitted {time}". The "N total" count goes up. | ⭐ | Not done | |
| PRC-08 | Submit an unusual price with a photo: the same milk at $20. | A "Submission sent for administrator review" message. The submission shows "Pending Review" and "Photo attached · visible to administrators". You can't see the photo. | ⭐ | Not done | |
| PRC-09 | Click "Add a price photo" and choose a JPG under 5 MB. Click "Remove". Then focus the photo area with Tab and press Enter. | A preview of the photo, then "Remove" clears it. Enter opens the file picker. | | Not done | |
| PRC-10 | Choose a GIF (pick "All files" in the picker), then the empty PNG, then the PNG over 5 MB. | "Choose a JPG or PNG image", "Choose a non-empty image", then "Image must be 5 MB or smaller". "Submit price" is disabled while a message shows. | | Not done | |
| PRC-11 | Submit a price with a photo of a few MB. | "Preparing image" with a percentage bar while it uploads, and the button reads "Saving...". | | Not done | |
| PRC-12 | Submit exactly the same product, store and price as PRC-07 again, the same day. | "You have already submitted this price for this product and store today." | | Not done | |
| PRC-13 | Submit more than 30 prices within an hour. | "You can submit up to 30 prices per hour. Please try again later." | | Not done | Slow to set up. Run it last. |
| PRC-14 | Fill in the form, choose a type filter and a photo, then click "Clear". | Every field, the type filter and the photo reset. | | Not done | |
| PRC-15 | Look at the cards in "Your price submissions". | No delete or edit buttons. Prices can't be deleted, by design. | | Not done | |
| PRC-16 | After an admin rejects your $20 price (ADP-04), reload. Do the same after an admin accepts one (ADP-03). | Rejected: a "Rejected" badge and "Rejection reason: {reason}". Accepted: an "Accepted" badge. | ⭐ | Not done | |
| PRC-17 | **Missing API address.** Delete the `VITE_API_BASE_URL` value in `.env.local`, restart `npm run dev` and open `/contribute`. Put it back afterwards. | The header shows as normal, with "Price submissions are not configured. Set VITE_API_BASE_URL in frontend/.env.local, or set VITE_PRICE_SUBMISSION_MODE=local." The page isn't blank. | | Not done | Fixed 4 Nov: the page used to be blank. |
| PRC-18 | In the afternoon, submit a usual price with the **earliest** date the picker allows (30 days ago). Do the same in "Upload a new product". | Both are accepted, any time of day. | | Not done | Fixed 6 Nov (backend): after 00:05 the earliest date used to be refused with "Observed date must be within the last 30 days". |
| PRC-19 | Choose a photo, then in the browser's network tools block requests to `*.amazonaws.com` (the photo bucket) and submit. Unblock afterwards. | "The photo upload failed. Check your connection and try again." Nothing is saved, and submitting again after unblocking works. | | Not done | The server's own check for a photo that never arrived (`PHOTO_NOT_FOUND`) can't be reached from the UI. The smoke test covers it ("photo that was never uploaded"). |

## 6. Contributor: new product requests

Log in as a contributor, open `/contribute` and click "Upload a new product". Use a made-up product, and delete it or have it rejected afterwards.

| ID | Steps | Expected result | Key | Status | Notes |
|---|---|---|:-:|---|---|
| NPR-01 | Open the dialog. Close it with ✕, then reopen it and press Esc. | "Upload a new product" with "Product name", "Brand", "Category" (with suggestions), "Pack quantity", "Pack unit" (ml, L, g, kg, pcs, rolls), "Units per pack", "Does it have any of these labels?" with "Healthier Choice Symbol" and the dietary tags, then "Store", "Price (SGD)", "Observed date", "Product picture (required)", "Price evidence (optional)" and "Submit new product for review". Both ways close it. | ⭐ | Not done | |
| NPR-02 | Fill in every field correctly, but add no product picture. Submit. | "A product picture is required for every new product." | ⭐ | Not done | |
| NPR-03 | Fill in Brand and Category. Set Product name to "x", leave Pack quantity empty, and set Units per pack to `1.5`. Submit. | One message: "Product name must be 2–120 characters; Pack quantity must be more than 0 and at most 100000; Units per pack must be a whole number from 1 to 100". There are no field codes (like `packQty:`) and no "Too small" or "Invalid input". | ⭐ | Not done | Fixed 4 Nov: it used to show the validation library's own messages. |
| NPR-04 | With valid product fields, leave Store empty and set the price to `0`. Submit. | "Choose a store; Price must be greater than $0" | | Not done | |
| NPR-05 | Tick five dietary tags, then untick one. | With five ticked, the other tags are disabled ("Choose up to five dietary tags."). Unticking one enables them again. | | Not done | |
| NPR-06 | In either picture box, choose a GIF, then the empty PNG, then the PNG over 5 MB, then a valid JPG. Click the remove button. | "Choose a JPG or PNG image", "Choose a non-empty image", "Image must be 5 MB or smaller". The JPG shows a preview and a "Remove product picture (required)" (or "Remove price evidence (optional)") button, which clears it. | | Not done | |
| NPR-07 | Propose a valid made-up product: "Test Oat Milk", brand "Test", category "plant milk", 1 L, 1 per pack, FairPrice, $5.45, today, with a product picture. | The button reads "Saving…", then the dialog closes. "Your product submissions" shows "Test Oat Milk · Pending", "Test · 1 × 1 L · FairPrice · $5.45", the picture, and "Delete pending product request". | ⭐ | Not done | |
| NPR-08 | Look for the pending product on Search and in the Smart basket search. | It isn't there until an admin approves it. | ⭐ | Not done | |
| NPR-09 | Propose a product that's in the catalog: "Magnolia Fresh Milk", brand "Magnolia", 946 ml, 1 per pack. Click the button that appears. | "This product is already in the catalog. Submit a price for it instead." and a "Submit a price for this product instead" button. The button closes the dialog and chooses that product in the price form. | ⭐ | Not done | |
| NPR-10 | Propose the same as NPR-09, but with Units per pack `6`. Delete it afterwards. | It's accepted as a pending request. A pack of 6 is a different product from a single one. | | Not done | Fixed 4 Nov (backend): it used to be refused as already in the catalog. |
| NPR-11 | As a **second** contributor, propose the same product as a pending request from NPR-07. | "Someone has already proposed this product. It is waiting for an admin." | | Not done | |
| NPR-12 | On a pending request, click "Delete pending product request" and cancel. Click it again and confirm. Propose the same product again. | The confirmation reads "Delete this request? Its product picture and price evidence photo will be removed too. This cannot be undone." Cancel changes nothing. Confirm shows "Deleting…", then the request disappears. Proposing it again works. | ⭐ | Not done | |
| NPR-13 | Open `/contribute` in two tabs. Delete a pending request in the first, then click its Delete button in the second. | The second tab says "This request no longer exists." and its list refreshes. | | Not done | |
| NPR-14 | Open `/contribute` in two tabs. An admin approves the request. Click Delete on it in the tab that hasn't refreshed. | "This product request is already approved." The list refreshes, showing it approved. | | Not done | |
| NPR-15 | After an admin approves your request (ADR-03), look at it in your list. | "{name} · Approved" and "Added to the catalog. Public prices update after nightly aggregation; reload Search or Smart Basket to see the product." There's no Delete button. | ⭐ | Not done | |
| NPR-16 | After an admin rejects your request (ADR-05), look at it in your list. | "{name} · Rejected" and "Rejection reason: {reason}". There's no Delete button. | ⭐ | Not done | |
| NPR-17 | With no requests yet, look at "Your product submissions". Then click "Refresh product submissions". | "New product submissions will appear here." Refresh reloads the list. | | Not done | |
| NPR-18 | Propose an 11th product within 24 hours. | "You can propose up to 10 new products a day. Please try again tomorrow." | | Not done | Delete the test requests afterwards. |

## 7. Admin: price review

Log in as an admin. You need a flagged price from PRC-08.

| ID | Steps | Expected result | Key | Status | Notes |
|---|---|---|:-:|---|---|
| ADP-01 | Open `/contribute`. | "Administrator workspace", "Review price evidence", and a count of flagged prices with "Awaiting review". Then "Review new product requests" and "Products and prices awaiting review" ("Administrator only"). There's no price form. | ⭐ | Not done | |
| ADP-02 | Look at a flagged price. | The photo, "Price evidence" and "Help shoppers trust this price" (or "No image" when none was attached). Then the product, "Pending Review", the price in SGD, the store, the observed date, "Submitted by {name} · {email}", "Submitted at" and "Evidence file {file name} · {size} MB". | ⭐ | Not done | |
| ADP-03 | Click "Accept". | A "Flagged price accepted" message. The card disappears and the count goes down. The contributor sees "Accepted" (PRC-16). | ⭐ | Not done | |
| ADP-04 | Click "Reject", then "Confirm rejection" with no reason. Type a reason and confirm. Also try "Cancel". | A "Reason for rejection" box ("Explain what needs to be corrected"). No reason: "Enter a reason before rejecting this submission." With a reason: a "Flagged price rejected" message, and the card disappears. "Cancel" closes the box. | ⭐ | Not done | |
| ADP-05 | Open the queue in two admin tabs. Accept a price in the first, then accept the same one in the second. | "This submission is already accepted." The second tab's queue refreshes. | | Not done | |
| ADP-06 | Decide every flagged price. | "Review queue is clear" and "New submissions will appear here." The count shows 0. | | Not done | |
| ADP-07 | Leave the queue open for more than 5 minutes (the photo link's lifetime), then reload a photo, e.g. by scrolling to one that hadn't loaded. | The photo still loads. If a link has expired, the page fetches fresh links once. | | Not done | |

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
| FRESH-03 | Submit an accepted price. | The message says "public prices update after nightly aggregation", and Search and the Smart basket don't change until after 00:05. | | Not done | |
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

The site on CloudFront (`SiteUrl`, currently https://d2xn4fxnysvlr5.cloudfront.net), built by `python infra\deploy.py` against the dev stack. Keep the browser's developer console open: it must show no CORS, mixed-content or "Failed to load resource" errors. See [docs/deployment.md](../deployment.md).

| ID | Steps | Expected result | Key | Status | Notes |
|---|---|---|:-:|---|---|
| DEP-01 | Open the site URL. Then try it with `http://` instead of `https://`. | The Smart basket opens over HTTPS (padlock in the address bar). `http://` redirects to `https://`. | ⭐ | Done 6 Nov | Checked with curl: `http://…/search` → 301 to `https://…/search`, which returns the app. Still worth a look in a browser. |
| DEP-02 | Open `{site}/search` directly, then reload. Do the same for `{site}/contribute` and `{site}/nothing-here`. | `/search` opens and survives a reload. `/contribute` asks you to log in, then opens. `/nothing-here` goes to `/basket`. Never an "AccessDenied" XML page. | ⭐ | Not done | Reloading a page other than `/` relies on CloudFront's fallback to `index.html`. 6 Nov: `/search` and `/contribute` return the app (checked by `infra/deploy.py`); the in-browser redirects still need a browser. |
| DEP-03 | On Search, look at the catalog and at Magnolia Fresh Milk. | The dev catalog with prices loads, and the milk shows its picture. | ⭐ | Not done | |
| DEP-04 | Register a new account on the site, log in as a contributor, sign out, then log in as an admin on the Admin tab. | The same results as AUTH-01 and AUTH-08, against the dev Cognito user pool. | ⭐ | Not done | |
| DEP-05 | As a contributor, submit a price **with a photo**, then an unusual one with a photo. As an admin, open the flagged one. | Both are saved (accepted, then pending review), with no CORS error in the console. The admin sees the photo. | ⭐ | Not done | Proves the photo bucket accepts uploads from the site's address. 6 Nov: the smoke test confirmed the bucket's CORS answer for the site ("photo bucket accepts uploads from the deployed site"). |
| DEP-06 | Propose a new product with a picture from the site. As an admin, open it in the review queue, then reject it. | It appears pending with its picture, in your list and in the admin queue. | | Not done | |
| DEP-07 | Build a Smart basket and open Healthier options. | Prices and swaps work as in §4. | | Not done | |
| DEP-08 | Note something visible, redeploy the frontend with a change (`python infra\deploy.py --frontend-only`), then reload the open tab normally. | The reload shows the new version, without clearing the cache. | | Not done | `index.html` is never cached; the other files have new names each build. |
| DEP-09 | In the developer tools' Network tab, select the page's first request (the document) and look at its response headers. | `strict-transport-security`, `x-content-type-options: nosniff` and `x-frame-options` are present. | | Done 6 Nov | Also `referrer-policy`. From CloudFront's security headers policy. |

## Running the automated tests

One script runs every automated suite and prints a table of what passed. Run it from the repository root (any Python 3):

```powershell
python tests\run_all.py
```

- **By default** it runs the backend unit tests (`pytest`), the frontend unit tests (`npm test`) and the template check (`sam validate --lint`). Nothing is sent to AWS.
- **`--aws`** also runs the end-to-end smoke test and the Smart Basket evaluation against dev. They need AWS credentials in the terminal.
- **`--only backend,frontend`** runs just the named suites (backend, frontend, lint, smoke, basket).
- A suite whose tool isn't installed shows `Skipped` with what to set up. For example, the frontend tests need `npm ci` in `frontend/` once.
- The script exits with an error if any suite failed.

Each suite on its own, and what to expect, is in [backend/TESTING.md part 1](../../backend/TESTING.md#1-automated-checks-5-min).
