import os
from functools import wraps
from dotenv import load_dotenv
load_dotenv()

from flask import Flask, render_template, redirect, url_for, flash, request, abort, session
import database
from retailers import RETAILERS, get_fetcher

app = Flask(__name__)
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


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    print(f"\n  Broodradar draait op http://localhost:{port}\n")
    app.run(debug=True, port=port)
