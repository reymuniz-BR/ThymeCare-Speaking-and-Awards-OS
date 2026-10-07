CREATE TABLE public.brief_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start date NOT NULL,
  section text NOT NULL,
  item_key text NOT NULL,
  opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE CASCADE,
  discovery_id uuid REFERENCES public.discoveries(id) ON DELETE CASCADE,
  submission_id uuid REFERENCES public.submissions(id) ON DELETE CASCADE,
  title text,
  reviewed boolean NOT NULL DEFAULT false,
  reviewed_by uuid REFERENCES public.profiles(id),
  reviewed_at timestamptz,
  follow_up_note text,
  follow_up_owner_id uuid REFERENCES public.profiles(id),
  follow_up_due date,
  follow_up_done boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (week_start, item_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.brief_items TO authenticated;
GRANT ALL ON public.brief_items TO service_role;

ALTER TABLE public.brief_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brief_items_select" ON public.brief_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "brief_items_insert" ON public.brief_items
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "brief_items_update" ON public.brief_items
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "brief_items_delete" ON public.brief_items
  FOR DELETE TO authenticated USING (public.can_manage(auth.uid()));

CREATE TRIGGER brief_items_updated BEFORE UPDATE ON public.brief_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX brief_items_week_idx ON public.brief_items (week_start);
CREATE INDEX brief_items_followup_idx ON public.brief_items (follow_up_owner_id) WHERE follow_up_done = false;