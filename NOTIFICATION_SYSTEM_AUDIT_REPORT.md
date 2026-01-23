# Notification System Audit Report
## PWA Popup Notifications for Vehicle Events

**Date:** January 22, 2025  
**Scope:** Ignition/Vehicle Moving, Power Off, Overspeeding notifications in PWA

---

## Executive Summary

The notification system has several critical issues preventing popup notifications from working properly in the PWA. This audit identifies broken components and provides recommended fixes.

---

## 🔴 CRITICAL ISSUES FOUND

### 1. **Event Type Mismatch: `ignition_off` vs `power_off`**

**Problem:**
- Database triggers create events with type `ignition_off`
- Notification preferences use `power_off` in AI chat preferences
- `GlobalAlertListener` receives `ignition_off` but checks for `power_off` preference
- **Result:** Power off notifications never trigger because event type doesn't match preference key

**Evidence:**
- `supabase/migrations/20260109132000_event_detection_triggers.sql` line 162: Creates `ignition_off` event
- `src/hooks/useNotificationPreferences.ts` line 11: AlertType includes `ignition_off`
- `src/hooks/useNotificationPreferences.ts` line 26: AIChatPreferences uses `power_off`
- `supabase/functions/handle-vehicle-event/index.ts` line 244: Maps `ignition_off` → `power_off` (only for AI chat, not notifications)

**Impact:** HIGH - Power off notifications never work

---

### 2. **Missing "Vehicle Moving" Event Detection**

**Problem:**
- No specific event type for "vehicle started moving"
- System only detects `ignition_on` (engine start) but not when vehicle actually starts moving
- User expects notification when vehicle begins movement, not just when ignition turns on

**Evidence:**
- Event types enum (`proactive_events.sql`) has no `vehicle_moving` or `movement_started` type
- Triggers only detect ignition state changes, not speed transitions from 0 to >0

**Impact:** MEDIUM - Users don't get notified when vehicle starts moving

---

### 3. **Notification Preference Mapping Broken**

**Problem:**
- `GlobalAlertListener` uses `event.event_type` directly as `AlertType`
- But `ignition_off` events don't match `power_off` preference key
- `shouldShowPush()` and `shouldPlaySound()` check alert type, but type mismatch causes notifications to be skipped

**Evidence:**
- `src/components/notifications/GlobalAlertListener.tsx` line 95: `const alertType = event.event_type as AlertType;`
- `src/hooks/useNotificationPreferences.ts` line 235: `shouldShowPush(alertType, severity)` - checks exact match
- No mapping function to convert `ignition_off` → `power_off` for notification checks

**Impact:** HIGH - Power off notifications fail silently

---

### 4. **Info Severity Events Not Showing Push Notifications**

**Problem:**
- `ignition_on` and `ignition_off` are marked as `severity: 'info'`
- Default notification preferences: `info: { sound: false, push: false }`
- **Result:** Ignition events never show push notifications by default

**Evidence:**
- `supabase/migrations/20260109132000_event_detection_triggers.sql` line 147: `severity: 'info'` for ignition_on
- `src/hooks/useNotificationPreferences.ts` line 69: `info: { sound: false, push: false }`
- `src/components/notifications/GlobalAlertListener.tsx` line 103-118: Only shows toast for critical/error/warning, not info

**Impact:** HIGH - Ignition notifications never show by default

---

### 5. **PWA Service Worker Notification Issues**

**Problem:**
- Service worker exists but may not be properly handling all notification scenarios
- No explicit permission request flow in PWA
- Service worker might not be active when app is in background

**Evidence:**
- `public/sw-custom.js` exists and handles notifications
- `src/hooks/useNotifications.ts` line 124: Checks for service worker but falls back to regular Notification API
- No explicit permission request banner for PWA users

**Impact:** MEDIUM - Notifications may not work when PWA is in background

---

### 6. **Overspeeding Detection Logic Issues**

