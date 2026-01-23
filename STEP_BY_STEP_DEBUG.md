# Step-by-Step Debug: Realtime Not Working

## 🔍 Let's Debug Together

Follow these steps and report what you see:

---

## Step 1: Open Vehicle Profile Page

**Navigate to:**
```
http://localhost:5173/owner/vehicle/358657105966092
```

**Question:** Does the page load? Does it show the vehicle map?

---

## Step 2: Open Browser Console

**Press F12** → Go to **Console** tab

**Look for these messages (copy exactly what you see):**

### Expected Messages:
```
[Realtime] 🔵 Setting up subscription for device: 358657105966092
[Realtime] 📡 Subscription status for 358657105966092: SUBSCRIBED
[Realtime] ✅ Successfully subscribed to vehicle_positions updates for 358657105966092
[Realtime] 🎯 Waiting for position updates...
```

**What do you see?**
- [ ] I see all these messages ✅
- [ ] I see some but not all
- [ ] I see error messages (what errors?)
- [ ] I see nothing related to Realtime
- [ ] I see other messages (what?)

**Please copy/paste the exact console messages you see.**

---

## Step 3: Check Network Tab

**Go to:** DevTools → **Network** tab

**Filter by:** Type "WS" (WebSocket)

**What do you see?**
- [ ] WebSocket connection to Supabase (what URL?)
- [ ] Connection status: "101 Switching Protocols" ✅
- [ ] Connection failed or closed ❌
- [ ] No WebSocket connection at all ❌

**What is the status of the WebSocket?**

---

## Step 4: Check for Errors

**In Console tab, look for RED error messages:**

**What errors do you see?**
- [ ] No errors ✅
- [ ] JavaScript errors (what?)
- [ ] Network errors (what?)
- [ ] Supabase errors (what?)
- [ ] Other errors (what?)

**Please copy/paste any error messages.**

---

## Step 5: Test While Page is Open

**Keep the page open and console visible:**

1. **Run this SQL in Supabase SQL Editor:**
   ```sql
   UPDATE vehicle_positions 
   SET 
     latitude = latitude + 0.0001,
     longitude = longitude + 0.0001,
     cached_at = NOW()
   WHERE device_id = '358657105966092';
   ```

2. **Watch console immediately** (within 1-2 seconds)

**What happens?**
- [ ] Console shows `[Realtime] Position update received` ✅
- [ ] Console shows nothing ❌
- [ ] Console shows error ❌
- [ ] Map marker moves ✅
- [ ] Map marker doesn't move ❌

**What do you see in console after running SQL?**

---

## Step 6: Check Device Assignment

**Run this SQL to verify user has access:**

```sql
-- Check if device is assigned to any profile
SELECT 
  va.device_id,
  va.profile_id,
  p.name as profile_name,
  p.user_id
FROM vehicle_assignments va
LEFT JOIN profiles p ON p.id = va.profile_id
WHERE va.device_id = '358657105966092';
```

**What does this return?**
- [ ] Device is assigned ✅
- [ ] Device is NOT assigned ❌
- [ ] Error (what error?)

---

## Step 7: Verify User Authentication

**In browser console, run:**

```javascript
// Check if user is authenticated
const { data: { session } } = await supabase.auth.getSession();
console.log('Session:', session?.user?.id);
```

**What do you see?**
- [ ] User ID shown ✅
- [ ] null or undefined ❌
- [ ] Error (what error?)

---

## 📋 Quick Diagnostic Checklist

**Please check each:**

- [ ] Page URL is correct: `/owner/vehicle/358657105966092`
- [ ] Page loads without errors
- [ ] Console shows "Setting up subscription"
- [ ] Console shows "Successfully subscribed"
- [ ] WebSocket connection exists
- [ ] WebSocket status is "101"
- [ ] No JavaScript errors
- [ ] User is authenticated
- [ ] Device is assigned to user (or user is admin)

---

## 🎯 Most Likely Issues

### Issue 1: Subscription Not Establishing
**Symptoms:** No console messages about subscription
**Check:** Console for errors, verify hook is called

### Issue 2: WebSocket Disconnected
**Symptoms:** Subscription shows but no updates
**Check:** Network tab → WebSocket status

### Issue 3: RLS Blocking
**Symptoms:** Subscription works but updates blocked
**Check:** User authentication and device assignment

### Issue 4: Update Happened Before Page Opened
**Symptoms:** No update message for old update
**Fix:** Test with new update while page is open

---

## 📝 Report Back

**Please share:**

1. **Console messages** (copy/paste)
2. **WebSocket status** (from Network tab)
3. **Any errors** (copy/paste)
4. **What happens** when you run SQL update with page open
5. **Device assignment** result (from SQL query)

**With this info, I can pinpoint the exact issue!** 🔧
