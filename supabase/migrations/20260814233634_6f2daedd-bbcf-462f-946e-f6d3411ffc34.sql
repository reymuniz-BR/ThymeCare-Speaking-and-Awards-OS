-- Remove duplicate empty HIMSS drafts, keeping the most recent one per opportunity.
WITH ranked AS (
  SELECT s.id,
         row_number() OVER (PARTITION BY s.opportunity_id ORDER BY s.updated_at DESC, s.created_at DESC) AS rn
  FROM public.submissions s
),
dupes AS (
  SELECT r.id FROM ranked r
  WHERE r.rn > 1
    AND NOT EXISTS (SELECT 1 FROM public.submission_fields f WHERE f.submission_id = r.id AND btrim(f.answer) <> '')
)
DELETE FROM public.submissions WHERE id IN (SELECT id FROM dupes);