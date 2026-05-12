
-- Add invoice tracking fields to documents table
alter table public.documents
  add column if not exists racun_broj text,
  add column if not exists racun_datum date;
