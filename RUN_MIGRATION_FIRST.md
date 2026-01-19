# ⚠️ Migration Required Before Testing

## Error Explanation

The error `column "enable_ai_chat_critical_battery" does not exist` means the migration hasn't been run yet.

## Solution: Run the Migration First

### Step 1: Open Supabase SQL Editor

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Click **New Query**

### Step 2: Run the Migration

Copy and paste the contents of this file into the SQL Editor:
```
supabase/migrations/20260118103411_add_ai_chat_preferences.sql
```

Or run this SQL directly:

```sql
-- Add Granular AI Chat Preferences
ALTER TABLE public.vehicle_notification_preferences
  ADD COLUMN IF NOT EXISTS enable_ai_chat_ignition_on BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_ai_chat_ignition_off BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_ai_chat_low_battery BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_ai_chat_critical_battery BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_ai_chat_overspeeding BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_ai_chat_harsh_braking BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_ai_chat_rapid_acceleration BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_ai_chat_geofence_enter BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_ai_chat_geofence_exit BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_ai_chat_idle_too_long BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_ai_chat_trip_completed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_ai_chat_offline BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_ai_chat_online BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_ai_chat_maintenance_due BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_ai_chat_anomaly_detected BOOLEAN DEFAULT true;

-- Update existing preferences
DO $$
BEGIN
  UPDATE public.vehicle_notification_preferences
  SET
    enable_ai_chat_critical_battery = COALESCE(enable_ai_chat_critical_battery, critical_battery, true),
    enable_ai_chat_offline = COALESCE(enable_ai_chat_offline, offline, true),
    enable_ai_chat_maintenance_due = COALESCE(enable_ai_chat_maintenance_due, maintenance_due, true),
    enable_ai_chat_anomaly_detected = COALESCE(enable_ai_chat_anomaly_detected, anomaly_detected, true)
  WHERE 
    critical_battery = true 
    OR offline = true 
    OR maintenance_due = true 
    OR anomaly_detected = true;
END $$;
```

### Step 3: Verify Migration Ran Successfully

After running the migration, run this query to verify:

```sql
-- Check if columns exist
SELECT 
  column_name,
  data_type,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'vehicle_notification_preferences'
  AND column_name LIKE 'enable_ai_chat_%'
ORDER BY column_name;
```

**Expected Result**: Should show 14 rows with all `enable_ai_chat_*` columns

### Step 4: Run Test Queries

Now you can run `TEST_AI_CHAT_PREFERENCES.sql` safely - it will work after the migration.

## Alternative: Using Supabase CLI

If you have Supabase CLI set up, you can run:

```bash
supabase migration up
```

This will run all pending migrations including the new one.

## Troubleshooting

### "Already exists" errors
- If you see "column already exists", that's fine - the migration uses `IF NOT EXISTS`
- This means the migration was already run

### "Table does not exist"
- Make sure `vehicle_notification_preferences` table exists
- Run the base migration first: `20260117000001_create_vehicle_notification_preferences.sql`

## Next Steps After Migration

1. ✅ Verify columns exist (use test query above)
2. ✅ Test UI component (check vehicle notification settings page)
3. ✅ Deploy edge function: `supabase functions deploy proactive-alarm-to-chat`
4. ✅ Test edge function logic (create test event)
