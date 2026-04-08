CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_requester uuid := auth.uid();
  v_requester_role text;
  v_target_role text;
BEGIN
  IF v_requester IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT role INTO v_requester_role
  FROM public.profiles
  WHERE id = v_requester;

  IF v_requester <> _user_id AND v_requester_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT role INTO v_target_role
  FROM public.profiles
  WHERE id = _user_id;

  RETURN v_target_role;
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_role(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_role(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO service_role;

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (
  id = auth.uid()
  AND role = public.get_user_role(auth.uid())
);

ALTER VIEW public.inventory_current SET (security_invoker = true);
ALTER VIEW public.inventory_current_per_location SET (security_invoker = true);

CREATE OR REPLACE FUNCTION public.create_primka(
  p_stock_location_id uuid,
  p_date date DEFAULT CURRENT_DATE,
  p_supplier text DEFAULT NULL::text,
  p_note text DEFAULT NULL::text,
  p_items jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_year int := extract(year from now());
  v_count int;
  v_doc_number text;
  v_doc_id uuid;
  v_item jsonb;
  v_item_id uuid;
  v_user_id uuid := auth.uid();
  v_user_role text;
begin
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_user_role := public.get_user_role(v_user_id);
  IF v_user_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only admins can create primka';
  END IF;

  select count(*) into v_count
  from documents
  where type = 'primka'
    and extract(year from date) = v_year;

  v_doc_number := 'PRM-' || v_year || '-' || lpad((v_count + 1)::text, 4, '0');

  while exists (select 1 from documents where doc_number = v_doc_number) loop
    v_count := v_count + 1;
    v_doc_number := 'PRM-' || v_year || '-' || lpad((v_count + 1)::text, 4, '0');
  end loop;

  insert into documents (type, status, doc_number, stock_location_id, recipient_name, note, date, created_by_user_id)
  values ('primka', 'posted', v_doc_number, p_stock_location_id, p_supplier, p_note, p_date, v_user_id)
  returning id into v_doc_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
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
$function$;

CREATE OR REPLACE FUNCTION public.create_otpremnica(
  p_stock_location_id uuid,
  p_date date DEFAULT CURRENT_DATE,
  p_project_id uuid DEFAULT NULL::uuid,
  p_recipient_name text DEFAULT NULL::text,
  p_recipient_address text DEFAULT NULL::text,
  p_issued_by text DEFAULT NULL::text,
  p_received_by text DEFAULT NULL::text,
  p_note text DEFAULT NULL::text,
  p_items jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  v_user_role text;
begin
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_user_role := public.get_user_role(v_user_id);
  IF v_user_role NOT IN ('admin', 'monter') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
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

  select count(*) into v_count
  from documents
  where type = 'otpremnica'
    and extract(year from date) = v_year;

  v_doc_number := 'OTP-' || v_year || '-' || lpad((v_count + 1)::text, 4, '0');

  while exists (select 1 from documents where doc_number = v_doc_number) loop
    v_count := v_count + 1;
    v_doc_number := 'OTP-' || v_year || '-' || lpad((v_count + 1)::text, 4, '0');
  end loop;

  insert into documents (type, status, doc_number, stock_location_id, project_id,
    recipient_name, recipient_address, issued_by, received_by, note, date, created_by_user_id)
  values ('otpremnica', 'posted', v_doc_number, p_stock_location_id, p_project_id,
    p_recipient_name, p_recipient_address, p_issued_by, p_received_by, p_note, p_date, v_user_id)
  returning id into v_doc_id;

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
$function$;

CREATE OR REPLACE FUNCTION public.create_povratnica(
  p_stock_location_id uuid,
  p_project_id uuid,
  p_date date DEFAULT CURRENT_DATE,
  p_returned_by text DEFAULT NULL::text,
  p_received_by text DEFAULT NULL::text,
  p_note text DEFAULT NULL::text,
  p_items jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_year int := extract(year from now());
  v_count int;
  v_doc_number text;
  v_doc_id uuid;
  v_item jsonb;
  v_item_id uuid;
  v_user_id uuid := auth.uid();
  v_user_role text;
begin
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_user_role := public.get_user_role(v_user_id);
  IF v_user_role NOT IN ('admin', 'monter') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  select count(*) into v_count
  from documents
  where type = 'povratnica'
    and extract(year from date) = v_year;

  v_doc_number := 'POV-' || v_year || '-' || lpad((v_count + 1)::text, 4, '0');

  while exists (select 1 from documents where doc_number = v_doc_number) loop
    v_count := v_count + 1;
    v_doc_number := 'POV-' || v_year || '-' || lpad((v_count + 1)::text, 4, '0');
  end loop;

  insert into documents (type, status, doc_number, stock_location_id, project_id,
    issued_by, received_by, note, date, created_by_user_id)
  values ('povratnica', 'posted', v_doc_number, p_stock_location_id, p_project_id,
    p_returned_by, p_received_by, p_note, p_date, v_user_id)
  returning id into v_doc_id;

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
      'return',
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
    'returned_by', p_returned_by,
    'received_by', p_received_by
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.create_primka(uuid, date, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_primka(uuid, date, text, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_primka(uuid, date, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_primka(uuid, date, text, text, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.create_otpremnica(uuid, date, uuid, text, text, text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_otpremnica(uuid, date, uuid, text, text, text, text, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_otpremnica(uuid, date, uuid, text, text, text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_otpremnica(uuid, date, uuid, text, text, text, text, text, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.create_povratnica(uuid, uuid, date, text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_povratnica(uuid, uuid, date, text, text, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_povratnica(uuid, uuid, date, text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_povratnica(uuid, uuid, date, text, text, text, jsonb) TO service_role;