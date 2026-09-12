-- 1. Pin search_path on remaining SECURITY DEFINER functions
ALTER FUNCTION public.create_primka(uuid, date, text, text, jsonb) SET search_path = public;
ALTER FUNCTION public.storno_primke(uuid) SET search_path = public;

-- 2. Revoke EXECUTE from anon/public on all SECURITY DEFINER functions
REVOKE ALL ON FUNCTION public.create_primka(uuid, date, text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_otpremnica(uuid, date, uuid, text, text, text, text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_povratnica(uuid, uuid, date, text, text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_primka_item(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.storno_otpremnice(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.storno_primke(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_own_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_user_role(uuid) FROM PUBLIC, anon;

-- 3. Trigger-only functions must not be callable via the API at all
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_created_by_user_id() FROM PUBLIC, anon, authenticated;

-- 4. Rename misleading documents INSERT policy
DROP POLICY IF EXISTS "Admins can do all on documents" ON public.documents;
CREATE POLICY "Admins can insert documents"
ON public.documents FOR INSERT TO authenticated
WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

-- 5. Harden profile role protection without depending on a helper function
DROP POLICY IF EXISTS "Users can update own profile except role" ON public.profiles;
CREATE POLICY "Users can update own profile except role"
ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid())
WITH CHECK (
  id = auth.uid()
  AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
);

-- 6. Explicit admin-only INSERT/DELETE policies on settings
CREATE POLICY "Admins can insert settings"
ON public.settings FOR INSERT TO authenticated
WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Admins can delete settings"
ON public.settings FOR DELETE TO authenticated
USING (public.get_user_role(auth.uid()) = 'admin');