
CREATE OR REPLACE FUNCTION public.set_created_by_user_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.created_by_user_id := auth.uid();
  RETURN NEW;
END;
$$;
