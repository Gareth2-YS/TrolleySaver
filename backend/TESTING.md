# Testing the backend

A step-by-step guide to checking that the backend works: before a handoff, after changing code, or when something looks wrong. Every step shows the command to type and what you should see. All commands and outputs here come from real runs against dev on 24 Oct 2026.

- **Environment:** dev (CloudFormation stack `trolleysaver-dev`). The tests create data in the shared dev tables and remove it again.
- **You need:** this repository, Python 3, the AWS CLI, and working credentials for the team's AWS account.
- **Time:** about 30 minutes for everything. Part 1 alone takes 5.
- **Terminal:** Windows PowerShell, which is what VS Code opens on Windows. In bash, use `/` instead of `\` in paths and `$(date +%F)` for today's date.
- **Pasting:** some terminals join pasted lines into one long line. The code blocks here still work if that happens: none contain `#` comments, and in blocks with several lines each line ends with `;`. If a block gives a strange error anyway, paste it one line at a time.

> ⚠️ **Run every command from the `backend` folder.** VS Code's terminal opens in the repository root (`…\TrolleySaver>`), so type `cd backend` first. Your prompt should end in `\TrolleySaver\backend>`. If you see `The module '.venv' could not be loaded`, you're in the wrong folder.

| Part | What it covers |
|---|---|
| [0. Set up your terminal](#0-set-up-your-terminal) | Folder, Python environment, AWS credentials, test variables. **Do this first, in every new terminal.** |
| [Common problems](#common-problems) | Error messages and fixes |
| [1. Automated checks](#1-automated-checks-5-min) | Unit tests, template, a 27-step end-to-end run |
| [2. Load the product catalog](#2-load-the-product-catalog-once) | Adds the spreadsheet's products and prices to dev (once) |
| [3. Call each Lambda directly](#3-call-each-lambda-directly-no-login) | Every endpoint's success and failure cases, without logging in |
| [4. Use the real API with a real login](#4-use-the-real-api-with-a-real-login) | Cognito sign-up and sign-in, tokens and real HTTP responses |
| [5. Create an admin account](#5-create-an-admin-account) | Only when someone needs one |
| [6. When something fails](#6-when-something-fails) | Logs, data, local debugging |
| [7. Pre-handoff checklist](#7-pre-handoff-checklist) | Everything above in one list |
| [8. Smart Basket](#8-smart-basket) | What the basket comparison covers and which test checks each part, then unit tests, direct calls, a hand-worked example, the spreadsheet evaluation and real HTTP |
| [9. Search](#9-search) | What product search and filters cover and which test checks each part, then unit tests, direct calls, field errors and real HTTP |

---

## 0. Set up your terminal

Variables and folder changes don't carry over to a new terminal. **Repeat 0.1–0.5 every time you open one** (0.3 only the first time).

### 0.1 Open a terminal

In VS Code: **Terminal → New Terminal**. The prompt shows the repository root:

```
PS C:\Users\<you>\Documents\GitHub\TrolleySaver>
```

### 0.2 Go to the backend folder

```powershell
cd backend
```

The prompt should now end in `\backend>`:

```
PS C:\Users\<you>\Documents\GitHub\TrolleySaver\backend>
```

### 0.3 Create the Python environment (first time only)

```powershell
python -m venv .venv;
.venv\Scripts\python -m pip install -r requirements-dev.txt
```

This creates a `.venv` folder inside `backend` and installs the packages; it takes a minute or two. Check it worked:

```powershell
Test-Path .venv\Scripts\python.exe
```

You should see `True`. `False` means you're not in the `backend` folder, or the first command failed.

For `sam validate` and `sam deploy` in part 1 you also need the SAM CLI: `winget install Amazon.SAM-CLI`, then open a new terminal.

### 0.4 Check your AWS credentials

```powershell
aws sts get-caller-identity --query Arn --output text
```

You should see your identity in the team account (`158670174505`):

```
arn:aws:sts::158670174505:assumed-role/AWSReservedSSO_nusisb_IsbUsersPS_b26fe32de66dfd87/<your NUS email>
```

If you get an error such as `The security token included in the request is expired` or `Unable to locate credentials`, your temporary AWS credentials have run out. Refresh them:

1. Sign in to the AWS access portal and open **Access keys** for the team account.
2. Copy **Option 2** (the credentials-file block) into `%USERPROFILE%\.aws\credentials`, replacing the old `[default]` values. Alternatively, paste the **PowerShell** commands from Option 1 into this terminal; those only last for this terminal.
3. Run the check again.

(If you've set up an SSO profile with `aws configure sso`, run `aws sso login` instead.)

### 0.5 Set the test variables

Two variables are used throughout parts 3 and 4:
- `$milk` is the product id of Magnolia Fresh Milk in dev. Its believable price is 181–548 cents.
- `$today` is today's date.

This single line sets both and prints them back:

```powershell
$milk = "a2210900-d837-5e6d-bbbc-73dea4f80ea1"; $today = Get-Date -Format "yyyy-MM-dd"; "milk=$milk today=$today"
```

**You should see:**

```
milk=a2210900-d837-5e6d-bbbc-73dea4f80ea1 today=2026-10-24
```

…with today's date. **If that line doesn't appear, the variables weren't set**; run the command again.

Later, if a command answers `"productId": "Choose a product"` or `"observedAt": "Choose the observed date"`, a variable is missing in this terminal. That usually means it's a new terminal. Run 0.5 again.

## Common problems

| You see | Cause | Fix |
|---|---|---|
| `The module '.venv' could not be loaded`, or `The term '.venv\Scripts\python' is not recognized` | You're not in the `backend` folder | `cd backend` (0.2) |
| `False` from `Test-Path .venv\Scripts\python.exe` | The Python environment wasn't created here | 0.3 |
| `ModuleNotFoundError: No module named 'boto3'` (or `requests`, `openpyxl`, `moto`) | Packages not installed | `.venv\Scripts\python -m pip install -r requirements-dev.txt` |
| `The security token included in the request is expired`, `ExpiredToken`, `Unable to locate credentials` | AWS credentials missing or expired | 0.4 |
| `"productId": "Choose a product"` and/or `"observedAt": "Choose the observed date"` | `$milk` and/or `$today` aren't set in this terminal: it's a new terminal, or the setup line didn't fully run | 0.5, and check that it prints `milk=… today=…` |
| A pasted block gives `Unexpected token` or only half of it seems to run | Your terminal joined the pasted lines into one | Paste the block one line at a time |
| `sam : The term 'sam' is not recognized` | SAM CLI not installed, or the terminal was opened before installing | `winget install Amazon.SAM-CLI`, then open a new terminal |
| `HTTP 500` with `"code": "INTERNAL_ERROR"`, or `Lambda crashed: …` | A bug in the backend | [Part 6](#6-when-something-fails) |

---

## 1. Automated checks (5 min)

**Before you start:** part 0 done in this terminal. The prompt ends in `\backend>`.

### 1.1 Unit tests

```powershell
.venv\Scripts\python -m pytest
```

**What it checks:** 132 tests of the Lambda code (including the Smart Basket, its daily prices and Search) and the seed script, run against an in-memory fake of AWS. Nothing is sent to the real account.
**You should see:** a row of dots, then `132 passed in …s`.

### 1.2 Template check

```powershell
sam validate --lint
```

**You should see:** `C:\…\backend\template.yaml is a valid SAM Template`.

### 1.3 End-to-end test against dev

```powershell
.venv\Scripts\python scripts\smoke_test.py
```

**What it checks:** the deployed backend over real HTTP, exactly as the frontend will use it. It signs up a throwaway user, logs in, compares a basket, uploads a photo, submits prices and moderates as a throwaway admin, then deletes everything it created. Takes about a minute.
**You should see:** 32 lines starting with `PASS`, then:

```
PASS  CORS preflight allowed
Cleaning up...

All checks passed
```

If a line says `FAIL`, the reason is in brackets after it.

## 2. Load the product catalog (once)

**Before you start:** part 0 done in this terminal.

Dev started with only 2 products (the two milks). This step adds the rest from `data/products 241026.xlsx`. It **never replaces or changes existing data**, and running it again is safe.

### 2.1 Preview what would be added

```powershell
.venv\Scripts\python scripts\seed_catalog.py --env dev --dry-run
```

**You should see:** a few `note:` lines (skipped promotion rows), one `add` or `keep` line per product, then this summary and `Dry run: nothing was written.`:

```
trolleysaver-dev-product:           22 to add,   2 already exist (kept)
trolleysaver-dev-retailer:           0 to add,   3 already exist (kept)
trolleysaver-dev-price-submission:  66 to add,   6 skipped (a seed price already exists for that product and store)
```

### 2.2 Add it

```powershell
.venv\Scripts\python scripts\seed_catalog.py --env dev
```

It prints the same summary, then asks:

```
Add these items to the shared dev tables? Type the env name to confirm:
```

Type `dev` and press Enter. **You should see:** `Added 22 products, 0 retailers and 66 prices to trolleysaver-dev-*.` If you run it again, it says `Nothing to add.`

## 3. Call each Lambda directly (no login)

**Before you start:** part 0 done in this terminal, **including the variables in 0.5**. Do the steps in order, because later steps use what earlier ones create.

### How this works

Normally API Gateway checks the user's Cognito login, then passes the Lambda an event describing who the user is. `scripts/invoke.py` builds that event itself and calls the Lambda directly, so you can test as any user without an account or a token. It works because your AWS credentials are allowed to call the Lambdas directly; people outside the AWS account still have to log in through the API.

- **Who you are:** by default the fake user `invoke-test-user`. Use `--as admin` for the fake admin `invoke-test-admin`, `--as anonymous` for a logged-out caller, or `--user-id <anything>` for another user.
- **Request body:** `--set name=value` builds the JSON for you. Whole numbers become numbers; everything else is text.
- **Output:** the first line is `HTTP <status code>`, followed by the JSON the frontend would receive. The codes you'll see:
  - `200` OK
  - `201` created
  - `400` invalid input
  - `401` not logged in
  - `403` not allowed
  - `409` conflict
  - `429` too many requests

### 3.1 Catalog

```powershell
.venv\Scripts\python scripts\invoke.py products
```

**You should see** (2 products before part 2, 24 after):

```
HTTP 200
{
  "items": [
    {
      "hcs": false,
      "category": "milk",
      "brand": "Magnolia",
      "packQty": 946,
      "id": "a2210900-d837-5e6d-bbbc-73dea4f80ea1",
      "name": "Magnolia Fresh Milk",
      "minCents": 181,
      "packUnit": "ml",
      "maxCents": 548
    },
    …
```

```powershell
.venv\Scripts\python scripts\invoke.py retailers
```

**You should see:** `HTTP 200` and three stores, with ids `coldstorage`, `fairprice` and `shengsiong`.

### 3.2 Submit a normal price → accepted

```powershell
.venv\Scripts\python scripts\invoke.py submit --set productId=$milk --set retailerId=fairprice --set priceCents=363 --set observedAt=$today
```

**You should see:**

```
HTTP 201
{
  "productId": "a2210900-d837-5e6d-bbbc-73dea4f80ea1",
  "submissionId": "…",
  "retailerId": "fairprice",
  "userId": "invoke-test-user",
  "priceCents": 363,
  "observedAt": "2026-10-23T16:00:00.000Z",
  "submittedAt": "2026-10-24T08:39:41.120Z",
  "status": "accepted",
  "id": "YTIyMTA5MDAt…",
  "productName": "Magnolia Fresh Milk",
  "retailerName": "FairPrice"
}
```

- **`"status": "accepted"`** because 363 cents is inside the milk's 181–548 range.
- **`observedAt`** looks like yesterday at 16:00. That's midnight today in Singapore, stored in UTC.

### 3.3 Submit an unusual price → flagged

```powershell
.venv\Scripts\python scripts\invoke.py submit --set productId=$milk --set retailerId=fairprice --set priceCents=2000 --set observedAt=$today
```

**You should see:** `HTTP 201` and `"status": "flagged"`. $20.00 is above the 548-cent maximum, so it waits for an admin (step 3.8).

### 3.4 Submit the same price again → duplicate

Run the command from 3.2 again. **You should see:**

```
HTTP 409
{
  "code": "DUPLICATE_SUBMISSION",
  "message": "You have already submitted this price for this product and store today.",
  "requestId": "…"
}
```

### 3.5 Invalid input → field errors

```powershell
.venv\Scripts\python scripts\invoke.py submit --set productId=$milk --set retailerId=fairprice --set priceCents=3.50 --set observedAt=2099-01-01
```

**You should see:**

```
HTTP 400
{
  "code": "VALIDATION_ERROR",
  "message": "Some fields are invalid.",
  "requestId": "…",
  "fieldErrors": {
    "priceCents": "Price must be a whole number of cents greater than 0",
    "observedAt": "Observed date cannot be in the future"
  }
}
```

```powershell
.venv\Scripts\python scripts\invoke.py submit --set productId=not-a-product --set retailerId=fairprice --set priceCents=363 --set observedAt=$today
```

**You should see:** `HTTP 400`, `"code": "VALIDATION_ERROR"`, `"fieldErrors": { "productId": "Unknown product" }`.

### 3.6 Photo upload

**a. Make a test image** in your temp folder, so nothing lands in the repo. Or skip this and use any JPG or PNG, such as a photo of a shelf tag, by setting `$png = "C:\path\to\photo.jpg"`.

```powershell
$png = "$env:TEMP\trolleysaver-test.png";
Add-Type -AssemblyName System.Drawing;
$bmp = New-Object System.Drawing.Bitmap 260, 90;
$g = [System.Drawing.Graphics]::FromImage($bmp); $g.Clear([System.Drawing.Color]::White);
$g.DrawString('Test price $3.65', (New-Object System.Drawing.Font "Arial", 20), [System.Drawing.Brushes]::Black, 10, 28);
$bmp.Save($png, [System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $bmp.Dispose();
"image saved: $png ($((Get-Item $png).Length) bytes)"
```

**You should see:** `image saved: C:\Users\<you>\AppData\Local\Temp\trolleysaver-test.png (1621 bytes)`.

**b. Upload it.** The script does what the browser does: it asks the upload Lambda for a one-time upload form, then sends the file straight to S3. The second line saves the returned `photoKey` in `$photoKey` for step c.

```powershell
$up = .venv\Scripts\python scripts\invoke.py upload-photo --file $png; $up;
$photoKey = [string](($up -match '^photoKey: ') -replace '^photoKey: ', ''); "saved photoKey=$photoKey"
```

**You should see:**

```
Uploaded trolleysaver-test.png (image/png, 1621 bytes) to S3 (HTTP 204)
photoKey: price-evidence/invoke-test-user/5e7d40d0-….png
saved photoKey=price-evidence/invoke-test-user/5e7d40d0-….png
```

**c. Submit a price with the photo:**

```powershell
.venv\Scripts\python scripts\invoke.py submit --set productId=$milk --set retailerId=shengsiong --set priceCents=365 --set observedAt=$today --set photoKey=$photoKey
```

**You should see:** `HTTP 201` and `"status": "accepted"`, plus `"photoKey"`, `"photoContentType": "image/png"`, `"photoSizeBytes"` and a long `"photoUrl": "https://trolleysaver-dev-photos-…"`. Copy the `photoUrl` into a browser **within 5 minutes** and you should see the "Test price $3.65" image. After 5 minutes the link stops working on purpose: photos are private.

**d. Things that must be refused:**

| Try | Command | You should see |
|---|---|---|
| Wrong file type | `Copy-Item $png "$env:TEMP\trolleysaver-test.gif"; .venv\Scripts\python scripts\invoke.py upload-photo --file "$env:TEMP\trolleysaver-test.gif"` | `upload-url Lambda refused the request:`, `HTTP 400`, `"contentType": "Must be image/jpeg or image/png"` |
| File over 5 MB | `[IO.File]::WriteAllBytes("$env:TEMP\trolleysaver-big.png", (New-Object byte[] (6MB))); .venv\Scripts\python scripts\invoke.py upload-photo --file "$env:TEMP\trolleysaver-big.png"` | `HTTP 400`, `"code": "IMAGE_TOO_LARGE"`, `"message": "Image must be 5 MB or smaller."` |
| Using someone else's photo | `.venv\Scripts\python scripts\invoke.py submit --user-id someone-else --set productId=$milk --set retailerId=coldstorage --set priceCents=366 --set observedAt=$today --set photoKey=$photoKey` | `HTTP 400`, `"photoKey": "Use the photoKey returned by your upload URL request"` |

### 3.7 My submissions

```powershell
.venv\Scripts\python scripts\invoke.py mine
```

**You should see** `HTTP 200` and your three submissions, newest first (shortened here):

```
"priceCents": 365,  "status": "accepted", "retailerName": "Sheng Siong", "photoUrl": "https://…"
"priceCents": 2000, "status": "flagged",  "retailerName": "FairPrice"
"priceCents": 363,  "status": "accepted", "retailerName": "FairPrice"
```

### 3.8 Admin moderation

Run these one at a time:

```powershell
.venv\Scripts\python scripts\invoke.py review-queue
```

→ `HTTP 403`, `"code": "FORBIDDEN"`, `"message": "Administrator permission is required."` Normal users can't see the queue.

```powershell
.venv\Scripts\python scripts\invoke.py review-queue --as admin
```

→ `HTTP 200`, with the 2000-cent submission from 3.3 and `"status": "flagged"`. Save its `id` in `$id`:

```powershell
$id = ((.venv\Scripts\python scripts\invoke.py review-queue --as admin | Select-Object -Skip 1) | Out-String | ConvertFrom-Json).items[0].id; "saved id=$id"
```

→ `saved id=` followed by a long code (`YTIyMTA5MDAt…`). Now try to reject without a reason:

```powershell
.venv\Scripts\python scripts\invoke.py moderate --as admin --id $id --set decision=rejected
```

→ `HTTP 400`, `"reason": "Enter a reason before rejecting"`.

```powershell
.venv\Scripts\python scripts\invoke.py moderate --as admin --id $id --set decision=rejected --set reason="Shelf label is unreadable"
```

→ `HTTP 200`, `"status": "rejected"`, `"rejectionReason": "Shelf label is unreadable"`, `"reviewedBy": "invoke-test-admin"`.

```powershell
.venv\Scripts\python scripts\invoke.py moderate --as admin --id $id --set decision=accepted
```

→ `HTTP 409`, `"code": "ALREADY_MODERATED"`, `"message": "This submission is already rejected."` Each flagged price can be decided once.

Run `invoke.py mine` again: the 2000-cent item now shows `"status": "rejected"`.

### 3.9 Logged out

```powershell
.venv\Scripts\python scripts\invoke.py mine --as anonymous
```

→ `HTTP 401`, `"code": "UNAUTHENTICATED"`, `"message": "Sign in again and retry."` Through the real API, API Gateway stops this before the Lambda even runs (part 4).

### 3.10 Rate limit (optional, about 1 minute)

Each user can submit 30 prices per hour. You already have 3, so of these 31 attempts, 27 should succeed and 4 be refused:

```powershell
$codes = foreach ($cents in 400..430) { (.venv\Scripts\python scripts\invoke.py submit --set productId=$milk --set retailerId=coldstorage --set priceCents=$cents --set observedAt=$today)[0] };
$codes | Group-Object | ForEach-Object { "$($_.Name) x$($_.Count)" }
```

**You should see:**

```
HTTP 201 x27
HTTP 429 x4
```

### 3.11 Clean up (always)

Dev is shared, so remove what you created:

```powershell
.venv\Scripts\python scripts\invoke.py cleanup;
.venv\Scripts\python scripts\invoke.py mine
```

**You should see:**

```
invoke-test-user: deleted 3 submission(s), 1 photo(s) and the profile row      ← 30 if you did 3.10
invoke-test-admin: deleted 0 submission(s), 0 photo(s) and the profile row
```

…and then `HTTP 200` with `"items": []`.

## 4. Use the real API with a real login

**Before you start:** part 0 done in this terminal, including the variables. This part goes through API Gateway and Cognito exactly as the frontend will, using a throwaway contributor account.

### 4.0 Paste these helpers

Paste them once per terminal; they disappear when it closes. Each helper is one long line:
- `StackOutput` reads the dev stack's API address and Cognito ids.
- `Cognito` calls Cognito's public sign-up and sign-in endpoint.
- `Call` sends an HTTP request and always prints the status code, even for errors.

```powershell
function StackOutput($key) { aws cloudformation describe-stacks --stack-name trolleysaver-dev --query "Stacks[0].Outputs[?OutputKey=='$key'].OutputValue" --output text };
function Cognito($action, $body) { Invoke-RestMethod -Method Post -Uri "https://cognito-idp.ap-southeast-1.amazonaws.com/" -ContentType "application/x-amz-json-1.1" -Headers @{ "X-Amz-Target" = "AWSCognitoIdentityProviderService.$action" } -Body ($body | ConvertTo-Json -Depth 5) };
function Call($method, $path, $body, $headers = @{}) { $params = @{ Method = $method; Uri = "$api$path"; Headers = $headers; UseBasicParsing = $true }; if ($body) { $params.Body = $body | ConvertTo-Json -Depth 5; $params.ContentType = "application/json" }; try { $r = Invoke-WebRequest @params; "HTTP $($r.StatusCode)"; $r.Content } catch { "HTTP $([int]$_.Exception.Response.StatusCode)"; $_.ErrorDetails.Message } };
$api = StackOutput ApiUrl; $clientId = StackOutput UserPoolClientId; $poolId = StackOutput UserPoolId;
"api=$api"
```

**You should see:** `api=https://<api-id>.execute-api.ap-southeast-1.amazonaws.com/dev`, where `<api-id>` is the dev API's short random id.

### 4.1 Sign up and sign in a throwaway contributor

```powershell
$email = "tester-$(Get-Random)@example.com"; $password = "Test-Passw0rd!";
$signup = Cognito SignUp @{ ClientId = $clientId; Username = $email; Password = $password; UserAttributes = @(@{ Name = "email"; Value = $email }, @{ Name = "name"; Value = "Test Contributor" }) }; $signup
```

**You should see:** `UserConfirmed` is `True`, so no verification code is needed, plus a `UserSub` (the new user's id). PowerShell shows it either as a small table or as two lines:

```
UserConfirmed UserSub
------------- -------
         True 99cae5fc-7051-703a-2fb2-3f2414205b5f
```

```powershell
$tokens = (Cognito InitiateAuth @{ AuthFlow = "USER_PASSWORD_AUTH"; ClientId = $clientId; AuthParameters = @{ USERNAME = $email; PASSWORD = $password } }).AuthenticationResult;
$auth = @{ Authorization = "Bearer $($tokens.AccessToken)" };
"token expires in $($tokens.ExpiresIn) seconds"
```

**You should see:** `token expires in 3600 seconds`.

### 4.2 Requests and responses

Run each command and compare:

| Request | Command | You should see |
|---|---|---|
| Public catalog | `Call GET "/products"` | `HTTP 200` and the product list |
| No token | `Call GET "/price-submissions/mine"` | `HTTP 401`, `{"message":"Unauthorized"}` |
| ID token instead of access token | `Call GET "/price-submissions/mine" $null @{ Authorization = "Bearer $($tokens.IdToken)" }` | `HTTP 401`, `{"message":"Unauthorized"}` |
| Access token | `Call GET "/price-submissions/mine" $null $auth` | `HTTP 200`, `{"items": [], "nextToken": null}` |
| Admin route as a contributor | `Call GET "/admin/price-submissions" $null $auth` | `HTTP 403`, `"code": "FORBIDDEN"` |
| Typo in the path | `Call GET "/price-submission/mine" $null $auth` | `HTTP 403`, `{"message":"Invalid key=value pair …"}`. That's API Gateway saying "no such route". |
| Submit a normal price | `Call POST "/price-submissions" @{ productId = $milk; retailerId = "coldstorage"; priceCents = 365; observedAt = $today } $auth` | `HTTP 201` and the record, with `"status": "accepted"` |
| Submit an unusual price | `Call POST "/price-submissions" @{ productId = $milk; retailerId = "coldstorage"; priceCents = 9999; observedAt = $today } $auth` | `HTTP 201` and the record, with `"status": "flagged"` |

### 4.3 Moderate as a real admin (optional)

This needs a real admin account. **None exist yet.** Create one in part 5, or skip this step. If you create one just for this test, delete it afterwards (part 5).

```powershell
$adminEmail = "<admin email>"; $adminPassword = "<admin password>";
$adminTokens = (Cognito InitiateAuth @{ AuthFlow = "USER_PASSWORD_AUTH"; ClientId = $clientId; AuthParameters = @{ USERNAME = $adminEmail; PASSWORD = $adminPassword } }).AuthenticationResult;
$adminAuth = @{ Authorization = "Bearer $($adminTokens.AccessToken)" };
$r = Call GET "/admin/price-submissions" $null $adminAuth; $r[0]; ($r[1] | ConvertFrom-Json).items | Select-Object status, priceCents, submitterName, submitterEmail
```

**You should see:** `HTTP 200` and the 9999-cent price from 4.2 as `flagged`, with `submitterName` "Test Contributor" and the tester's email.

```powershell
$flaggedId = (($r[1] | ConvertFrom-Json).items | Where-Object submitterEmail -eq $email)[0].id;
Call PATCH "/admin/price-submissions/$flaggedId" @{ decision = "accepted" } $adminAuth;
Call PATCH "/admin/price-submissions/$flaggedId" @{ decision = "rejected"; reason = "Too late" } $adminAuth
```

**You should see:**
1. `HTTP 200`, with the record now showing `"status": "accepted"`.
2. `HTTP 409`, `"code": "ALREADY_MODERATED"`.

### 4.4 Clean up (always)

```powershell
.venv\Scripts\python scripts\invoke.py cleanup --user-id $signup.UserSub;
aws cognito-idp admin-delete-user --user-pool-id $poolId --username $email
```

**You should see:** `<user id>: deleted 2 submission(s), 0 photo(s) and the profile row`. The second command prints nothing when it succeeds.

## 5. Create an admin account

**No admin accounts exist yet, on purpose.** Create one only when someone needs it, such as the frontend developer working on the admin review page, or you for step 4.3. Anyone with access to the team's AWS account can do this, including the frontend developer. Admin accounts can't be created through the app's sign-up.

**Before you start:** 0.1–0.4 done in this terminal.

```powershell
.venv\Scripts\python scripts\create_admin.py --env dev --email you@example.com --name "Your Name"
```

1. It asks `Password for the admin account:` and then `Type it again:`. **Nothing appears while you type; that's normal.**
2. The password needs 8+ characters, with an upper-case letter, a lower-case letter, a number and a symbol. If it doesn't qualify, the script says so and asks again before creating anything.
3. **You should see:**

   ```
   Created you@example.com
   you@example.com is an admin (sub …). Sign in with this email and password; no email is sent.
   ```

- **Email address:** no email is ever sent, so any address works. Pick one you'll recognise, because it's the login name.
- **Running it again** for the same email resets that account's password and makes sure it's an admin.
- **Using it:** sign in on the frontend's **Admin** tab (once the frontend uses Cognito), or use it in step 4.3.
- **⚠️ Don't create admins in the AWS console.** The console only sets a temporary password. Cognito then forces a password change at first sign-in, which the frontend can't handle, and console-made accounts get no profile row.

**Managing admins.** First save the user pool id:

```powershell
$poolId = aws cloudformation describe-stacks --stack-name trolleysaver-dev --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" --output text; "poolId=$poolId"
```

You should see `poolId=ap-southeast-1_` followed by the dev user pool's id. Then run whichever of these you need.

List the admins' emails (prints nothing if there are none):

```powershell
aws cognito-idp list-users-in-group --user-pool-id $poolId --group-name admin --query "Users[].Attributes[?Name=='email'].Value | []" --output text
```

Remove someone's admin rights but keep their account:

```powershell
aws cognito-idp admin-remove-user-from-group --user-pool-id $poolId --username you@example.com --group-name admin
```

Delete an account completely:

```powershell
aws cognito-idp admin-delete-user --user-pool-id $poolId --username you@example.com
```

## 6. When something fails

Check [Common problems](#common-problems) first. Then:

1. **Read the error.** The `code` and `message` tell you which rule failed; [docs/api §5](../docs/api/README.md#5-errors) lists them all. A response with only `{"message": …}` came from API Gateway (bad token or wrong path), not from the backend code.
2. **Read the Lambda logs.** Times are UTC, so Singapore time minus 8 hours. For the last 30 minutes:

   ```powershell
   aws logs tail /aws/lambda/trolleysaver-dev-create-submission --since 30m --format short
   ```

   To watch live while you send requests from another terminal (Ctrl+C to stop):

   ```powershell
   aws logs tail /aws/lambda/trolleysaver-dev-create-submission --follow
   ```

   - **Other functions:** `-catalog`, `-basket`, `-price-aggregator`, `-upload-url`, `-my-submissions`, `-admin-submissions`, `-cognito-pre-signup`, `-cognito-post-confirmation`.
   - **What appears:** refused requests are logged as `Client error <CODE>: …`, and crashes (`HTTP 500`) with a full Python traceback.
3. **Reproduce it locally.** Add `--local` to the same `invoke.py` command. It then runs the code in your `lambdas/` folder against the real dev tables, so you can add `print()` calls or breakpoints without deploying.
4. **Look at the data.** AWS console → DynamoDB → Tables → `trolleysaver-dev-price-submission` → *Explore table items*. Photos are in S3 → `trolleysaver-dev-photos-…` → `price-evidence/`.
5. **After fixing code:**
   1. `.venv\Scripts\python -m pytest`
   2. `sam deploy --config-env dev`
   3. `.venv\Scripts\python scripts\smoke_test.py`

## 7. Pre-handoff checklist

- [ ] 1.1: `pytest` shows `132 passed`
- [ ] 1.2: `sam validate --lint` is clean
- [ ] 1.3: `smoke_test.py` says `All checks passed`
- [ ] 2: the catalog is in dev, and `invoke.py products` lists 24 products
- [ ] 3: Lambda walkthrough done, with results matching the expectations
- [ ] 4: real-login walkthrough done (4.3 is optional)
- [ ] 8.4: `basket_eval.py` says `0 failed`
- [ ] 9.2–9.4: search returns the two milks for `q=milk&maxPriceCents=500`, and bad parameters give `400` with the field named
- [ ] Cleanup done:
  - `invoke.py mine` shows `"items": []`
  - no `tester-…@example.com` accounts remain: `aws cognito-idp list-users --user-pool-id $poolId --query "Users[].Username"`
- [ ] The frontend developer:
  - has the dev values (`ApiUrl`, `UserPoolId`, `UserPoolClientId`)
  - has the links to [docs/handoffs](../docs/handoffs/README.md) and [docs/api](../docs/api/README.md)
  - knows **no admin accounts exist yet** and how to create one ([auth handoff §5](../docs/handoffs/2026-10-24-auth-backend-to-frontend.md#5-admin-accounts-none-exist-yet))

## 8. Smart Basket

**Before you start:** part 0 done in this terminal, the catalog loaded (part 2), and the daily prices worked out at least once ([below](#daily-prices-run-the-nightly-job-by-hand)). The evaluation compares the backend with the spreadsheet, so dev needs the spreadsheet's products and prices.

`POST /basket/compare` is public and only reads data, so 8.1–8.6 create no submissions and need no cleanup. What it returns, and the rules it follows, are in [docs/api → `POST /basket/compare`](../docs/api/README.md#post-basketcompare).

### What Smart Basket covers

The shopper picks products and quantities. The backend answers with two baskets side by side:
- **Basket:** exactly what the shopper picked, priced at every store.
- **Healthier basket:** the same list with each product swapped for a Healthier Choice (HCS) product in the same category, where one exists.

For each basket it returns:
- the cheapest store,
- every store's total and per-item shopping list,
- the items a store has no price for,
- how much the cheapest store saves compared with each other store.

Finally, it says how much more (or less) the healthier basket costs.

This is the Preliminary Report's "Plan the basket" feature, its Basket Optimisation rules, and the Smart Basket part of its system evaluation. The table shows each behaviour and the test that checks it. Test names are in:
- `tests/test_basket_compare.py`: the pure calculation,
- `tests/test_basket_handler.py`: the whole basket Lambda against fake DynamoDB,
- `tests/test_daily_prices.py`: the nightly daily-price job.

**Prices it uses (the daily average)**

Each store's price for a product is a **daily average** stored in the `retailer-price` table. The `price-aggregator` Lambda works it out at 00:05 Singapore time. The rules are in [database-design.md §4](../docs/architecture/database-design.md#4-daily-average-price-retailer-price).

| Behaviour | Checked by |
|---|---|
| Averages the accepted prices **submitted during the previous Singapore day** (midnight to midnight SGT) | `test_window_is_one_singapore_day_in_utc`, `test_window_edges`, `test_default_run_averages_yesterday`, `test_yesterday_is_in_singapore_time` |
| Each product **and store** is averaged separately; one store's prices never affect another's | `test_each_product_and_retailer_is_averaged_separately` |
| The mean, rounded to the nearest cent, halves up (250 and 251 give 251) | `test_average_rounds_to_the_nearest_cent_halves_up` |
| **Flagged and rejected** prices never count | `test_only_accepted_prices_count`, `test_submissions_to_basket` |
| A flagged price an admin accepts counts on the day it was **accepted** | `test_admin_accepted_price_counts_on_the_day_it_was_accepted`, `test_submissions_to_basket` |
| No new prices that day → the last average is **kept** | `test_pairs_without_submissions_keep_their_last_average`, `test_daily_rows` |
| Re-running a day gives the same prices; backfill goes oldest day first | `test_rerunning_a_day_gives_the_same_prices`, `test_backfill_processes_days_oldest_first` |
| The basket uses the stored average, and shows its `priceDate` and `submissionCount` | `test_uses_the_stored_daily_average`, `test_submissions_to_basket`, 8.7 |
| A new submission reaches the basket only after the job runs | `test_raw_submissions_wait_for_the_nightly_job`, 8.7 |
| An average more than **30 days** old is stale and the product shows unpriced; the limit is configurable (`PRICE_MAX_AGE_DAYS`) | `test_stored_price_older_than_30_days_is_stale`, `test_price_max_age_is_configurable` |
| `pricesUpdated` says when the job last ran (`null` before its first run) | `test_prices_updated_is_the_latest_job_run`, `test_prices_updated_is_null_before_the_first_run` |
| Contributors' prices averaged in with the spreadsheet's | 8.4 (`OVERRIDDEN`), 8.7 |

**The basket comparison**

| Behaviour | Checked by |
|---|---|
| Totals each store: quantity × price per line, added up | `test_hand_worked_basket`, `test_lines_carry_quantity_unit_price_and_subtotal`, 8.4, 8.5 |
| Recommends the **cheapest single store** | `test_hand_worked_basket`, 8.4, 8.5, 8.6 |
| Ranks every store; equal totals are ordered by store name | `test_equal_totals_break_ties_by_store_name`, 8.4 ("breakfast" tie) |
| A product with no price at a store is listed as **unpriced**, not dropped; the store is marked incomplete and its coverage shown | `test_missing_price_is_unpriced_and_ranks_store_below_complete_ones`, `test_unpriced_product_is_listed_not_dropped` |
| Stores that price everything rank above stores that don't; incomplete stores rank by coverage, then total | `test_missing_price_is_unpriced_and_ranks_store_below_complete_ones`, `test_incomplete_stores_rank_by_coverage_then_total` |
| No prices anywhere → no recommendation | `test_no_prices_anywhere` |
| Only compares the stores the shopper chose (`retailerIds`) | `test_retailer_subset`, `test_retailer_filter`, 8.4 ("two-stores") |

**Savings (the report's evaluation metric)**

| Behaviour | Checked by |
|---|---|
| Saving of the cheapest store against **each other store**, in cents and percent | `test_hand_worked_basket`, 8.4, 8.5, 8.6 |
| Both stores price everything → compared over the **full basket** | `test_hand_worked_basket`, 8.4 |
| One store is missing items → compared over **only the items both price**, labelled as such; can be negative | `test_missing_price_is_unpriced_and_ranks_store_below_complete_ones` |
| No items in common → no saving given | `test_no_common_items_gives_null_saving` |
| "You save up to …": the biggest full-basket saving | `test_hand_worked_basket`, 8.4 |

**The healthier basket**

| Behaviour | Checked by |
|---|---|
| A non-HCS product is **swapped** for an HCS product in the same category | `test_hand_worked_healthier_basket`, 8.4, 8.5 |
| An HCS product is **kept** as it is | `test_already_hcs_product_is_kept` |
| No HCS product in the category (e.g. detergent, eggs, toilet rolls) → the original is **kept** | `test_hand_worked_healthier_basket`, 8.4 ("household") |
| Several HCS options → each store uses its **cheapest** one | `test_each_store_uses_its_cheapest_hcs_option` |
| A store without the HCS product shows the line as unpriced, rather than falling back to the original | `test_hcs_priced_at_one_store_leaves_others_unpriced` |
| HCS product has no price anywhere → treated as no option | `test_unpriced_hcs_everywhere_counts_as_no_option` |
| Nothing to swap → no healthier basket | `test_nothing_to_swap_gives_no_healthier_basket`, `test_no_healthier_basket_when_nothing_can_be_swapped`, 8.4 ("already-healthy") |
| Extra cost of the healthier basket, which can be negative | `test_hand_worked_healthier_basket`, `test_healthier_basket_can_be_cheaper`, 8.4, 8.5 |
| Extra cost only given when both best stores price everything | `test_extra_cost_needs_complete_recommendations` |

**The request**

| Behaviour | Checked by |
|---|---|
| Public: works with no login, and gives the same answer when signed in | `test_signed_in_callers_get_the_same_answer`, 1.3 (smoke test) |
| 1–50 products, 1–99 of each; the same product twice is merged | `test_validation_errors`, `test_too_many_lines`, `test_repeated_products_are_merged` |
| Unknown product or store, bad quantity, bad JSON → `400` with the field named | `test_validation_errors`, `test_invalid_json`, 8.3 |
| Deployed Lambda, API route, permissions and CORS work | 1.3 (smoke test), 8.4 with `--http`, 8.6 |

**Not covered, by design**

These are outside the current Smart Basket, so nothing tests them:
- **Store pairs** (splitting the basket between two stores). The requirements ask for the cheapest single store.
- **Promotions, member prices and multi-buy deals.** Only regular prices are stored.
- **Branch-level prices.** Prices are per retailer.
- **Stock availability.** The spreadsheet's `sold_out` column isn't loaded.
- **Comparing by unit price.** Swaps and totals use the price per pack, so a swap may change the pack size (shown in the response).
- **Saving baskets on the server.** The frontend keeps the basket.
- **Load and response-time testing.** That's part of the QA stress testing.
- **Instant price updates.** Prices change once a day by design.

### Daily prices: run the nightly job by hand

The basket only sees prices the nightly job has averaged. On a new environment, after loading the catalog, or to pick up today's submissions straight away, run the job yourself:

```powershell
.venv\Scripts\python scripts\invoke.py aggregate --set backfillDays=30
```

**What it does:** recomputes each of the last 30 days, oldest first, including today so far. Running it again is safe. Other forms:
- `.venv\Scripts\python scripts\invoke.py aggregate` processes yesterday only, which is what the 00:05 schedule does.
- `--set date=2026-10-24` processes one day.

**You should see:** one entry per day, with how many product–store prices it updated, then the run time:

```
{
  "days": [
    …
    { "date": "2026-10-24", "pairsUpdated": 66 },
    …
  ],
  "computedAt": "…"
}
```

To check the nightly schedule exists and when it runs next:

```powershell
aws scheduler get-schedule --name trolleysaver-dev-daily-prices --query "{state: State, cron: ScheduleExpression, tz: ScheduleExpressionTimezone}"
```

### 8.1 Unit tests

```powershell
.venv\Scripts\python -m pytest tests\test_basket_compare.py tests\test_basket_handler.py tests\test_daily_prices.py -v
```

**What it checks:** 62 tests, using an in-memory fake of AWS.
- **Calculation:** totals, ranking, unpriced items, savings over the full basket and over common items only, tie-breaks.
- **Healthier basket:** swaps, "already Healthier Choice", "no Healthier Choice option", the cheapest option per store, and no fallback to the original when a store lacks the healthier product.
- **Daily prices:**
  - Window edges at Singapore midnight, accepted prices only, admin-accepted prices on their acceptance day, half-up rounding.
  - Carry-forward, safe re-runs, backfill order, stale averages, and `pricesUpdated`.
  - One end-to-end test runs the whole path: submissions, then the job, then the basket.
- **Requests:** every validation error.

**You should see:** `62 passed`.

### 8.2 Write the test baskets

The test baskets are in `scripts/basket_cases.json`, written with product names. This turns them into request bodies with dev's real product ids:

```powershell
.venv\Scripts\python scripts\basket_eval.py --env dev --dump-requests baskets
```

**You should see:** `wrote baskets\weekly-staples.json` and five more files. The `baskets` folder is git-ignored.

### 8.3 Call the basket Lambda

```powershell
.venv\Scripts\python scripts\invoke.py basket --body-file baskets\weekly-staples.json
```

Add `--local` to run the code in your `lambdas/` folder instead of the deployed function (no deploy needed).

**You should see:** `HTTP 200`, then the comparison, starting:

```
HTTP 200
{
  "priceMaxAgeDays": 30,
  "basket": {
    "stores": [
      {
        "rank": 1,
        "retailerId": "shengsiong",
        "retailerName": "Sheng Siong",
        "complete": true,
        "pricedCount": 3,
        "missingCount": 0,
        "coveragePercent": 100.0,
        "totalCents": 3750,
        "lines": [
          {
            "productId": "0385e1d8-86d6-5524-ad5f-7eab57702767",
            "productName": "Gardenia Enriched White Bread",
            …
            "quantity": 2,
            "unitPriceCents": 250,
            "subtotalCents": 500,
```

Scroll down for `recommendation`, `savings`, `healthierBasket` (with `swaps`) and `healthierExtra`. Check them against 8.5.

An invalid basket shows the error shape:

```powershell
.venv\Scripts\python scripts\invoke.py basket --body '{\"items\": [{\"productId\": \"nope\", \"quantity\": 0}]}'
```

**You should see:** `HTTP 400`, `"code": "VALIDATION_ERROR"`, with `items[0].productId` and `items[0].quantity` in `fieldErrors`.

### 8.4 Evaluation against the spreadsheet

This is the system evaluation from the Preliminary Report: it checks the recommended store and every store's total against figures calculated by hand, and measures the savings against buying the whole basket at each supermarket. The script does the hand calculation itself, from the regular prices in `data/products 241026.xlsx`, not from DynamoDB and not with the backend's code. It then sends each test basket to the backend.

```powershell
.venv\Scripts\python scripts\basket_eval.py --env dev
```

By default it calls the deployed Lambda. Use `--local` for your local code, `--http` for the real API (exactly as the frontend calls it), `--case weekly-staples` for one basket, and `--verbose` to list every check.

**You should see:**

```
Smart Basket evaluation against dev (deployed Lambda)

PASS       weekly-staples     20 checks  cheapest: Sheng Siong $37.50  max saving: $6.20
PASS       breakfast          20 checks  cheapest: FairPrice $30.41  max saving: $0.44
PASS       drinks-and-snacks  20 checks  cheapest: FairPrice $28.40  max saving: $1.05
PASS       already-healthy    10 checks  cheapest: Sheng Siong $30.49  max saving: $1.06
PASS       household          10 checks  cheapest: Sheng Siong $29.56  max saving: $0.49
PASS       two-stores         16 checks  cheapest: FairPrice $39.70  max saving: $4.00

96 of 96 checks passed or explained by newer prices; 0 failed. Report: basket_eval_report.md
```

- **The report.** `basket_eval_report.md` has a table per basket (expected and backend totals, savings in dollars and percent, the healthier basket's extra cost) for the final report.
- **OVERRIDDEN.** If contributors have submitted accepted prices for a product at a store, the backend rightly averages them in, so the price no longer matches the spreadsheet.
  - The script then says `OVERRIDDEN` instead of `FAIL`, and names the product and store, for example `note: Chew's Fresh Eggs with Vitamin E at Cold Storage: $4.38, the average of 2 submissions on 24 Oct 2026 (sheet: $3.75)`.
  - Dev is shared, so expect this whenever others are testing. The run still counts it as passed.
- **FAIL.** A real mismatch. The line shows the expected and actual values.
- **Ties.** In "breakfast", FairPrice and Sheng Siong tie at $30.41. Equal totals are ordered by store name, so FairPrice is recommended.

### 8.5 Check the numbers by hand

The first test basket, `weekly-staples`: Gardenia Enriched White Bread ×2, Dynamo Laundry Detergent ×1, SongHe AAA Thai Hom Mali Rice ×1. Prices in cents come from the spreadsheet.

| Store | White bread ×2 | Dynamo | Thai rice | Total |
|---|---|---|---|---|
| FairPrice | 2 × 250 = 500 | 1590 | 1880 | $39.70 |
| Sheng Siong | 2 × 250 = 500 | 1390 | 1860 | **$37.50** |
| Cold Storage | 2 × 250 = 500 | 1990 | 1880 | $43.70 |

- `basket.recommendation` is Sheng Siong at `3750`.
- `basket.savings` shows FairPrice `220` (5.5%) and Cold Storage `620` (14.2%), both with `basis: "full-basket"`.
- `maxSavingsCents` is `620`.

The healthier basket:
- The bread becomes Gardenia 100% Wholemeal (330), with `swapped`.
- Dynamo stays, with `no-hcs-option`, because detergent has no Healthier Choice product.
- The rice becomes Songhe Noble Brown Rice, with `swapped`.

| Store | Wholemeal ×2 | Dynamo | Brown rice | Total |
|---|---|---|---|---|
| FairPrice | 660 | 1590 | 1885 | $41.35 |
| Sheng Siong | 660 | 1390 | 1884 | **$39.34** |
| Cold Storage | 660 | 1990 | 1980 | $46.30 |

- `healthierBasket.recommendation` is Sheng Siong at `3934`.
- Its savings are `201` (4.9%) and `696` (15.0%).
- `healthierExtra.extraCents` = 3934 − 3750 = `184` (4.9%), so the healthier basket costs $1.84 more.

### 8.6 Real HTTP, as the frontend calls it

No login is needed:

```powershell
$api = aws cloudformation describe-stacks --stack-name trolleysaver-dev --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" --output text;
$r = Invoke-RestMethod -Method Post -Uri "$api/basket/compare" -ContentType application/json -Body (Get-Content baskets\weekly-staples.json -Raw);
$r.basket.stores | Select-Object rank, retailerName, totalCents, complete;
$r.basket.savings | Select-Object retailerName, basis, savingsCents, savingsPercent;
$r.healthierExtra
```

**You should see:** the stores ranked Sheng Siong 3750, FairPrice 3970, Cold Storage 4370; savings of 220 and 620; and `extraCents` 184.

### 8.7 Watch it react to new prices (optional)

This submits three Dynamo detergent prices as a fake user, runs the daily-price job for today, and checks the basket. Finish with cleanup. Dynamo's believable price range is 695–2985 cents. A separate user id keeps your test data apart from 3.x.

```powershell
$u = "basket-test-user"; $dynamo = (Get-Content baskets\weekly-staples.json -Raw | ConvertFrom-Json).items[1].productId;
.venv\Scripts\python scripts\invoke.py submit --user-id $u --set productId=$dynamo --set retailerId=fairprice --set priceCents=1000 --set observedAt=$today;
.venv\Scripts\python scripts\invoke.py submit --user-id $u --set productId=$dynamo --set retailerId=fairprice --set priceCents=1100 --set observedAt=$today;
.venv\Scripts\python scripts\invoke.py submit --user-id $u --set productId=$dynamo --set retailerId=coldstorage --set priceCents=9999 --set observedAt=$today;
$j = ((.venv\Scripts\python scripts\invoke.py basket --body-file baskets\weekly-staples.json) | Select-Object -Skip 1) -join "`n" | ConvertFrom-Json;
"before the job:"; $j.basket.stores | Select-Object rank, retailerName, totalCents;
.venv\Scripts\python scripts\invoke.py aggregate --set date=$today;
$j = ((.venv\Scripts\python scripts\invoke.py basket --body-file baskets\weekly-staples.json) | Select-Object -Skip 1) -join "`n" | ConvertFrom-Json;
"after the job:"; $j.basket.stores | Select-Object rank, retailerName, totalCents;
($j.basket.stores | Where-Object retailerId -eq "fairprice").lines | Select-Object productName, unitPriceCents, submissionCount, priceDate
```

**You should see:**
1. All three submissions return `HTTP 201`. Both FairPrice prices are `"status": "accepted"`, and the 9999 at Cold Storage is `"status": "flagged"`.
2. **Before the job**, the basket is unchanged (Sheng Siong 3750, FairPrice 3970, Cold Storage 4370), because new prices wait for the daily average.
3. **After the job**, FairPrice's Dynamo price is the average of today's two prices, (1000 + 1100) / 2 = **1050**, with `submissionCount` 2 and today's `priceDate`. FairPrice becomes cheapest. Cold Storage is unchanged, because flagged prices are ignored:

   ```
   rank retailerName totalCents
   ---- ------------ ----------
      1 FairPrice          3430
      2 Sheng Siong        3750
      3 Cold Storage       4370
   ```

Then clean up. Deleting the submissions doesn't change prices that are already stored, so finish by recomputing the last 30 days from what's left:

```powershell
.venv\Scripts\python scripts\invoke.py cleanup --user-id $u;
.venv\Scripts\python scripts\invoke.py aggregate --set backfillDays=30 | Out-Null;
$j = ((.venv\Scripts\python scripts\invoke.py basket --body-file baskets\weekly-staples.json) | Select-Object -Skip 1) -join "`n" | ConvertFrom-Json;
$j.basket.stores | Select-Object rank, retailerName, totalCents
```

**You should see:** `basket-test-user: deleted 3 submission(s), 0 photo(s) and the profile row`, then Sheng Siong 3750, FairPrice 3970 and Cold Storage 4370 again.

## 9. Search

**Before you start:** Daily prices worked out at least once ([8, Daily prices](#daily-prices-run-the-nightly-job-by-hand)). The commands and outputs in this part come from runs against dev on 27 Oct 2026.

### What Search covers

The shopper types words and picks filters. The backend answers with the products that match **every** filter given, sorted by name, each with its current price at each store and its lowest price. With no filters it returns the whole catalog. It also returns the filter options (`facets`), the number of results and the catalog size.

Test names are in `tests/test_search.py`, which runs the whole search Lambda against fake DynamoDB.

**Text search (`q`)**

| Behaviour | Checked by |
|---|---|
| Every word must match, ignoring case | `test_text_search` ("WHOLEMEAL", "bread white"), 9.2 |
| Matches the name, brand, category, `searchTerms`, `dietary` tags and pack size | `test_text_search` ("sunshine", "porridge", "vegetarian", "946", "kg") |
| A blank or all-spaces `q` matches everything; no match gives an empty list | `test_text_search` ("  ", "caviar") |

**Filters**

| Behaviour | Checked by |
|---|---|
| `category`, `brand` and `dietary` match exactly, ignoring case | `test_filters_ignore_case_and_combine` |
| `hcs=true` gives Healthier Choice products only, `hcs=false` the others | `test_filters_ignore_case_and_combine`, 9.4 |
| Filters combine: a product must match all of them | `test_filters_ignore_case_and_combine`, 9.2 |
| The price filter uses the product's **lowest current price** at any store, and both bounds are inclusive | `test_price_filter_uses_the_lowest_price`, 9.2 |
| A product with no current price is left out whenever a price bound is given | `test_price_filter_uses_the_lowest_price` (`minPriceCents=0`), `test_stale_and_unaggregated_prices_are_ignored` |

**Prices**

| Behaviour | Checked by |
|---|---|
| Each item has its store prices (`priceCents`, `priceDate`, `submissionCount`); stores with no price are missing | `test_items_carry_store_prices_and_the_lowest_one`, 9.2 |
| `lowestPrice` is the cheapest store, with ties going to the alphabetically first retailer id; `null` when no store prices it | `test_items_carry_store_prices_and_the_lowest_one`, 9.2 (Marigold: FairPrice and Sheng Siong both 356) |
| Uses the stored daily averages, like the basket: averages over 30 days old and submissions the nightly job hasn't averaged yet are ignored | `test_stale_and_unaggregated_prices_are_ignored` |
| `pricesUpdated` says when the job last ran (`null` before its first run) | `test_no_filters_returns_the_whole_catalog_by_name`, `test_empty_catalog` |

**The response**

| Behaviour | Checked by |
|---|---|
| Sorted by name; with no filters, the whole catalog | `test_no_filters_returns_the_whole_catalog_by_name` |
| `facets` (categories, brands, dietary tags) come from the **whole catalog**, not just the results | `test_facets_come_from_the_whole_catalog`, 9.2 |
| `total` is the number of results and `catalogSize` the number of products | `test_no_filters_returns_the_whole_catalog_by_name`, 9.2, 9.4 |
| An empty catalog gives an empty list, not an error | `test_empty_catalog` |

**The request**

| Behaviour | Checked by |
|---|---|
| Public: works with no login | 9.4 |
| `q` over 100 characters, `hcs` not `true`/`false`, a price that isn't a whole number of cents 0 or more, or `maxPriceCents` below `minPriceCents` → `400` with the field named | `test_invalid_parameters`, 9.3 |
| Deployed Lambda, API route and permissions work | 9.2, 9.4 |


### 9.1 Unit tests

```powershell
.venv\Scripts\python -m pytest tests\test_search.py -v
```

**What it checks:** 22 tests, using an in-memory fake of AWS: text search, each filter alone and combined, the price filter against the lowest price, store prices and `lowestPrice`, stale prices, facets, an empty catalog, and every validation error.

**You should see:** `22 passed`.

### 9.2 Call the search Lambda

```powershell
.venv\Scripts\python scripts\invoke.py search --query q=milk --query maxPriceCents=500
```

Each `--query name=value` adds one query parameter. Add `--local` to run the code in your `lambdas/` folder instead of the deployed function.

**You should see:** `HTTP 200` and the two milks, each with its store prices and `lowestPrice`:

```
HTTP 200
{
  "items": [
    {
      "hcs": false,
      "category": "milk",
      "brand": "Magnolia",
      "packQty": 946,
      "id": "a2210900-d837-5e6d-bbbc-73dea4f80ea1",
      "name": "Magnolia Fresh Milk",
      "minCents": 181,
      "packUnit": "ml",
      "maxCents": 548,
      "prices": {
        "coldstorage": {
          "priceCents": 365,
          "priceDate": "2026-10-22",
          "submissionCount": 1
        },
        "fairprice": {
          "priceCents": 363,
          "priceDate": "2026-10-24",
          "submissionCount": 1
        },
        "shengsiong": {
          "priceCents": 363,
          "priceDate": "2026-10-22",
          "submissionCount": 1
        }
      },
      "lowestPrice": {
        "retailerId": "fairprice",
        "retailerName": "FairPrice",
        "priceCents": 363,
        "priceDate": "2026-10-24"
      }
    },
    {
      "hcs": true,
      "category": "milk",
      "brand": "Marigold",
      "packQty": 956,
      "id": "1220bf01-0ec4-5200-9f83-90792fc6b0b3",
      "name": "Marigold HL Milk - Plain",
      "minCents": 178,
      "maxCents": 540,
      "packUnit": "ml",
      "prices": {
        "coldstorage": {
          "priceCents": 360,
          "priceDate": "2026-10-22",
          "submissionCount": 1
        },
        "fairprice": {
          "priceCents": 356,
          "priceDate": "2026-10-22",
          "submissionCount": 1
        },
        "shengsiong": {
          "priceCents": 356,
          "priceDate": "2026-10-22",
          "submissionCount": 1
        }
      },
      "lowestPrice": {
        "retailerId": "fairprice",
        "retailerName": "FairPrice",
        "priceCents": 356,
        "priceDate": "2026-10-22"
      }
    }
  ],
  "total": 2,
  "catalogSize": 24,
  "facets": {
    "categories": [
      "bread",
      "cereal",
      "coffee",
      "cookies",
      "detergent",
      "eggs",
      "milk",
      "rice",
      "soft drinks",
      "tea",
      "toilet rolls",
      "yoghurt"
    ],
    "brands": [
      "Chew'S",
      "Coca-Cola",
      "Dynamo",
      "Farmers Union",
      "Gardenia",
      "Kellog's",
      "Kleenex",
      "Lipton",
      "Magnolia",
      "Marigold",
      "Mondelēz International",
      "Munchy's",
      "NUYOLK",
      "Nestlé",
      "Old Town",
      "Owl",
      "Pursoft",
      "Songhe",
      "Top"
    ],
    "dietary": [
      "halal",
      "vegetarian"
    ]
  },
  "priceMaxAgeDays": 30,
  "pricesUpdated": "2026-10-25T06:53:24.734Z"
}
```

What to check:
- Only the two milks are returned (`"total": 2`), out of `"catalogSize": 24`.
- `facets` lists every category and brand in the catalog, not just milk.
- Both milks are tied for cheapest between FairPrice and Sheng Siong (363 and 356), and `lowestPrice` goes to `fairprice`, the alphabetically first retailer id.

Exact prices, dates and `pricesUpdated` change as people submit prices and the nightly job runs, so yours may differ. The shape should match.

Try other filters the same way, for example `--query category=bread --query hcs=true` (1 product: Gardenia 100% Wholemeal) or no `--query` at all (all 24 products).

### 9.3 Invalid input → field errors

Run each line and compare:

| Command | `fieldErrors` |
|---|---|
| `.venv\Scripts\python scripts\invoke.py search --query hcs=yes` | `"hcs": "Must be true or false"` |
| `.venv\Scripts\python scripts\invoke.py search --query minPriceCents=1.50` | `"minPriceCents": "Must be a whole number of cents, 0 or more"` |
| `.venv\Scripts\python scripts\invoke.py search --query minPriceCents=500 --query maxPriceCents=100` | `"maxPriceCents": "Maximum price must not be less than the minimum price"` |
| `.venv\Scripts\python scripts\invoke.py search --query q=$("x" * 101)` | `"q": "Keep the search under 100 characters"` |

**You should see:** `HTTP 400` and `"code": "VALIDATION_ERROR"` each time, for example:

```
HTTP 400
{
  "code": "VALIDATION_ERROR",
  "message": "Some fields are invalid.",
  "requestId": "…",
  "fieldErrors": {
    "hcs": "Must be true or false"
  }
}
```

### 9.4 Real HTTP, as the frontend calls it

No login is needed:

```powershell
$api = aws cloudformation describe-stacks --stack-name trolleysaver-dev --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" --output text;
$r = Invoke-RestMethod -Uri "$api/products/search?q=milk&maxPriceCents=500";
"$($r.total) of $($r.catalogSize) products, prices updated $($r.pricesUpdated)";
$r.items | Select-Object name, hcs, @{ n = "lowest"; e = { "$($_.lowestPrice.retailerName) $($_.lowestPrice.priceCents)" } } | Format-Table
```

**You should see:**

```
2 of 24 products, prices updated 2026-10-25T06:53:24.734Z

name                       hcs lowest
----                       --- ------
Magnolia Fresh Milk      False FairPrice 363
Marigold HL Milk - Plain  True FairPrice 356
```

An invalid parameter over HTTP:

```powershell
try { Invoke-RestMethod -Uri "$api/products/search?hcs=yes" } catch { "HTTP $([int]$_.Exception.Response.StatusCode)"; $_.ErrorDetails.Message }
```

**You should see:** `HTTP 400`, then `{"code": "VALIDATION_ERROR", … "fieldErrors": {"hcs": "Must be true or false"}}`.
