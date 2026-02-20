import os
from supabase import create_client

_supabase = None
_has_retailer_column = None


def _get_client():
    global _supabase
    if _supabase is None:
        url = os.environ["SUPABASE_URL"]
        key = os.environ["SUPABASE_KEY"]
        _supabase = create_client(url, key)
    return _supabase


def sign_in(email, password):
    """Authenticate user with email and password. Returns dict with session, user, access_token, refresh_token; raises on failure."""
    sb = _get_client()
    response = sb.auth.sign_in_with_password({"email": email, "password": password})
    return response


def get_user_from_token(access_token):
    """Validate access token and return user. Raises on invalid/expired token."""
    sb = _get_client()
    response = sb.auth.get_user(jwt=access_token)
    return response.user


def _check_retailer_column():
    """Check of de retailer-kolom bestaat (migratie uitgevoerd)."""
    global _has_retailer_column
    if _has_retailer_column is not None:
        return _has_retailer_column
    sb = _get_client()
    try:
        sb.table("snapshots").select("retailer").limit(1).execute()
        _has_retailer_column = True
    except Exception:
        _has_retailer_column = False
    return _has_retailer_column


def create_snapshot(products, retailer="ah", label=None):
    """Sla een nieuw snapshot op met alle producten. Retourneert snapshot_id."""
    sb = _get_client()
    has_retailer = _check_retailer_column()

    row = {"product_count": len(products), "label": label}
    if has_retailer:
        row["retailer"] = retailer

    snap = sb.table("snapshots").insert(row).execute()
    snapshot_id = snap.data[0]["id"]

    rows = []
    for p in products:
        images = p.get("images", [])
        image_url = None
        for img in images:
            if img.get("width") == 200:
                image_url = img["url"]
                break
        if not image_url and images:
            image_url = images[0]["url"]

        r = {
            "snapshot_id": snapshot_id,
            "webshop_id": p.get("webshopId"),
            "hq_id": p.get("hqId"),
            "title": p.get("title"),
            "brand": p.get("brand"),
            "sales_unit_size": p.get("salesUnitSize"),
            "price": p.get("priceBeforeBonus"),
            "unit_price_description": p.get("unitPriceDescription"),
            "main_category": p.get("mainCategory"),
            "sub_category": p.get("subCategory"),
            "nutriscore": p.get("nutriscore"),
            "is_bonus": p.get("isBonus", False),
            "is_stapel_bonus": p.get("isStapelBonus", False),
            "discount_labels": p.get("discountLabels", []),
            "description_highlights": p.get("descriptionHighlights"),
            "property_icons": p.get("propertyIcons", []),
            "image_url": image_url,
            "available_online": p.get("availableOnline", True),
            "order_availability_status": p.get("orderAvailabilityStatus"),
            "raw_json": p,
        }
        if has_retailer:
            r["retailer"] = retailer
        rows.append(r)

    batch_size = 500
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        sb.table("products").insert(batch).execute()

    _generate_timeline_events(retailer, snapshot_id)
    return snapshot_id


def get_snapshots(retailer=None):
    """Alle snapshots ophalen, nieuwste eerst. Optioneel gefilterd op retailer."""
    sb = _get_client()
    if retailer and not _check_retailer_column():
        if retailer != "ah":
            return []
        return sb.table("snapshots").select("*").order("created_at", desc=True).execute().data
    q = sb.table("snapshots").select("*").order("created_at", desc=True)
    if retailer and _check_retailer_column():
        q = q.eq("retailer", retailer)
    return q.execute().data


def get_snapshot_products(snapshot_id):
    """Producten van een specifiek snapshot."""
    sb = _get_client()
    return sb.table("products").select("*").eq("snapshot_id", snapshot_id).execute().data


def get_latest_snapshot_products(retailer="ah"):
    """Producten van de meest recente snapshot voor een retailer."""
    snapshots = get_snapshots(retailer)
    if not snapshots:
        return []
    return get_snapshot_products(snapshots[0]["id"])


