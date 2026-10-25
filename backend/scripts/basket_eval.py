"""Smart Basket system evaluation: check the backend's answers against totals worked out by hand.

The Preliminary Report evaluates Smart Basket by comparing the recommended store and basket totals
with manually calculated totals for each retailer, and by measuring the savings against buying the
whole basket at each supermarket. This script does that calculation itself, from the regular-price
rows of the product spreadsheet (not from DynamoDB and not with the backend's code), sends each
basket in basket_cases.json to the backend, and reports PASS/FAIL for every check.

Usage (from backend/):
    .venv/Scripts/python scripts/basket_eval.py --env dev                  # the deployed Lambda
    .venv/Scripts/python scripts/basket_eval.py --env dev --local          # the handler code on your machine
    .venv/Scripts/python scripts/basket_eval.py --env dev --http           # the real API over HTTP
    .venv/Scripts/python scripts/basket_eval.py --env dev --dump-requests baskets   # only write the request bodies

dev must hold the spreadsheet's seed prices (scripts/seed_catalog.py), averaged into the daily prices
(invoke.py aggregate --set backfillDays=30). If contributors have also submitted accepted prices for a
product at a store, the backend rightly averages them in, and checks they affect are reported as
OVERRIDDEN instead of FAIL. A Markdown report for the final write-up goes to basket_eval_report.md.
"""

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

import boto3
import requests
from boto3.dynamodb.conditions import Key

from invoke import build_event, invoke_deployed, invoke_local
from seed_catalog import DEFAULT_XLSX, RETAILER_ALIASES, RETAILERS, SEED_USER, normalise_name, read_rows
from stack import DEFAULT_REGION, stack_outputs

DEFAULT_CASES = Path(__file__).with_name("basket_cases.json")


# ---------- The hand calculation, from the spreadsheet ----------

def name_key(name):
    return normalise_name(str(name).replace("’", "'"))


def load_sheet(path):
    """{name key: {name, category, hcs, prices {retailerId: cents}}} from the regular-price rows."""
    sheet = {}
    for row in read_rows(path):
        if row.get("priceType") != "regular":
            continue
        entry = sheet.setdefault(name_key(row["name"]), {
            "name": " ".join(str(row["name"]).split()),
            "category": str(row["category"]).strip(),
            "hcs": row.get("healthier_choice") == "certified",
            "prices": {},
        })
        entry["prices"][RETAILER_ALIASES.get(row["retailerID"], row["retailerID"])] = int(round(float(row["priceCents"])))
    return sheet


def exact_picks(lines, retailer_ids):
    return {rid: [(entry, qty) if rid in entry["prices"] else None for entry, qty in lines] for rid in retailer_ids}


def healthier_picks(lines, retailer_ids, sheet):
    statuses, picks = [], {rid: [] for rid in retailer_ids}
    for entry, qty in lines:
        options = [] if entry["hcs"] else [
            o for o in sheet.values()
            if o["hcs"] and o["category"] == entry["category"] and any(r in o["prices"] for r in retailer_ids)
        ]
        status = "already-hcs" if entry["hcs"] else "swapped" if options else "no-hcs-option"
        statuses.append(status)
        for rid in retailer_ids:
            if status == "swapped":
                here = [o for o in options if rid in o["prices"]]
                best = min(here, key=lambda o: (o["prices"][rid], o["name"]), default=None)
                picks[rid].append((best, qty) if best else None)
            else:
                picks[rid].append((entry, qty) if rid in entry["prices"] else None)
    return statuses, picks


def summarise(picks, retailer_ids):
    stores = {}
    for rid in retailer_ids:
        subtotals = [pick[0]["prices"][rid] * pick[1] if pick else None for pick in picks[rid]]
        stores[rid] = {
            "total": sum(s for s in subtotals if s is not None),
            "subtotals": subtotals,
            "complete": all(s is not None for s in subtotals),
            "priced": sum(s is not None for s in subtotals),
        }
    order = sorted(retailer_ids, key=lambda r: (not stores[r]["complete"], -stores[r]["priced"], stores[r]["total"], RETAILERS[r]))
    best = order[0] if stores[order[0]]["priced"] else None
    savings, full = {}, []
    for rid in order[1:] if best else []:
        a, b = stores[best], stores[rid]
        if a["complete"] and b["complete"]:
            savings[rid] = b["total"] - a["total"]
            full.append(savings[rid])
        else:
            common = [i for i, (x, y) in enumerate(zip(a["subtotals"], b["subtotals"])) if x is not None and y is not None]
            savings[rid] = sum(b["subtotals"][i] - a["subtotals"][i] for i in common) if common else None
    return {"stores": stores, "order": order, "best": best, "savings": savings, "maxSavings": max(full) if full else None}


