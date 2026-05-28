
-- Add per-item invoice tracking fields to document_items
alter table public.document_items
  add column if not exists fakturirana_kolicina numeric default 0,
  add column if not exists racun_broj text,
  add column if not exists racun_datum date;
