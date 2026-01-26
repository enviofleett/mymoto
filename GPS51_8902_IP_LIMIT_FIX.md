# GPS51 IP Limit (8902) Fix – What Next

**Error:** `GPS51 querytrips error: ip limit:178.62.14.85 (status: 8902)`  
**Meaning:** GPS51 is rate-limiting or blocking requests from your server IP (`178.62.14.85`).

---

## Fixes Applied

1. **Abort on 8902**  
   When the sync hits IP limit (8902) and exhausts retries, it **stops** processing more devices.  
   Previously it continued to the next device, which also got 8902, and so on.

2. **Start-of-run backoff check**  
   Before processing any device, the sync checks global rate-limit state.  
   If we’re in a 8902 backoff window, the **entire run is skipped** (no GPS51 calls).

3. **Longer 8902 backoff**  
   Backoff after 8902 increased from **60s → 5 minutes**.  
   Reduces repeated calls while the IP is still limited.

4. **Longer delay between devices**  
   Delay between devices increased from **2s → 5 seconds** to lower burst load on GPS51.

5. **Shared `gps51-client`**  
   The same 5‑minute 8902 backoff is used in `_shared/gps51-client.ts` (used by `gps-data`, etc.).

---

## What To Do Next

### 1. Deploy the updated Edge Function

```bash
supabase functions deploy sync-trips-incremental
```

### 2. Wait 5+ minutes

Give GPS51 time to stop limiting your IP.  
During this time, cron may run; if backoff is active, the sync will skip (see **Behavior** below).

### 3. Reset `trip_sync_status` for failed devices

Run in **Supabase SQL Editor**:

```sql
-- Reset devices that failed with 8902
UPDATE trip_sync_status
SET
  sync_status = 'idle',
  error_message = NULL,
  current_operation = NULL,
  sync_progress_percent = NULL,
  updated_at = NOW()
WHERE sync_status = 'error'
  AND (error_message ILIKE '%8902%' OR error_message ILIKE '%ip limit%');
```

Or use the full script: **`RESET_TRIP_SYNC_ERRORS_AFTER_8902.sql`**.

### 4. Let cron retry (or trigger manually)

- **Cron:** Next run (e.g. every 10–15 min) will process devices again, with the new logic.
- **Manual:** Call `sync-trips-incremental` with optional `device_ids` or `force_full_sync` as needed.

---

## New Behavior

| Situation | Behavior |
|----------|----------|
| Start of run, backoff active | Skip entire sync; return `skipped: true`, `reason: "IP limit backoff active"`. |
| Device gets 8902, retries exhausted | Mark that device as `error`, **abort** sync, return `partial: true`, `ip_limit_hit: true`. |
| Next cron run | If still in backoff → skip. If not → process devices with 5s spacing. |

---

## Implemented: Stagger + Fewer Devices per Run

- **Stagger cron:** `gps-data` runs at :00, :15, :30, :45; `sync-trips-incremental` at :05, :20, :35, :50 (never same minute). Apply migration `20260126000000_stagger_gps51_cron.sql`.
- **Fewer devices per run:** Sync-trips processes **max 5 devices per cron run** when syncing “all” from vehicles. Priority: devices in `error` first, then oldest `updated_at` (round-robin over time). Manual invoke with `device_ids` is not capped.

---

## Files Touched

- `supabase/functions/sync-trips-incremental/index.ts` – backoff check, abort on 8902, 5s delay, 5‑min backoff, **max 5 devices per run** (errors first, then oldest).
- `supabase/functions/_shared/gps51-client.ts` – 5‑min 8902 backoff.
- `supabase/migrations/20260126000000_stagger_gps51_cron.sql` – **stagger cron:** gps-data :00/:15/:30/:45, sync-trips :05/:20/:35/:50.
- `RESET_TRIP_SYNC_ERRORS_AFTER_8902.sql` – reset script for 8902-affected devices.
- `GPS51_8902_IP_LIMIT_FIX.md` – this doc.