**Problem:**
- Multiple detection mechanisms with different thresholds:
  - `gps-data/index.ts`: Detects if `speed > 120 && is_overspeeding`
  - `detect_critical_events()`: Detects if `is_overspeeding = true` (any speed)
  - `detect_vehicle_events()`: Detects if `speed > 100` (different threshold)
- Inconsistent severity levels (error vs critical)
- Cooldown periods may be too short (5 minutes)

**Evidence:**
- `supabase/functions/gps-data/index.ts` line 280: `speed > 120 && pos.is_overspeeding`
- `supabase/migrations/20260110112113_0c69ef92-fe48-44a5-87d3-b5cb8d9c914d.sql` line 107: `is_overspeeding = true` (any speed)
- `supabase/migrations/20260109132000_event_detection_triggers.sql` line 74: `speed > 100`

**Impact:** MEDIUM - Overspeeding notifications may be inconsistent or missed

---

## 🟡 MODERATE ISSUES

### 7. **Realtime Subscription May Not Be Active**

**Problem:**
- `GlobalAlertListener` subscribes to `proactive_vehicle_events` INSERT events
- If realtime is not enabled or subscription fails, no notifications will be received
- No error handling or retry logic for failed subscriptions

**Evidence:**
- `src/components/notifications/GlobalAlertListener.tsx` line 144-160: Single subscription attempt
- No subscription status monitoring
- No fallback polling mechanism

**Impact:** MEDIUM - Notifications may stop working if realtime fails

---

### 8. **Notification Permission Not Requested on PWA Install**

**Problem:**
- No automatic permission request when PWA is installed
- Users must manually enable notifications in settings
- Many users may not know notifications are available

**Evidence:**
- `src/components/notifications/NotificationPermissionBanner.tsx` exists but may not be shown
- No check on PWA install to request permissions

**Impact:** LOW - Users may not enable notifications

---

## ✅ RECOMMENDED FIXES

### Fix 1: Map `ignition_off` to `power_off` in Notification System

**File:** `src/components/notifications/GlobalAlertListener.tsx`

```typescript
// Add event type mapping function
const mapEventTypeToAlertType = (eventType: string): AlertType => {
  const mapping: Record<string, AlertType> = {
    'ignition_off': 'ignition_off', // Keep for compatibility
    'ignition_on': 'ignition_on',
    'overspeeding': 'overspeeding',
    'low_battery': 'low_battery',
    'critical_battery': 'critical_battery',
    // Add other mappings as needed
  };
  return (mapping[eventType] || eventType) as AlertType;
};

// In handleNewEvent:
const alertType = mapEventTypeToAlertType(event.event_type) as AlertType;
```

**OR** Update AlertType to include both and handle both in preferences.

---

### Fix 2: Add "Vehicle Moving" Event Detection

**File:** `supabase/migrations/20260122000003_add_vehicle_moving_event.sql`

```sql
-- Add vehicle_moving to event_type enum
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'vehicle_moving';

-- Update detect_vehicle_events() function to detect movement start
-- Add after ignition_on detection:
IF NEW.ignition_on = true 
   AND NEW.speed IS NOT NULL AND NEW.speed > 5
   AND (prev_position.speed IS NULL OR prev_position.speed <= 5) THEN
  PERFORM create_proactive_event(
    p_device_id := NEW.device_id,
    p_event_type := 'vehicle_moving'::event_type,
    p_severity := 'info'::event_severity,
    p_title := 'Vehicle Started Moving',
    p_description := format('Vehicle is now moving at %s km/h', NEW.speed),
    p_metadata := jsonb_build_object(
      'speed', NEW.speed,
      'previous_speed', prev_position.speed
    ),
    p_latitude := NEW.latitude,
    p_longitude := NEW.longitude
  );
END IF;
```

**File:** `src/hooks/useNotificationPreferences.ts`

```typescript
export type AlertType = 
  | 'low_battery'
  | 'critical_battery'
  | 'overspeeding'
  | 'harsh_braking'
  | 'rapid_acceleration'
  | 'ignition_on'
  | 'ignition_off'
  | 'vehicle_moving'  // ADD THIS
  | 'power_off'       // ADD THIS (alias for ignition_off)
  | // ... rest
```

