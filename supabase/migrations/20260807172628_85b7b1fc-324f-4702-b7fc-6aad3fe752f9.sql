-- 1. Taxonomy table
CREATE TABLE public.taxonomy_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  applies_to text,
  value text NOT NULL,
  label text NOT NULL,
  tone text NOT NULL DEFAULT 'neutral',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX taxonomy_options_unique
  ON public.taxonomy_options (kind, COALESCE(applies_to, '*'), value);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.taxonomy_options TO authenticated;
GRANT ALL ON public.taxonomy_options TO service_role;

ALTER TABLE public.taxonomy_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "taxonomy_read" ON public.taxonomy_options
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "taxonomy_insert" ON public.taxonomy_options
  FOR INSERT TO authenticated WITH CHECK (public.can_manage(auth.uid()));
CREATE POLICY "taxonomy_update" ON public.taxonomy_options
  FOR UPDATE TO authenticated USING (public.can_manage(auth.uid()));
CREATE POLICY "taxonomy_delete" ON public.taxonomy_options
  FOR DELETE TO authenticated USING (public.can_manage(auth.uid()));

CREATE TRIGGER taxonomy_options_updated BEFORE UPDATE ON public.taxonomy_options
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Seed taxonomies
INSERT INTO public.taxonomy_options (kind, applies_to, value, label, tone, sort_order) VALUES
  ('status','speaking','information_not_available','Information Not Available','neutral',10),
  ('status','speaking','monitoring','Monitoring','info',20),
  ('status','speaking','submission_open','Submission Open','info',30),
  ('status','speaking','evaluating','Evaluating','warning',40),
  ('status','speaking','planning_to_submit','Planning to Submit','warning',50),
  ('status','speaking','drafting','Drafting','primary',60),
  ('status','speaking','client_review','Client Review','primary',70),
  ('status','speaking','submitted','Submitted','info',80),
  ('status','speaking','accepted','Accepted','success',90),
  ('status','speaking','declined','Declined','critical',100),
  ('status','speaking','sponsoring','Sponsoring','success',110),
  ('status','speaking','reached_out','Reached Out','info',120),
  ('status','speaking','passed','Passed','neutral',130),
  ('status','award','not_open_yet','Not Open Yet','neutral',10),
  ('status','award','monitoring','Monitoring','info',20),
  ('status','award','evaluating','Evaluating','warning',30),
  ('status','award','planning_to_submit','Planning to Submit','warning',40),
  ('status','award','in_progress','In Progress','primary',50),
  ('status','award','client_review','Client Review','primary',60),
  ('status','award','submitted','Submitted','info',70),
  ('status','award','awaiting_results','Awaiting Results','info',80),
  ('status','award','won','Won','success',90),
  ('status','award','finalist','Finalist','success',100),
  ('status','award','not_selected','Not Selected','critical',110),
  ('status','award','passed','Passed','neutral',120),
  ('priority',NULL,'critical','Critical','critical',10),
  ('priority',NULL,'high','High','warning',20),
  ('priority',NULL,'medium','Medium','info',30),
  ('priority',NULL,'low','Low','neutral',40),
  ('deadline_type',NULL,'confirmed','Confirmed','success',10),
  ('deadline_type',NULL,'estimated','Estimated','warning',20),
  ('deadline_type',NULL,'rolling','Rolling','info',30),
  ('deadline_type',NULL,'tbd','TBD','neutral',40),
  ('deadline_type',NULL,'invitation_only','Invitation Only','primary',50),
  ('recommendation',NULL,'recommended','Recommended','success',10),
  ('recommendation',NULL,'needs_review','Needs Review','warning',20),
  ('recommendation',NULL,'do_not_pursue','Do Not Pursue','critical',30),
  ('outcome',NULL,'pending','Pending','neutral',10),
  ('outcome',NULL,'won','Won','success',20),
  ('outcome',NULL,'finalist','Finalist','success',30),
  ('outcome',NULL,'accepted','Accepted','success',40),
  ('outcome',NULL,'not_selected','Not Selected','critical',50),
  ('outcome',NULL,'declined','Declined','critical',60),
  ('outcome',NULL,'withdrawn','Withdrawn','neutral',70);

