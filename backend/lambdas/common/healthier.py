"""The healthier basket: each product swapped for a Healthier Choice (HCS) product in its category.

Pure functions, no AWS calls. Choices use the same shape as common.basket.
"""

from common.basket import percent, price_choice, product_fields

SWAPPED = "swapped"
ALREADY_HCS = "already-hcs"
NO_HCS_OPTION = "no-hcs-option"

# Pack units a price per 100 can be worked out for: unit -> (per-100 unit, base units per pack unit).
PER_100_UNITS = {"g": ("g", 1), "kg": ("g", 1000), "ml": ("ml", 1), "l": ("ml", 1000)}


def _hcs_by_category(products):
    options = {}
    for product in products.values():
        if product.get("hcs"):
            options.setdefault(product.get("category"), []).append(product)
    return options


def _category_options(product, options):
    """HCS products that could replace a product: those in its category, or none if it is HCS already."""
    return [] if product.get("hcs") else options.get(product.get("category"), [])


def _per_100(product, cents):
    unit = PER_100_UNITS.get((product.get("packUnit") or "").lower())
    if cents is None or not unit or not product.get("packQty"):
        return None
    base, factor = unit
    amount = float(product["packQty"]) * factor * float(product.get("packCount") or 1)
    return {"cents": round(cents * 100 / amount, 1), "unit": base}


def _option(product, option, prices, retailer_ids, ranking_id):
    at_stores = {rid: price for rid, price in prices[option["id"]].items() if rid in retailer_ids}
    cents = at_stores[ranking_id]["priceCents"] if ranking_id in at_stores else None
    original = prices.get(product["id"], {}).get(ranking_id)
    return {
        **product_fields(option),
        "prices": at_stores,
        "priceCents": cents,
        "priceDiffCents": cents - original["priceCents"] if cents is not None and original else None,
        "pricePer100": _per_100(option, cents),
    }


def _option_key(option):
    # Priced at the ranking store first, by that price; the rest by their lowest price anywhere.
    at_ranking = option["priceCents"]
    lowest = min(p["priceCents"] for p in option["prices"].values())
    return (at_ranking is None, lowest if at_ranking is None else at_ranking, option["productName"] or "")


def candidate_ids(lines, products):
    """HCS products that could replace a non-HCS basket line, so their prices can be looked up."""
    options = _hcs_by_category(products)
    ids = [p["id"] for line in lines for p in _category_options(products[line["productId"]], options)]
    return list(dict.fromkeys(ids))


def healthier_choices(lines, products, prices, retailer_ids, ranking_id=None):
    """Return (choices, swaps); choices is None when no line could be swapped.

    A non-HCS line is swapped when its category has an HCS product priced at any allowed store. Each
    store then uses its cheapest HCS option (ties by name). A store without one leaves the line
    unpriced rather than falling back to the original, so stores stay comparable.

    Each swap also lists `options`: every one of those HCS products, priced and ranked at ranking_id
    (the basket's recommended store); see _option_key. With no ranking_id they rank by lowest price.
    """
    options = _hcs_by_category(products)
    choices = {rid: [] for rid in retailer_ids}
    swaps = []
    for line in lines:
        product = products[line["productId"]]
        priced_options = [p for p in _category_options(product, options)
                          if any(rid in prices.get(p["id"], {}) for rid in retailer_ids)]
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
            "options": sorted((_option(product, p, prices, retailer_ids, ranking_id) for p in priced_options), key=_option_key),
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
