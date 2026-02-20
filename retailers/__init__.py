RETAILERS = {
    "ah": {
        "name": "Albert Heijn",
        "color": "#00A0E2",
        "active": True,
        "description": "Grootste supermarktketen van Nederland",
        "icon": "/logos/ah.svg",
    },
    "jumbo": {
        "name": "Jumbo",
        "color": "#FFCC00",
        "active": True,
        "description": "De tweede supermarkt van Nederland",
        "icon": "/logos/jumbo.svg",
    },
}


def get_fetcher(slug):
    """Importeer de fetch-module voor een retailer."""
    if slug == "ah":
        from retailers import ah
        return ah
    elif slug == "jumbo":
        from retailers import jumbo
        return jumbo
    raise ValueError(f"Onbekende retailer: {slug}")


def enrich_products_with_ingredients(fetcher, products):
    """Haal ingrediënten op en voeg ze toe aan elk product (mutates products)."""
    if not products:
        return
    fetch_ingredients = getattr(fetcher, "fetch_ingredients", None)
    if not callable(fetch_ingredients):
        return
    ids = [p.get("webshopId") for p in products if p.get("webshopId")]
    if not ids:
        return
    ingredients_map = fetch_ingredients(ids)
    for p in products:
        wid = p.get("webshopId")
        if wid is not None:
            p["ingredients"] = ingredients_map.get(str(wid))
