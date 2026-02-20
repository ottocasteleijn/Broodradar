"""Plus supermarkt product fetcher via de Plus middleware API (Tweakwise-backed)."""
import json
import logging
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urlencode

logger = logging.getLogger(__name__)

API_BASE = "https://pls-sprmrkt-mw.prd.vdc1.plus.nl/api/v3"
AUTH_URL = "https://pls-sprmrkt-mw.prd.vdc1.plus.nl"
AUTH_PATH = "/Due-away-are-Fight-Banq-Though-theere-Prayers-On"
NAVIGATION_URL = f"{API_BASE}/navigation"
PRODUCT_DETAIL_URL = f"{API_BASE}/product"
MAX_WORKERS = 10
PAGE_SIZE = 1000

HEADERS = {
    "Cache-Control": "no-cache",
    "Content-Type": "application/json",
    "Accept": "*/*",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "User-Agent": "PLUS/3.6.0 (Android 12)",
}

AUTH_COOKIE_KEY = "reese84"

_AUTH_SOLUTION = {
    "solution": {
        "interrogation": {
            "p": "IrfkY8S0oyIit0dzhSM0VhQjloaXNRU18iajItW1IsJGY7T0JCY0Vpcnp3UkdbIm5CNjVKMi1bXC14MidTcWdfQkxmMWNRX203Yi0yKj9tSWp8bG8hbiUwIDdYLmlvZGN3fkAgJFAxMD4gKzlnVj5rNDhwJDYwKSBxTGB3VWJlaWtPJHM1Pic2MzggKEtNRFwsTGAraWAlZWdLY2kvY0AieG1vbyVgMT4lPiA+IDAgMWNRZmlidT8nMzM+ICYwX08iUTkwPiQ+ITU+JjAxMCY1SClkaWR+b2NwJGRxPSIpIiwuRDRJeHlRX0NcbTlaMiViLS5jVVwiJDIpfklUT0h8YVFjUiZ7ejgyI0g5VVNHaWFHVFNkMmd6dX9pOHU3P0xlTTdiLTZqPGFlY3IsKTg2R0d2bTN6MiIrXmVlXSIjXX1SLC5JN19IdmFJenJxN1JHXWRKMilCIT5iU1dlQlZ3fW1HckphUTFEV1pyWERaTkMzaG5BNVxLZkJQPkReSkR5cWJAd09COGhTYWR9b0ppSWlJM25vST5EXU5FVkRqekI1VTJWUVhRMjRUNTA0XGlabklpQ0FTclRSX0ZVRFEyW21KTGA/QHlJaUk9TGNUOH1kY0pFVFpdRl5JaUlpU3E6dWVGWmVYbGdeSmk1QmxsZElcZlA+RkB2RWxgeFRodkM+TG5IQVlyUjFiWlM+R3JGU1B6W2ZbSkI0ZHFVV1E0fWNWX2pgWWpDUV9pM1VSXGMxbERjMVRKUjFeSUl5QTh5YWtodUNsRG5tRXQwM1hwcDlSQlVXXkJMaVtGRFRYaHAyU05AOldVO2RiUTVEUzd1Qll6TW9DWUlpSTVMYVk8bGlfSUNZQjh5YW5FXGRQMlE9SlUwM1F4Z1FuTGZUVTJQNGJfanBZakNQUlpFVFxtTG5JY3hCLTIsLkQ+Rjh1Y09KfmRHWGhdan5COTFWeDpIQjxtN2oyKFIgNlBZbkhTVXVUXUdyVkJVSkpla2VER1d2WmZXQkxiYHByNGpKQTdUfG1hYzxlXUlyREFWUHE2WFtkUWd7a2NSPkVSa2hnSllKWENSQHZDVH5LYW1OR1RVWGExa2xhNlRBPWVkV3dWWn5KYm9mRkRuTkVOTkZVWlJyVE1GUTAyaGRmQmlgfGlYRHVWV1JMYmBwcjNqRlRKWEh3QmtKTWVvZGZEbUpBN1RyXmdaVkdKU3hmRWFgdVpUWUlpQ3pdY2tpM0VgNldJQDN8aFN5Q1NTPkxkUFtqZVd4Z1dbbkdKX0RmRVxmSmNRelRRWk5CN1JxPWNqTGAzVTUwMm9GRkJUelxvQVxlVFB8YjJWTkI1YzRmQWhqW2pYQUhCZTpHUVI4ZVJhYHVUVExnRlppNUpZVHdBWlpRNVR8Yz1DeVExanh3RFJSWFRURlRRZkFSNlA+RFleSHdZWFU9YlFmQjZcSlxhYVk3U1FxSFJRMlIzU3U9YWloaERYVGhCY1B2V1A4ZlJoYldHWVxuZVtJUjxJag==",
            "st": 1667958230,
            "sr": 595521988,
            "cr": 398863270,
        },
        "version": "beta",
    },
    "old_token": None,
    "error": None,
    "performance": {"interrogation": 340},
}

_token_cache = {"token": None}
_session = None


def _get_session():
    global _session
    if _session is None:
        _session = requests.Session()
        _session.headers.update(HEADERS)
    return _session


