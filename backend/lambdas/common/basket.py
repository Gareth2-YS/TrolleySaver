"""Basket totals per store, ranking, the recommended store and savings. Pure functions, no AWS calls.

A "choice" is what one store would sell for one basket line: {product, priceCents, priceDate,
submissionCount, replaces}, or None when the store has no usable price for it. `choices` maps each retailer id to a
list of choices in the same order as the basket lines.
"""


def percent(part, whole):
    return round(part * 100 / whole, 1) if whole else None


def price_choice(product, prices, retailer_id, replaces=None):
    price = prices.get(product["id"], {}).get(retailer_id)
    if not price:
        return None
    return {"product": product, "priceCents": price["priceCents"], "priceDate": price["priceDate"],
            "submissionCount": price["submissionCount"], "replaces": replaces}


def exact_choices(lines, products, prices, retailer_ids):
    """Each store prices exactly the products the shopper picked."""
    return {rid: [price_choice(products[line["productId"]], prices, rid) for line in lines] for rid in retailer_ids}


def product_fields(product):
    """The product details every basket line and healthier option carries."""
    return {
        "productId": product["id"],
        "productName": product.get("name"),
        "brand": product.get("brand"),
        "packQty": product.get("packQty"),
        "packUnit": product.get("packUnit"),
        "packCount": product.get("packCount") or 1,
        "hcs": bool(product.get("hcs")),
        "category": product.get("category"),
    }


def _line(line, choice):
    record = {
        **product_fields(choice["product"]),
        "quantity": line["quantity"],
        "unitPriceCents": choice["priceCents"],
        "subtotalCents": choice["priceCents"] * line["quantity"],
        "priceDate": choice["priceDate"],
        "submissionCount": choice["submissionCount"],
    }
    if choice["replaces"]:
        record["replacesProductId"] = choice["replaces"]
    return record


def _store(retailer, lines, products, store_choices):
    priced, unpriced, subtotals = [], [], []
    for line, choice in zip(lines, store_choices):
        if choice is None:
            product = products[line["productId"]]
            unpriced.append({"productId": product["id"], "productName": product.get("name"), "category": product.get("category")})
            subtotals.append(None)
        else:
            record = _line(line, choice)
            priced.append(record)
            subtotals.append(record["subtotalCents"])
    return {
        "retailerId": retailer["id"],
        "retailerName": retailer.get("name"),
        "complete": not unpriced,
        "pricedCount": len(priced),
        "missingCount": len(unpriced),
        "coveragePercent": percent(len(priced), len(lines)),
        "totalCents": sum(s for s in subtotals if s is not None),
        "lines": priced,
        "unpriced": unpriced,
        "_subtotals": subtotals,
    }


def _rank_key(store):
    # Complete stores first by total; incomplete ones by coverage, then total; name breaks ties.
    return (not store["complete"], -store["pricedCount"], store["totalCents"], store["retailerName"] or "")


def _saving(recommended, other):
    entry = {"retailerId": other["retailerId"], "retailerName": other["retailerName"]}
    if recommended["complete"] and other["complete"]:
        basis, compared = "full-basket", len(recommended["_subtotals"])
        recommended_total, other_total = recommended["totalCents"], other["totalCents"]
    else:
        common = [i for i, (a, b) in enumerate(zip(recommended["_subtotals"], other["_subtotals"])) if a is not None and b is not None]
        basis, compared = "common-items", len(common)
        recommended_total = sum(recommended["_subtotals"][i] for i in common)
        other_total = sum(other["_subtotals"][i] for i in common)
    entry.update(basis=basis, comparedLines=compared)
    if not compared:
        entry.update(otherTotalCents=None, recommendedTotalCents=None, savingsCents=None, savingsPercent=None)
        return entry
    savings = other_total - recommended_total
    entry.update(otherTotalCents=other_total, recommendedTotalCents=recommended_total,
                 savingsCents=savings, savingsPercent=percent(savings, other_total))
    return entry


def compare(lines, products, retailers, choices):
    """Total the basket at every retailer, rank them and compare the best one with the rest."""
    ranked = sorted((_store(r, lines, products, choices[r["id"]]) for r in retailers), key=_rank_key)
    stores = [{"rank": rank, **store} for rank, store in enumerate(ranked, start=1)]

    best = stores[0] if stores and stores[0]["pricedCount"] else None
    recommendation, savings, max_savings = None, [], None
    if best:
        recommendation = {key: best[key] for key in ("retailerId", "retailerName", "totalCents", "complete")}
        savings = [_saving(best, other) for other in stores[1:]]
        full = [s["savingsCents"] for s in savings if s["basis"] == "full-basket"]
        max_savings = max(full) if full else None

    for store in stores:
        del store["_subtotals"]
    return {"stores": stores, "recommendation": recommendation, "savings": savings, "maxSavingsCents": max_savings}
