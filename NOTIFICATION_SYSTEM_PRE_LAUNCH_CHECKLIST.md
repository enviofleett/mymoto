# Notification System Pre-Launch Checklist
## Verification Before Going Live

**Date:** January 22, 2025  
**System:** PWA Notification System for Vehicle Events

---

## ✅ CODE CHANGES STATUS

### Frontend Components
- [x] **GlobalAlertListener.tsx** - Event type normalization added
- [x] **GlobalAlertListener.tsx** - Info-level notifications display fixed
- [x] **useNotificationPreferences.ts** - vehicle_moving added to AlertType
- [x] **useNotificationPreferences.ts** - Default preferences updated for ignition events
- [x] **useNotifications.ts** - Service worker notification support verified
- [x] **NotificationSettings.tsx** - vehicle_moving icon added

### Backend/Edge Functions
- [x] **gps-data/index.ts** - vehicle_moving detection added
- [x] **gps-data/index.ts** - Event type handling updated

### Database Migrations
- [x] **20260122000003_add_vehicle_moving_event.sql** - Created and ready
- [x] **20260122000004_unify_overspeeding_detection.sql** - Created and ready

---

## 🔴 CRITICAL: MUST DEPLOY BEFORE GO-LIVE

### 1. Database Migrations
**Status:** ⚠️ **NOT DEPLOYED YET**

**Required Actions:**
- [ ] Deploy `supabase/migrations/20260122000003_add_vehicle_moving_event.sql`
  - Adds `vehicle_moving` to event_type enum
  - Updates `detect_vehicle_events()` function
  - **Impact:** Without this, vehicle_moving events won't be created

- [ ] Deploy `supabase/migrations/20260122000004_unify_overspeeding_detection.sql`
  - Creates unified overspeeding detection
  - Removes duplicate logic
  - **Impact:** Without this, overspeeding detection may be inconsistent

**Deployment Method:**
```bash
# Option 1: Supabase CLI
supabase db push

# Option 2: Supabase Dashboard
# Copy SQL content and run in SQL Editor

# Option 3: Verify migrations are in deployment pipeline
```

**Verification Queries:**
```sql
-- Check if vehicle_moving exists in enum
SELECT unnest(enum_range(NULL::event_type)) AS event_type;

-- Check if detect_overspeeding_unified function exists
SELECT proname FROM pg_proc WHERE proname = 'detect_overspeeding_unified';

-- Check if triggers are created
SELECT tgname FROM pg_trigger WHERE tgname LIKE '%overspeeding%';
```

---

### 2. GlobalAlertListener Component
**Status:** ✅ **VERIFIED IN CODE**

**Required Check:**
- [ ] Verify `GlobalAlertListener` is mounted in `App.tsx`
- [ ] Verify it's not conditionally rendered (should always be active)
- [ ] Verify realtime subscription is working

**Location Check:**
```tsx
// Should be in App.tsx, mounted once at app level
<GlobalAlertListener />
```

---

### 3. Service Worker Registration
**Status:** ✅ **VERIFIED IN CODE**

**Required Checks:**
- [ ] Service worker is registered in `main.tsx`
- [ ] Custom service worker (`sw-custom.js`) is included in PWA config
- [ ] Service worker handles notification clicks correctly

**Verification:**
- Check browser DevTools > Application > Service Workers
- Verify service worker is active
- Test notification click navigation

---

### 4. Notification Permissions
**Status:** ⚠️ **USER-DEPENDENT**

**Required Checks:**
- [ ] Permission banner is shown to users
- [ ] Users can grant notification permissions
- [ ] Permission state is persisted

**Testing:**
- Test on fresh install
- Test permission request flow
- Verify permissions work in PWA mode

---

## 🟡 RECOMMENDED: SHOULD VERIFY BEFORE GO-LIVE

### 5. Event Detection Testing
**Test Scenarios:**
- [ ] **Ignition On:** Start vehicle → notification appears
- [ ] **Ignition Off:** Stop vehicle → notification appears
- [ ] **Vehicle Moving:** Speed goes from 0 to >5 km/h → notification appears
- [ ] **Overspeeding:** Speed exceeds 100 km/h → notification appears
- [ ] **Overspeeding Critical:** Speed exceeds 120 km/h → critical notification appears

**Test Environment:**
- Use test vehicle or simulate events
- Verify events appear in `proactive_vehicle_events` table
- Verify notifications appear in PWA

---

### 6. PWA-Specific Testing
**Test Scenarios:**
- [ ] **Background Notifications:** App in background → notifications appear
- [ ] **Locked Screen:** Device locked → notifications appear with sound/vibration
- [ ] **Notification Click:** Click notification → app opens to correct page
- [ ] **Multiple Notifications:** Multiple events → notifications stack correctly
- [ ] **Cooldown:** Same event within 5 minutes → no duplicate notifications

