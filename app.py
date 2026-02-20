import os
from functools import wraps
from dotenv import load_dotenv
load_dotenv()

from flask import Flask, render_template, redirect, url_for, flash, request, abort, session, jsonify, send_from_directory
import database
from retailers import RETAILERS, get_fetcher

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "frontend", "dist")

app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path="")
app.secret_key = os.environ.get("SECRET_KEY", "broodradar-dev-key")

app.jinja_env.globals["RETAILERS"] = RETAILERS


def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        access_token = session.get("access_token")
        if not access_token:
            return redirect(url_for("login"))
        try:
            database.get_user_from_token(access_token)
        except Exception:
            session.clear()
            return redirect(url_for("login"))
        return f(*args, **kwargs)
    return decorated_function


@app.context_processor
def inject_user_email():
    return {"user_email": session.get("user_email")}


@app.route("/login", methods=["GET", "POST"])
def login():
    if session.get("access_token"):
        try:
            database.get_user_from_token(session["access_token"])
            return redirect(url_for("dashboard"))
        except Exception:
            session.clear()
    if request.method == "POST":
        email = (request.form.get("email") or "").strip()
        password = request.form.get("password") or ""
        if not email or not password:
            flash("Vul e-mail en wachtwoord in.", "error")
            return render_template("login.html")
        try:
            response = database.sign_in(email, password)
            session["access_token"] = response.session.access_token
            session["refresh_token"] = response.session.refresh_token
            session["user_email"] = response.user.email
            return redirect(url_for("dashboard"))
        except Exception as e:
            flash("Inloggen mislukt. Controleer je gegevens.", "error")
            return render_template("login.html")
    return render_template("login.html")


@app.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.route("/")
def index():
    return redirect(url_for("dashboard"))


@app.route("/dashboard")
@login_required
def dashboard():
    stats = database.get_retailer_stats()
    recent_events = database.get_timeline_events(limit=5)
    return render_template("dashboard.html", stats=stats, recent_events=recent_events)


@app.route("/retailer/<slug>")
@login_required
def retailer_detail(slug):
    if slug not in RETAILERS:
        abort(404)

    info = RETAILERS[slug]
    snapshots = database.get_snapshots(retailer=slug)
    snapshot = snapshots[0] if snapshots else None
    products = database.get_latest_snapshot_products(retailer=slug) if snapshot else []

    categories = sorted(set(p["sub_category"] for p in products if p.get("sub_category")))
    brands = sorted(set(p["brand"] for p in products if p.get("brand")))

    return render_template(
        "retailer.html",
        slug=slug,
        info=info,
        snapshot=snapshot,
        products=products,
        categories=categories,
        brands=brands,
    )


@app.route("/retailer/<slug>/snapshot/new", methods=["POST"])
@login_required
def snapshot_new(slug):
    if slug not in RETAILERS:
        abort(404)

    info = RETAILERS[slug]
    if not info["active"]:
        flash(f"{info['name']} is nog niet beschikbaar.", "error")
        return redirect(url_for("retailer_detail", slug=slug))

    try:
        fetcher = get_fetcher(slug)
        products = fetcher.fetch_all_products()
        database.create_snapshot(products, retailer=slug)
        flash(f"Snapshot aangemaakt met {len(products)} producten.", "success")
    except NotImplementedError as e:
        flash(str(e), "error")
    except Exception as e:
        flash(f"Fout bij ophalen: {e}", "error")

    return redirect(url_for("retailer_detail", slug=slug))


@app.route("/timeline")
@login_required
def timeline():
    retailer_filter = request.args.get("retailer", "")
    type_filter = request.args.get("type", "")

    events = database.get_timeline_events(
        limit=100,
        retailer=retailer_filter or None,
        event_type=type_filter or None,
    )

    return render_template(
        "timeline.html",
        events=events,
        retailer_filter=retailer_filter,
        type_filter=type_filter,
    )


@app.route("/snapshots")
@login_required
def snapshots():
    retailer_filter = request.args.get("retailer", "")
    all_snapshots = database.get_snapshots(retailer=retailer_filter or None)
    return render_template(
        "snapshots.html",
        snapshots=all_snapshots,
        retailer_filter=retailer_filter,
    )


