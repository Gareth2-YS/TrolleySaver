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
    """The filter options the page offers, taken from the whole catalog so they don't shrink as filters apply."""
    return {
        "categories": sorted({p["category"] for p in products if p.get("category")}),
        "brands": sorted({p["brand"] for p in products if p.get("brand")}),
        "dietary": sorted({tag for p in products for tag in p.get("dietary") or []}),
    }


def search(products, prices, retailers, criteria):
    """Matching products in the order given, each with its store prices and lowest price."""
    items = []
    for product in products:
        product_prices = prices.get(product["id"], {})
        lowest = lowest_price(product_prices, retailers)
        if matches(product, lowest, criteria):
            items.append({**product, "prices": product_prices, "lowestPrice": lowest})
    return items
