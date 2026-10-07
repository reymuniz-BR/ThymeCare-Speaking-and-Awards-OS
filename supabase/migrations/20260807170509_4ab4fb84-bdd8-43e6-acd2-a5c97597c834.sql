REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_manage(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage(uuid) TO authenticated;

-- OPPORTUNITIES
CREATE TABLE public.opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type public.opportunity_type NOT NULL DEFAULT 'award',
  organizer TEXT,
  url TEXT,
  description TEXT,
  audience TEXT,
  region TEXT,
  location TEXT,
  tier SMALLINT NOT NULL DEFAULT 2,
  cost_usd NUMERIC(12,2),
  effort TEXT,
  fit_score SMALLINT,
  status public.opportunity_status NOT NULL DEFAULT 'prospect',
  owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  source TEXT,
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.opportunity_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  label TEXT,
  is_current BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (opportunity_id, year)
);

CREATE TABLE public.opportunity_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  cycle_id UUID REFERENCES public.opportunity_cycles(id) ON DELETE CASCADE,
  kind public.date_kind NOT NULL,
  date DATE NOT NULL,
  confidence TEXT NOT NULL DEFAULT 'confirmed',
  note TEXT,
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.opportunity_dates (date);
CREATE INDEX ON public.opportunity_dates (opportunity_id);

CREATE TABLE public.speakers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  title TEXT,
  bio TEXT,
  topics TEXT[] NOT NULL DEFAULT '{}',
  availability TEXT,
  email TEXT,
  photo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  cycle_id UUID REFERENCES public.opportunity_cycles(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  stage public.submission_stage NOT NULL DEFAULT 'draft',
  assignee_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ,
  outcome TEXT,
  outcome_notes TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.submission_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  prompt TEXT NOT NULL,
  answer TEXT NOT NULL DEFAULT '',
  word_limit INTEGER,
  char_limit INTEGER,
  reused_from_field_id UUID REFERENCES public.submission_fields(id) ON DELETE SET NULL,
  reused_from_asset_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.submission_speakers (
  submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  speaker_id UUID NOT NULL REFERENCES public.speakers(id) ON DELETE CASCADE,
  role TEXT,
  PRIMARY KEY (submission_id, speaker_id)
);

CREATE TABLE public.content_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drive_file_id TEXT UNIQUE,
  name TEXT NOT NULL,
  mime_type TEXT,
  folder_path TEXT,
  web_view_link TEXT,
  category public.asset_category NOT NULL DEFAULT 'other',
  extracted_text TEXT,
  summary TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.content_snippets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category public.asset_category NOT NULL DEFAULT 'boilerplate',
  tags TEXT[] NOT NULL DEFAULT '{}',
  source_asset_id UUID REFERENCES public.content_assets(id) ON DELETE SET NULL,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.discoveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  source_url TEXT,
  source TEXT NOT NULL DEFAULT 'ai',
  organizer TEXT,
  type public.opportunity_type,
  description TEXT,
  estimated_deadline DATE,
  region TEXT,
  relevance_score SMALLINT,
  rationale TEXT,
  duplicate_of UUID REFERENCES public.opportunities(id) ON DELETE SET NULL,
  raw_extract JSONB,
  status public.discovery_status NOT NULL DEFAULT 'new',
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  promoted_opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.opportunities ADD COLUMN created_from_discovery_id UUID REFERENCES public.discoveries(id) ON DELETE SET NULL;

CREATE TABLE public.activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  field TEXT,
  old_value TEXT,
  new_value TEXT,
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.activity_log (created_at DESC);

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.email_digest_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  digest_key TEXT NOT NULL,
  recipient TEXT,
  item_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'sent',
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, digest_key)
);

