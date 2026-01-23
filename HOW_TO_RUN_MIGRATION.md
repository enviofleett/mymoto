# How to Run the vehicle_mileage_details Migration

## Method 1: Using Supabase CLI (Recommended if you have it installed)

### Step 1: Check if Supabase CLI is installed
```bash
supabase --version
```

If you see a version number, you're good to go! If not, install it:
```bash
npm install -g supabase
```

### Step 2: Link to your project (if not already linked)
```bash
# Navigate to your project directory
cd /Users/alli/mymoto/fleet-heartbeat-dashboard-6f37655e

# Link to your Supabase project
supabase link --project-ref cmvpnsqiefbsqkwnraka
```

You'll need your Supabase access token. Get it from:
- https://supabase.com/dashboard/account/tokens

### Step 3: Push the migration
```bash
supabase db push
```

This will apply **all pending migrations** including the `vehicle_mileage_details` table.

---

## Method 2: Using Supabase Dashboard (Easiest - No CLI needed)

### Step 1: Open Supabase Dashboard
1. Go to: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka
2. Click on **SQL Editor** in the left sidebar

### Step 2: Open the migration file
1. In your project, open: `supabase/migrations/20260119000001_create_mileage_detail_table.sql`
2. **Copy the ENTIRE contents** of the file (all 77 lines)

### Step 3: Run the SQL
1. In Supabase SQL Editor, paste the copied SQL
2. Click **Run** (or press Cmd+Enter / Ctrl+Enter)
3. You should see: "Success. No rows returned"

### Step 4: Verify it worked
Run this query to check:
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name = 'vehicle_mileage_details';
```

You should see one row with `vehicle_mileage_details`.

---

## Method 3: Using Terminal (Quick SQL execution)

If you have `psql` or Supabase CLI installed, you can also run:

```bash
# Using Supabase CLI
supabase db execute --file supabase/migrations/20260119000001_create_mileage_detail_table.sql

# Or using psql (if you have database connection string)
psql "your-connection-string" -f supabase/migrations/20260119000001_create_mileage_detail_table.sql
```

---

## Verification

After running the migration, verify it worked:

### Check 1: Table exists
```sql
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'vehicle_mileage_details'
);
```
Should return `true`.

### Check 2: Table structure
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'vehicle_mileage_details'
ORDER BY ordinal_position;
```
Should show all columns like: `id`, `device_id`, `statisticsday`, `mileage`, etc.

### Check 3: RLS is enabled
```sql
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename = 'vehicle_mileage_details';
```
Should show `rowsecurity = true`.

---

## Troubleshooting

### Error: "relation already exists"
The table already exists! You can skip this migration or drop and recreate:
```sql
DROP TABLE IF EXISTS public.vehicle_mileage_details CASCADE;
-- Then run the migration again
```

### Error: "permission denied"
Make sure you're using an account with admin access or the service role key.

### Error: "extension not found"
If you see errors about extensions, they should already be enabled in Supabase. If not, contact Supabase support.

---

## What This Migration Creates

- ✅ `vehicle_mileage_details` table
- ✅ Indexes for efficient queries
- ✅ RLS policies for security
- ✅ Foreign key to `vehicles` table
- ✅ Unique constraint on `(device_id, statisticsday, gps51_record_id)`

After running this, the 404 error will disappear and mileage details will work!