@app.route("/vergelijk")
@login_required
def vergelijk():
    old_id = request.args.get("old")
    new_id = request.args.get("new")

    if not old_id or not new_id:
        flash("Selecteer twee snapshots om te vergelijken.", "error")
        return redirect(url_for("snapshots"))

    all_snapshots = database.get_snapshots()
    old_snapshot = next((s for s in all_snapshots if s["id"] == old_id), None)
    new_snapshot = next((s for s in all_snapshots if s["id"] == new_id), None)

    if not old_snapshot or not new_snapshot:
        flash("Snapshot niet gevonden.", "error")
        return redirect(url_for("snapshots"))

    changes = database.compare_snapshots(old_id, new_id)

    return render_template(
        "vergelijk.html",
        old_snapshot=old_snapshot,
        new_snapshot=new_snapshot,
        changes=changes,
    )


# ---------------------------------------------------------------------------
# JSON API endpoints (voor React frontend)
# ---------------------------------------------------------------------------

def api_login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        access_token = session.get("access_token")
        if not access_token:
            return jsonify({"error": "Not authenticated"}), 401
        try:
            database.get_user_from_token(access_token)
        except Exception:
            session.clear()
            return jsonify({"error": "Token expired"}), 401
        return f(*args, **kwargs)
    return decorated_function


@app.route("/api/auth/login", methods=["POST"])
def api_login():
    data = request.get_json() or {}
    email = (data.get("email") or "").strip()
    password = data.get("password") or ""
    if not email or not password:
        return jsonify({"error": "Vul e-mail en wachtwoord in."}), 400
    try:
        response = database.sign_in(email, password)
        session["access_token"] = response.session.access_token
        session["refresh_token"] = response.session.refresh_token
        session["user_email"] = response.user.email
        return jsonify({"email": response.user.email})
    except Exception:
        return jsonify({"error": "Inloggen mislukt. Controleer je gegevens."}), 401


@app.route("/api/auth/logout", methods=["POST"])
def api_logout():
    session.clear()
    return jsonify({"ok": True})


@app.route("/api/auth/me")
def api_me():
    access_token = session.get("access_token")
    if not access_token:
        return jsonify({"error": "Not authenticated"}), 401
    try:
        database.get_user_from_token(access_token)
        return jsonify({"email": session.get("user_email")})
    except Exception:
        session.clear()
        return jsonify({"error": "Token expired"}), 401


@app.route("/api/retailers")
@api_login_required
def api_retailers():
    stats = database.get_retailer_stats()
    result = []
    for slug, info in RETAILERS.items():
        stat = stats.get(slug, {})
        last_snap = stat.get("last_snapshot")
        result.append({
            "id": slug,
            "name": info["name"],
            "color": info["color"],
            "active": info["active"],
            "description": info.get("description", ""),
            "icon": info.get("icon") or None,
            "productCount": last_snap["product_count"] if last_snap else None,
            "lastUpdate": last_snap["created_at"] if last_snap else None,
            "snapshotCount": stat.get("snapshot_count", 0),
        })
    return jsonify(result)


@app.route("/api/retailers/refresh-all", methods=["POST"])
@api_login_required
def api_refresh_all():
    """Handmatig snapshots maken voor alle actieve retailers."""
    results = {}
    for slug, info in RETAILERS.items():
        if not info["active"]:
            continue
        try:
            fetcher = get_fetcher(slug)
            products = fetcher.fetch_all_products()
            snapshot_id = database.create_snapshot(products, retailer=slug)
            results[slug] = {"ok": True, "product_count": len(products), "snapshot_id": snapshot_id}
        except Exception as e:
            results[slug] = {"ok": False, "error": str(e)}
    return jsonify({"results": results})


@app.route("/api/retailers/<slug>/products")
@api_login_required
def api_retailer_products(slug):
    if slug not in RETAILERS:
        return jsonify({"error": "Retailer niet gevonden"}), 404
    products = database.get_catalog_products(slug)
    return jsonify(products)


