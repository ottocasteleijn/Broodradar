import os
from datetime import datetime, timezone
from supabase import create_client

_supabase = None
_has_retailer_column = None
_has_product_catalog = None


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


def _check_product_catalog():
    """Check of product_catalog tabel bestaat."""
    global _has_product_catalog
    if _has_product_catalog is not None:
        return _has_product_catalog
    sb = _get_client()
    try:
        sb.table("product_catalog").select("id").limit(1).execute()
        _has_product_catalog = True
    except Exception:
        _has_product_catalog = False
    return _has_product_catalog


def _catalog_row_from_snapshot_product(r):
    """Maak een product_catalog rij uit een snapshot-product dict (zoals in create_snapshot)."""
    return {
        "retailer": r.get("retailer", "ah"),
        "webshop_id": r.get("webshop_id") or "",
        "title": r.get("title"),
        "brand": r.get("brand"),
        "price": r.get("price"),
        "sales_unit_size": r.get("sales_unit_size"),
        "unit_price_description": r.get("unit_price_description"),
        "nutriscore": r.get("nutriscore"),
        "main_category": r.get("main_category"),
        "sub_category": r.get("sub_category"),
        "image_url": r.get("image_url"),
        "is_bonus": bool(r.get("is_bonus", False)),
        "is_available": True,
    }


def _detect_changes(old_row, new_data):
    """Vergelijk oude catalog row met nieuwe data. Retourneert (event_type, changes dict)."""
    changes = {}
    if old_row is None:
        return "first_seen", changes

    old_price = float(old_row["price"]) if old_row.get("price") is not None else None
    new_price = float(new_data["price"]) if new_data.get("price") is not None else None
    if old_price != new_price:
        changes["price"] = {"old": old_price, "new": new_price}
        if old_price and new_price:
            changes["price"]["pct_change"] = round((new_price - old_price) / old_price * 100, 1)

    old_title = (old_row.get("title") or "").strip()
    new_title = (new_data.get("title") or "").strip()
    if old_title != new_title:
        changes["title"] = {"old": old_title or None, "new": new_title or None}

    old_bonus = bool(old_row.get("is_bonus", False))
    new_bonus = bool(new_data.get("is_bonus", False))
    if old_bonus != new_bonus:
        changes["bonus"] = {"old": old_bonus, "new": new_bonus}

    if not changes:
        return "unchanged", {}
    if "price" in changes and "title" not in changes and "bonus" not in changes:
        return "price_change", changes
    if "title" in changes and "price" not in changes and "bonus" not in changes:
        return "title_change", changes
    if "bonus" in changes and "price" not in changes and "title" not in changes:
        return "bonus_change", changes
    return "multi_change", changes


def _update_catalog_and_history(sb, retailer, snapshot_id, rows, has_retailer):
    """Na snapshot insert: upsert product_catalog en schrijf product_history."""
    if not rows:
        return
    new_by_webshop = {r["webshop_id"]: r for r in rows if r.get("webshop_id")}
    if not new_by_webshop:
        return

    snapshots = get_snapshots(retailer)
    old_by_webshop = {}
    if len(snapshots) >= 2:
        prev_snapshot_id = snapshots[1]["id"]
        old_products = get_snapshot_products(prev_snapshot_id)
        old_by_webshop = {p["webshop_id"]: p for p in old_products if p.get("webshop_id")}

    all_webshop_ids = set(old_by_webshop.keys()) | set(new_by_webshop.keys())
    existing_list = []
    try:
        # Supabase .in_() with large list may need batching
        wids = list(all_webshop_ids)
        for i in range(0, len(wids), 100):
            chunk = wids[i : i + 100]
            r = sb.table("product_catalog").select("*").eq("retailer", retailer).in_("webshop_id", chunk).execute()
            existing_list.extend(r.data)
    except Exception:
        existing_list = []
    existing_by_webshop = {row["webshop_id"]: row for row in existing_list}

    history_batch = []
    now_iso = datetime.now(timezone.utc).isoformat()

    for webshop_id, new_data in new_by_webshop.items():
        catalog_row = _catalog_row_from_snapshot_product(new_data)
        existing = existing_by_webshop.get(webshop_id)
        event_type, changes = _detect_changes(existing, new_data)
        price_at = new_data.get("price")
        if existing:
            product_id = existing["id"]
            sb.table("product_catalog").update({
                "title": catalog_row["title"],
                "brand": catalog_row["brand"],
                "price": catalog_row["price"],
                "sales_unit_size": catalog_row["sales_unit_size"],
                "unit_price_description": catalog_row["unit_price_description"],
                "nutriscore": catalog_row["nutriscore"],
                "main_category": catalog_row["main_category"],
                "sub_category": catalog_row["sub_category"],
                "image_url": catalog_row["image_url"],
                "is_bonus": catalog_row["is_bonus"],
                "is_available": True,
                "last_seen_at": now_iso,
                "updated_at": now_iso,
            }).eq("id", product_id).execute()
        else:
            ins = sb.table("product_catalog").insert(catalog_row).execute()
            if ins.data:
                product_id = ins.data[0]["id"]
            else:
                continue
        history_batch.append({
            "product_id": product_id,
            "snapshot_id": snapshot_id,
            "event_type": event_type,
            "changes": changes,
            "price_at_snapshot": price_at,
        })

    for webshop_id in set(old_by_webshop.keys()) - set(new_by_webshop.keys()):
        existing = existing_by_webshop.get(webshop_id)
        if not existing:
            continue
        product_id = existing["id"]
        sb.table("product_catalog").update({
            "is_available": False,
            "updated_at": now_iso,
        }).eq("id", product_id).execute()
        history_batch.append({
            "product_id": product_id,
            "snapshot_id": snapshot_id,
            "event_type": "removed",
            "changes": {},
            "price_at_snapshot": None,
        })

    for i in range(0, len(history_batch), 500):
        sb.table("product_history").insert(history_batch[i : i + 500]).execute()


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
    if _check_product_catalog():
        try:
            _update_catalog_and_history(sb, retailer, snapshot_id, rows, has_retailer)
        except Exception:
            pass
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


