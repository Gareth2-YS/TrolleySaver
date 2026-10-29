"""The healthier basket: each product swapped for a Healthier Choice (HCS) product in its category.

Pure functions, no AWS calls. Choices use the same shape as common.basket.
"""

from common.basket import percent, price_choice

SWAPPED = "swapped"
ALREADY_HCS = "already-hcs"
NO_HCS_OPTION = "no-hcs-option"


def _hcs_by_category(products):
    options = {}
    for product in products.values():
        if product.get("hcs"):
            options.setdefault(product.get("category"), []).append(product)
    return options


def candidate_ids(lines, products):
    """HCS products that could replace a non-HCS basket line, so their prices can be looked up."""
    options = _hcs_by_category(products)
    ids = []
    for line in lines:
        product = products[line["productId"]]
        if not product.get("hcs"):
            ids.extend(p["id"] for p in options.get(product.get("category"), []))
    return list(dict.fromkeys(ids))


def healthier_choices(lines, products, prices, retailer_ids):
    """Return (choices, swaps); choices is None when no line could be swapped.

    A non-HCS line is swapped when its category has an HCS product priced at any allowed store. Each
    store then uses its cheapest HCS option (ties by name). A store without one leaves the line
    unpriced rather than falling back to the original, so stores stay comparable.
    """
    options = _hcs_by_category(products)
    choices = {rid: [] for rid in retailer_ids}
    swaps = []
    for line in lines:
        product = products[line["productId"]]
        priced_options = [] if product.get("hcs") else [
            p for p in options.get(product.get("category"), [])
            if any(rid in prices.get(p["id"], {}) for rid in retailer_ids)
        ]
        if product.get("hcs"):
            status = ALREADY_HCS
        elif priced_options:
            status = SWAPPED
        else:
            status = NO_HCS_OPTION
        swaps.append({
            "originalProductId": product["id"],
            "originalName": product.get("name"),
            "category": product.get("category"),
            "status": status,
        })
        for rid in retailer_ids:
            if status != SWAPPED:
                choices[rid].append(price_choice(product, prices, rid))
                continue
            at_store = [p for p in priced_options if rid in prices[p["id"]]]
            cheapest = min(at_store, key=lambda p: (prices[p["id"]][rid]["priceCents"], p.get("name") or ""), default=None)
            choices[rid].append(price_choice(cheapest, prices, rid, replaces=product["id"]) if cheapest else None)
    if not any(s["status"] == SWAPPED for s in swaps):
        return None, swaps
    return choices, swaps


def extra_cost(basket, healthier):
    """How much more the healthier basket's best store costs than the basket's best store."""
    if not healthier:
        return None
    original, better = basket["recommendation"], healthier["recommendation"]
    if not (original and better and original["complete"] and better["complete"]):
        return None
    extra = better["totalCents"] - original["totalCents"]
    return {
        "basketTotalCents": original["totalCents"],
        "healthierTotalCents": better["totalCents"],
        "extraCents": extra,
        "extraPercent": percent(extra, original["totalCents"]),
    }
