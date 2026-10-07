ALTER TABLE public.discoveries
  ADD COLUMN IF NOT EXISTS application_url text,
  ADD COLUMN IF NOT EXISTS event_date date,
  ADD COLUMN IF NOT EXISTS categories text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS confidence text NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS research_notes text;

ALTER TYPE public.discovery_status ADD VALUE IF NOT EXISTS 'researching';
ALTER TYPE public.discovery_status ADD VALUE IF NOT EXISTS 'duplicate';