---

### Fix 3: Fix Notification Preference Defaults for Ignition Events

**File:** `src/hooks/useNotificationPreferences.ts`

```typescript
const DEFAULT_PREFERENCES: NotificationPreferences = {
  // ... existing
  alertTypeSettings: {
    // Override defaults for important events
    ignition_on: { sound: false, push: true },  // Show push, no sound
    ignition_off: { sound: false, push: true }, // Show push, no sound
    vehicle_moving: { sound: false, push: true }, // Show push, no sound
    overspeeding: { sound: true, push: true },   // Show push with sound
  },
  // ... rest
};
```

---

### Fix 4: Add Event Type Normalization in GlobalAlertListener

**File:** `src/components/notifications/GlobalAlertListener.tsx`

```typescript
// Add normalization function
const normalizeEventType = (eventType: string): AlertType => {
  // Map database event types to notification preference keys
  const typeMap: Record<string, AlertType> = {
    'ignition_off': 'ignition_off', // Keep both for compatibility
    'power_off': 'ignition_off',     // Map power_off to ignition_off
    'ignition_on': 'ignition_on',
    'overspeeding': 'overspeeding',
    'low_battery': 'low_battery',
    'critical_battery': 'critical_battery',
  };
  
  return (typeMap[eventType] || eventType) as AlertType;
};

// In handleNewEvent:
const alertType = normalizeEventType(event.event_type) as AlertType;
```

---

### Fix 5: Show Info-Level Notifications

**File:** `src/components/notifications/GlobalAlertListener.tsx`

```typescript
// Update toast display logic
if (severity === 'critical' || severity === 'error') {
  toast({
    title: event.title,
    description: event.message,
    variant: "destructive"
  });
  sendEmailNotification(event);
} else if (severity === 'warning') {
  toast({
    title: event.title,
    description: event.message
  });
} else if (severity === 'info' && shouldShowPush(alertType, severity)) {
  // Show info notifications if user has enabled them
  toast({
    title: event.title,
    description: event.message,
    variant: "default"
  });
}
```

---

### Fix 6: Unify Overspeeding Detection

**File:** `supabase/migrations/20260122000004_unify_overspeeding_detection.sql`

```sql
-- Create unified overspeeding detection function
CREATE OR REPLACE FUNCTION detect_overspeeding_unified()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  speed_threshold DECIMAL := 100; -- km/h (configurable)
  last_event_time TIMESTAMPTZ;
BEGIN
  -- Only trigger if is_overspeeding flag is true AND speed exceeds threshold
  IF NEW.is_overspeeding = true 
     AND NEW.speed IS NOT NULL 
     AND NEW.speed > speed_threshold
     AND NEW.speed < 300 THEN -- Sanity check
    
    -- Check cooldown (5 minutes)
    SELECT MAX(created_at) INTO last_event_time
    FROM proactive_vehicle_events
    WHERE device_id = NEW.device_id
      AND event_type = 'overspeeding'
      AND created_at > NOW() - INTERVAL '5 minutes';
    
    IF last_event_time IS NULL THEN
      -- Determine severity based on speed
      PERFORM create_proactive_event(
        p_device_id := NEW.device_id,
        p_event_type := 'overspeeding'::event_type,
        p_severity := CASE 
          WHEN NEW.speed > 120 THEN 'critical'::event_severity
          WHEN NEW.speed > 100 THEN 'error'::event_severity
          ELSE 'warning'::event_severity
        END,
        p_title := 'Overspeeding Detected',
        p_description := format('Vehicle traveling at %s km/h (limit: %s km/h)', 
          ROUND(NEW.speed::numeric, 0), speed_threshold),
        p_metadata := jsonb_build_object(
          'speed', NEW.speed,
          'threshold', speed_threshold
        ),
        p_latitude := NEW.latitude,
        p_longitude := NEW.longitude,
        p_value_after := NEW.speed,
        p_threshold := speed_threshold
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Replace existing triggers with unified version
DROP TRIGGER IF EXISTS trigger_detect_critical_events ON vehicle_positions;
CREATE TRIGGER trigger_detect_overspeeding_unified
BEFORE UPDATE ON vehicle_positions
FOR EACH ROW
WHEN (NEW.is_overspeeding = true AND OLD.is_overspeeding = false)
EXECUTE FUNCTION detect_overspeeding_unified();
```

