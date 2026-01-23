# Debug: Missing Realtime Subscription Logs

## 🔍 Issue Found

**Console shows:**
- ✅ GlobalAlertListener subscribing (for `proactive_vehicle_events`)
- ✅ VehicleLocationMap loading
- ✅ useVehicleLiveData fetching
- ❌ **NO `[Realtime]` messages for `vehicle_positions` subscription**

**Expected but missing:**
```
[Realtime] 🔵 Setting up subscription for device: 358657105966092
[Realtime] 📡 Subscription status for 358657105966092: SUBSCRIBED
[Realtime] ✅ Successfully subscribed to vehicle_positions updates
```

---

## 🐛 Possible Causes

### 1. Hook Not Running
**Check:** Is `useRealtimeVehicleUpdates` hook actually executing?

**Add temporary log:**
```typescript
// In OwnerVehicleProfile/index.tsx, line 81
console.log('[DEBUG] About to call useRealtimeVehicleUpdates with deviceId:', deviceId);
useRealtimeVehicleUpdates(deviceId);
console.log('[DEBUG] useRealtimeVehicleUpdates called');
```

### 2. DeviceId Check Failing
**Check:** Is deviceId null/undefined when hook runs?

**The hook checks:**
```typescript
if (!deviceId) {
  console.log(`[Realtime] Skipping subscription - deviceId is null/undefined`);
  return;
}
```

**If you see "Skipping subscription":** deviceId is null

### 3. Console Filter Hiding Messages
**Check:** Console filter settings
- Make sure "All levels" is selected
- Check if `[Realtime]` prefix is being filtered
- Try searching console for "Realtime"

### 4. Hook Dependency Issue
**Check:** useEffect dependencies

The hook uses: `[deviceId, queryClient]`

**If deviceId changes or queryClient changes:** Hook re-runs

---

## 🔧 Quick Fixes to Try

### Fix 1: Add Debug Logging

**In `src/pages/owner/OwnerVehicleProfile/index.tsx`:**

Add before line 81:
```typescript
console.log('[DEBUG] deviceId before hook:', deviceId);
console.log('[DEBUG] deviceId type:', typeof deviceId);
console.log('[DEBUG] deviceId truthy?', !!deviceId);
```

### Fix 2: Check Hook Import

**Verify import on line 33:**
```typescript
import { useRealtimeVehicleUpdates } from "@/hooks/useRealtimeVehicleUpdates";
```

**Check:** Is this import working? No errors?

### Fix 3: Check for Errors

**Look in console for:**
- JavaScript errors
- React errors
- Import errors
- Hook execution errors

---

## 🧪 Test: Add Explicit Logging

**Modify `src/hooks/useRealtimeVehicleUpdates.ts`:**

Add at the very start of the hook:
```typescript
export function useRealtimeVehicleUpdates(deviceId: string | null) {
  console.log('[DEBUG useRealtimeVehicleUpdates] Hook called with deviceId:', deviceId);
  console.log('[DEBUG useRealtimeVehicleUpdates] deviceId type:', typeof deviceId);
  console.log('[DEBUG useRealtimeVehicleUpdates] deviceId truthy?', !!deviceId);
  
  const queryClient = useQueryClient();

  useEffect(() => {
    console.log('[DEBUG useRealtimeVehicleUpdates] useEffect running, deviceId:', deviceId);
    // ... rest of code
```

**This will help identify:**
- Is hook being called?
- Is deviceId valid?
- Is useEffect running?

---

## 📋 Diagnostic Checklist

**Check console for:**

- [ ] `[DEBUG] deviceId before hook:` message
- [ ] `[DEBUG useRealtimeVehicleUpdates] Hook called` message
- [ ] `[Realtime] Skipping subscription` message (means deviceId is null)
- [ ] `[Realtime] 🔵 Setting up subscription` message (means hook is working)
- [ ] Any JavaScript errors
- [ ] Any React errors
- [ ] Console filter settings

---

## 🎯 Next Steps

1. **Add debug logging** (see above)
2. **Refresh page**
3. **Check console** for new debug messages
4. **Report what you see**

**This will help identify exactly where the issue is!** 🔧
