"""Plus supermarkt product fetcher via server-side rendered HTML (Googlebot prerender)."""
import logging
import re
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from html import unescape

logger = logging.getLogger(__name__)

BASE_URL = "https://www.plus.nl"
MAIN_CATEGORY = "/producten/brood-gebak-bakproducten"
EXCLUDED_SUBCATEGORIES = (
    "bakproducten",
    "luxe-cake-en-koek",
    "vers-gebak",
)
PRODUCT_URL = f"{BASE_URL}/product"
MAX_WORKERS = 8
REQUEST_TIMEOUT = 30

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "nl-NL,nl;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
}

_session = None
_slug_cache = {}


def _get_session():
    global _session
    if _session is None:
        _session = requests.Session()
        _session.headers.update(HEADERS)
    return _session


def _fetch_html(url):
    """Fetch prerendered HTML via Googlebot user-agent."""
    resp = _get_session().get(url, timeout=REQUEST_TIMEOUT)
    resp.raise_for_status()
    return resp.text


def _parse_product_list(html):
    """Parse product links, titles, prices, images and bonus from a PLP page."""
    products = []

    link_pattern = re.compile(
        r'href="/product/([^"]+)"\s+title="([^"]+)"'
    )
    price_int_pattern = re.compile(
        r'PriceInteger[^>]*><span[^>]*>([^<]+)'
    )
    price_dec_pattern = re.compile(
        r'PriceDecimals[^>]*><span[^>]*>([^<]+)'
    )
    prev_price_pattern = re.compile(
        r'PricePrevious[^>]*>(.*?)</div',
        re.DOTALL,
    )
    image_pattern = re.compile(
        r'src="(https://images\.ctfassets\.net/s0lodsnpsezb/(\d+)_M/[^"]+)"'
    )

    links = link_pattern.findall(html)
    price_ints = price_int_pattern.findall(html)
    price_decs = price_dec_pattern.findall(html)
    prev_prices = prev_price_pattern.findall(html)

    images_by_sku = {}
    for url, sku in image_pattern.findall(html):
        url = url.replace("&amp;", "&")
        url = re.sub(r"[?&]w=\d+", "?w=200", url)
        url = re.sub(r"[?&]h=\d+", "&h=200", url)
        images_by_sku.setdefault(sku, url)

    for i, (slug, title) in enumerate(links):
        sku = slug.rsplit("-", 1)[-1] if "-" in slug else slug
        title = unescape(title)

        price = None
        if i < len(price_ints) and i < len(price_decs):
            try:
                price = float(price_ints[i].strip() + price_decs[i].strip())
            except (ValueError, TypeError):
                pass

        is_bonus = False
        prev_price = None
        if i < len(prev_prices):
            prev_match = re.search(r"[\d]+[.,][\d]+", prev_prices[i])
            if prev_match:
                is_bonus = True
                try:
                    prev_price = float(prev_match.group().replace(",", "."))
                except (ValueError, TypeError):
                    pass

        image_url = images_by_sku.get(sku)
        images = [{"url": image_url, "width": 200}] if image_url else []

        products.append({
            "webshopId": sku,
            "hqId": sku,
            "title": title,
            "brand": _extract_brand(title),
            "salesUnitSize": _extract_unit(slug),
            "priceBeforeBonus": prev_price if is_bonus else price,
            "unitPriceDescription": None,
            "mainCategory": "Brood, gebak & bakproducten",
            "subCategory": None,
            "nutriscore": None,
            "isBonus": is_bonus,
            "isStapelBonus": False,
            "discountLabels": [],
            "descriptionHighlights": None,
            "propertyIcons": [],
            "images": images,
            "availableOnline": True,
            "orderAvailabilityStatus": None,
            "_plus_slug": slug,
        })

    return products


def _extract_brand(title):
    """Haal merk uit titel (eerste woord of PLUS)."""
    if title.upper().startswith("PLUS "):
        return "PLUS"
    parts = title.split()
    return parts[0] if parts else None


def _extract_unit(slug):
    """Probeer eenheid uit de slug te halen (bijv. 'zak-1-st' of 'zak-400-g')."""
    unit_match = re.search(r"-(stuk|zak|pak|doos|bakje|fles|blik)-(\d+)-(\w+)-", slug)
    if unit_match:
        return f"{unit_match.group(2)} {unit_match.group(3)}"
    unit_match2 = re.search(r"-(stuk|zak|pak|doos|bakje|fles|blik)-(\d+)-(\w+)$", slug)
    if unit_match2:
        return f"{unit_match2.group(2)} {unit_match2.group(3)}"
    return None


