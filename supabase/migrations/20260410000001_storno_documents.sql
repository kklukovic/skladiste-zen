-- Add storno_of_document_id column to track which document a storno reverses
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS storno_of_document_id uuid REFERENCES public.documents(id);

-- Update inventory_current view to count storno transaction types
CREATE OR REPLACE VIEW public.inventory_current AS
SELECT
  a.id, a.code, a.name, a.unit, a.category, a.purchase_price, a.average_cost, a.min_quantity,
  COALESCE(SUM(CASE
    WHEN t.type IN ('opening_balance','adjustment_in','in','return','storno_otpremnice') THEN t.quantity
    WHEN t.type IN ('adjustment_out','out','storno_primka') THEN -t.quantity
  END), 0) AS current_qty,
  COALESCE(SUM(CASE
    WHEN t.type IN ('opening_balance','adjustment_in','in','return','storno_otpremnice') THEN t.quantity
    WHEN t.type IN ('adjustment_out','out','storno_primka') THEN -t.quantity
  END), 0) * COALESCE(a.average_cost, 0) AS current_value
FROM public.articles a
LEFT JOIN public.inventory_transactions t ON a.id = t.article_id
GROUP BY a.id;

ALTER VIEW public.inventory_current SET (security_invoker = true);

-- Update inventory_current_per_location view similarly
CREATE OR REPLACE VIEW public.inventory_current_per_location AS
SELECT
  a.id AS article_id, a.code, a.name, a.unit, a.purchase_price, a.average_cost,
  sl.id AS stock_location_id, sl.code AS location_code,
  COALESCE(SUM(CASE
    WHEN t.type IN ('opening_balance','adjustment_in','in','return','storno_otpremnice') THEN t.quantity
    WHEN t.type IN ('adjustment_out','out','storno_primka') THEN -t.quantity
  END), 0) AS current_qty
FROM public.articles a
CROSS JOIN public.stock_locations sl
LEFT JOIN public.inventory_transactions t ON a.id = t.article_id AND t.stock_location_id = sl.id
GROUP BY a.id, sl.id;

ALTER VIEW public.inventory_current_per_location SET (security_invoker = true);

