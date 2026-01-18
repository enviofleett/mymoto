# Deploy Proactive Alarm to Chat Edge Function

## Deployment Command

### Option 1: Simple Deployment (if linked to project)
```bash
supabase functions deploy proactive-alarm-to-chat
```

### Option 2: With Project Reference
```bash
supabase functions deploy proactive-alarm-to-chat --project-ref YOUR_PROJECT_REF
```

### Option 3: With Additional Flags (if needed)
```bash
supabase functions deploy proactive-alarm-to-chat --no-verify-jwt
```

---

## Copy & Paste Ready Commands

### 1. Deploy Function
```bash
supabase functions deploy proactive-alarm-to-chat
```

### 2. Verify Deployment (check logs)
```bash
supabase functions logs proactive-alarm-to-chat --limit 10
```

### 3. Test Function Manually (optional)
```bash
curl -X POST 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/proactive-alarm-to-chat' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"event": {"device_id": "13612333441", "event_type": "ignition_on", "severity": "info", "title": "Test", "message": "Test"}}'
```

---

## Quick Deploy Steps

1. **Open Terminal**
   - Navigate to project root: `/Users/alli/mymoto/fleet-heartbeat-dashboard-6f37655e`

2. **Run Deployment**
   ```bash
   supabase functions deploy proactive-alarm-to-chat
   ```

3. **Verify Success**
   - Look for "Deployed successfully" message
   - Check Supabase Dashboard → Edge Functions → `proactive-alarm-to-chat`

4. **Test (Optional)**
   - Use `QUICK_TEST_SCRIPT.sql` to create a test event
   - Verify function behavior in logs

---

## If Deployment Fails

### Check Supabase CLI is installed
```bash
supabase --version
```

### Check you're logged in
```bash
supabase login
```

### Check project is linked
```bash
supabase status
```

### Deploy from project root
```bash
cd /Users/alli/mymoto/fleet-heartbeat-dashboard-6f37655e
supabase functions deploy proactive-alarm-to-chat
```

---

## What to Expect After Deployment

✅ Success message: "Deployed successfully"  
✅ Function appears in Supabase Dashboard  
✅ Function logs available  
✅ Function ready to receive events  

---

## Post-Deployment Verification

### 1. Check Function in Dashboard
- Go to Supabase Dashboard → Edge Functions
- Find `proactive-alarm-to-chat`
- Verify latest deployment timestamp

### 2. Test with SQL (use QUICK_TEST_SCRIPT.sql)
```sql
-- Create test event
INSERT INTO proactive_vehicle_events (device_id, event_type, severity, title, message)
VALUES ('13612333441', 'ignition_on', 'info', 'Test', 'Test message');
```

### 3. Check Function Logs
- Dashboard → Edge Functions → `proactive-alarm-to-chat` → Logs
- Look for execution logs
- Should see preference checks in logs
