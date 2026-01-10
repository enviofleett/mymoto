-- Schedule cron job to check for offline vehicles every 15 minutes
SELECT cron.schedule(
  'check-offline-vehicles',
  '*/15 * * * *',
  $$
  SELECT
    net.http_post(
        url:='https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/check-offline-vehicles',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtdnBuc3FpZWZic3Frd25yYWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MjIwMDEsImV4cCI6MjA4MzI5ODAwMX0.nJLb5znjUiGsCk_S2QubhBtqIl3DB3I8LbZihIMJdwo"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
  $$
);