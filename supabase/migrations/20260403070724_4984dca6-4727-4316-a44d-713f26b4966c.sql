
-- Fix 1: Prevent privilege escalation - replace profiles UPDATE policy
-- Drop the old permissive policy
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- New policy: users can update their own profile but CANNOT change their role
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid() AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()));

-- Fix 2: Tighten document_items INSERT - only allow inserts linked to documents the user created or if admin
DROP POLICY IF EXISTS "All authenticated can insert document_items" ON public.document_items;

CREATE POLICY "Authenticated can insert own document_items"
ON public.document_items
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_id
    AND (d.created_by_user_id = auth.uid() OR get_user_role(auth.uid()) = 'admin')
  )
);

-- Fix 3: Tighten inventory_transactions INSERT
DROP POLICY IF EXISTS "All authenticated can insert inventory_transactions" ON public.inventory_transactions;

CREATE POLICY "Authenticated can insert own inventory_transactions"
ON public.inventory_transactions
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_id
    AND (d.created_by_user_id = auth.uid() OR get_user_role(auth.uid()) = 'admin')
  )
);
