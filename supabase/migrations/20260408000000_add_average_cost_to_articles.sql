-- Add average_cost to articles for AVCO inventory valuation
alter table public.articles
  add column if not exists average_cost numeric default 0;

create or replace view public.inventory_current as
select
  a.id, a.code, a.name, a.unit, a.category, a.purchase_price, a.average_cost, a.min_quantity,
  coalesce(sum(case
    when t.type in ('opening_balance','adjustment_in','in','return') then t.quantity
    when t.type in ('adjustment_out','out') then -t.quantity
  end), 0) as current_qty,
  coalesce(sum(case
    when t.type in ('opening_balance','adjustment_in','in','return') then t.quantity
    when t.type in ('adjustment_out','out') then -t.quantity
  end), 0) * coalesce(a.average_cost, 0) as current_value
from public.articles a
left join public.inventory_transactions t on a.id = t.article_id
group by a.id;

create or replace view public.inventory_current_per_location as
select
  a.id as article_id, a.code, a.name, a.unit, a.purchase_price, a.average_cost,
  sl.id as stock_location_id, sl.code as location_code,
  coalesce(sum(case
    when t.type in ('opening_balance','adjustment_in','in','return') then t.quantity
    when t.type in ('adjustment_out','out') then -t.quantity
  end), 0) as current_qty
from public.articles a
cross join public.stock_locations sl
left join public.inventory_transactions t on a.id = t.article_id and t.stock_location_id = sl.id
group by a.id, sl.id;