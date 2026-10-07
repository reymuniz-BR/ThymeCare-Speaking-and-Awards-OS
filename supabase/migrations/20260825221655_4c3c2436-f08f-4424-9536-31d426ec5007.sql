CREATE TABLE public.webhook_runs (
  name TEXT PRIMARY KEY,
  last_run_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT ALL ON public.webhook_runs TO service_role;

ALTER TABLE public.webhook_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages webhook runs"
  ON public.webhook_runs FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER webhook_runs_updated
  BEFORE UPDATE ON public.webhook_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();