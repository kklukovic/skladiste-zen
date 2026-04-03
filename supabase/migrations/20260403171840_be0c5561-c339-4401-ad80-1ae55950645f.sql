
-- Fix privilege escalation: restrict profile INSERT to only allow default 'monter' role
DROP POLICY IF EXISTS "Allow insert for new profiles" ON public.profiles;
CREATE POLICY "Allow insert for new profiles"
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (id = auth.uid() AND role = 'monter');
