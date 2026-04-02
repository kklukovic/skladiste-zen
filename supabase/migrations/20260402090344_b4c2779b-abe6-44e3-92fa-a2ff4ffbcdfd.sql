
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

    -- Create inventory transaction
    insert into inventory_transactions (article_id, type, quantity, stock_location_id, document_id, document_item_id, created_by_user_id)
    values (
      (v_item->>'article_id')::uuid,
      'in',
      (v_item->>'quantity')::numeric,
      p_stock_location_id,
      v_doc_id,
      v_item_id,
      v_user_id
    );

    -- Update purchase price if changed
    if (v_item->>'unit_price') is not null then
      update articles
      set purchase_price = (v_item->>'unit_price')::numeric
      where id = (v_item->>'article_id')::uuid
        and purchase_price is distinct from (v_item->>'unit_price')::numeric;
    end if;
  end loop;

  return jsonb_build_object('id', v_doc_id, 'doc_number', v_doc_number);
end;
$$;
