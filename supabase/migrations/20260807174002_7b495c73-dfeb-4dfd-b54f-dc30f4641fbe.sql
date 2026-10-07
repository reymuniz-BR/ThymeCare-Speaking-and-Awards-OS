CREATE TABLE public.monitoring_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  checked_at timestamptz NOT NULL DEFAULT now(),
  source_url text,
  ok boolean NOT NULL DEFAULT false,
  application_state text,
  confidence text NOT NULL DEFAULT 'uncertain',
  summary text,
  error text,
  changes_found integer NOT NULL DEFAULT 0,
  triggered_by text NOT NULL DEFAULT 'manual',
  actor_id uuid REFERENCES public.profiles(id),
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.monitoring_checks TO authenticated;
GRANT ALL ON public.monitoring_checks TO service_role;
ALTER TABLE public.monitoring_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "checks readable" ON public.monitoring_checks FOR SELECT TO authenticated USING (true);
CREATE POLICY "checks insertable" ON public.monitoring_checks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "checks deletable by managers" ON public.monitoring_checks FOR DELETE TO authenticated USING (public.can_manage(auth.uid()));

CREATE TABLE public.opportunity_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  check_id uuid REFERENCES public.monitoring_checks(id) ON DELETE SET NULL,
  field text NOT NULL,
  label text NOT NULL,
  old_value text,
  new_value text,
  source_url text,
  confidence text NOT NULL DEFAULT 'uncertain',
  evidence text,
  detected_at timestamptz NOT NULL DEFAULT now(),
  review_status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.opportunity_changes TO authenticated;
GRANT ALL ON public.opportunity_changes TO service_role;
ALTER TABLE public.opportunity_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "changes readable" ON public.opportunity_changes FOR SELECT TO authenticated USING (true);
CREATE POLICY "changes insertable" ON public.opportunity_changes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "changes updatable" ON public.opportunity_changes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "changes deletable by managers" ON public.opportunity_changes FOR DELETE TO authenticated USING (public.can_manage(auth.uid()));

CREATE TRIGGER opportunity_changes_updated BEFORE UPDATE ON public.opportunity_changes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_changes_pending ON public.opportunity_changes (opportunity_id, review_status);
CREATE INDEX idx_checks_opp ON public.monitoring_checks (opportunity_id, checked_at DESC);

ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS application_state text,
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz;