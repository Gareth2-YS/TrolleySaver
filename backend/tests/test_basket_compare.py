"""Pure tests of the basket and healthier-basket calculations, on hand-worked numbers (no AWS)."""

from common.basket import compare, exact_choices
from common.healthier import candidate_ids, extra_cost, healthier_choices

FP, SS, CS = "fairprice", "shengsiong", "coldstorage"
RETAILERS = [{"id": FP, "name": "FairPrice"}, {"id": SS, "name": "Sheng Siong"}, {"id": CS, "name": "Cold Storage"}]
ALL = [FP, SS, CS]

PRODUCTS = {p["id"]: p for p in (
    {"id": "white", "name": "Gardenia Enriched White Bread", "category": "bread", "hcs": False, "packQty": 400, "packUnit": "g"},
    {"id": "wholemeal", "name": "Gardenia 100% Wholemeal", "category": "bread", "hcs": True, "packQty": 400, "packUnit": "g"},
    {"id": "dynamo", "name": "Dynamo Detergent", "category": "detergent", "hcs": False},
    {"id": "thai", "name": "SongHe Thai Hom Mali Rice", "category": "rice", "hcs": False},
    {"id": "brown", "name": "Songhe Noble Brown Rice", "category": "rice", "hcs": True},
)}

# The spreadsheet's regular prices, in cents.
SHEET = {
    "white": {FP: 250, SS: 250, CS: 250},
    "wholemeal": {FP: 330, SS: 330, CS: 330},
    "dynamo": {FP: 1590, SS: 1390, CS: 1990},
    "thai": {FP: 1880, SS: 1860, CS: 1880},
    "brown": {FP: 1885, SS: 1884, CS: 1980},
}
BASKET = [{"productId": "white", "quantity": 2}, {"productId": "dynamo", "quantity": 1}, {"productId": "thai", "quantity": 1}]


def prices_from(table):
    return {pid: {rid: {"priceCents": c, "priceDate": "2026-10-24", "submissionCount": 1}
                  for rid, c in by_store.items()} for pid, by_store in table.items()}


def run(lines=BASKET, table=SHEET, products=PRODUCTS, retailers=RETAILERS):
    prices = prices_from(table)
    ids = [r["id"] for r in retailers]
    return compare(lines, products, retailers, exact_choices(lines, products, prices, ids))


def run_healthier(lines=BASKET, table=SHEET, products=PRODUCTS, retailers=RETAILERS):
    prices = prices_from(table)
    ids = [r["id"] for r in retailers]
    choices, swaps = healthier_choices(lines, products, prices, ids)
    return (compare(lines, products, retailers, choices) if choices else None), swaps


def totals(comparison):
    return {s["retailerId"]: s["totalCents"] for s in comparison["stores"]}


def saving(comparison, retailer_id):
    return next(s for s in comparison["savings"] if s["retailerId"] == retailer_id)


def test_hand_worked_basket():
    result = run()
    assert totals(result) == {SS: 3750, FP: 3970, CS: 4370}
    assert [s["retailerId"] for s in result["stores"]] == [SS, FP, CS]
    assert [s["rank"] for s in result["stores"]] == [1, 2, 3]
    assert result["recommendation"] == {"retailerId": SS, "retailerName": "Sheng Siong", "totalCents": 3750, "complete": True}
    assert saving(result, FP) == {"retailerId": FP, "retailerName": "FairPrice", "basis": "full-basket", "comparedLines": 3,
                                  "otherTotalCents": 3970, "recommendedTotalCents": 3750, "savingsCents": 220, "savingsPercent": 5.5}
    assert saving(result, CS)["savingsCents"] == 620 and saving(result, CS)["savingsPercent"] == 14.2
    assert result["maxSavingsCents"] == 620


def test_lines_carry_quantity_unit_price_and_subtotal():
    sheng_siong = run()["stores"][0]
    bread = sheng_siong["lines"][0]
    assert (bread["productId"], bread["quantity"], bread["unitPriceCents"], bread["subtotalCents"]) == ("white", 2, 250, 500)
    assert bread["packCount"] == 1 and bread["hcs"] is False and "replacesProductId" not in bread
    assert sheng_siong["complete"] and sheng_siong["coveragePercent"] == 100.0 and sheng_siong["unpriced"] == []


