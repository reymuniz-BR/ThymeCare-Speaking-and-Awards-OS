CREATE TYPE public.proof_point_kind AS ENUM (
  'company_overview','differentiation','market_problem','innovation_story','healthcare_impact',
  'patient_impact','customer_impact','growth_metric','business_metric','technology_narrative',
  'value_based_care','executive_bio','leadership_example','customer_example','milestone',
  'award_recognition','approved_quote'
);

CREATE TABLE public.proof_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  kind public.proof_point_kind NOT NULL,
  content text NOT NULL DEFAULT '',
  theme text,
  speaker_id uuid REFERENCES public.speakers(id) ON DELETE SET NULL,
  executive_name text,
  source text,
  source_url text,
  source_date date,
  last_verified_at date,
  approved boolean NOT NULL DEFAULT false,
  approved_by uuid REFERENCES public.profiles(id),
  approved_at timestamptz,
  expires_on date,
  notes text,
  tags text[] NOT NULL DEFAULT '{}',
  usage_count integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.proof_points TO authenticated;
GRANT ALL ON public.proof_points TO service_role;

ALTER TABLE public.proof_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "proof_points_select" ON public.proof_points FOR SELECT TO authenticated USING (true);
CREATE POLICY "proof_points_insert" ON public.proof_points FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "proof_points_update" ON public.proof_points FOR UPDATE TO authenticated USING (true);
CREATE POLICY "proof_points_delete" ON public.proof_points FOR DELETE TO authenticated USING (public.can_manage(auth.uid()));

CREATE TRIGGER proof_points_updated BEFORE UPDATE ON public.proof_points
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX proof_points_kind_idx ON public.proof_points (kind);
CREATE INDEX proof_points_approved_idx ON public.proof_points (approved);