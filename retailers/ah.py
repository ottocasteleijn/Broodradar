"""Albert Heijn product fetcher via de AH mobiele API."""
import json
import subprocess
import time
from urllib.parse import urlencode

_token_cache = {"token": None, "expires_at": 0}

API_BASE = "https://api.ah.nl"
AUTH_URL = f"{API_BASE}/mobile-auth/v1/auth/token/anonymous"
SEARCH_URL = f"{API_BASE}/mobile-services/product/search/v2"

HEADERS = {
    "User-Agent": "Appie/8.22.3",
    "Content-Type": "application/json",
    "x-application": "AHWEBSHOP",
}


def _curl(method, url, body=None, extra_headers=None):
    """HTTP request via curl (omzeilt TLS-fingerprint blokkade)."""
    headers = {**HEADERS, **(extra_headers or {})}
    cmd = ["curl", "-s", "-X", method]
    for k, v in headers.items():
        cmd += ["-H", f"{k}: {v}"]
    if body is not None:
        cmd += ["-d", json.dumps(body)]
    cmd.append(url)

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if result.returncode != 0:
        raise RuntimeError(f"curl failed: {result.stderr}")
    return json.loads(result.stdout)


def _get_token():
    """Haal een anonymous token op, met in-memory caching."""
    if time.time() < _token_cache["expires_at"] - 60:
        return _token_cache["token"]

    data = _curl("POST", AUTH_URL, body={"clientId": "appie"})
    _token_cache["token"] = data["access_token"]
    _token_cache["expires_at"] = time.time() + data["expires_in"]
    return _token_cache["token"]


def fetch_all_products(query="brood"):
    """Haal alle broodproducten op via paginatie. Retourneert list[dict]."""
    token = _get_token()
    extra = {"Authorization": f"Bearer {token}"}

    all_products = []
    page = 0
    while True:
        params = urlencode({"query": query, "size": 200, "page": page, "sortOn": "RELEVANCE"})
        data = _curl("GET", f"{SEARCH_URL}?{params}", extra_headers=extra)
        all_products.extend(data["products"])

        if page >= data["page"]["totalPages"] - 1:
            break
        page += 1

    return all_products
