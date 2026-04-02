
drop view if exists public.inventory_current;
drop view if exists public.inventory_current_per_location;

create view public.inventory_current with (security_invoker = on) as
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

create view public.inventory_current_per_location with (security_invoker = on) as
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
