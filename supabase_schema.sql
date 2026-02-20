-- Broodradar: Volledig schema (fresh install)
-- Run dit in: Supabase Dashboard → SQL Editor → New query

-- Tabel: snapshots
create table if not exists snapshots (
  id uuid primary key default gen_random_uuid(),
  retailer text not null default 'ah',
  product_count integer not null default 0,
  label text,
  created_at timestamptz default now()
);

-- Tabel: products
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references snapshots(id) on delete cascade,
  retailer text not null default 'ah',
  webshop_id text,
  hq_id text,
  title text,
  brand text,
  sales_unit_size text,
  price numeric,
  unit_price_description text,
  main_category text,
  sub_category text,
  nutriscore text,
  is_bonus boolean default false,
  is_stapel_bonus boolean default false,
  discount_labels jsonb default '[]'::jsonb,
  description_highlights text,
  property_icons jsonb default '[]'::jsonb,
  image_url text,
  available_online boolean default true,
  order_availability_status text,
  raw_json jsonb
);

-- Tabel: timeline_events
create table if not exists timeline_events (
  id uuid primary key default gen_random_uuid(),
  retailer text not null,
  event_type text not null,
  snapshot_id uuid references snapshots(id) on delete cascade,
  product_title text,
  product_image_url text,
  details jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

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
create index if not exists snapshots_retailer_idx on snapshots(retailer);
create index if not exists products_snapshot_id_idx on products(snapshot_id);
create index if not exists products_webshop_id_idx on products(webshop_id);
create index if not exists products_retailer_idx on products(retailer);
create index if not exists timeline_events_created_idx on timeline_events(created_at desc);
create index if not exists timeline_events_retailer_idx on timeline_events(retailer);
create index if not exists product_catalog_retailer_webshop_idx on product_catalog(retailer, webshop_id);
create index if not exists product_history_product_id_idx on product_history(product_id);
create index if not exists product_history_product_created_idx on product_history(product_id, created_at desc);
create index if not exists product_history_snapshot_id_idx on product_history(snapshot_id);

-- RLS policies
alter table snapshots enable row level security;
alter table products enable row level security;
alter table timeline_events enable row level security;
alter table product_catalog enable row level security;
alter table product_history enable row level security;

drop policy if exists "Allow all for anon" on snapshots;
drop policy if exists "Allow all for anon" on products;
drop policy if exists "Allow all for anon" on timeline_events;
drop policy if exists "Allow all for anon" on product_catalog;
drop policy if exists "Allow all for anon" on product_history;
create policy "Allow all for anon" on snapshots for all using (true) with check (true);
create policy "Allow all for anon" on products for all using (true) with check (true);
create policy "Allow all for anon" on timeline_events for all using (true) with check (true);
create policy "Allow all for anon" on product_catalog for all using (true) with check (true);
create policy "Allow all for anon" on product_history for all using (true) with check (true);