CREATE TABLE public.saved_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- GRANTS + RLS
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['opportunities','opportunity_cycles','opportunity_dates','speakers','submissions','submission_fields','submission_speakers','content_assets','content_snippets','discoveries','activity_log','notifications','email_digest_log','saved_views']
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY['opportunities','opportunity_cycles','opportunity_dates','speakers','submissions','submission_fields','submission_speakers','content_assets','content_snippets','discoveries']
  LOOP
    EXECUTE format('CREATE POLICY "team read %1$s" ON public.%1$I FOR SELECT TO authenticated USING (true)', t);
    EXECUTE format('CREATE POLICY "team insert %1$s" ON public.%1$I FOR INSERT TO authenticated WITH CHECK (true)', t);
    EXECUTE format('CREATE POLICY "team update %1$s" ON public.%1$I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)', t);
    EXECUTE format('CREATE POLICY "managers delete %1$s" ON public.%1$I FOR DELETE TO authenticated USING (public.can_manage(auth.uid()))', t);
    EXECUTE format('CREATE TRIGGER %1$s_updated BEFORE UPDATE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS submission_speakers_updated ON public.submission_speakers;

CREATE POLICY "team read activity" ON public.activity_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "team write activity" ON public.activity_log FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "own notifications" ON public.notifications FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own saved views" ON public.saved_views FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own digest log" ON public.email_digest_log FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ACTIVITY TRIGGERS
CREATE OR REPLACE FUNCTION public.log_opportunity_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.activity_log (actor_id, entity_type, entity_id, opportunity_id, action, summary)
    VALUES (auth.uid(), 'opportunity', NEW.id, NEW.id, 'created', NEW.name);
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.activity_log (actor_id, entity_type, entity_id, opportunity_id, action, field, old_value, new_value, summary)
    VALUES (auth.uid(),'opportunity',NEW.id,NEW.id,'status_changed','status',OLD.status::text,NEW.status::text, NEW.name);
  END IF;
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    INSERT INTO public.activity_log (actor_id, entity_type, entity_id, opportunity_id, action, field, old_value, new_value, summary)
    VALUES (auth.uid(),'opportunity',NEW.id,NEW.id,'owner_changed','owner_id',OLD.owner_id::text,NEW.owner_id::text, NEW.name);
  END IF;
  IF NEW.tier IS DISTINCT FROM OLD.tier THEN
    INSERT INTO public.activity_log (actor_id, entity_type, entity_id, opportunity_id, action, field, old_value, new_value, summary)
    VALUES (auth.uid(),'opportunity',NEW.id,NEW.id,'updated','tier',OLD.tier::text,NEW.tier::text, NEW.name);
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.log_opportunity_change() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER opportunities_activity AFTER INSERT OR UPDATE ON public.opportunities
FOR EACH ROW EXECUTE FUNCTION public.log_opportunity_change();

CREATE OR REPLACE FUNCTION public.log_date_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.activity_log (actor_id, entity_type, entity_id, opportunity_id, action, field, new_value)
    VALUES (auth.uid(),'opportunity_date',NEW.id,NEW.opportunity_id,'date_added',NEW.kind::text,NEW.date::text);
  ELSIF NEW.date IS DISTINCT FROM OLD.date THEN
    INSERT INTO public.activity_log (actor_id, entity_type, entity_id, opportunity_id, action, field, old_value, new_value)
    VALUES (auth.uid(),'opportunity_date',NEW.id,NEW.opportunity_id,'date_changed',NEW.kind::text,OLD.date::text,NEW.date::text);
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.log_date_change() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER opportunity_dates_activity AFTER INSERT OR UPDATE ON public.opportunity_dates
FOR EACH ROW EXECUTE FUNCTION public.log_date_change();

CREATE OR REPLACE FUNCTION public.log_submission_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.activity_log (actor_id, entity_type, entity_id, opportunity_id, action, summary)
    VALUES (auth.uid(),'submission',NEW.id,NEW.opportunity_id,'created',NEW.title);
  ELSIF NEW.stage IS DISTINCT FROM OLD.stage THEN
    INSERT INTO public.activity_log (actor_id, entity_type, entity_id, opportunity_id, action, field, old_value, new_value, summary)
    VALUES (auth.uid(),'submission',NEW.id,NEW.opportunity_id,'stage_changed','stage',OLD.stage::text,NEW.stage::text,NEW.title);
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.log_submission_change() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER submissions_activity AFTER INSERT OR UPDATE ON public.submissions
FOR EACH ROW EXECUTE FUNCTION public.log_submission_change();