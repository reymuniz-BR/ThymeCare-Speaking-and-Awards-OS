CREATE TABLE IF NOT EXISTS public.job_secrets (
  name text PRIMARY KEY,
  secret text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT ALL ON public.job_secrets TO service_role;

ALTER TABLE public.job_secrets ENABLE ROW LEVEL SECURITY;

-- No policies: unreachable for anon and authenticated users by design.

CREATE TRIGGER job_secrets_updated
  BEFORE UPDATE ON public.job_secrets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.job_secrets (name, secret)
VALUES ('email-digest', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (name) DO NOTHING;