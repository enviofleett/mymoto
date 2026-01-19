# Morning Briefing Fix Instructions

## Issue
The cron job calls the function with `trigger: 'scheduled'` but the function only returns device_ids instead of processing them.

## Error You're Seeing
If you tried to run code from the audit report, that's documentation (not executable code). The audit report uses TypeScript comments (`//`) which are not valid SQL.

## Actual Fix Required

### Step 1: Update the Edge Function

**File:** `supabase/functions/morning-briefing/index.ts`

1. **Add the helper function** (after line 441, before the `serve` function):
   - See `FIX_MORNING_BRIEFING_BATCH_PROCESSING.ts` for the complete helper function code

2. **Replace lines 457-504** with the new batch processing logic:
   - The new code actually processes all vehicles instead of just returning IDs

### Step 2: Test the Fix

**Manual Test:**
```bash
curl -X POST 'https://YOUR_PROJECT.supabase.co/functions/v1/morning-briefing' \
  -H 'Authorization: Bearer YOUR_SERVICE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"trigger": "scheduled"}'
```

**Expected Response:**
```json
{
  "message": "Morning briefing batch processing complete",
  "vehicles_found": 5,
  "vehicles_succeeded": 5,
  "vehicles_failed": 0,
  "users_notified": 8
}
```

### Step 3: Verify Cron Job

The cron job should automatically call the function at 7 AM UTC daily. The fix allows it to process all vehicles.

## Files to Edit

1. **`supabase/functions/morning-briefing/index.ts`**
   - Add `processMorningBriefingForVehicle` helper function
   - Replace lines 457-504 with new batch processing logic

## Reference

See `FIX_MORNING_BRIEFING_BATCH_PROCESSING.ts` for the complete code changes.
