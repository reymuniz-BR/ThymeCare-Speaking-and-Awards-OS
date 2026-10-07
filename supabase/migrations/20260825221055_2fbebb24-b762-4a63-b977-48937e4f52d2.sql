
-- Approved email list
CREATE TABLE public.allowed_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  note text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.allowed_emails TO authenticated;
GRANT ALL ON public.allowed_emails TO service_role;
ALTER TABLE public.allowed_emails ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_team_member(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id);
$$;

CREATE POLICY "team read allowed_emails" ON public.allowed_emails
  FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "admins insert allowed_emails" ON public.allowed_emails
  FOR INSERT TO authenticated WITH CHECK (public.can_manage(auth.uid()));
CREATE POLICY "admins update allowed_emails" ON public.allowed_emails
  FOR UPDATE TO authenticated USING (public.can_manage(auth.uid())) WITH CHECK (public.can_manage(auth.uid()));
CREATE POLICY "admins delete allowed_emails" ON public.allowed_emails
  FOR DELETE TO authenticated USING (public.can_manage(auth.uid()));

CREATE TRIGGER allowed_emails_updated BEFORE UPDATE ON public.allowed_emails
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed the approved list with everyone who already has an account
INSERT INTO public.allowed_emails (email)
SELECT DISTINCT lower(email) FROM public.profiles WHERE email IS NOT NULL
ON CONFLICT (email) DO NOTHING;

-- Block sign-ups from emails that are not approved
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE first_user BOOLEAN;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO first_user;

  IF NOT first_user AND NOT EXISTS (
    SELECT 1 FROM public.allowed_emails WHERE lower(email) = lower(NEW.email)
  ) THEN
    RAISE EXCEPTION 'This email is not approved for access. Ask an administrator to add it.';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (NEW.id, NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN first_user THEN 'admin'::public.app_role ELSE 'contributor'::public.app_role END)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;

-- Replace allow-any-signed-in-user rules with team membership checks
DO $$
DECLARE p RECORD; sql text;
BEGIN
  FOR p IN
    SELECT tablename, policyname, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename <> 'allowed_emails'
      AND (qual = 'true' OR with_check = 'true')
  LOOP
    sql := format('ALTER POLICY %I ON public.%I', p.policyname, p.tablename);
    IF p.qual = 'true' THEN
      sql := sql || ' USING (public.is_team_member(auth.uid()))';
    END IF;
    IF p.with_check = 'true' THEN
      sql := sql || ' WITH CHECK (public.is_team_member(auth.uid()))';
    END IF;
    EXECUTE sql;
  END LOOP;
END $$;