-- ============================================================
-- RPC: storno_otpremnice
-- Reverses an otpremnica by returning all items back to stock
-- ============================================================
CREATE OR REPLACE FUNCTION public.storno_otpremnice(p_document_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_role text;
  v_orig_doc documents%ROWTYPE;
  v_year int := EXTRACT(year FROM now());
  v_count int;
  v_doc_number text;
  v_storno_doc_id uuid;
  v_item document_items%ROWTYPE;
  v_item_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_user_role := public.get_user_role(v_user_id);
  IF v_user_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only admins can perform storno';
  END IF;

  -- Load and validate original document
  SELECT * INTO v_orig_doc FROM documents WHERE id = p_document_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document not found';
  END IF;
  IF v_orig_doc.type NOT IN ('otpremnica') THEN
    RAISE EXCEPTION 'Document is not an otpremnica';
  END IF;
  IF v_orig_doc.status = 'stornoed' THEN
    RAISE EXCEPTION 'Document has already been stornoed';
  END IF;
  IF EXISTS (SELECT 1 FROM documents WHERE storno_of_document_id = p_document_id) THEN
    RAISE EXCEPTION 'Document has already been stornoed';
  END IF;

  -- Generate unique storno doc number
  SELECT COUNT(*) INTO v_count FROM documents
  WHERE type = 'storno_otpremnice' AND EXTRACT(year FROM date) = v_year;
  v_doc_number := 'S-OTP-' || v_year || '-' || lpad((v_count + 1)::text, 4, '0');
  WHILE EXISTS (SELECT 1 FROM documents WHERE doc_number = v_doc_number) LOOP
    v_count := v_count + 1;
    v_doc_number := 'S-OTP-' || v_year || '-' || lpad((v_count + 1)::text, 4, '0');
  END LOOP;

  -- Create storno document
  INSERT INTO documents (
    type, status, doc_number, stock_location_id, project_id,
    issued_by, received_by, note, date, created_by_user_id, storno_of_document_id
  ) VALUES (
    'storno_otpremnice', 'posted', v_doc_number,
    v_orig_doc.stock_location_id, v_orig_doc.project_id,
    v_orig_doc.issued_by, v_orig_doc.received_by,
    'Storno otpremnice ' || v_orig_doc.doc_number,
    CURRENT_DATE, v_user_id, p_document_id
  ) RETURNING id INTO v_storno_doc_id;

  -- Reverse each item: return goods back to stock
  FOR v_item IN SELECT * FROM document_items WHERE document_id = p_document_id
  LOOP
    INSERT INTO document_items (document_id, article_id, quantity, unit, note)
    VALUES (v_storno_doc_id, v_item.article_id, v_item.quantity, v_item.unit,
      'Storno: ' || v_orig_doc.doc_number)
    RETURNING id INTO v_item_id;

    INSERT INTO inventory_transactions (
      article_id, type, quantity, stock_location_id,
      document_id, document_item_id, project_id, created_by_user_id
    ) VALUES (
      v_item.article_id, 'storno_otpremnice', v_item.quantity,
      v_orig_doc.stock_location_id, v_storno_doc_id, v_item_id,
      v_orig_doc.project_id, v_user_id
    );
  END LOOP;

  -- Mark original document as stornoed
  UPDATE documents
  SET status = 'stornoed', cancellation_reason = 'Storno: ' || v_doc_number
  WHERE id = p_document_id;

  RETURN jsonb_build_object('id', v_storno_doc_id, 'doc_number', v_doc_number);
END;
$$;

REVOKE ALL ON FUNCTION public.storno_otpremnice(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.storno_otpremnice(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.storno_otpremnice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.storno_otpremnice(uuid) TO service_role;

-- ============================================================
-- RPC: storno_primke
-- Reverses a primka by removing items from stock and recalculating AVCO
-- ============================================================
CREATE OR REPLACE FUNCTION public.storno_primke(p_document_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_role text;
  v_orig_doc documents%ROWTYPE;
  v_year int := EXTRACT(year FROM now());
  v_count int;
  v_doc_number text;
  v_storno_doc_id uuid;
  v_item document_items%ROWTYPE;
  v_item_id uuid;
  v_current_qty numeric;
  v_current_avg numeric;
  v_available numeric;
  v_article_code text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_user_role := public.get_user_role(v_user_id);
  IF v_user_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only admins can perform storno';
  END IF;

  -- Load and validate original document
  SELECT * INTO v_orig_doc FROM documents WHERE id = p_document_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document not found';
  END IF;
  IF v_orig_doc.type NOT IN ('primka') THEN
    RAISE EXCEPTION 'Document is not a primka';
  END IF;
  IF v_orig_doc.status = 'stornoed' THEN
    RAISE EXCEPTION 'Document has already been stornoed';
  END IF;
  IF EXISTS (SELECT 1 FROM documents WHERE storno_of_document_id = p_document_id) THEN
    RAISE EXCEPTION 'Document has already been stornoed';
  END IF;

  -- Check we have enough stock to reverse each item
  FOR v_item IN SELECT * FROM document_items WHERE document_id = p_document_id
  LOOP
    SELECT COALESCE(SUM(CASE
      WHEN t.type IN ('opening_balance','adjustment_in','in','return','storno_otpremnice') THEN t.quantity
      WHEN t.type IN ('adjustment_out','out','storno_primka') THEN -t.quantity
    END), 0)
    INTO v_available
    FROM inventory_transactions t
    WHERE t.article_id = v_item.article_id
      AND t.stock_location_id = v_orig_doc.stock_location_id;

    IF v_available < v_item.quantity THEN
      SELECT code INTO v_article_code FROM articles WHERE id = v_item.article_id;
      RAISE EXCEPTION 'Nedovoljno zalihe za storno artikla %: dostupno %, potrebno %',
        v_article_code, v_available, v_item.quantity;
    END IF;
  END LOOP;

  -- Generate unique storno doc number
  SELECT COUNT(*) INTO v_count FROM documents
  WHERE type = 'storno_primka' AND EXTRACT(year FROM date) = v_year;
  v_doc_number := 'S-PRM-' || v_year || '-' || lpad((v_count + 1)::text, 4, '0');
  WHILE EXISTS (SELECT 1 FROM documents WHERE doc_number = v_doc_number) LOOP
    v_count := v_count + 1;
    v_doc_number := 'S-PRM-' || v_year || '-' || lpad((v_count + 1)::text, 4, '0');
  END LOOP;

  -- Create storno document
  INSERT INTO documents (
    type, status, doc_number, stock_location_id,
    recipient_name, note, date, created_by_user_id, storno_of_document_id
  ) VALUES (
    'storno_primka', 'posted', v_doc_number, v_orig_doc.stock_location_id,
    v_orig_doc.recipient_name,
    'Storno primke ' || v_orig_doc.doc_number,
    CURRENT_DATE, v_user_id, p_document_id
  ) RETURNING id INTO v_storno_doc_id;

  -- Process each item: remove from stock and recalculate AVCO
  FOR v_item IN SELECT * FROM document_items WHERE document_id = p_document_id
  LOOP
    INSERT INTO document_items (document_id, article_id, quantity, unit, unit_price, note)
    VALUES (v_storno_doc_id, v_item.article_id, v_item.quantity, v_item.unit, v_item.unit_price,
      'Storno: ' || v_orig_doc.doc_number)
    RETURNING id INTO v_item_id;

    INSERT INTO inventory_transactions (
      article_id, type, quantity, stock_location_id,
      document_id, document_item_id, created_by_user_id
    ) VALUES (
      v_item.article_id, 'storno_primka', v_item.quantity,
      v_orig_doc.stock_location_id, v_storno_doc_id, v_item_id, v_user_id
    );

    -- Recalculate AVCO: remove the reversed quantity from the weighted average
    IF v_item.unit_price IS NOT NULL THEN
      SELECT COALESCE(SUM(CASE
        WHEN t.type IN ('opening_balance','adjustment_in','in','return','storno_otpremnice') THEN t.quantity
        WHEN t.type IN ('adjustment_out','out','storno_primka') THEN -t.quantity
      END), 0)
      INTO v_current_qty
      FROM inventory_transactions t
      WHERE t.article_id = v_item.article_id;

      SELECT average_cost INTO v_current_avg FROM articles WHERE id = v_item.article_id;

      UPDATE articles SET
        average_cost = CASE
          WHEN (v_current_qty - v_item.quantity) <= 0 THEN 0
          ELSE GREATEST(0,
            (v_current_qty * COALESCE(v_current_avg, 0) - v_item.quantity * v_item.unit_price)
            / (v_current_qty - v_item.quantity)
          )
        END
      WHERE id = v_item.article_id;
    END IF;
  END LOOP;

  -- Mark original document as stornoed
  UPDATE documents
  SET status = 'stornoed', cancellation_reason = 'Storno: ' || v_doc_number
  WHERE id = p_document_id;

  RETURN jsonb_build_object('id', v_storno_doc_id, 'doc_number', v_doc_number);
END;
$$;

REVOKE ALL ON FUNCTION public.storno_primke(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.storno_primke(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.storno_primke(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.storno_primke(uuid) TO service_role;
