
create or replace function public.create_primka(
  p_stock_location_id uuid,
  p_date date default current_date,
  p_supplier text default null,
  p_note text default null,
  p_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year int := extract(year from now());
  v_count int;
  v_doc_number text;
  v_doc_id uuid;
  v_item jsonb;
  v_item_id uuid;
  v_user_id uuid := auth.uid();
  v_current_qty numeric;
  v_current_avg numeric;
  v_article_id uuid;
  v_new_qty numeric;
  v_unit_price numeric;
begin
  -- Generate doc number safely
  select count(*) into v_count
  from documents
  where type = 'primka'
    and extract(year from date) = v_year;

  v_doc_number := 'PRM-' || v_year || '-' || lpad((v_count + 1)::text, 4, '0');

  -- Ensure uniqueness
  while exists (select 1 from documents where doc_number = v_doc_number) loop
    v_count := v_count + 1;
    v_doc_number := 'PRM-' || v_year || '-' || lpad((v_count + 1)::text, 4, '0');
  end loop;

  -- Create document
  insert into documents (type, status, doc_number, stock_location_id, recipient_name, note, date, created_by_user_id)
  values ('primka', 'posted', v_doc_number, p_stock_location_id, p_supplier, p_note, p_date, v_user_id)
  returning id into v_doc_id;

  -- Process items
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    -- Insert document item
    insert into document_items (document_id, article_id, quantity, unit, unit_price, note)
    values (
      v_doc_id,
      (v_item->>'article_id')::uuid,
      (v_item->>'quantity')::numeric,
      coalesce(v_item->>'unit', 'kom'),
      (v_item->>'unit_price')::numeric,
      v_item->>'note'
    )
    returning id into v_item_id;

    v_article_id := (v_item->>'article_id')::uuid;
    v_new_qty := (v_item->>'quantity')::numeric;
    v_unit_price := (v_item->>'unit_price')::numeric;

    if (v_item->>'unit_price') is not null then
      select coalesce(sum(case
        when t.type in ('opening_balance','adjustment_in','in','return') then t.quantity
        when t.type in ('adjustment_out','out') then -t.quantity
      end), 0)
      into v_current_qty
      from inventory_transactions t
      where t.article_id = v_article_id;

      select average_cost
      into v_current_avg
      from articles
      where id = v_article_id;
    end if;

    -- Create inventory transaction
    insert into inventory_transactions (article_id, type, quantity, stock_location_id, document_id, document_item_id, created_by_user_id)
    values (
      v_article_id,
      'in',
      v_new_qty,
      p_stock_location_id,
      v_doc_id,
      v_item_id,
      v_user_id
    );

    -- Update average cost and purchase price
    if (v_item->>'unit_price') is not null then
      update articles
      set
        average_cost = case
          when v_current_qty + v_new_qty = 0 then 0
          else (v_current_qty * coalesce(v_current_avg, 0) + v_new_qty * v_unit_price) / (v_current_qty + v_new_qty)
        end,
        purchase_price = v_unit_price
      where id = v_article_id;
    end if;
  end loop;

  return jsonb_build_object('id', v_doc_id, 'doc_number', v_doc_number);
end;
$$;
