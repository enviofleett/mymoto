# Troubleshooting Notification Settings Error

## Error: "Failed to load notification preferences"

If you're seeing this error, check the following:

### 1. Check Browser Console
Open browser DevTools (F12) and check the Console tab for detailed error messages. Look for:
- Error codes (PGRST301, 23503, 42P01, etc.)
- Error messages
- Stack traces

### 2. Verify Database Migration
Run this SQL in Supabase SQL Editor to check if the table exists:

```sql
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'vehicle_notification_preferences'
);
```

If it returns `false`, run the migration:
```sql
-- File: supabase/migrations/20260117000001_create_vehicle_notification_preferences.sql
```

### 3. Check RLS Policies
Verify RLS policies exist:

```sql
SELECT * FROM pg_policies 
WHERE tablename = 'vehicle_notification_preferences';
```

You should see:
- "Users can manage their own vehicle notification preferences"
- "Service role can read all vehicle notification preferences"

### 4. Check Foreign Key Constraints
Verify the vehicle exists:

```sql
SELECT device_id FROM vehicles WHERE device_id = 'YOUR_DEVICE_ID';
```

If no rows returned, the device_id doesn't exist in the vehicles table.

### 5. Check User Authentication
Verify you're authenticated:

```sql
SELECT auth.uid();  -- Should return your user ID
```

### 6. Test Direct Query
Try querying the table directly:

```sql
SELECT * FROM vehicle_notification_preferences 
WHERE user_id = auth.uid() 
AND device_id = 'YOUR_DEVICE_ID';
```

If this fails, check:
- RLS policies
- Foreign key constraints
- Table permissions

### Common Error Codes

- **PGRST116**: No rows returned (this is OK - means no preferences exist yet)
- **PGRST301**: Permission denied (RLS policy issue)
- **23503**: Foreign key violation (device_id doesn't exist in vehicles table)
- **42P01**: Table doesn't exist (migration not run)

### Quick Fix

If the table doesn't exist, run the migration file:
```sql
-- Copy and paste the entire content of:
-- supabase/migrations/20260117000001_create_vehicle_notification_preferences.sql
```

Then refresh the page and try again.
