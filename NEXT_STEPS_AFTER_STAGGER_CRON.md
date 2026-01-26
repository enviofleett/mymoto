# Next Steps After Staggered Cron

Cron is verified: **sync-gps-data** :00/:15/:30/:45, **auto-sync-trips-staggered** :05/:20/:35/:50.

---

## 1. Deploy `sync-trips-incremental` (if not already)

The function has **max 5 devices per run**, **abort on 8902**, **5 min backoff**, **5s delay** between devices.

```bash
cd /Users/alli/mymoto/fleet-heartbeat-dashboard-6f37655e
supabase functions deploy sync-trips-incremental
```

---

## 2. Reset 8902 errors (optional)

Clear `error` status for devices that failed with IP limit so they get retried:

```sql
UPDATE trip_sync_status
SET sync_status = 'idle', error_message = NULL
WHERE sync_status = 'error'
  AND (error_message ILIKE '%8902%' OR error_message ILIKE '%ip limit%');
```

Run in **Supabase SQL Editor**. Or use `RESET_TRIP_SYNC_ERRORS_AFTER_8902.sql`.

---

## 3. Monitor

- **Cron:** `sync-gps-data` and `auto-sync-trips-staggered` run every 15 min, offset by 5 min.
- **Trip sync:** Up to 5 devices per run (errors first, then oldest). Remaining devices rotate over later runs.
- **8902:** If hit, sync aborts that run and skips the next run(s) during 5 min backoff.

Check `trip_sync_status` after a few runs:

```sql
SELECT device_id, sync_status, error_message, updated_at
FROM trip_sync_status
WHERE sync_status = 'error'
ORDER BY updated_at DESC
LIMIT 20;
```

Expect fewer 8902 errors. If some devices stay in `error`, rerun the reset (step 2) and keep monitoring.

---

## 4. Optional: manual sync for specific devices

```sql
SELECT trigger_trip_sync('DEVICE_ID_HERE', false);
-- or all devices (still subject to max 5 per run when invoked via cron):
-- SELECT trigger_trip_sync(NULL, false);
```

---

**Summary:** Deploy the function → (optional) reset 8902 errors → monitor `trip_sync_status` and logs.
