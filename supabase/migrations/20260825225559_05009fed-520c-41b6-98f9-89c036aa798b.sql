ALTER TABLE public.speakers
  ADD COLUMN IF NOT EXISTS organization text,
  ADD COLUMN IF NOT EXISTS is_external boolean NOT NULL DEFAULT false;