def from_response(comparison):
    stores = {s["retailerId"]: s for s in comparison["stores"]}
    return {
        "totals": {rid: s["totalCents"] for rid, s in stores.items()},
        "order": [s["retailerId"] for s in comparison["stores"]],
        "best": (comparison.get("recommendation") or {}).get("retailerId"),
        "savings": {s["retailerId"]: s["savingsCents"] for s in comparison["savings"]},
        "savingsPercent": {s["retailerId"]: s["savingsPercent"] for s in comparison["savings"]},
        "maxSavings": comparison.get("maxSavingsCents"),
    }


# ---------- Running the cases ----------

def money(cents):
    return "—" if cents is None else f"{'-' if cents < 0 else ''}${abs(cents) / 100:.2f}"


def make_caller(args):
    if args.http:
        api = stack_outputs(args.env, args.region)["ApiUrl"]

        def call(body):
            r = requests.post(f"{api}/basket/compare", json=body, timeout=30)
            return r.status_code, r.json()
    else:
        invoke = invoke_local if args.local else invoke_deployed

        def call(body):
            result = invoke(args.env, args.region, "basket", build_event("basket", None, None, json.dumps(body), None, None))
            return result["statusCode"], json.loads(result["body"])
    return call


def catalog_ids(env, region):
    table = boto3.resource("dynamodb", region_name=region).Table(f"trolleysaver-{env}-product")
    items, kwargs = [], {}
    while True:
        page = table.scan(**kwargs)
        items.extend(page["Items"])
        if "LastEvaluatedKey" not in page:
            break
        kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]
    return {name_key(p["name"]): p["id"] for p in items}


def request_for(case, ids):
    missing = [item["product"] for item in case["items"] if name_key(item["product"]) not in ids]
    if missing:
        raise SystemExit(f"{case['name']}: not in the dev catalog: {', '.join(missing)}. Run scripts/seed_catalog.py first.")
    body = {"items": [{"productId": ids[name_key(item["product"])], "quantity": item["quantity"]} for item in case["items"]]}
    if case.get("retailerIds"):
        body["retailerIds"] = case["retailerIds"]
    return body


def find_overrides(response, sheet, env, region):
    """Lines whose stored daily price includes contributors' submissions, not just the seed data.

    The basket uses each store's daily average, so once contributors have submitted accepted prices
    for a product at a store, its price can rightly differ from the spreadsheet.
    """
    table = boto3.resource("dynamodb", region_name=region).Table(f"trolleysaver-{env}-price-submission")
    overrides = []
    for key in ("basket", "healthierBasket"):
        for store in (response.get(key) or {}).get("stores", []):
            for line in store["lines"]:
                expected = sheet.get(name_key(line["productName"]), {}).get("prices", {}).get(store["retailerId"])
                if expected == line["unitPriceCents"]:
                    continue
                rows = table.query(KeyConditionExpression=Key("productId").eq(line["productId"])
                                   & Key("sk").begins_with(f"{store['retailerId']}#"))["Items"]
                if any(r["status"] == "accepted" and r["userId"] != SEED_USER for r in rows):
                    day = datetime.fromisoformat(line["priceDate"]).strftime("%d %b %Y")
                    count = line["submissionCount"]
                    overrides.append(f"{line['productName']} at {store['retailerName']}: {money(line['unitPriceCents'])}, "
                                     f"the average of {count} submission{'s' if count != 1 else ''} on {day} (sheet: {money(expected)})")
    return sorted(set(overrides))


