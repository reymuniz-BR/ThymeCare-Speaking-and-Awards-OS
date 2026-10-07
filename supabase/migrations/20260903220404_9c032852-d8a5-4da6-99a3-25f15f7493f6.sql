select cron.unschedule('discover-daily');

select cron.schedule(
  'discover-weekly',
  '0 11 * * 1',
  $$
  select net.http_post(
    url := 'https://project--2183e766-3a7e-4b5f-965b-a450428b6dfe.lovable.app/api/public/hooks/discover-daily',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-job-secret', (select secret from public.job_secrets where name = 'discover-daily')
    ),
    body := '{}'::jsonb
  );
  $$
);