ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS client_approval text NOT NULL DEFAULT 'needs_approval';

ALTER TABLE public.opportunities
  DROP CONSTRAINT IF EXISTS opportunities_client_approval_check;

ALTER TABLE public.opportunities
  ADD CONSTRAINT opportunities_client_approval_check
  CHECK (client_approval IN ('needs_approval','proposed','approved','declined'));