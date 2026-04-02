
create or replace function public.create_otpremnica(
  p_stock_location_id uuid,
  p_date date default current_date,
  p_project_id uuid default null,
  p_recipient_name text default null,
  p_recipient_address text default null,
  p_issued_by text default null,
  p_received_by text default null,
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
  v_available numeric;
  v_article_code text;
begin
  -- Validate stock for each item
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    -- Calculate available stock at this location
    select coalesce(sum(case
      when t.type in ('opening_balance','adjustment_in','in','return') then t.quantity
      when t.type in ('adjustment_out','out') then -t.quantity
    end), 0)
    into v_available
    from inventory_transactions t
    where t.article_id = (v_item->>'article_id')::uuid
      and t.stock_location_id = p_stock_location_id;

    if v_available < (v_item->>'quantity')::numeric then
      select code into v_article_code from articles where id = (v_item->>'article_id')::uuid;
      raise exception 'Nedovoljno na zalihi za artikl %: dostupno %, traženo %',
        v_article_code, v_available, (v_item->>'quantity')::numeric;
    end if;
  end loop;

  -- Generate doc number safely
  select count(*) into v_count
  from documents
  where type = 'otpremnica'
    and extract(year from date) = v_year;

  v_doc_number := 'OTP-' || v_year || '-' || lpad((v_count + 1)::text, 4, '0');

  while exists (select 1 from documents where doc_number = v_doc_number) loop
    v_count := v_count + 1;
    v_doc_number := 'OTP-' || v_year || '-' || lpad((v_count + 1)::text, 4, '0');
  end loop;

  -- Create document
  insert into documents (type, status, doc_number, stock_location_id, project_id,
    recipient_name, recipient_address, issued_by, received_by, note, date, created_by_user_id)
  values ('otpremnica', 'posted', v_doc_number, p_stock_location_id, p_project_id,
    p_recipient_name, p_recipient_address, p_issued_by, p_received_by, p_note, p_date, v_user_id)
  returning id into v_doc_id;

  -- Process items
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into document_items (document_id, article_id, quantity, unit, note)
    values (
      v_doc_id,
      (v_item->>'article_id')::uuid,
      (v_item->>'quantity')::numeric,
      coalesce(v_item->>'unit', 'kom'),
      v_item->>'note'
    )
    returning id into v_item_id;

    insert into inventory_transactions (article_id, type, quantity, stock_location_id,
      document_id, document_item_id, project_id, created_by_user_id)
    values (
      (v_item->>'article_id')::uuid,
      'out',
      (v_item->>'quantity')::numeric,
      p_stock_location_id,
      v_doc_id,
      v_item_id,
      p_project_id,
      v_user_id
    );
  end loop;

  return jsonb_build_object(
    'id', v_doc_id,
    'doc_number', v_doc_number,
    'date', p_date,
    'recipient_name', p_recipient_name,
    'recipient_address', p_recipient_address,
    'issued_by', p_issued_by,
    'received_by', p_received_by
  );
end;
$$;
