-- One row per (digest_key, recipient): guarantees an email is only ever sent once.
DELETE FROM public.email_digest_log a
USING public.email_digest_log b
WHERE a.ctid < b.ctid
  AND a.digest_key = b.digest_key
  AND coalesce(a.recipient,'') = coalesce(b.recipient,'');

CREATE UNIQUE INDEX IF NOT EXISTS email_digest_log_key_recipient_idx
  ON public.email_digest_log (digest_key, coalesce(recipient, ''));

-- Allow server-side jobs to record sends.
GRANT SELECT, INSERT, UPDATE ON public.email_digest_log TO service_role;

INSERT INTO public.webhook_runs (name, last_run_at)
VALUES ('email-digest', now() - interval '7 days')
ON CONFLICT DO NOTHING;