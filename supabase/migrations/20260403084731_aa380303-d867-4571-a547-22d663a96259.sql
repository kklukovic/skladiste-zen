-- Drop the restrictive inventory_transactions INSERT policy
DROP POLICY IF EXISTS "Authenticated can insert own inventory_transactions" ON public.inventory_transactions;

-- Create a new INSERT policy that allows authenticated users to insert
-- when they own the related document OR when it's an admin doing adjustments
CREATE POLICY "Authenticated can insert inventory_transactions"
ON public.inventory_transactions FOR INSERT TO authenticated
WITH CHECK (
  (document_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM documents d
    WHERE d.id = inventory_transactions.document_id
    AND (d.created_by_user_id = auth.uid() OR get_user_role(auth.uid()) = 'admin')
  ))
  OR
  (document_id IS NULL AND get_user_role(auth.uid()) = 'admin')
);