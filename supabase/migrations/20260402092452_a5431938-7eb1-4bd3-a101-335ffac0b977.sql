
-- 1. Create profiles table
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL,
  role text NOT NULL DEFAULT 'monter',
  email text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. Security definer function to get user role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = _user_id
$$;

-- 3. Profiles RLS - everyone can read own, admins can read all
CREATE POLICY "Users can read own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Allow insert for new profiles" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- 4. Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, username, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'monter')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. Drop all existing RLS policies and recreate with role-based access

-- articles
DROP POLICY IF EXISTS "Authenticated users can read articles" ON public.articles;
DROP POLICY IF EXISTS "Authenticated users can insert articles" ON public.articles;
DROP POLICY IF EXISTS "Authenticated users can update articles" ON public.articles;
DROP POLICY IF EXISTS "Authenticated users can delete articles" ON public.articles;

CREATE POLICY "All authenticated can read articles" ON public.articles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert articles" ON public.articles
  FOR INSERT TO authenticated WITH CHECK (public.get_user_role(auth.uid()) = 'admin');
CREATE POLICY "Admins can update articles" ON public.articles
  FOR UPDATE TO authenticated USING (public.get_user_role(auth.uid()) = 'admin');
CREATE POLICY "Admins can delete articles" ON public.articles
  FOR DELETE TO authenticated USING (public.get_user_role(auth.uid()) = 'admin');

-- stock_locations
DROP POLICY IF EXISTS "Authenticated users can read stock_locations" ON public.stock_locations;
DROP POLICY IF EXISTS "Authenticated users can insert stock_locations" ON public.stock_locations;
DROP POLICY IF EXISTS "Authenticated users can update stock_locations" ON public.stock_locations;
DROP POLICY IF EXISTS "Authenticated users can delete stock_locations" ON public.stock_locations;

CREATE POLICY "All authenticated can read stock_locations" ON public.stock_locations
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert stock_locations" ON public.stock_locations
  FOR INSERT TO authenticated WITH CHECK (public.get_user_role(auth.uid()) = 'admin');
CREATE POLICY "Admins can update stock_locations" ON public.stock_locations
  FOR UPDATE TO authenticated USING (public.get_user_role(auth.uid()) = 'admin');
CREATE POLICY "Admins can delete stock_locations" ON public.stock_locations
  FOR DELETE TO authenticated USING (public.get_user_role(auth.uid()) = 'admin');

-- projects
DROP POLICY IF EXISTS "Authenticated users can read projects" ON public.projects;
DROP POLICY IF EXISTS "Authenticated users can insert projects" ON public.projects;
DROP POLICY IF EXISTS "Authenticated users can update projects" ON public.projects;
DROP POLICY IF EXISTS "Authenticated users can delete projects" ON public.projects;

CREATE POLICY "All authenticated can read projects" ON public.projects
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert projects" ON public.projects
  FOR INSERT TO authenticated WITH CHECK (public.get_user_role(auth.uid()) = 'admin');
CREATE POLICY "Admins can update projects" ON public.projects
  FOR UPDATE TO authenticated USING (public.get_user_role(auth.uid()) = 'admin');
CREATE POLICY "Admins can delete projects" ON public.projects
  FOR DELETE TO authenticated USING (public.get_user_role(auth.uid()) = 'admin');

-- documents
DROP POLICY IF EXISTS "Authenticated users can read documents" ON public.documents;
DROP POLICY IF EXISTS "Authenticated users can insert documents" ON public.documents;
DROP POLICY IF EXISTS "Authenticated users can update documents" ON public.documents;
DROP POLICY IF EXISTS "Authenticated users can delete documents" ON public.documents;

CREATE POLICY "All authenticated can read documents" ON public.documents
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can do all on documents" ON public.documents
  FOR INSERT TO authenticated WITH CHECK (public.get_user_role(auth.uid()) = 'admin');
CREATE POLICY "Monters can insert otpremnica povratnica" ON public.documents
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_user_role(auth.uid()) = 'monter'
    AND type IN ('otpremnica', 'povratnica')
  );
CREATE POLICY "Admins can update documents" ON public.documents
  FOR UPDATE TO authenticated USING (public.get_user_role(auth.uid()) = 'admin');
CREATE POLICY "Admins can delete documents" ON public.documents
  FOR DELETE TO authenticated USING (public.get_user_role(auth.uid()) = 'admin');

-- document_items
DROP POLICY IF EXISTS "Authenticated users can read document_items" ON public.document_items;
DROP POLICY IF EXISTS "Authenticated users can insert document_items" ON public.document_items;
DROP POLICY IF EXISTS "Authenticated users can update document_items" ON public.document_items;
DROP POLICY IF EXISTS "Authenticated users can delete document_items" ON public.document_items;

CREATE POLICY "All authenticated can read document_items" ON public.document_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "All authenticated can insert document_items" ON public.document_items
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admins can update document_items" ON public.document_items
  FOR UPDATE TO authenticated USING (public.get_user_role(auth.uid()) = 'admin');
CREATE POLICY "Admins can delete document_items" ON public.document_items
  FOR DELETE TO authenticated USING (public.get_user_role(auth.uid()) = 'admin');

-- inventory_transactions
DROP POLICY IF EXISTS "Authenticated users can read inventory_transactions" ON public.inventory_transactions;
DROP POLICY IF EXISTS "Authenticated users can insert inventory_transactions" ON public.inventory_transactions;
DROP POLICY IF EXISTS "Authenticated users can update inventory_transactions" ON public.inventory_transactions;
DROP POLICY IF EXISTS "Authenticated users can delete inventory_transactions" ON public.inventory_transactions;

CREATE POLICY "All authenticated can read inventory_transactions" ON public.inventory_transactions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "All authenticated can insert inventory_transactions" ON public.inventory_transactions
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admins can update inventory_transactions" ON public.inventory_transactions
  FOR UPDATE TO authenticated USING (public.get_user_role(auth.uid()) = 'admin');
CREATE POLICY "Admins can delete inventory_transactions" ON public.inventory_transactions
  FOR DELETE TO authenticated USING (public.get_user_role(auth.uid()) = 'admin');

-- settings
DROP POLICY IF EXISTS "Authenticated users can read settings" ON public.settings;
DROP POLICY IF EXISTS "Authenticated users can update settings" ON public.settings;

CREATE POLICY "Admins can read settings" ON public.settings
  FOR SELECT TO authenticated USING (public.get_user_role(auth.uid()) = 'admin');
CREATE POLICY "Admins can update settings" ON public.settings
  FOR UPDATE TO authenticated USING (public.get_user_role(auth.uid()) = 'admin');

-- 6. Trigger to auto-set created_by_user_id on documents
CREATE OR REPLACE FUNCTION public.set_created_by_user_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  NEW.created_by_user_id := auth.uid();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_document_created_by
  BEFORE INSERT ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.set_created_by_user_id();

CREATE TRIGGER set_transaction_created_by
  BEFORE INSERT ON public.inventory_transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_created_by_user_id();
