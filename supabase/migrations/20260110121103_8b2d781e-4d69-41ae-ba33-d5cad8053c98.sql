-- Schedule the process-trips edge function to run every 5 minutes
SELECT cron.schedule(
  'process-vehicle-trips',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
      url := 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/process-trips',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtdnBuc3FpZWZic3Frd25yYWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MjIwMDEsImV4cCI6MjA4MzI5ODAwMX0.nJLb5znjUiGsCk_S2QubhBtqIl3DB3I8LbZihIMJdwo"}'::jsonb,
      body := '{"lookback_hours": 2}'::jsonb
  ) AS request_id;
  $$
);