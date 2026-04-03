-- Fix: Monters must set created_by_user_id to their own auth.uid()
DROP POLICY IF EXISTS "Monters can insert otpremnica povratnica" ON public.documents;

CREATE POLICY "Monters can insert otpremnica povratnica"
ON public.documents
FOR INSERT
TO authenticated
WITH CHECK (
  get_user_role(auth.uid()) = 'monter'
  AND type = ANY (ARRAY['otpremnica','povratnica'])
  AND created_by_user_id = auth.uid()
);