-- 3. Expand opportunities
ALTER TABLE public.opportunities
  ADD COLUMN application_url text,
  ADD COLUMN event_date date,
  ADD COLUMN announcement_date date,
  ADD COLUMN category text,
  ADD COLUMN priority text NOT NULL DEFAULT 'medium',
  ADD COLUMN recommendation text NOT NULL DEFAULT 'needs_review',
  ADD COLUMN submission_owner_id uuid REFERENCES public.profiles(id),
  ADD COLUMN internal_draft_due date,
  ADD COLUMN client_review_due date,
  ADD COLUMN submission_date date,
  ADD COLUMN outcome text,
  ADD COLUMN open_date date,
  ADD COLUMN early_deadline date,
  ADD COLUMN final_deadline date,
  ADD COLUMN deadline_type text NOT NULL DEFAULT 'tbd',
  ADD COLUMN deadline_source_url text,
  ADD COLUMN deadline_verified_at date,
  ADD COLUMN monitoring_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN last_checked_at timestamptz,
  ADD COLUMN change_detected boolean NOT NULL DEFAULT false,
  ADD COLUMN previous_deadline date,
  ADD COLUMN monitoring_notes text;

-- 4. Status becomes configurable text
ALTER TABLE public.opportunities ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.opportunities ALTER COLUMN status TYPE text USING status::text;
ALTER TABLE public.opportunities ALTER COLUMN status SET DEFAULT 'monitoring';

UPDATE public.opportunities SET status = CASE status
  WHEN 'prospect' THEN 'evaluating'
  WHEN 'tracking' THEN 'monitoring'
  WHEN 'in_progress' THEN CASE WHEN type = 'award' THEN 'in_progress' ELSE 'drafting' END
  WHEN 'shortlisted' THEN CASE WHEN type = 'award' THEN 'finalist' ELSE 'accepted' END
  WHEN 'won' THEN CASE WHEN type = 'award' THEN 'won' ELSE 'accepted' END
  WHEN 'lost' THEN CASE WHEN type = 'award' THEN 'not_selected' ELSE 'declined' END
  WHEN 'declined' THEN CASE WHEN type = 'award' THEN 'passed' ELSE 'declined' END
  WHEN 'archived' THEN 'passed'
  ELSE status END;

-- 5. Backfill deadline columns from existing timeline rows
UPDATE public.opportunities o SET
  open_date = (SELECT d.date FROM public.opportunity_dates d WHERE d.opportunity_id = o.id AND d.kind = 'opens' ORDER BY d.date LIMIT 1),
  final_deadline = (SELECT d.date FROM public.opportunity_dates d WHERE d.opportunity_id = o.id AND d.kind = 'deadline' ORDER BY d.date LIMIT 1),
  early_deadline = (SELECT d.date FROM public.opportunity_dates d WHERE d.opportunity_id = o.id AND d.kind = 'extended_deadline' ORDER BY d.date LIMIT 1),
  event_date = (SELECT d.date FROM public.opportunity_dates d WHERE d.opportunity_id = o.id AND d.kind = 'event_start' ORDER BY d.date LIMIT 1),
  announcement_date = (SELECT d.date FROM public.opportunity_dates d WHERE d.opportunity_id = o.id AND d.kind = 'notification' ORDER BY d.date LIMIT 1);

-- 6. Keep the shared timeline in sync with opportunity date columns
CREATE OR REPLACE FUNCTION public.sync_opportunity_dates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  pairs CONSTANT text[][] := ARRAY[['opens','open_date'],['extended_deadline','early_deadline'],['deadline','final_deadline'],['notification','announcement_date'],['event_start','event_date']];
  k text; v date;
BEGIN
  FOREACH k SLICE 0 IN ARRAY ARRAY['opens','extended_deadline','deadline','notification','event_start'] LOOP
    v := CASE k
      WHEN 'opens' THEN NEW.open_date
      WHEN 'extended_deadline' THEN NEW.early_deadline
      WHEN 'deadline' THEN NEW.final_deadline
      WHEN 'notification' THEN NEW.announcement_date
      ELSE NEW.event_date END;
    IF v IS NULL THEN
      DELETE FROM public.opportunity_dates d WHERE d.opportunity_id = NEW.id AND d.kind = k::public.date_kind AND d.note = 'auto';
    ELSIF EXISTS (SELECT 1 FROM public.opportunity_dates d WHERE d.opportunity_id = NEW.id AND d.kind = k::public.date_kind AND d.note = 'auto') THEN
      UPDATE public.opportunity_dates d SET date = v
        WHERE d.opportunity_id = NEW.id AND d.kind = k::public.date_kind AND d.note = 'auto' AND d.date IS DISTINCT FROM v;
    ELSE
      INSERT INTO public.opportunity_dates (opportunity_id, kind, date, note)
      VALUES (NEW.id, k::public.date_kind, v, 'auto');
    END IF;
  END LOOP;
  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.sync_opportunity_dates() FROM PUBLIC, anon;

CREATE TRIGGER opportunities_sync_dates
AFTER INSERT OR UPDATE OF open_date, early_deadline, final_deadline, announcement_date, event_date
ON public.opportunities
FOR EACH ROW EXECUTE FUNCTION public.sync_opportunity_dates();
