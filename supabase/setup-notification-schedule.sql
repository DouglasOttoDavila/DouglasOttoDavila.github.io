-- Run after deploying lab-notifications and setting its secrets.
-- First create Vault secret lab_notification_secret with the SAME random value
-- as the edge secret LAB_NOTIFICATION_SECRET. Use the dashboard or a parameterized
-- management query; never commit the secret or interpolate it into logs.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
do $$
begin
 if not exists(select 1 from vault.secrets where name='lab_notification_secret') then
  raise exception 'Create Vault secret lab_notification_secret before scheduling notifications';
 end if;
 if exists(select 1 from cron.job where jobname='lab-notification-delivery') then
  perform cron.unschedule('lab-notification-delivery');
 end if;
 perform cron.schedule('lab-notification-delivery','* * * * *', $job$
  select net.http_post(
   url := 'https://zlixsxbovbshsyptxymp.supabase.co/functions/v1/lab-notifications',
   headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='lab_notification_secret')),
   body := '{}'::jsonb, timeout_milliseconds := 55000
  );
 $job$);
end; $$;
