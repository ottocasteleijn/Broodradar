-- Broodradar: Migratie voor multi-retailer support
-- Run dit in Supabase SQL Editor als je AL een bestaande database hebt

-- Retailer kolom toevoegen aan snapshots
alter table snapshots add column if not exists retailer text not null default 'ah';
create index if not exists snapshots_retailer_idx on snapshots(retailer);

-- Retailer kolom toevoegen aan products
alter table products add column if not exists retailer text not null default 'ah';
create index if not exists products_retailer_idx on products(retailer);

-- Timeline events tabel
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

create index if not exists timeline_events_created_idx on timeline_events(created_at desc);
create index if not exists timeline_events_retailer_idx on timeline_events(retailer);

-- RLS voor timeline_events
alter table timeline_events enable row level security;
drop policy if exists "Allow all for anon" on timeline_events;
create policy "Allow all for anon" on timeline_events for all using (true) with check (true);
