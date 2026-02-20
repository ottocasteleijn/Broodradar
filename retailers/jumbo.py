"""Jumbo product fetcher via de Jumbo mobiele API."""
import requests
from urllib.parse import urlencode

API_BASE = "https://mobileapi.jumbo.com"
SEARCH_URL = f"{API_BASE}/v17/search"

HEADERS = {
    "User-Agent": "Jumbo/9.5.1 (Android 12)",
    "Accept": "application/json",
}

PAGE_SIZE = 30  # Jumbo API geeft 500 bij limit > ~30

_session = None


def _get_session():
    global _session
    if _session is None:
        _session = requests.Session()
        _session.headers.update(HEADERS)
    return _session


def _get(url):
    """HTTP GET via requests."""
    resp = _get_session().get(url, timeout=30)
    resp.raise_for_status()
    return resp.json()


def _map_product(p):
    """Map Jumbo product naar het AH-formaat dat database.py verwacht."""
    prices = p.get("prices", {})
    price_obj = prices.get("price", {})
    promo_obj = prices.get("promotionalPrice", {})
    unit_price = prices.get("unitPrice", {})

    # Prijs: Jumbo geeft centen, database verwacht euro's
    price_cents = promo_obj.get("amount") or price_obj.get("amount")
    price_eur = round(price_cents / 100, 2) if price_cents else None

    original_cents = price_obj.get("amount")
    original_eur = round(original_cents / 100, 2) if original_cents else None

    is_promo = "promotionalPrice" in prices

    # Eenheidsprijs beschrijving
    up = unit_price.get("price", {})
    up_unit = unit_price.get("unit", "")
    up_amount = up.get("amount")
    unit_price_desc = f"€{up_amount / 100:.2f}/{up_unit}" if up_amount else None

    # Afbeelding
    views = p.get("imageInfo", {}).get("primaryView", [])
    image_url = views[0]["url"] if views else None

    # Merk uit titel halen (Jumbo geeft geen apart brand-veld)
    title = p.get("title", "")
    brand = title.split(" - ")[0].strip() if " - " in title else None

    return {
        "webshopId": p.get("id"),
        "hqId": p.get("id"),
        "title": title,
        "brand": brand,
        "salesUnitSize": None,
        "priceBeforeBonus": original_eur if is_promo else price_eur,
        "unitPriceDescription": unit_price_desc,
        "mainCategory": None,
        "subCategory": None,
        "nutriscore": None,
        "isBonus": is_promo,
        "isStapelBonus": False,
        "discountLabels": [],
        "descriptionHighlights": None,
        "propertyIcons": [],
        "images": [{"url": image_url, "width": 200}] if image_url else [],
        "availableOnline": p.get("available", True),
        "orderAvailabilityStatus": p.get("availability", {}).get("availability"),
        # Bewaar het volledige Jumbo-object als raw_json
        "_raw_jumbo": p,
    }


def fetch_all_products(query="brood"):
    """Haal alle broodproducten op via paginatie. Retourneert list[dict]."""
    all_products = []
    offset = 0

    while True:
        params = urlencode({"q": query, "offset": offset, "limit": PAGE_SIZE})
        data = _get(f"{SEARCH_URL}?{params}")

        products_data = data.get("products", {})
        items = products_data.get("data", [])
        total = products_data.get("total", 0)

        all_products.extend(_map_product(p) for p in items)

        offset += PAGE_SIZE
        if offset >= total:
            break

    return all_products