def get_catalog_products(retailer):
    """Producten uit product_catalog voor een retailer (eigen database, met historie op snapshots)."""
    if not _check_product_catalog():
        return []
    sb = _get_client()
    try:
        r = (
            sb.table("product_catalog")
            .select("id, retailer, webshop_id, title, brand, price, sales_unit_size, unit_price_description, nutriscore, sub_category, image_url, is_bonus, first_seen_at, last_seen_at")
            .eq("retailer", retailer)
            .order("title")
            .execute()
        )
        return r.data or []
    except Exception:
        return []


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


def get_product(product_id):
    """Haal een product_catalog record op op basis van id. Retourneert None als niet gevonden."""
    if not _check_product_catalog():
        return None
    sb = _get_client()
    try:
        r = sb.table("product_catalog").select("*").eq("id", product_id).limit(1).execute()
        return r.data[0] if r.data else None
    except Exception:
        return None


def get_product_history(product_id, limit=50):
    """Haal product_history entries op voor een product, nieuwste eerst."""
    if not _check_product_catalog():
        return []
    sb = _get_client()
    try:
        r = (
            sb.table("product_history")
            .select("*")
            .eq("product_id", product_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return r.data or []
    except Exception:
        return []


def get_product_at_snapshot(product_id, snapshot_id):
    """
    Haal het product op zoals het was in een bepaald snapshot.
    Retourneert None als het product niet in dat snapshot zit.
    Anders: dict met product (catalog-vorm), snapshot, history_entry, adjacent (newer/older snapshot_id).
    """
    if not _check_product_catalog():
        return None
    catalog = get_product(product_id)
    if not catalog:
        return None
    retailer = catalog.get("retailer") or "ah"
    webshop_id = catalog.get("webshop_id") or ""
    if not webshop_id:
        return None

    sb = _get_client()
    # Product row in dit snapshot (snapshot is per retailer, dus snapshot_id + webshop_id is voldoende)
    try:
        r = (
            sb.table("products")
            .select("*")
            .eq("snapshot_id", snapshot_id)
            .eq("webshop_id", webshop_id)
            .limit(1)
            .execute()
        )
        snapshot_row = r.data[0] if r.data else None
    except Exception:
        snapshot_row = None

    if not snapshot_row:
        return None

    # Snapshot-metadata
    snap_list = sb.table("snapshots").select("*").eq("id", snapshot_id).limit(1).execute().data
    snapshot_meta = snap_list[0] if snap_list else {"id": snapshot_id, "created_at": None, "retailer": retailer}

    # History entry voor dit snapshot
    history = get_product_history(product_id, limit=200)
    history_entry = next((h for h in history if h.get("snapshot_id") == snapshot_id), None)
    if not history_entry:
        history_entry = {
            "event_type": "unchanged",
            "changes": {},
            "price_at_snapshot": snapshot_row.get("price"),
        }

    # Adjacent: nieuwste eerst, dus index-1 = newer (recenter), index+1 = older
    current_idx = next((i for i, h in enumerate(history) if h.get("snapshot_id") == snapshot_id), -1)
    newer_snapshot_id = history[current_idx - 1]["snapshot_id"] if current_idx > 0 else None
    older_snapshot_id = history[current_idx + 1]["snapshot_id"] if current_idx >= 0 and current_idx + 1 < len(history) else None

    # Catalog-vorm voor frontend (id = catalog id, rest uit snapshot + catalog voor first/last seen)
    product_payload = {
        "id": product_id,
        "retailer": retailer,
        "webshop_id": webshop_id,
        "title": snapshot_row.get("title"),
        "brand": snapshot_row.get("brand"),
        "price": snapshot_row.get("price"),
        "sales_unit_size": snapshot_row.get("sales_unit_size"),
        "unit_price_description": snapshot_row.get("unit_price_description"),
        "nutriscore": snapshot_row.get("nutriscore"),
        "main_category": snapshot_row.get("main_category"),
        "sub_category": snapshot_row.get("sub_category"),
        "image_url": snapshot_row.get("image_url"),
        "is_bonus": bool(snapshot_row.get("is_bonus", False)),
        "is_available": True,
        "first_seen_at": catalog.get("first_seen_at") or "",
        "last_seen_at": catalog.get("last_seen_at") or "",
        "created_at": catalog.get("created_at") or "",
        "updated_at": catalog.get("updated_at") or "",
    }

    return {
        "product": product_payload,
        "snapshot": {
            "id": snapshot_meta.get("id"),
            "created_at": snapshot_meta.get("created_at"),
            "retailer": snapshot_meta.get("retailer", retailer),
        },
        "history_entry": {
            "event_type": history_entry.get("event_type"),
            "changes": history_entry.get("changes") or {},
            "price_at_snapshot": history_entry.get("price_at_snapshot"),
        },
        "adjacent": {
            "newer_snapshot_id": newer_snapshot_id,
            "older_snapshot_id": older_snapshot_id,
        },
        "version_index": current_idx + 1 if current_idx >= 0 else None,
        "version_count": len(history),
    }


def get_product_by_webshop_id(retailer, webshop_id):
    """Lookup product_catalog op basis van retailer en webshop_id. Retourneert None als niet gevonden."""
    if not _check_product_catalog():
        return None
    sb = _get_client()
    try:
        r = (
            sb.table("product_catalog")
            .select("*")
            .eq("retailer", retailer)
            .eq("webshop_id", webshop_id)
            .limit(1)
            .execute()
        )
        return r.data[0] if r.data else None
    except Exception:
        return None


def get_catalog_ids_for_webshop_ids(retailer, webshop_ids):
    """Geef een dict webshop_id -> catalog id voor de opgegeven retailer en webshop_ids."""
    if not _check_product_catalog() or not webshop_ids:
        return {}
    sb = _get_client()
    wids = list(set(webshop_ids))[:500]
    try:
        r = (
            sb.table("product_catalog")
            .select("id, webshop_id")
            .eq("retailer", retailer)
            .in_("webshop_id", wids)
            .execute()
        )
        return {row["webshop_id"]: row["id"] for row in (r.data or [])}
    except Exception:
        return {}


def ensure_catalog_entry(retailer, webshop_id):
    """Haal catalog-product op; als het nog niet bestaat, maak aan uit laatste snapshot en retourneer. None als product niet in laatste snapshot zit."""
    if not _check_product_catalog():
        return None
    existing = get_product_by_webshop_id(retailer, webshop_id)
    if existing:
        return existing
    products = get_latest_snapshot_products(retailer)
    row = next((p for p in products if p.get("webshop_id") == webshop_id), None)
    if not row:
        return None
    sb = _get_client()
    catalog_row = _catalog_row_from_snapshot_product(row)
    ins = sb.table("product_catalog").insert(catalog_row).execute()
    if not ins.data:
        return None
    # Geen product_history schrijven bij lazy-aanmaak (gebruiker volgt product).
    # Alleen wijzigingen uit snapshots (supermarkt) horen in "Recente wijzigingen".
    return ins.data[0]


def ensure_catalog_entries_for_webshop_ids(retailer, webshop_ids):
    """
    Zorg dat product_catalog een entry heeft voor elk (retailer, webshop_id).
    Ontbrekende entries worden uit het laatste snapshot aangemaakt.
    Retourneert een dict webshop_id -> catalog_id voor alle opgegeven webshop_ids (bestaand + nieuw).
    """
    if not _check_product_catalog() or not webshop_ids:
        return {}
    catalog_ids = get_catalog_ids_for_webshop_ids(retailer, list(webshop_ids))
    missing = [wid for wid in webshop_ids if wid and wid not in catalog_ids]
    if not missing:
        return catalog_ids
    snapshot_products = get_latest_snapshot_products(retailer)
    by_webshop = {p.get("webshop_id"): p for p in snapshot_products if p.get("webshop_id")}
    to_insert = []
    for wid in missing:
        p = by_webshop.get(wid)
        if not p:
            continue
        to_insert.append(_catalog_row_from_snapshot_product(p))
    if to_insert:
        sb = _get_client()
        try:
            for i in range(0, len(to_insert), 100):
                batch = to_insert[i : i + 100]
                ins = sb.table("product_catalog").insert(batch).execute()
                if ins.data:
                    for row in ins.data:
                        catalog_ids[row["webshop_id"]] = row["id"]
        except Exception:
            pass
    return catalog_ids
