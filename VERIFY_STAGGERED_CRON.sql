-- Verify staggered GPS51 cron jobs
-- Run in Supabase SQL Editor. Expected: sync-gps-data at :00/:15/:30/:45, auto-sync-trips-staggered at :05/:20/:35/:50

SELECT
  jobid,
  jobname,
  schedule,
  active,
  CASE
    WHEN jobname = 'sync-gps-data'           AND schedule = '0,15,30,45 * * * *'  THEN 'OK (gps-data)'
    WHEN jobname = 'auto-sync-trips-staggered' AND schedule = '5,20,35,50 * * * *' THEN 'OK (sync-trips)'
    WHEN jobname IN ('sync-gps-data', 'auto-sync-trips-staggered')                 THEN 'CHECK schedule'
    ELSE 'other'
  END AS check_
FROM cron.job
WHERE jobname IN ('sync-gps-data', 'auto-sync-trips-staggered')
ORDER BY jobname;