def _discover_leaf_categories():
    """Ontdek alle leaf-subcategorieën van de broodcategorie."""
    url = f"{BASE_URL}{MAIN_CATEGORY}"
    html = _fetch_html(url)
    all_cats = list(set(re.findall(
        rf'href="({re.escape(MAIN_CATEGORY)}/[^"]+)"', html
    )))
    all_cats.sort()

    leaves = []
    for cat in all_cats:
        segment = cat.replace(MAIN_CATEGORY + "/", "").split("/")[0]
        if segment in EXCLUDED_SUBCATEGORIES:
            continue
        is_parent = any(
            other.startswith(cat + "/") for other in all_cats if other != cat
        )
        if not is_parent:
            leaves.append(cat)
    return leaves, html


def _scrape_category(url):
    """Scrape een enkele categorie-URL en retourneer producten."""
    try:
        html = _fetch_html(url)
        return _parse_product_list(html)
    except Exception as exc:
        logger.warning("Plus: fout bij ophalen %s: %s", url, exc)
        return []


def fetch_all_products(query="brood"):
    """Haal alle broodproducten op via alle subcategorieën. Retourneert list[dict]."""
    logger.info("Plus: ontdekken subcategorieën van %s", MAIN_CATEGORY)
    leaves, main_html = _discover_leaf_categories()
    logger.info("Plus: %d leaf-categorieën gevonden", len(leaves))

    seen = {}
    main_products = _parse_product_list(main_html)
    for p in main_products:
        seen[p["webshopId"]] = p

    urls = [f"{BASE_URL}{cat}" for cat in leaves]
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(_scrape_category, url): url for url in urls}
        for future in as_completed(futures):
            for p in future.result():
                if p["webshopId"] not in seen:
                    seen[p["webshopId"]] = p

    products = list(seen.values())
    for p in products:
        _slug_cache[p["webshopId"]] = p.get("_plus_slug", "")

    logger.info("Plus: %d unieke producten opgehaald", len(products))
    return products


def _fetch_product_detail(slug):
    """Haal productdetails op (ingrediënten, prijs) van de PDP."""
    url = f"{PRODUCT_URL}/{slug}"
    try:
        html = _fetch_html(url)
    except Exception:
        return None

    detail = {}

    ing_pattern = re.compile(
        r'ingredienten_btn.*?<span data-expression=""[^>]*>(.+?)</span>',
        re.DOTALL,
    )
    ing_match = ing_pattern.search(html)
    if ing_match:
        raw = ing_match.group(1).strip()
        raw = re.sub(r"<[^>]+>", "", raw)
        detail["ingredients"] = unescape(raw).strip()

    price_int_match = re.search(r'PriceInteger[^>]*><span[^>]*>([^<]+)', html)
    price_dec_match = re.search(r'PriceDecimals[^>]*><span[^>]*>([^<]+)', html)
    if price_int_match and price_dec_match:
        try:
            detail["price"] = float(
                price_int_match.group(1).strip() + price_dec_match.group(1).strip()
            )
        except (ValueError, TypeError):
            pass

    prev_match = re.search(
        r'PricePrevious[^>]*>.*?(\d+[.,]\d+).*?</div', html, re.DOTALL
    )
    if prev_match:
        try:
            detail["previousPrice"] = float(prev_match.group(1).replace(",", "."))
        except (ValueError, TypeError):
            pass

    return detail


def _fetch_one_ingredients(product_id):
    """Haal ingrediënten op voor één product. Retourneert (webshop_id, ingredient_text)."""
    pid = str(product_id)
    slug = _slug_cache.get(pid)
    if not slug:
        return (pid, None)

    detail = _fetch_product_detail(slug)
    if not detail:
        return (pid, None)
    return (pid, detail.get("ingredients"))


def verify_products_exist(webshop_ids):
    """Verify via product detail page welke producten nog bestaan. Retourneert set van webshop_id strings."""
    if not webshop_ids:
        return set()
    existing = set()

    def _check_one(product_id):
        url = f"{BASE_URL}/product/x-{product_id}"
        try:
            resp = _get_session().get(url, timeout=REQUEST_TIMEOUT, allow_redirects=True)
            if resp.status_code == 200 and "pagina-niet-gevonden" not in resp.url:
                return str(product_id)
        except Exception:
            pass
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
    Haal ingrediënten op voor de opgegeven product_ids.
    Retourneert dict[product_id_str, ingredient_text].

    Gebruikt de _slug_cache die gevuld wordt door fetch_all_products.
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
