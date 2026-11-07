"""Product search and filters for the Search page. Pure functions, no AWS calls.

Text search matches every word of `q`, ignoring case, against a product's name, brand, category,
search terms, dietary tags and pack size. The price filter uses the product's lowest current price
at any store, so products with no current price are left out whenever a price bound is given.
"""


def _key(value):
    return str(value).strip().casefold()


def searchable_text(product):
    parts = [product.get("name"), product.get("brand"), product.get("category"),
             *(product.get("searchTerms") or []), *(product.get("dietary") or []),
             product.get("packQty"), product.get("packUnit")]
    return " ".join(_key(p) for p in parts if p is not None and p != "")


def lowest_price(product_prices, retailers):
    """The cheapest store for one product, ties by retailer id, or None when no store prices it."""
    if not product_prices:
        return None
    retailer_id, price = min(product_prices.items(), key=lambda entry: (entry[1]["priceCents"], entry[0]))
    return {"retailerId": retailer_id, "retailerName": (retailers.get(retailer_id) or {}).get("name"),
            "priceCents": price["priceCents"], "priceDate": price["priceDate"]}


def matches(product, lowest, criteria):
    if criteria["words"]:
        text = searchable_text(product)
        if not all(word in text for word in criteria["words"]):
            return False
    if criteria["category"] and _key(product.get("category") or "") != criteria["category"]:
        return False
    if criteria["brand"] and _key(product.get("brand") or "") != criteria["brand"]:
        return False
    if criteria["dietary"] and criteria["dietary"] not in {_key(tag) for tag in product.get("dietary") or []}:
        return False
    if criteria["hcs"] is not None and bool(product.get("hcs")) != criteria["hcs"]:
        return False
    low, high = criteria["minPriceCents"], criteria["maxPriceCents"]
    if low is not None or high is not None:
        if lowest is None:
            return False
        if (low is not None and lowest["priceCents"] < low) or (high is not None and lowest["priceCents"] > high):
            return False
    return True


def facets(products):
    """Every category, brand and dietary tag in the whole catalog, for forms that need the full lists."""
    return {
        "categories": sorted({p["category"] for p in products if p.get("category")}),
        "brands": sorted({p["brand"] for p in products if p.get("brand")}),
        "dietary": sorted({tag for p in products for tag in p.get("dietary") or []}),
    }


# Each facet and the search criterion it filters on.
FACET_CRITERIA = {"categories": "category", "brands": "brand", "dietary": "dietary"}


def _facet_values(product, criterion):
    if criterion == "dietary":
        return product.get("dietary") or []
    value = product.get(criterion)
    return [value] if value else []


def priced(products, prices, retailers):
    """Each product with its store prices and lowest price, as the Search page shows it."""
    items = []
    for product in products:
        product_prices = prices.get(product["id"], {})
        items.append({**product, "prices": product_prices, "lowestPrice": lowest_price(product_prices, retailers)})
    return items


def search(items, criteria):
    """The priced products that match, in the order given."""
    return [item for item in items if matches(item, item["lowestPrice"], criteria)]


def facet_counts(items, criteria):
    """For each filter, how many products each option would give with all the other filters kept.

    An option is left out when it would give none, so the dropdowns only offer choices that lead
    somewhere, whichever filter the shopper picks first.
    """
    counts = {name: {} for name in FACET_CRITERIA}
    for item in items:
        for name, criterion in FACET_CRITERIA.items():
            if matches(item, item["lowestPrice"], {**criteria, criterion: None}):
                for value in _facet_values(item, criterion):
                    counts[name][value] = counts[name].get(value, 0) + 1
    return {name: dict(sorted(found.items(), key=lambda entry: entry[0].casefold())) for name, found in counts.items()}
