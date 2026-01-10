-- Schedule the predictive-briefing cron job to run every hour at minute 30
-- This runs 30 minutes before the top of the hour to catch trips starting at :00
SELECT cron.schedule(
  'predictive-briefing-hourly',
  '30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/predictive-briefing',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtdnBuc3FpZWZic3Frd25yYWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MjIwMDEsImV4cCI6MjA4MzI5ODAwMX0.nJLb5znjUiGsCk_S2QubhBtqIl3DB3I8LbZihIMJdwo"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);