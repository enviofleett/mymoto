# Localhost Testing Setup

## 🚀 Development Server

The development server is configured to run on **port 8080**.

### Access URLs:

- **Local:** http://localhost:8080
- **Network:** http://0.0.0.0:8080 (accessible from other devices on your network)

---

## 📋 Quick Start

### 1. Start the Development Server

```bash
cd /Users/alli/mymoto/fleet-heartbeat-dashboard-6f37655e
npm run dev
```

The server should start automatically and display:
```
  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:8080/
  ➜  Network: http://0.0.0.0:8080/
```

### 2. Open in Browser

Open your browser and navigate to:
**http://localhost:8080**

---

## 🔧 Configuration

### Port Configuration
The server port is configured in `vite.config.ts`:
- **Port:** 8080
- **Host:** `::` (all interfaces)

### Environment Variables
The Supabase client has hardcoded fallbacks, so it should work without a `.env` file:
- `VITE_SUPABASE_URL` (optional - has fallback)
- `VITE_SUPABASE_PUBLISHABLE_KEY` (optional - has fallback)

---

## 🧪 Testing the AI LLM Service

### Step 1: Deploy Instrumented Edge Functions

Before testing locally, deploy the instrumented edge functions:

```bash
# Deploy vehicle-chat function
supabase functions deploy vehicle-chat

# Deploy proactive-alarm-to-chat function
supabase functions deploy proactive-alarm-to-chat
```

### Step 2: Test in Browser

1. Open http://localhost:8080
2. Log in to your account
3. Navigate to a vehicle's chat
4. Send test messages
5. Check the debug log: `.cursor/debug.log`

### Step 3: Monitor Logs

The instrumentation logs will be written to:
```
/Users/alli/mymoto/fleet-heartbeat-dashboard-6f37655e/.cursor/debug.log
```

---

## 📊 What to Test

1. **Chat Message Saving:**
   - Send messages in vehicle chat
   - Verify messages appear and persist after refresh

2. **Language Preference:**
   - Change language in vehicle settings
   - Send messages and verify language consistency

3. **Proactive Notifications:**
   - Create test proactive events
   - Verify they appear in chat

4. **Error Handling:**
   - Test with invalid inputs
   - Verify graceful error messages

---

## 🐛 Troubleshooting

### Server Won't Start

**Port already in use:**
```bash
# Kill process on port 8080
lsof -ti:8080 | xargs kill -9

# Or change port in vite.config.ts
```

**Dependencies missing:**
```bash
npm install
```

### Edge Functions Not Working

- Verify functions are deployed: Check Supabase Dashboard
- Check environment variables: Supabase Dashboard → Edge Functions → Settings
- Check function logs: Supabase Dashboard → Edge Functions → Logs

### Logs Not Appearing

- Verify debug log server is running (should be automatic)
- Check log file path: `.cursor/debug.log`
- Ensure edge functions are deployed with instrumentation

---

## 📝 Next Steps

After testing:
1. Review logs in `.cursor/debug.log`
2. Share logs for analysis
3. Get GO/NO-GO production readiness report

---

**Status:** ✅ Development server ready for testing  
**URL:** http://localhost:8080
