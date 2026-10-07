CREATE TABLE public.submission_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL UNIQUE REFERENCES public.submissions(id) ON DELETE CASCADE,
  opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
  model text,
  brief jsonb NOT NULL DEFAULT '{}'::jsonb,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  generated_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.submission_briefs TO authenticated;
GRANT ALL ON public.submission_briefs TO service_role;

ALTER TABLE public.submission_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "briefs_select" ON public.submission_briefs FOR SELECT TO authenticated USING (true);
CREATE POLICY "briefs_insert" ON public.submission_briefs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "briefs_update" ON public.submission_briefs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "briefs_delete" ON public.submission_briefs FOR DELETE TO authenticated USING (public.can_manage(auth.uid()));

CREATE TRIGGER submission_briefs_updated BEFORE UPDATE ON public.submission_briefs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX submission_briefs_opportunity_idx ON public.submission_briefs(opportunity_id);