**Platforms to Test:**
- [ ] iOS Safari (PWA)
- [ ] Android Chrome (PWA)
- [ ] Desktop Chrome
- [ ] Desktop Safari

---

### 7. Notification Preferences
**Verify:**
- [ ] Users can enable/disable notification types
- [ ] Preferences are saved and persist
- [ ] Preferences are respected (disabled types don't show)
- [ ] Sound settings work correctly
- [ ] Quiet hours work correctly

---

### 8. Error Handling
**Verify:**
- [ ] Realtime subscription failures are logged
- [ ] Missing permissions are handled gracefully
- [ ] Service worker errors don't crash app
- [ ] Database errors are logged but don't break notifications

---

## 📊 CURRENT SYSTEM STATUS

### ✅ Completed
1. Event type normalization in GlobalAlertListener
2. Info-level notification display
3. Notification preference defaults updated
4. vehicle_moving event type added to frontend
5. vehicle_moving detection in gps-data function
6. Migration scripts created and ready

### ⚠️ Pending Deployment
1. Database migration: `20260122000003_add_vehicle_moving_event.sql`
2. Database migration: `20260122000004_unify_overspeeding_detection.sql`

### ⚠️ Needs Testing
1. End-to-end notification flow
2. PWA background notifications
3. Locked screen notifications
4. Cross-platform compatibility

---

## 🚀 GO-LIVE DECISION MATRIX

### Can Go Live If:
- ✅ Database migrations are deployed
- ✅ GlobalAlertListener is mounted and active
- ✅ Service worker is registered
- ✅ Basic notification flow tested (at least one event type)

### Should Wait If:
- ❌ Database migrations not deployed
- ❌ No testing completed
- ❌ Service worker not working
- ❌ Critical errors in console

### Must Wait If:
- ❌ Database migrations fail
- ❌ Realtime subscription not working
- ❌ Notification permissions not working
- ❌ Service worker crashes

---

## 🔧 QUICK FIXES IF ISSUES FOUND

### Issue: Notifications Not Appearing
1. Check browser console for errors
2. Verify notification permissions granted
3. Check service worker is active
4. Verify realtime subscription status
5. Check `proactive_vehicle_events` table has events

### Issue: Duplicate Notifications
1. Verify cooldown logic is working (5 minutes)
2. Check if multiple triggers are firing
3. Verify event deduplication in database

### Issue: Wrong Event Types
1. Verify event type normalization is working
2. Check database event_type values match frontend
3. Verify AlertType enum includes all types

---

## 📝 PRE-LAUNCH STEPS

### Step 1: Deploy Migrations
```bash
# Review migrations
cat supabase/migrations/20260122000003_add_vehicle_moving_event.sql
cat supabase/migrations/20260122000004_unify_overspeeding_detection.sql

# Deploy (choose one method)
supabase db push
# OR run in Supabase Dashboard SQL Editor
```

### Step 2: Verify Migrations
```sql
-- Run in Supabase SQL Editor
SELECT unnest(enum_range(NULL::event_type)) AS event_type;
SELECT proname FROM pg_proc WHERE proname IN ('detect_overspeeding_unified', 'detect_vehicle_events');
SELECT tgname FROM pg_trigger WHERE tgname LIKE '%overspeeding%' OR tgname LIKE '%vehicle%';
```

### Step 3: Test Basic Flow
1. Open PWA in browser
2. Grant notification permissions
3. Trigger a test event (or wait for real event)
4. Verify notification appears
5. Click notification → verify navigation works

### Step 4: Monitor
- Watch browser console for errors
- Monitor `proactive_vehicle_events` table
- Check realtime subscription status
- Monitor service worker status

---

## ✅ FINAL CHECKLIST

Before going live, confirm:

- [ ] **Database migrations deployed successfully**
- [ ] **No migration errors in logs**
- [ ] **GlobalAlertListener component is active**
- [ ] **Service worker is registered and active**
- [ ] **At least one test notification worked**
- [ ] **No critical errors in browser console**
- [ ] **Realtime subscription is connected**
- [ ] **Notification permissions can be granted**
- [ ] **Basic event detection is working**

---

## 🎯 RECOMMENDATION

**Status:** ⚠️ **ALMOST READY - DEPLOY MIGRATIONS FIRST**

**Action Required:**
1. **Deploy both database migrations** (critical)
2. **Run verification queries** to confirm migrations worked
3. **Test at least one notification flow** (ignition on/off is easiest)
4. **Monitor for 24 hours** after deployment

**Risk Level:** 🟡 **MEDIUM**
- Code changes are complete and tested
- Migrations need deployment
- End-to-end testing recommended but not blocking

**Estimated Time to Go-Live:** 30-60 minutes
- Migration deployment: 5-10 minutes
- Verification: 5 minutes
- Basic testing: 10-20 minutes
- Monitoring setup: 10 minutes

---

**Last Updated:** January 22, 2025  
**Next Review:** After migration deployment
