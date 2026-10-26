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

**What it checks:** 48 tests of the Lambda code and the seed script, run against an in-memory fake of AWS. Nothing is sent to the real account.
**You should see:** a row of dots, then `48 passed in …s`.

### 1.2 Template check

```powershell
sam validate --lint
```

**You should see:** `C:\…\backend\template.yaml is a valid SAM Template`.

### 1.3 End-to-end test against dev

```powershell
.venv\Scripts\python scripts\smoke_test.py
```

**What it checks:** the deployed backend over real HTTP, exactly as the frontend will use it. It signs up a throwaway user, logs in, uploads a photo, submits prices and moderates as a throwaway admin, then deletes everything it created. Takes about a minute.
**You should see:** 27 lines starting with `PASS`, then:

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

   - **Other functions:** `-catalog`, `-upload-url`, `-my-submissions`, `-admin-submissions`, `-cognito-pre-signup`, `-cognito-post-confirmation`.
   - **What appears:** refused requests are logged as `Client error <CODE>: …`, and crashes (`HTTP 500`) with a full Python traceback.
3. **Reproduce it locally.** Add `--local` to the same `invoke.py` command. It then runs the code in your `lambdas/` folder against the real dev tables, so you can add `print()` calls or breakpoints without deploying.
4. **Look at the data.** AWS console → DynamoDB → Tables → `trolleysaver-dev-price-submission` → *Explore table items*. Photos are in S3 → `trolleysaver-dev-photos-…` → `price-evidence/`.
5. **After fixing code:**
   1. `.venv\Scripts\python -m pytest`
   2. `sam deploy --config-env dev`
   3. `.venv\Scripts\python scripts\smoke_test.py`

## 7. Pre-handoff checklist

- [ ] 1.1: `pytest` shows `48 passed`
- [ ] 1.2: `sam validate --lint` is clean
- [ ] 1.3: `smoke_test.py` says `All checks passed`
- [ ] 2: the catalog is in dev, and `invoke.py products` lists 24 products
- [ ] 3: Lambda walkthrough done, with results matching the expectations
- [ ] 4: real-login walkthrough done (4.3 is optional)
- [ ] Cleanup done:
  - `invoke.py mine` shows `"items": []`
  - no `tester-…@example.com` accounts remain: `aws cognito-idp list-users --user-pool-id $poolId --query "Users[].Username"`
- [ ] The frontend developer:
  - has the dev values (`ApiUrl`, `UserPoolId`, `UserPoolClientId`)
  - has the links to [docs/handoffs](../docs/handoffs/README.md) and [docs/api](../docs/api/README.md)
  - knows **no admin accounts exist yet** and how to create one ([auth handoff §5](../docs/handoffs/2026-10-24-auth-backend-to-frontend.md#5-admin-accounts-none-exist-yet))
