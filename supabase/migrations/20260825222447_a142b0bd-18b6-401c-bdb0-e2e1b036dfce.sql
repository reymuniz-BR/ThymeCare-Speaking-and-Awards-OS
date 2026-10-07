-- Resolve any pre-existing duplicates before adding the constraint.
WITH renumbered AS (
  SELECT id, row_number() OVER (PARTITION BY field_id ORDER BY created_at, id) AS rn
  FROM public.submission_answer_versions
)
UPDATE public.submission_answer_versions v
SET version = r.rn
FROM renumbered r
WHERE v.id = r.id AND v.version IS DISTINCT FROM r.rn;

ALTER TABLE public.submission_answer_versions
  ALTER COLUMN version SET DEFAULT 0;

CREATE OR REPLACE FUNCTION public.assign_answer_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.version IS NULL OR NEW.version <= 0 THEN
    -- Serialize concurrent inserts for the same field so numbering can't collide.
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.field_id::text, 0));
    SELECT COALESCE(MAX(version), 0) + 1 INTO NEW.version
    FROM public.submission_answer_versions
    WHERE field_id = NEW.field_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS submission_answer_versions_assign_version ON public.submission_answer_versions;
CREATE TRIGGER submission_answer_versions_assign_version
  BEFORE INSERT ON public.submission_answer_versions
  FOR EACH ROW EXECUTE FUNCTION public.assign_answer_version();

ALTER TABLE public.submission_answer_versions
  ADD CONSTRAINT submission_answer_versions_field_version_key UNIQUE (field_id, version);