@app.route("/api/retailers/<slug>/snapshot", methods=["POST"])
@api_login_required
def api_snapshot_new(slug):
    if slug not in RETAILERS:
        return jsonify({"error": "Retailer niet gevonden"}), 404
    info = RETAILERS[slug]
    if not info["active"]:
        return jsonify({"error": f"{info['name']} is nog niet beschikbaar."}), 400
    try:
        fetcher = get_fetcher(slug)
        products = fetcher.fetch_all_products()
        snapshot_id = database.create_snapshot(products, retailer=slug)
        return jsonify({"snapshot_id": snapshot_id, "product_count": len(products)})
    except NotImplementedError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": f"Fout bij ophalen: {e}"}), 500


@app.route("/api/cron/snapshots")
def cron_snapshots():
    """Vercel cron: dagelijkse snapshot voor alle actieve retailers. Beveiligd met CRON_SECRET."""
    auth = request.headers.get("Authorization", "")
    expected = os.environ.get("CRON_SECRET", "")
    if not expected or auth != f"Bearer {expected}":
        return jsonify({"error": "Unauthorized"}), 401

    results = {}
    for slug, info in RETAILERS.items():
        if not info["active"]:
            continue
        try:
            fetcher = get_fetcher(slug)
            products = fetcher.fetch_all_products()
            snapshot_id = database.create_snapshot(products, retailer=slug)
            results[slug] = {"ok": True, "product_count": len(products), "snapshot_id": snapshot_id}
        except Exception as e:
            results[slug] = {"ok": False, "error": str(e)}

    return jsonify({"results": results})


@app.route("/api/snapshots")
@api_login_required
def api_snapshots():
    retailer_filter = request.args.get("retailer", "")
    all_snapshots = database.get_snapshots(retailer=retailer_filter or None)
    return jsonify(all_snapshots)


@app.route("/api/snapshots/compare")
@api_login_required
def api_compare_snapshots():
    old_id = request.args.get("old")
    new_id = request.args.get("new")
    if not old_id or not new_id:
        return jsonify({"error": "Geef 'old' en 'new' snapshot IDs mee."}), 400
    try:
        changes = database.compare_snapshots(old_id, new_id)
        return jsonify(changes)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/timeline")
@api_login_required
def api_timeline():
    retailer_filter = request.args.get("retailer", "")
    type_filter = request.args.get("type", "")
    events = database.get_timeline_events(
        limit=100,
        retailer=retailer_filter or None,
        event_type=type_filter or None,
    )
    return jsonify(events)


@app.route("/api/products/by-ref")
@api_login_required
def api_product_by_ref():
    retailer = request.args.get("retailer", "").strip()
    webshop_id = request.args.get("webshop_id", "").strip()
    if not retailer or not webshop_id:
        return jsonify({"error": "Geef retailer en webshop_id mee."}), 400
    if retailer not in RETAILERS:
        return jsonify({"error": "Retailer niet gevonden"}), 404
    product = database.get_product_by_webshop_id(retailer, webshop_id)
    if not product:
        product = database.ensure_catalog_entry(retailer, webshop_id)
    if not product:
        return jsonify({"error": "Product niet gevonden"}), 404
    return jsonify(product)


@app.route("/api/products/<product_id>")
@api_login_required
def api_product(product_id):
    product = database.get_product(product_id)
    if not product:
        return jsonify({"error": "Product niet gevonden"}), 404
    return jsonify(product)


@app.route("/api/products/<product_id>/history")
@api_login_required
def api_product_history(product_id):
    limit = request.args.get("limit", 50, type=int)
    limit = min(max(limit, 1), 200)
    product = database.get_product(product_id)
    if not product:
        return jsonify({"error": "Product niet gevonden"}), 404
    history = database.get_product_history(product_id, limit=limit)
    return jsonify(history)


@app.errorhandler(404)
def fallback_to_frontend(e):
    """Serve the React frontend for any route not matched by Flask (client-side routing)."""
    index = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.isfile(index):
        return send_from_directory(FRONTEND_DIR, "index.html")
    return "Frontend niet gebuild. Draai 'npm run build' in frontend/.", 404


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    print(f"\n  Broodradar draait op http://localhost:{port}\n")
    app.run(debug=True, port=port)