def compare_snapshots(old_id, new_id):
    """Vergelijk twee snapshots. Retourneert dict met wijzigingen."""
    old_products = {p["webshop_id"]: p for p in get_snapshot_products(old_id)}
    new_products = {p["webshop_id"]: p for p in get_snapshot_products(new_id)}

    old_ids = set(old_products.keys())
    new_ids = set(new_products.keys())

    result = {
        "new_products": [new_products[wid] for wid in sorted(new_ids - old_ids)],
        "removed_products": [old_products[wid] for wid in sorted(old_ids - new_ids)],
        "price_changes": [],
        "bonus_changes": [],
    }

    for wid in sorted(old_ids & new_ids):
        old = old_products[wid]
        new = new_products[wid]

        old_price = float(old["price"]) if old["price"] else 0
        new_price = float(new["price"]) if new["price"] else 0
        if old_price != new_price:
            pct = ((new_price - old_price) / old_price * 100) if old_price else 0
            result["price_changes"].append({
                "product": new,
                "old_price": old_price,
                "new_price": new_price,
                "pct_change": round(pct, 1),
            })

        if old["is_bonus"] != new["is_bonus"]:
            result["bonus_changes"].append({
                "product": new,
                "was_bonus": old["is_bonus"],
                "is_bonus": new["is_bonus"],
            })

    return result


def _generate_timeline_events(retailer, new_snapshot_id):
    """Genereer timeline events door het nieuwe snapshot te vergelijken met het vorige."""
    snapshots = get_snapshots(retailer)
    if len(snapshots) < 2:
        return

    old_id = snapshots[1]["id"]
    changes = compare_snapshots(old_id, new_snapshot_id)
    sb = _get_client()
    events = []

    for p in changes["new_products"]:
        events.append({
            "retailer": retailer,
            "event_type": "new_product",
            "snapshot_id": new_snapshot_id,
            "product_title": p["title"],
            "product_image_url": p.get("image_url"),
            "details": {"price": float(p["price"]) if p.get("price") else None},
        })

    for p in changes["removed_products"]:
        events.append({
            "retailer": retailer,
            "event_type": "removed_product",
            "snapshot_id": new_snapshot_id,
            "product_title": p["title"],
            "product_image_url": p.get("image_url"),
            "details": {},
        })

    for c in changes["price_changes"]:
        events.append({
            "retailer": retailer,
            "event_type": "price_change",
            "snapshot_id": new_snapshot_id,
            "product_title": c["product"]["title"],
            "product_image_url": c["product"].get("image_url"),
            "details": {
                "old_price": c["old_price"],
                "new_price": c["new_price"],
                "pct_change": c["pct_change"],
            },
        })

    for c in changes["bonus_changes"]:
        events.append({
            "retailer": retailer,
            "event_type": "bonus_change",
            "snapshot_id": new_snapshot_id,
            "product_title": c["product"]["title"],
            "product_image_url": c["product"].get("image_url"),
            "details": {
                "was_bonus": c["was_bonus"],
                "is_bonus": c["is_bonus"],
            },
        })

    if events:
        try:
            batch_size = 500
            for i in range(0, len(events), batch_size):
                sb.table("timeline_events").insert(events[i:i + batch_size]).execute()
        except Exception:
            pass


def get_timeline_events(limit=50, retailer=None, event_type=None):
    """Haal timeline events op, nieuwste eerst."""
    sb = _get_client()
    try:
        q = sb.table("timeline_events").select("*").order("created_at", desc=True).limit(limit)
        if retailer:
            q = q.eq("retailer", retailer)
        if event_type:
            q = q.eq("event_type", event_type)
        return q.execute().data
    except Exception:
        return []


def get_retailer_stats():
    """Haal per retailer het laatste snapshot op voor de dashboard kaarten."""
    from retailers import RETAILERS
    stats = {}
    all_snapshots = get_snapshots()
    for slug in RETAILERS:
        if _check_retailer_column():
            retailer_snaps = [s for s in all_snapshots if s.get("retailer") == slug]
        else:
            retailer_snaps = all_snapshots if slug == "ah" else []
        stats[slug] = {
            "last_snapshot": retailer_snaps[0] if retailer_snaps else None,
            "snapshot_count": len(retailer_snaps),
        }
    return stats