def run_case(case, call, ids, sheet, args):
    retailer_ids = case.get("retailerIds") or list(RETAILERS)
    lines = [(sheet[name_key(item["product"])], item["quantity"]) for item in case["items"]]
    want = summarise(exact_picks(lines, retailer_ids), retailer_ids)
    statuses, picks = healthier_picks(lines, retailer_ids, sheet)
    want_healthier = summarise(picks, retailer_ids) if "swapped" in statuses else None

    status, response = call(request_for(case, ids))
    checks = []

    def check(label, expected, actual, show=str):
        checks.append({"label": label, "expected": show(expected), "actual": show(actual), "ok": expected == actual})

    check("HTTP status", 200, status)
    if status != 200:
        return checks, response, want, want_healthier, []

    def compare_section(prefix, wanted, comparison):
        got = from_response(comparison)
        check(f"{prefix} recommended store", wanted["best"], got["best"])
        check(f"{prefix} store ranking", wanted["order"], got["order"], lambda o: " > ".join(o))
        for rid in retailer_ids:
            check(f"{prefix} total at {RETAILERS[rid]}", wanted["stores"][rid]["total"], got["totals"].get(rid), money)
        for rid, cents in wanted["savings"].items():
            check(f"{prefix} saving vs {RETAILERS[rid]}", cents, got["savings"].get(rid), money)
        check(f"{prefix} max saving", wanted["maxSavings"], got["maxSavings"], money)
        return got

    got = compare_section("basket", want, response["basket"])
    healthier = response.get("healthierBasket")
    check("healthier basket offered", want_healthier is not None, healthier is not None)
    got_healthier = None
    if want_healthier and healthier:
        check("healthier swaps", statuses, [s["status"] for s in healthier["swaps"]], lambda s: ", ".join(s))
        got_healthier = compare_section("healthier", want_healthier, healthier)
        if want["best"] and want_healthier["best"] and want["stores"][want["best"]]["complete"] and want_healthier["stores"][want_healthier["best"]]["complete"]:
            extra = want_healthier["stores"][want_healthier["best"]]["total"] - want["stores"][want["best"]]["total"]
            check("healthier extra cost", extra, (response.get("healthierExtra") or {}).get("extraCents"), money)

    overrides = find_overrides(response, sheet, args.env, args.region) if any(not c["ok"] for c in checks) else []
    for c in checks:
        c["verdict"] = "PASS" if c["ok"] else ("OVERRIDDEN" if overrides else "FAIL")
    return checks, response, want, want_healthier, overrides
    return checks, response, want, want_healthier, overrides


# ---------- Report ----------

def section_table(title, wanted, comparison, retailer_ids):
    got = from_response(comparison) if comparison else None
    rows = [f"**{title}**", "", "| Store | Expected total | Backend total | Saving if you buy at the recommended store | Backend saving |", "|---|---|---|---|---|"]
    for rid in wanted["order"]:
        mark = " (recommended)" if rid == wanted["best"] else ""
        saving = wanted["savings"].get(rid)
        backend_total = got["totals"].get(rid) if got else None
        backend_saving = got["savings"].get(rid) if got else None
        pct = got["savingsPercent"].get(rid) if got else None
        rows.append(f"| {RETAILERS[rid]}{mark} | {money(wanted['stores'][rid]['total'])} | {money(backend_total)} | "
                    f"{'—' if rid == wanted['best'] else money(saving)} | "
                    f"{'—' if rid == wanted['best'] else money(backend_saving) + (f' ({pct}%)' if pct is not None else '')} |")
    return rows


