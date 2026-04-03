-- Remove the old overlapping UPDATE policy
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
