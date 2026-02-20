-- Add ingredients column to products and product_catalog
alter table products add column if not exists ingredients text;
alter table product_catalog add column if not exists ingredients text;
