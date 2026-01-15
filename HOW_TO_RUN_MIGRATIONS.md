# How to Run SQL Migrations in Supabase

## Step-by-Step Guide

### Option 1: Using Supabase SQL Editor (Recommended)

1. **Open Supabase Dashboard**
   - Go to https://supabase.com/dashboard
   - Select your project

2. **Navigate to SQL Editor**
   - Click on **"SQL Editor"** in the left sidebar
   - Click **"New Query"** button (top right)

3. **Run Each Migration**

   **Migration 1: Fix RLS Policies**
   - Open file: `supabase/migrations/20260114000003_fix_alarm_rls_policies.sql`
   - **Copy ALL the SQL content** (not the filename!)
   - Paste into the SQL Editor
   - Click **"Run"** button (or press Cmd/Ctrl + Enter)
   - Wait for "Success. No rows returned" message

   **Migration 2: Add Proactive Chat Columns**
   - Open file: `supabase/migrations/20260114000005_add_proactive_chat_columns.sql`
   - **Copy ALL the SQL content**
   - Paste into the SQL Editor (clear previous query first)
   - Click **"Run"**
   - Wait for "Success. No rows returned" message

   **Migration 3: Create Alarm-to-Chat Trigger**
   - Open file: `supabase/migrations/20260114000004_trigger_alarm_to_chat.sql`
   - **Copy ALL the SQL content**
   - Paste into the SQL Editor (clear previous query first)
   - Click **"Run"**
   - Wait for "Success. No rows returned" message

### Option 2: Using Supabase CLI (If Installed)

```bash
# Make sure you're in the project directory
cd /Users/alli/mymoto/fleet-heartbeat-dashboard-6f37655e

# Link to your Supabase project (if not already linked)
supabase link --project-ref YOUR_PROJECT_REF

# Push all migrations
supabase db push
```

### Option 3: Run All Migrations in One Query

You can also combine all three migrations into one query:

1. Open all three migration files
2. Copy the content from each file
3. Paste them in order (1, 2, 3) into SQL Editor
4. Separate each migration with a blank line or comment
5. Click "Run" once

---

## Important Notes

### ✅ What "Success. No rows returned" Means
- This is **NORMAL** for DDL statements (CREATE, ALTER, DROP)
- It means the migration ran successfully
- No data rows are returned because these are schema changes

### ⚠️ If Migration 3 Fails

If you get an error about `net.http_post` or `net` extension:

1. **Check if net extension is enabled:**
   ```sql
   SELECT * FROM pg_extension WHERE extname = 'net';
   ```

2. **If not enabled, enable it:**
   ```sql
   CREATE EXTENSION IF NOT EXISTS net;
   ```

3. **If extension is not available:**
   - Skip Migration 3 for now
   - Use `DEPLOY_MIGRATIONS_ALTERNATIVE.sql` instead
   - Set up Supabase webhooks (see alternative file for instructions)

### 🔍 Verify Migrations Ran Successfully

After running all migrations, verify they worked:

```sql
-- Check RLS policies were updated
SELECT * FROM pg_policies WHERE tablename = 'proactive_vehicle_events';

-- Check new columns exist
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'vehicle_chat_history' 
AND column_name IN ('is_proactive', 'alert_id');

-- Check trigger exists
SELECT * FROM pg_trigger WHERE tgname = 'trigger_alarm_to_chat';
```

---

## Troubleshooting

### Error: "relation does not exist"
- Make sure you're running migrations in the correct database
- Check that the table exists first

### Error: "permission denied"
- Make sure you're using the correct database user
- Check RLS policies aren't blocking the operation

### Error: "syntax error"
- Make sure you copied the **entire** SQL content
- Don't copy the filename, only the SQL code
- Check for any missing semicolons

---

## Quick Reference

**Files to run:**
1. `supabase/migrations/20260114000003_fix_alarm_rls_policies.sql`
2. `supabase/migrations/20260114000005_add_proactive_chat_columns.sql`
3. `supabase/migrations/20260114000004_trigger_alarm_to_chat.sql`

**Where to run:** Supabase Dashboard → SQL Editor → New Query

**Expected result:** "Success. No rows returned" for each migration
