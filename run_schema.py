#!/usr/bin/env python3
"""
Voert het Supabase schema uit.

Gebruik:
  1. Via database-wachtwoord (directe Postgres):
     Zet SUPABASE_DB_PASSWORD in .env en run: python3 run_schema.py

  2. Handmatig:
     Kopieer supabase_schema.sql (of migrate_multi_retailer.sql) en
     plak in Supabase Dashboard → SQL Editor → Run
"""
import os
import sys
from pathlib import Path
from urllib.parse import quote_plus

env_path = Path(__file__).parent / ".env"
if env_path.exists():
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

url = os.environ.get("SUPABASE_URL", "").replace("https://", "").replace(".supabase.co", "")
if not url:
    sys.exit("SUPABASE_URL ontbreekt in .env")

password = os.environ.get("SUPABASE_DB_PASSWORD", "")
if not password:
    print("=" * 60)
    print("SUPABASE_DB_PASSWORD is niet ingesteld in .env")
    print()
    print("Optie A: Stel het database-wachtwoord in:")
    print("  1. Ga naar: https://supabase.com/dashboard/project/" + url + "/settings/database")
    print("  2. Kopieer of reset het database-wachtwoord")
    print("  3. Zet het in .env: SUPABASE_DB_PASSWORD=<wachtwoord>")
    print()
    print("Optie B: Voer de SQL handmatig uit:")
    print("  1. Ga naar: https://supabase.com/dashboard/project/" + url + "/sql/new")
    print("  2. Plak de inhoud van supabase_schema.sql of migrate_multi_retailer.sql")
    print("  3. Klik op Run")
    print("=" * 60)
    sys.exit(1)

sql_file = sys.argv[1] if len(sys.argv) > 1 else "supabase_schema.sql"
schema_sql = os.path.join(os.path.dirname(__file__), sql_file)

if __name__ == "__main__":
    import psycopg2

    with open(schema_sql, "r") as f:
        sql = f.read()

    POOLER_REGIONS = ["eu-central-1", "us-east-1", "ap-southeast-1"]
    base = f"postgresql://postgres.{url}:{quote_plus(password)}"

    print("Verbinding maken met Supabase...")
    conn = None
    for region in POOLER_REGIONS:
        try:
            cs = f"{base}@aws-0-{region}.pooler.supabase.com:6543/postgres"
            conn = psycopg2.connect(cs)
            print(f"  Verbonden via {region}")
            break
        except Exception as e:
            print(f"  {region}: {e}")

    if not conn:
        try:
            cs = f"postgresql://postgres:{quote_plus(password)}@db.{url}.supabase.co:5432/postgres"
            conn = psycopg2.connect(cs)
            print("  Verbonden via direct connection")
        except Exception as e:
            print(f"  Direct: {e}")

    if not conn:
        sys.exit("Kon niet verbinden. Controleer SUPABASE_DB_PASSWORD.")

    conn.autocommit = True
    cur = conn.cursor()
    print(f"Schema uitvoeren ({sql_file})...")
    cur.execute(sql)
    print("Schema succesvol uitgevoerd!")
    cur.close()
    conn.close()
