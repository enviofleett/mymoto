-- Reset trip_sync_status errors after GPS51 IP limit (8902) fix
-- Run this AFTER deploying sync-trips-incremental fixes and waiting 5+ minutes for GPS51 backoff.
--
-- What this does:
-- - Clears error_message and sets sync_status = 'idle' for devices that failed with 8902
-- - Next cron run will retry those devices (with new abort-on-8902 + backoff logic)

-- Option 1: Reset only devices that failed with "ip limit" / 8902
-- Only sync_status and error_message (current_operation etc. may not exist)
UPDATE trip_sync_status
SET sync_status = 'idle', error_message = NULL
WHERE sync_status = 'error'
  AND (error_message ILIKE '%8902%' OR error_message ILIKE '%ip limit%');

-- Check how many were reset
SELECT COUNT(*) AS reset_count
FROM trip_sync_status
WHERE sync_status = 'idle'
  AND updated_at >= NOW() - INTERVAL '1 minute';

-- Option 2 (optional): Reset ALL devices in error (if you want to retry everything)
-- UPDATE trip_sync_status SET sync_status = 'idle', error_message = NULL WHERE sync_status = 'error';

-- Verify: no remaining 8902 errors
SELECT device_id, sync_status, error_message
FROM trip_sync_status
WHERE sync_status = 'error'
ORDER BY updated_at DESC
LIMIT 20;