def test_missing_price_is_unpriced_and_ranks_store_below_complete_ones():
    table = {**SHEET, "dynamo": {FP: 1590, CS: 1990}}  # Sheng Siong has no detergent price
    result = run(table=table)
    assert [s["retailerId"] for s in result["stores"]] == [FP, CS, SS]
    sheng_siong = result["stores"][2]
    assert not sheng_siong["complete"]
    assert (sheng_siong["pricedCount"], sheng_siong["missingCount"], sheng_siong["coveragePercent"]) == (2, 1, 66.7)
    assert sheng_siong["totalCents"] == 2360
    assert sheng_siong["unpriced"] == [{"productId": "dynamo", "productName": "Dynamo Detergent", "category": "detergent"}]
    assert result["recommendation"]["retailerId"] == FP

    # Against a complete store: whole basket. Against the incomplete one: only the 2 shared lines,
    # where Sheng Siong is cheaper, so the "saving" is negative.
    assert saving(result, CS)["basis"] == "full-basket" and saving(result, CS)["savingsCents"] == 400
    vs_ss = saving(result, SS)
    assert (vs_ss["basis"], vs_ss["comparedLines"], vs_ss["recommendedTotalCents"], vs_ss["otherTotalCents"]) == ("common-items", 2, 2380, 2360)
    assert vs_ss["savingsCents"] == -20 and vs_ss["savingsPercent"] == -0.8
    assert result["maxSavingsCents"] == 400


def test_incomplete_stores_rank_by_coverage_then_total():
    table = {"white": {FP: 250, SS: 250}, "dynamo": {FP: 1590}, "thai": {CS: 100}}
    result = run(table=table)
    assert [s["retailerId"] for s in result["stores"]] == [FP, CS, SS]
    assert result["recommendation"] == {"retailerId": FP, "retailerName": "FairPrice", "totalCents": 2090, "complete": False}
    assert result["maxSavingsCents"] is None


def test_no_common_items_gives_null_saving():
    table = {"white": {FP: 250}, "thai": {SS: 1860}}
    result = run(lines=[{"productId": "white", "quantity": 1}, {"productId": "thai", "quantity": 1}], table=table)
    vs_other = result["savings"][0]
    assert vs_other["comparedLines"] == 0 and vs_other["savingsCents"] is None and vs_other["savingsPercent"] is None


def test_no_prices_anywhere():
    result = run(table={})
    assert result["recommendation"] is None and result["savings"] == [] and result["maxSavingsCents"] is None
    assert all(not s["complete"] and s["totalCents"] == 0 for s in result["stores"])


def test_equal_totals_break_ties_by_store_name():
    result = run(lines=[{"productId": "white", "quantity": 1}])
    assert [s["retailerName"] for s in result["stores"]] == ["Cold Storage", "FairPrice", "Sheng Siong"]
    assert all(s["savingsCents"] == 0 for s in result["savings"])


def test_retailer_subset():
    result = run(retailers=[RETAILERS[0], RETAILERS[2]])
    assert totals(result) == {FP: 3970, CS: 4370}
    assert result["recommendation"]["retailerId"] == FP


# ---------- Healthier basket ----------

def test_hand_worked_healthier_basket():
    healthier, swaps = run_healthier()
    assert [(s["originalProductId"], s["status"]) for s in swaps] == [("white", "swapped"), ("dynamo", "no-hcs-option"), ("thai", "swapped")]
    assert totals(healthier) == {SS: 3934, FP: 4135, CS: 4630}
    assert healthier["recommendation"]["retailerId"] == SS
    assert saving(healthier, FP)["savingsCents"] == 201 and saving(healthier, FP)["savingsPercent"] == 4.9
    assert saving(healthier, CS)["savingsCents"] == 696 and saving(healthier, CS)["savingsPercent"] == 15.0

    lines = healthier["stores"][0]["lines"]
    assert [(l["productId"], l.get("replacesProductId")) for l in lines] == [("wholemeal", "white"), ("dynamo", None), ("brown", "thai")]
    assert lines[0]["quantity"] == 2 and lines[0]["subtotalCents"] == 660 and lines[0]["hcs"] is True

    assert extra_cost(run(), healthier) == {"basketTotalCents": 3750, "healthierTotalCents": 3934, "extraCents": 184, "extraPercent": 4.9}