---

### Fix 7: Add PWA Permission Request on Install

**File:** `src/components/notifications/NotificationPermissionBanner.tsx`

```typescript
// Add check for PWA install
useEffect(() => {
  // Check if PWA is installed
  const isPWA = window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true;
  
  if (isPWA && permission === 'default') {
    // Auto-show permission banner for PWA users
    setShowBanner(true);
  }
}, [permission]);
```

---

### Fix 8: Add Realtime Subscription Health Monitoring

**File:** `src/components/notifications/GlobalAlertListener.tsx`

```typescript
const [subscriptionStatus, setSubscriptionStatus] = useState<'subscribing' | 'subscribed' | 'error'>('subscribing');

useEffect(() => {
  const channel = supabase
    .channel('global_proactive_alerts')
    .on('postgres_changes', { ... }, handleNewEvent)
    .subscribe((status) => {
      console.log('[GlobalAlertListener] Subscription status:', status);
      setSubscriptionStatus(status === 'SUBSCRIBED' ? 'subscribed' : 'error');
      
      if (status === 'SUBSCRIBED') {
        console.log('[GlobalAlertListener] Successfully subscribed to events');
      } else if (status === 'CHANNEL_ERROR') {
        console.error('[GlobalAlertListener] Subscription error, retrying...');
        // Retry logic could be added here
      }
    });

  return () => {
    supabase.removeChannel(channel);
  };
}, [handleNewEvent]);
```

---

## 📋 IMPLEMENTATION PRIORITY

### Priority 1 (CRITICAL - Fix Immediately)
1. ✅ Fix event type mapping (`ignition_off` → `power_off` compatibility)
2. ✅ Fix info-level notification display
3. ✅ Add event type normalization in GlobalAlertListener

### Priority 2 (HIGH - Fix Soon)
4. ✅ Add "vehicle moving" event detection
5. ✅ Unify overspeeding detection logic
6. ✅ Update notification preference defaults

### Priority 3 (MEDIUM - Fix When Possible)
7. ✅ Add realtime subscription health monitoring
8. ✅ Add PWA permission request on install

---

## 🧪 TESTING CHECKLIST

After fixes are implemented, test:

- [ ] Power off notification appears when ignition turns off
- [ ] Ignition on notification appears when engine starts
- [ ] Vehicle moving notification appears when speed goes from 0 to >5 km/h
- [ ] Overspeeding notification appears when speed exceeds threshold
- [ ] Notifications work when PWA is in background
- [ ] Notifications work when device is locked
- [ ] Notification sounds play correctly
- [ ] Notification vibration works on Android
- [ ] Notification preferences are respected
- [ ] Multiple notifications don't spam (cooldown works)

---

## 📊 CURRENT STATE SUMMARY

| Event Type | Detected? | Notification Works? | Issue |
|------------|-----------|---------------------|-------|
| Ignition On | ✅ Yes | ❌ No (info severity, push disabled) | Fix 3, 5 |
| Ignition Off | ✅ Yes | ❌ No (type mismatch + info severity) | Fix 1, 3, 5 |
| Power Off | ❌ No | ❌ No | Same as ignition_off |
| Vehicle Moving | ❌ No | ❌ No | Fix 2 |
| Overspeeding | ✅ Yes | ⚠️ Partial (inconsistent) | Fix 6 |

---

## 🔧 QUICK FIX SUMMARY

1. **Map `ignition_off` to work with `power_off` preferences**
2. **Enable push notifications for info-level ignition events by default**
3. **Add vehicle moving detection (speed 0 → >5 km/h)**
4. **Unify overspeeding detection with consistent thresholds**
5. **Add realtime subscription monitoring and error handling**

---

**Next Steps:** Implement fixes in priority order and test thoroughly in PWA environment.