def write_report(path, args, mode, results):
    total = sum(len(r["checks"]) for r in results)
    passed = sum(c["verdict"] == "PASS" for r in results for c in r["checks"])
    failed = sum(c["verdict"] == "FAIL" for r in results for c in r["checks"])
    out = [
        "# Smart Basket evaluation",
        "",
        f"Environment `{args.env}`, {mode}, run {datetime.now():%d %b %Y %H:%M}. Expected values are worked out from "
        f"the regular prices in `{Path(args.xlsx).name}`, independently of the backend.",
        "",
        f"**{passed} of {total} checks passed**, {failed} failed, {total - passed - failed} differ because of newer community prices.",
    ]
    for r in results:
        case = r["case"]
        out += ["", f"## {case['name']}", "", case.get("description", ""), "",
                "Basket: " + ", ".join(f"{i['product']} × {i['quantity']}" for i in case["items"]), ""]
        retailer_ids = case.get("retailerIds") or list(RETAILERS)
        out += section_table("Basket", r["want"], (r["response"] or {}).get("basket"), retailer_ids)
        if r["want_healthier"]:
            out += [""] + section_table("Healthier basket", r["want_healthier"], (r["response"] or {}).get("healthierBasket"), retailer_ids)
            extra = (r["response"] or {}).get("healthierExtra")
            if extra:
                out += ["", f"Healthier basket costs {money(extra['extraCents'])} more ({extra['extraPercent']}%)."]
        else:
            out += ["", "No healthier basket: nothing in it can be swapped for a Healthier Choice product."]
        if r["overrides"]:
            out += ["", "Newer community prices used by the backend:"] + [f"- {o}" for o in r["overrides"]]
        bad = [c for c in r["checks"] if c["verdict"] != "PASS"]
        if bad:
            out += ["", "| Check | Expected | Backend | Result |", "|---|---|---|---|"]
            out += [f"| {c['label']} | {c['expected']} | {c['actual']} | {c['verdict']} |" for c in bad]
    Path(path).write_text("\n".join(out) + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--env", default="dev")
    parser.add_argument("--region", default=DEFAULT_REGION)
    parser.add_argument("--xlsx", default=str(DEFAULT_XLSX), help="Spreadsheet the expected totals come from")
    parser.add_argument("--cases", default=str(DEFAULT_CASES))
    parser.add_argument("--case", help="Run only this case")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--local", action="store_true", help="Run the handler code locally instead of the deployed Lambda")
    mode.add_argument("--http", action="store_true", help="Call the deployed API over HTTP, as the frontend does")
    parser.add_argument("--dump-requests", metavar="DIR", help="Write each case's request body to DIR/<case>.json and stop")
    parser.add_argument("--report", default="basket_eval_report.md")
    parser.add_argument("--verbose", action="store_true", help="Print every check, not only the failures")
    args = parser.parse_args()
    sys.stdout.reconfigure(errors="replace")

    cases = json.loads(Path(args.cases).read_text(encoding="utf-8"))["cases"]
    if args.case:
        cases = [c for c in cases if c["name"] == args.case] or sys.exit(f"No case named {args.case!r}")
    ids = catalog_ids(args.env, args.region)

    if args.dump_requests:
        folder = Path(args.dump_requests)
        folder.mkdir(parents=True, exist_ok=True)
        for case in cases:
            (folder / f"{case['name']}.json").write_text(json.dumps(request_for(case, ids), indent=2) + "\n", encoding="utf-8")
            print(f"wrote {folder / (case['name'] + '.json')}")
        return

    sheet = load_sheet(args.xlsx)
    unknown = [i["product"] for c in cases for i in c["items"] if name_key(i["product"]) not in sheet]
    if unknown:
        raise SystemExit(f"Not in the spreadsheet: {', '.join(unknown)}")

    mode_name = "local handler" if args.local else "API over HTTP" if args.http else "deployed Lambda"
    print(f"Smart Basket evaluation against {args.env} ({mode_name})\n")
    call = make_caller(args)
    results = []
    for case in cases:
        checks, response, want, want_healthier, overrides = run_case(case, call, ids, sheet, args)
        results.append({"case": case, "checks": checks, "response": response, "want": want,
                        "want_healthier": want_healthier, "overrides": overrides})
        verdicts = [c["verdict"] for c in checks]
        summary = "PASS" if all(v == "PASS" for v in verdicts) else "FAIL" if "FAIL" in verdicts else "OVERRIDDEN"
        best = RETAILERS.get(want["best"], "none")
        print(f"{summary:<10} {case['name']:<18} {len(checks):>2} checks  cheapest: {best} {money(want['stores'][want['best']]['total']) if want['best'] else ''}"
              f"  max saving: {money(want['maxSavings'])}")
        for c in checks:
            if args.verbose or c["verdict"] != "PASS":
                print(f"    {c['verdict']:<10} {c['label']}: expected {c['expected']}, backend {c['actual']}")
        for o in overrides:
            print(f"    note: {o}")

    write_report(args.report, args, mode_name, results)
    failed = sum(c["verdict"] == "FAIL" for r in results for c in r["checks"])
    total = sum(len(r["checks"]) for r in results)
    print(f"\n{total - failed} of {total} checks passed or explained by newer prices; {failed} failed. Report: {args.report}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