def test_already_hcs_product_is_kept():
    lines = [{"productId": "wholemeal", "quantity": 1}, {"productId": "thai", "quantity": 1}]
    healthier, swaps = run_healthier(lines=lines)
    assert [s["status"] for s in swaps] == ["already-hcs", "swapped"]
    assert [l["productId"] for l in healthier["stores"][0]["lines"]] == ["wholemeal", "brown"]


def test_nothing_to_swap_gives_no_healthier_basket():
    healthier, swaps = run_healthier(lines=[{"productId": "wholemeal", "quantity": 1}, {"productId": "dynamo", "quantity": 1}])
    assert healthier is None
    assert [s["status"] for s in swaps] == ["already-hcs", "no-hcs-option"]
    assert extra_cost(run(), None) is None


def test_each_store_uses_its_cheapest_hcs_option():
    products = {**PRODUCTS, "oat": {"id": "oat", "name": "Oat Loaf", "category": "bread", "hcs": True}}
    table = {**SHEET, "wholemeal": {FP: 300, SS: 320, CS: 330}, "oat": {FP: 310, SS: 290, CS: 330}}
    healthier, _ = run_healthier(lines=[{"productId": "white", "quantity": 1}], table=table, products=products)
    chosen = {s["retailerId"]: s["lines"][0]["productId"] for s in healthier["stores"]}
    # Cold Storage ties at 330: the name breaks it ("Gardenia..." before "Oat Loaf").
    assert chosen == {FP: "wholemeal", SS: "oat", CS: "wholemeal"}


def test_hcs_priced_at_one_store_leaves_others_unpriced():
    table = {**SHEET, "wholemeal": {FP: 330}}
    healthier, swaps = run_healthier(lines=[{"productId": "white", "quantity": 1}], table=table)
    assert swaps[0]["status"] == "swapped"
    by_store = {s["retailerId"]: s for s in healthier["stores"]}
    assert by_store[FP]["complete"] and by_store[FP]["lines"][0]["productId"] == "wholemeal"
    assert not by_store[SS]["complete"] and by_store[SS]["lines"] == []  # does not fall back to white bread
    assert healthier["recommendation"]["retailerId"] == FP


def test_unpriced_hcs_everywhere_counts_as_no_option():
    table = {k: v for k, v in SHEET.items() if k != "wholemeal"}
    healthier, swaps = run_healthier(lines=[{"productId": "white", "quantity": 1}], table=table)
    assert healthier is None and swaps[0]["status"] == "no-hcs-option"


def test_healthier_basket_can_be_cheaper():
    table = {**SHEET, "wholemeal": {FP: 200, SS: 200, CS: 200}}
    lines = [{"productId": "white", "quantity": 1}]
    healthier, _ = run_healthier(lines=lines, table=table)
    extra = extra_cost(run(lines=lines, table=table), healthier)
    assert extra["extraCents"] == -50 and extra["extraPercent"] == -20.0


def test_extra_cost_needs_complete_recommendations():
    # Wholemeal only at FairPrice, detergent everywhere except FairPrice: no store has the whole
    # healthier basket, so there is no fair "extra cost" to report.
    table = {**SHEET, "wholemeal": {FP: 330}, "dynamo": {SS: 1390, CS: 1990}}
    lines = [{"productId": "white", "quantity": 1}, {"productId": "dynamo", "quantity": 1}]
    healthier, _ = run_healthier(lines=lines, table=table)
    assert not healthier["recommendation"]["complete"]
    assert run(lines=lines, table=table)["recommendation"]["complete"]
    assert extra_cost(run(lines=lines, table=table), healthier) is None


def test_candidate_ids_are_hcs_products_in_non_hcs_categories():
    assert candidate_ids(BASKET, PRODUCTS) == ["wholemeal", "brown"]
    assert candidate_ids([{"productId": "wholemeal", "quantity": 1}], PRODUCTS) == []
