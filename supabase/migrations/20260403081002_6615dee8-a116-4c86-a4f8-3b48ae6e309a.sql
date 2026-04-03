-- Create a SECURITY DEFINER function to safely check current role
CREATE OR REPLACE FUNCTION public.get_own_role()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- Revoke public access
REVOKE EXECUTE ON FUNCTION public.get_own_role() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_own_role() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_own_role() TO authenticated;

-- Drop old UPDATE policy and recreate using the SECURITY DEFINER function
DROP POLICY IF EXISTS "Users can update own profile except role" ON public.profiles;
CREATE POLICY "Users can update own profile except role"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = public.get_own_role()
  );
