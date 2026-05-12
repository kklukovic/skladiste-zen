
-- ============================================================
-- RPC: delete_primka_item
-- Deletes a single item from a primka document, removes the
-- linked inventory transaction, and recalculates AVCO for the
-- article via a full chronological replay of all remaining
-- transactions.
--
-- Preconditions:
--   - Caller must be admin
--   - Parent document must be type 'primka' and status != 'stornoed'
--   - No outgoing (out) transactions for this article exist with a
--     document date strictly AFTER the primka's date
-- ============================================================
CREATE OR REPLACE FUNCTION public.delete_primka_item(p_document_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id     uuid := auth.uid();
  v_user_role   text;
  v_item        document_items%ROWTYPE;
  v_doc         documents%ROWTYPE;
  v_article_id  uuid;
  v_running_qty numeric := 0;
  v_running_avg numeric := 0;
  v_t           RECORD;
BEGIN
  -- Auth
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  v_user_role := public.get_user_role(v_user_id);
  IF v_user_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only admins can delete primka items';
  END IF;

  -- Load and validate document item + parent document
  SELECT * INTO v_item FROM document_items WHERE id = p_document_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stavka dokumenta nije pronađena';
  END IF;

  SELECT * INTO v_doc FROM documents WHERE id = v_item.document_id;
  IF NOT FOUND OR v_doc.type != 'primka' THEN
    RAISE EXCEPTION 'Dokument nije primka';
  END IF;
  IF v_doc.status = 'stornoed' THEN
    RAISE EXCEPTION 'Nije moguće brisati stavke stornirane primke';
  END IF;

  v_article_id := v_item.article_id;

  -- Block deletion if any outgoing transaction exists for this article
  -- on a document dated strictly AFTER this primka's date
  IF EXISTS (
    SELECT 1
    FROM inventory_transactions t
    JOIN documents d ON d.id = t.document_id
    WHERE t.article_id = v_article_id
      AND t.type IN ('out', 'adjustment_out')
      AND d.date > v_doc.date
  ) THEN
    RAISE EXCEPTION 'Nije moguće obrisati stavku — postoje otpremnice za ovaj artikl nakon datuma primke';
  END IF;

  -- Delete the inventory transaction linked to this item, then the item itself
  DELETE FROM inventory_transactions WHERE document_item_id = p_document_item_id;
  DELETE FROM document_items WHERE id = p_document_item_id;

  -- Full AVCO recalculation: replay all remaining transactions for the article
  -- in chronological order (created_at, then id as tie-breaker)
  FOR v_t IN (
    SELECT
      t.type,
      t.quantity,
      di.unit_price
    FROM inventory_transactions t
    LEFT JOIN document_items di ON di.id = t.document_item_id
    WHERE t.article_id = v_article_id
    ORDER BY t.created_at ASC, t.id ASC
  )
  LOOP
    IF v_t.type IN ('opening_balance', 'adjustment_in', 'in', 'return', 'storno_otpremnice') THEN
      IF v_t.unit_price IS NOT NULL AND (v_running_qty + v_t.quantity) > 0 THEN
        v_running_avg := (v_running_qty * v_running_avg + v_t.quantity * v_t.unit_price)
                         / (v_running_qty + v_t.quantity);
      END IF;
      v_running_qty := v_running_qty + v_t.quantity;
    ELSIF v_t.type IN ('adjustment_out', 'out', 'storno_primka') THEN
      v_running_qty := GREATEST(0, v_running_qty - v_t.quantity);
    END IF;
  END LOOP;

  UPDATE articles SET average_cost = v_running_avg WHERE id = v_article_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_primka_item(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_primka_item(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_primka_item(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_primka_item(uuid) TO service_role;
