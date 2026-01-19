# 🧪 QUICK TEST & MONITOR GUIDE
## Test Your Retry System in 5 Minutes

---

## 🎯 **STEP 1: Test the System** (2 minutes)

### **Run the Test Script**

**Open**: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/sql/new

**Copy and Run**: `TEST_RETRY_SYSTEM.sql`

**What it does**:
1. ✅ Creates a test proactive event
2. ✅ Waits 5 seconds for processing
3. ✅ Checks if notification was created
4. ✅ Checks if chat message was posted
5. ✅ Checks for any errors
6. ✅ Provides test summary

**Expected Results**:
- ✅ Event created with `notified = true`
- ✅ Chat message created with `is_proactive = true`
- ✅ No errors in `edge_function_errors` table
- ✅ Test result: "✅ TEST PASSED"

---

## 📊 **STEP 2: Check System Health** (1 minute)

### **Run the Monitoring Dashboard**

**Copy and Run**: `MONITORING_DASHBOARD.sql`

**What it shows**:
1. ✅ System overview (cron job status, tables)
2. ✅ Cron job execution stats (last 24 hours)
3. ✅ Notification success rate
4. ✅ Failed events status
5. ✅ Top failing event types
6. ✅ Recent errors
7. ✅ System health score
8. ✅ Recommendations

**Expected Results**:
- ✅ Cron job: ACTIVE
- ✅ Notification success rate: > 90%
- ✅ Health status: "✅ EXCELLENT" or "✅ GOOD"

---

## 🔍 **STEP 3: Monitor Cron Job Execution** (2 minutes)

### **Check if Cron Job Has Run**

```sql
-- Check recent cron job executions
WITH retry_job AS (
  SELECT jobid FROM cron.job 
  WHERE command LIKE '%retry-failed-notifications%' 
  AND active = true 
  ORDER BY jobid DESC 
  LIMIT 1
)
SELECT 
  runid,
  status,
  start_time,
  end_time,
  return_message,
  CASE 
    WHEN status = 'succeeded' THEN '✅ SUCCESS'
    WHEN status = 'failed' THEN '❌ FAILED'
    WHEN status = 'running' THEN '⏳ RUNNING'
    ELSE '⚠️ ' || status
  END as status_display
FROM cron.job_run_details jrd
CROSS JOIN retry_job rj
WHERE jrd.jobid = rj.jobid
ORDER BY jrd.start_time DESC
LIMIT 5;
```

**Note**: It may take up to 15 minutes for the first execution (cron runs every 15 minutes).

---

## 🎯 **QUICK CHECKS**

### **Check 1: Is Cron Job Active?**
```sql
SELECT jobid, schedule, active 
FROM cron.job 
WHERE command LIKE '%retry-failed-notifications%';
```

### **Check 2: Any Failed Events?**
```sql
SELECT 
  COUNT(*) as pending_retries,
  COUNT(*) FILTER (WHERE retry_count < 3) as can_retry,
  COUNT(*) FILTER (WHERE retry_count >= 3) as max_retries
FROM edge_function_errors
WHERE resolved = false;
```

### **Check 3: Notification Success Rate?**
```sql
SELECT 
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE notified = true) as successful,
  ROUND(100.0 * COUNT(*) FILTER (WHERE notified = true) / COUNT(*), 2) as success_rate
FROM proactive_vehicle_events
WHERE created_at >= now() - INTERVAL '24 hours';
```

---

## 📋 **DAILY MONITORING CHECKLIST**

### **Morning Check** (5 minutes):
1. ✅ Run `MONITORING_DASHBOARD.sql`
2. ✅ Check system health score
3. ✅ Review any recommendations
4. ✅ Check for max retries reached

### **Weekly Review** (10 minutes):
1. ✅ Review notification success rate trends
2. ✅ Check top failing event types
3. ✅ Review error messages for patterns
4. ✅ Optimize retry intervals if needed

---

## 🚨 **ALERT THRESHOLDS**

### **⚠️ WARNING** (Take Action):
- Notification success rate < 90%
- Pending retries > 50
- Max retries reached > 10

### **❌ CRITICAL** (Fix Immediately):
- Cron job not active
- Notification success rate < 80%
- Max retries reached > 50

---

## 🎉 **SUCCESS INDICATORS**

### **✅ System is Healthy When**:
- Cron job: ACTIVE
- Notification success rate: > 95%
- Pending retries: < 10
- Max retries reached: < 5
- Health status: "✅ EXCELLENT" or "✅ GOOD"

---

## 📝 **TROUBLESHOOTING**

### **Issue: Test Failed**
**Check**:
1. Edge function logs: `supabase functions logs proactive-alarm-to-chat --tail 50`
2. Database settings: `SELECT * FROM pg_settings WHERE name LIKE 'app.settings.%';`
3. Trigger status: `SELECT * FROM information_schema.triggers WHERE trigger_name = 'trigger_alarm_to_chat';`

### **Issue: Cron Job Not Running**
**Check**:
1. Job active: `SELECT * FROM cron.job WHERE jobid = 15;`
2. Recent executions: See Step 3 above
3. Database settings: Service role key must be set

### **Issue: Many Failed Events**
**Check**:
1. Error messages: `SELECT error_message FROM edge_function_errors WHERE resolved = false LIMIT 10;`
2. Edge function logs
3. Network connectivity
4. Service role key validity

---

## 🔗 **QUICK LINKS**

- **SQL Editor**: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/sql/new
- **Edge Functions**: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/functions
- **Function Logs**: Use Supabase CLI: `supabase functions logs retry-failed-notifications --tail 50`

---

**Total Time**: ~5 minutes for initial test  
**Daily Monitoring**: ~5 minutes  
**Status**: ✅ Ready to test!
