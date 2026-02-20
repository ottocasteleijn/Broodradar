-- Product catalog and history tables for per-product records and change log
-- Run in Supabase Dashboard → SQL Editor or via apply_migration

-- Tabel: product_catalog (een rij per uniek product)
create table if not exists product_catalog (
  id uuid primary key default gen_random_uuid(),
  retailer text not null,
  webshop_id text not null,
  title text,
  brand text,
  price numeric,
  sales_unit_size text,
  unit_price_description text,
  nutriscore text,
  main_category text,
  sub_category text,
  image_url text,
  is_bonus boolean default false,
  is_available boolean default true,
  first_seen_at timestamptz default now(),
  last_seen_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(retailer, webshop_id)
);

-- Tabel: product_history (een rij per product per snapshot)
create table if not exists product_history (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references product_catalog(id) on delete cascade,
  snapshot_id uuid not null references snapshots(id) on delete cascade,
  event_type text not null,
  changes jsonb default '{}'::jsonb,
  price_at_snapshot numeric,
  created_at timestamptz default now()
);

-- Indexes
create index if not exists product_catalog_retailer_webshop_idx on product_catalog(retailer, webshop_id);
create index if not exists product_history_product_id_idx on product_history(product_id);
create index if not exists product_history_product_created_idx on product_history(product_id, created_at desc);
create index if not exists product_history_snapshot_id_idx on product_history(snapshot_id);

-- RLS
alter table product_catalog enable row level security;
alter table product_history enable row level security;

drop policy if exists "Allow all for anon" on product_catalog;
drop policy if exists "Allow all for anon" on product_history;
create policy "Allow all for anon" on product_catalog for all using (true) with check (true);
create policy "Allow all for anon" on product_history for all using (true) with check (true);
