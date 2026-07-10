-- Create the `calendar_sync_secret` entry in Supabase Vault before running this file.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'marryday-google-calendar-sync';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end;
$$;

select cron.schedule(
  'marryday-google-calendar-sync',
  '*/5 * * * *',
  $job$
    select net.http_post(
      url := 'https://pjqfeqeyfwzbjqddutki.supabase.co/functions/v1/google-calendar-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-calendar-sync-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'calendar_sync_secret'
          limit 1
        )
      ),
      body := '{"action":"drain"}'::jsonb,
      timeout_milliseconds := 10000
    );
  $job$
);
