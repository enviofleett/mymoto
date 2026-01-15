# How to Run the Disk I/O Optimization Migration

## Option 1: Using Supabase CLI (Recommended)

If you have Supabase CLI installed:

```bash
# Make sure you're in the project root
cd /Users/alli/mymoto/fleet-heartbeat-dashboard-6f37655e

# Link to your Supabase project (if not already linked)
supabase link --project-ref cmvpnsqiefbsqkwnraka

# Push the migration
supabase db push
```

Or run the specific migration:

```bash
supabase migration up
```

---

## Option 2: Using psql (Direct Database Connection)

If you have `psql` installed and your database connection string:

```bash
# Get your database connection string from Supabase Dashboard:
# Settings → Database → Connection string → URI

# Then run:
psql "postgresql://postgres:[YOUR-PASSWORD]@db.cmvpnsqiefbsqkwnraka.supabase.co:5432/postgres" \
  -f supabase/migrations/20260115000002_optimize_disk_io_indexes.sql
```

Or connect interactively:

```bash
psql "postgresql://postgres:[YOUR-PASSWORD]@db.cmvpnsqiefbsqkwnraka.supabase.co:5432/postgres"

# Then paste the SQL content
\i supabase/migrations/20260115000002_optimize_disk_io_indexes.sql
```

---

## Option 3: Using Supabase Dashboard (Easiest)

1. Go to: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/sql
2. Click "New Query"
3. Copy the entire content of `supabase/migrations/20260115000002_optimize_disk_io_indexes.sql`
4. Paste into the SQL editor
5. Click "Run"

---

## Option 4: Using curl with Supabase REST API

```bash
# Get your Supabase service role key from Dashboard
# Settings → API → service_role key

curl -X POST \
  'https://cmvpnsqiefbsqkwnraka.supabase.co/rest/v1/rpc/exec_sql' \
  -H 'apikey: YOUR_SERVICE_ROLE_KEY' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "CREATE INDEX IF NOT EXISTS idx_chat_history_device_created_30day ON vehicle_chat_history(device_id, created_at DESC) WHERE created_at >= NOW() - INTERVAL '\''30 days'\''; ..."
  }'
```

**Note:** This requires creating an RPC function first, so it's more complex.

---

## Quick Check: Verify Indexes Were Created

After running the migration, verify with:

```sql
-- Check if indexes exist
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE indexname LIKE 'idx_%'
  AND schemaname = 'public'
ORDER BY tablename, indexname;
```

You should see all 10 indexes listed.

---

## Recommended Approach

**For your project, I recommend Option 3 (Supabase Dashboard)** because:
- ✅ No CLI installation needed
- ✅ Visual confirmation of success
- ✅ Easy to see any errors
- ✅ Can verify indexes immediately after

The SQL file is safe to run multiple times (uses `IF NOT EXISTS`), so if an index already exists, it won't error.
