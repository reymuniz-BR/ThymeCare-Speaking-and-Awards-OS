ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS deadline_time time,
  ADD COLUMN IF NOT EXISTS deadline_timezone text;

INSERT INTO public.job_secrets (name, secret)
VALUES ('calendar-feed', encode(gen_random_bytes(24), 'hex'))
ON CONFLICT (name) DO NOTHING;