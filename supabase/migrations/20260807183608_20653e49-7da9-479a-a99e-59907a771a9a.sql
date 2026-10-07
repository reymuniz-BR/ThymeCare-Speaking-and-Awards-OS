CREATE TABLE public.submission_answer_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id uuid NOT NULL REFERENCES public.submission_fields(id) ON DELETE CASCADE,
  submission_id uuid NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  answer text NOT NULL DEFAULT '',
  word_count integer NOT NULL DEFAULT 0,
  char_count integer NOT NULL DEFAULT 0,
  origin text NOT NULL DEFAULT 'human',
  model text,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  verifications jsonb NOT NULL DEFAULT '[]'::jsonb,
  alternate jsonb,
  note text,
  is_final boolean NOT NULL DEFAULT false,
  reusable boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX submission_answer_versions_field_idx
  ON public.submission_answer_versions (field_id, version DESC);
CREATE INDEX submission_answer_versions_submission_idx
  ON public.submission_answer_versions (submission_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.submission_answer_versions TO authenticated;
GRANT ALL ON public.submission_answer_versions TO service_role;

ALTER TABLE public.submission_answer_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team read answer versions" ON public.submission_answer_versions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "team insert answer versions" ON public.submission_answer_versions
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "team update answer versions" ON public.submission_answer_versions
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "managers delete answer versions" ON public.submission_answer_versions
  FOR DELETE TO authenticated USING (can_manage(auth.uid()));

CREATE TRIGGER submission_answer_versions_updated
  BEFORE UPDATE ON public.submission_answer_versions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();