def _login():
    """Verkrijg een reese84 token via de bot-challenge endpoint."""
    url = f"{AUTH_URL}{AUTH_PATH}?d=pls-sprmrkt-mw.prd.vdc1.plus.nl"
    try:
        resp = requests.post(
            url,
            data=json.dumps(_AUTH_SOLUTION),
            headers={"Content-Type": "application/json"},
            timeout=15,
        )
        resp.raise_for_status()
        token = resp.json().get("token")
        if not token:
            raise RuntimeError("Plus auth response bevat geen token")
        _token_cache["token"] = token
        logger.info("Plus reese84 token verkregen")
        return token
    except Exception as exc:
        logger.error("Plus login mislukt: %s", exc)
        raise


def _get_token():
    """Haal gecached token op, of login opnieuw."""
    if _token_cache["token"]:
        return _token_cache["token"]
    return _login()


def _get(url, retry=True):
    """HTTP GET met reese84 cookie. Retry eenmaal bij 401/403."""
    token = _get_token()
    session = _get_session()
    session.cookies.set(AUTH_COOKIE_KEY, token, domain="pls-sprmrkt-mw.prd.vdc1.plus.nl")
    resp = session.get(url, timeout=30)

    if resp.status_code in (401, 403) and retry:
        logger.warning("Plus API %d, opnieuw inloggen...", resp.status_code)
        _token_cache["token"] = None
        return _get(url, retry=False)

    resp.raise_for_status()
    return resp.json()


def _map_product(p):
    """Map Plus Tweakwise product naar het standaardformat dat database.py verwacht."""
    title = p.get("title", "")
    brand = p.get("brand")

    sale_price = p.get("price")
    list_price = p.get("listPrice") or p.get("price")
    if isinstance(sale_price, str):
        try:
            sale_price = float(sale_price)
        except (ValueError, TypeError):
            sale_price = None
    if isinstance(list_price, str):
        try:
            list_price = float(list_price)
        except (ValueError, TypeError):
            list_price = None

    is_bonus = False
    if sale_price is not None and list_price is not None and list_price > sale_price:
        is_bonus = True

    price = list_price if is_bonus else sale_price

    images_data = p.get("images", [])
    image_url = None
    if isinstance(images_data, list) and images_data:
        first_img = images_data[0]
        if isinstance(first_img, dict):
            image_url = first_img.get("effectiveUrl") or first_img.get("url")
        elif isinstance(first_img, str):
            image_url = first_img

    unit_size = p.get("baseUnit") or p.get("unit")

    return {
        "webshopId": str(p.get("itemno", "")),
        "hqId": str(p.get("itemno", "")),
        "title": title,
        "brand": brand,
        "salesUnitSize": unit_size,
        "priceBeforeBonus": price,
        "unitPriceDescription": None,
        "mainCategory": p.get("mainCategoryName"),
        "subCategory": None,
        "nutriscore": None,
        "isBonus": is_bonus,
        "isStapelBonus": False,
        "discountLabels": [],
        "descriptionHighlights": None,
        "propertyIcons": [],
        "images": [{"url": image_url, "width": 200}] if image_url else [],
        "availableOnline": True,
        "orderAvailabilityStatus": None,
        "_raw_plus": p,
    }


def fetch_all_products(query="brood"):
    """Haal alle broodproducten op via Tweakwise navigatie-paginatie. Retourneert list[dict]."""
    all_products = []
    page = 1

    while True:
        params = urlencode({
            "tn_q": query,
            "tn_ps": PAGE_SIZE,
            "tn_p": page,
        })
        url = f"{NAVIGATION_URL}?{params}"
        data = _get(url)

        items = data.get("items", [])
        if not items:
            break

        all_products.extend(_map_product(p) for p in items)

        props = data.get("properties", {})
        total_pages = props.get("nrofpages", 1)
        if isinstance(total_pages, str):
            try:
                total_pages = int(total_pages)
            except ValueError:
                total_pages = 1

        if page >= total_pages:
            break
        page += 1

    logger.info("Plus: %d producten opgehaald voor query '%s'", len(all_products), query)
    return all_products


def _fetch_one_detail(product_id):
    """Haal productdetails op voor één product. Retourneert (product_id, detail_dict)."""
    if not product_id:
        return (product_id, None)
    try:
        data = _get(f"{PRODUCT_DETAIL_URL}/{product_id}")
        return (str(product_id), data)
    except Exception:
        return (str(product_id), None)


def _fetch_one_ingredients(product_id):
    """Haal ingrediënten op voor één product. Retourneert (product_id, ingredient_text)."""
    pid, data = _fetch_one_detail(product_id)
    if not data or not isinstance(data, dict):
        return (pid, None)

    ingredients = data.get("wettelijke_naam") or data.get("ingredients")
    if ingredients and isinstance(ingredients, str):
        return (pid, ingredients.strip())
    return (pid, None)


def verify_products_exist(webshop_ids):
    """Verify via product detail API welke producten nog bestaan. Retourneert set van webshop_id strings die bestaan."""
    if not webshop_ids:
        return set()
    existing = set()

    def _check_one(product_id):
        try:
            _get(f"{PRODUCT_DETAIL_URL}/{product_id}")
            return str(product_id)
        except Exception:
            return None

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(_check_one, pid): pid for pid in webshop_ids}
        for future in as_completed(futures):
            result = future.result()
            if result:
                existing.add(result)
    return existing


def fetch_ingredients(product_ids):
    """
    Haal ingrediënten op voor de opgegeven product_ids via concurrente REST-calls.
    Retourneert dict[product_id_str, ingredient_text].
    """
    if not product_ids:
        return {}
    result = {}
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(_fetch_one_ingredients, pid): pid for pid in product_ids}
        for future in as_completed(futures):
            pid, text = future.result()
            if pid and text is not None:
                result[pid] = text
    return result
