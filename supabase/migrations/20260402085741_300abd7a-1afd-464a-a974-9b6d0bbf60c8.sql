
-- 1. articles
create table public.articles (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  unit text not null default 'kom',
  category text,
  purchase_price numeric default 0,
  min_quantity numeric default 0,
  created_at timestamptz default now()
);
alter table public.articles enable row level security;
create policy "Authenticated users can read articles" on public.articles for select to authenticated using (true);
create policy "Authenticated users can insert articles" on public.articles for insert to authenticated with check (true);
create policy "Authenticated users can update articles" on public.articles for update to authenticated using (true);
create policy "Authenticated users can delete articles" on public.articles for delete to authenticated using (true);

-- 2. stock_locations
create table public.stock_locations (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  description text,
  created_at timestamptz default now()
);
alter table public.stock_locations enable row level security;
create policy "Authenticated users can read stock_locations" on public.stock_locations for select to authenticated using (true);
create policy "Authenticated users can insert stock_locations" on public.stock_locations for insert to authenticated with check (true);
create policy "Authenticated users can update stock_locations" on public.stock_locations for update to authenticated using (true);
create policy "Authenticated users can delete stock_locations" on public.stock_locations for delete to authenticated using (true);

insert into public.stock_locations (code, name) values ('A','Lokacija A'),('B','Lokacija B'),('C','Lokacija C');

-- 3. projects
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  site_address text,
  note text,
  status text default 'active',
  created_at timestamptz default now()
);
alter table public.projects enable row level security;
create policy "Authenticated users can read projects" on public.projects for select to authenticated using (true);
create policy "Authenticated users can insert projects" on public.projects for insert to authenticated with check (true);
create policy "Authenticated users can update projects" on public.projects for update to authenticated using (true);
create policy "Authenticated users can delete projects" on public.projects for delete to authenticated using (true);

-- 4. documents
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  status text not null default 'posted',
  doc_number text unique not null,
  project_id uuid references public.projects(id),
  stock_location_id uuid references public.stock_locations(id) not null,
  recipient_name text,
  recipient_address text,
  issued_by text,
  received_by text,
  note text,
  date date not null default current_date,
  created_by_user_id uuid references auth.users(id),
  created_at timestamptz default now(),
  cancelled_at timestamptz,
  cancellation_reason text
);
alter table public.documents enable row level security;
create policy "Authenticated users can read documents" on public.documents for select to authenticated using (true);
create policy "Authenticated users can insert documents" on public.documents for insert to authenticated with check (true);
create policy "Authenticated users can update documents" on public.documents for update to authenticated using (true);
create policy "Authenticated users can delete documents" on public.documents for delete to authenticated using (true);

-- 5. document_items
create table public.document_items (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references public.documents(id) not null,
  article_id uuid references public.articles(id) not null,
  quantity numeric not null,
  unit text not null,
  unit_price numeric,
  note text,
  created_at timestamptz default now()
);
alter table public.document_items enable row level security;
create policy "Authenticated users can read document_items" on public.document_items for select to authenticated using (true);
create policy "Authenticated users can insert document_items" on public.document_items for insert to authenticated with check (true);
create policy "Authenticated users can update document_items" on public.document_items for update to authenticated using (true);
create policy "Authenticated users can delete document_items" on public.document_items for delete to authenticated using (true);

-- 6. inventory_transactions
create table public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  article_id uuid references public.articles(id) not null,
  type text not null,
  quantity numeric not null,
  stock_location_id uuid references public.stock_locations(id) not null,
  document_id uuid references public.documents(id),
  document_item_id uuid references public.document_items(id),
  project_id uuid references public.projects(id),
  note text,
  created_by_user_id uuid references auth.users(id),
  created_at timestamptz default now()
);
alter table public.inventory_transactions enable row level security;
create policy "Authenticated users can read inventory_transactions" on public.inventory_transactions for select to authenticated using (true);
create policy "Authenticated users can insert inventory_transactions" on public.inventory_transactions for insert to authenticated with check (true);
create policy "Authenticated users can update inventory_transactions" on public.inventory_transactions for update to authenticated using (true);
create policy "Authenticated users can delete inventory_transactions" on public.inventory_transactions for delete to authenticated using (true);

-- 7. settings
create table public.settings (
  id boolean primary key default true,
  company_name text default 'COREX ING d.o.o.',
  company_oib text default '17193431064',
  company_address text default 'Međimurska ulica 23',
  company_city text default '42000 Varaždin',
  company_phone text,
  company_email text,
  constraint one_row check (id = true)
);
alter table public.settings enable row level security;
create policy "Authenticated users can read settings" on public.settings for select to authenticated using (true);
create policy "Authenticated users can update settings" on public.settings for update to authenticated using (true);

insert into public.settings (id) values (true);

-- 8. VIEW: current inventory
create view public.inventory_current as
select
  a.id, a.code, a.name, a.unit, a.category, a.purchase_price, a.min_quantity,
  coalesce(sum(case
    when t.type in ('opening_balance','adjustment_in','in','return') then t.quantity
    when t.type in ('adjustment_out','out') then -t.quantity
  end), 0) as current_qty,
  coalesce(sum(case
    when t.type in ('opening_balance','adjustment_in','in','return') then t.quantity
    when t.type in ('adjustment_out','out') then -t.quantity
  end), 0) * a.purchase_price as current_value
from public.articles a
left join public.inventory_transactions t on a.id = t.article_id
group by a.id;

-- 9. VIEW: inventory per location
create view public.inventory_current_per_location as
select
  a.id as article_id, a.code, a.name, a.unit, a.purchase_price,
  sl.id as stock_location_id, sl.code as location_code,
  coalesce(sum(case
    when t.type in ('opening_balance','adjustment_in','in','return') then t.quantity
    when t.type in ('adjustment_out','out') then -t.quantity
  end), 0) as current_qty
from public.articles a
cross join public.stock_locations sl
left join public.inventory_transactions t on a.id = t.article_id and t.stock_location_id = sl.id
group by a.id, sl.id;
