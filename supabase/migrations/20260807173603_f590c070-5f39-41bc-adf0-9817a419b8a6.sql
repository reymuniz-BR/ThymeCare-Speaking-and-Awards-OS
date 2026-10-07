INSERT INTO public.taxonomy_options (kind, applies_to, value, label, tone, sort_order, is_active)
VALUES ('status','speaking','deadline_passed','Deadline Passed','muted',14,true),
       ('status','award','deadline_passed','Deadline Passed','muted',13,true)
ON CONFLICT DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS opportunities_unique_name_type
  ON public.opportunities (lower(btrim(name)), type);