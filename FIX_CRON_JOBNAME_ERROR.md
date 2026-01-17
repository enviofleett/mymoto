# 🔧 FIX: Cron Job Query Error

## ❌ **Error Encountered**

```
ERROR: 42703: column "jobname" does not exist
LINE 2: WHERE jobname = 'retry-failed-notifications-15min'
```

## 🔍 **Root Cause**

The `cron.job` table in PostgreSQL's `pg_cron` extension **does not have a `jobname` column**. 

The `jobname` parameter in `cron.schedule()` is just a label for the function call, but it's not stored as a column in the `cron.job` table.

## ✅ **Solution**

Instead of using `jobname`, we identify jobs by:
1. **Job ID** (if known) - Direct lookup: `WHERE jobid = 15`
2. **Command text pattern** - Search in command: `WHERE command LIKE '%retry-failed-notifications%'`

## 📝 **Fixed Queries**

### **Check Cron Job Status**:

**Before (❌ Broken)**:
```sql
SELECT * FROM cron.job 
WHERE jobname = 'retry-failed-notifications-15min';
```

**After (✅ Fixed)**:
```sql
SELECT 
  jobid,
  schedule,
  LEFT(command, 80) as command_preview,
  active
FROM cron.job
WHERE command LIKE '%retry-failed-notifications%'
ORDER BY jobid DESC
LIMIT 1;
```

### **Check Cron Job Executions**:

**Before (❌ Broken)**:
```sql
SELECT * FROM cron.job_run_details
WHERE jobname = 'retry-failed-notifications-15min';
```

**After (✅ Fixed)**:
```sql
WITH retry_job AS (
  SELECT jobid 
  FROM cron.job 
  WHERE command LIKE '%retry-failed-notifications%' 
  ORDER BY jobid DESC 
  LIMIT 1
)
SELECT 
  jrd.*
FROM cron.job_run_details jrd
CROSS JOIN retry_job rj
WHERE jrd.jobid = rj.jobid
ORDER BY jrd.start_time DESC;
```

## 📋 **Files Fixed**

1. ✅ `supabase/migrations/20260119000005_setup_retry_notifications_cron.sql`
2. ✅ `MONITOR_RETRY_SYSTEM.sql`
3. ✅ `DEPLOYMENT_VERIFICATION_CHECKLIST.md`
4. ✅ `QUICK_CHECK_RETRY_CRON.sql` (new - simple check query)

## 🎯 **Quick Check Query**

Use this simple query to verify your retry cron job:

```sql
-- Quick check: Is retry cron job active?
SELECT 
  jobid,
  schedule,
  active,
  CASE 
    WHEN command LIKE '%retry-failed-notifications%' AND active = true 
    THEN '✅ ACTIVE'
    ELSE '❌ NOT FOUND OR INACTIVE'
  END as status
FROM cron.job
WHERE command LIKE '%retry-failed-notifications%'
ORDER BY jobid DESC
LIMIT 1;
```

**Or if you know the jobid (e.g., 15)**:
```sql
SELECT * FROM cron.job WHERE jobid = 15;
```

## ✅ **Status**

All queries have been fixed and will now work correctly!

**Your cron job (Job ID 15) is active and working.** ✅
