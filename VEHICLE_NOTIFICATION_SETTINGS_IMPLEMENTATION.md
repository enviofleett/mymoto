# Vehicle Notification Settings Implementation

## Overview
Added a comprehensive vehicle-specific notification settings system that allows users to enable/disable proactive notifications for each vehicle individually.

## Features Implemented

### 1. Database Schema
**File:** `supabase/migrations/20260117000001_create_vehicle_notification_preferences.sql`

- Created `vehicle_notification_preferences` table
- Stores user preferences per vehicle (user_id + device_id)
- Supports all event types from `proactive_vehicle_events`:
  - **Safety & Critical:** `critical_battery`, `low_battery`, `offline`, `anomaly_detected`
  - **Driving Behavior:** `overspeeding`, `harsh_braking`, `rapid_acceleration`
  - **Status & Events:** `ignition_on`, `ignition_off`, `online`, `geofence_enter`, `geofence_exit`, `idle_too_long`, `trip_completed`
  - **Maintenance:** `maintenance_due`
  - **Special Features:** `morning_greeting` (AI morning briefing)

- Default settings:
  - Critical alerts enabled by default: `critical_battery`, `offline`, `anomaly_detected`, `maintenance_due`
  - All other notifications disabled by default (user must opt-in)

### 2. Frontend Component
**File:** `src/components/fleet/VehicleNotificationSettings.tsx`

- Beautiful UI with categorized notification toggles
- Categories:
  - **Safety & Critical** (red/orange indicators)
  - **Status & Events** (blue indicators)
  - **Driving Behavior** (yellow indicators)
  - **Maintenance** (wrench icon)
  - **Special Features** (sun icon for morning greeting)

- Features:
  - Real-time preference updates
  - Auto-creates default preferences on first load
  - Loading states and error handling
  - Toast notifications for save success/failure

### 3. Integration with Vehicle Profile
**File:** `src/pages/owner/OwnerVehicleProfile/components/ReportsSection.tsx`

- Added third tab "Notifications" to the Reports section
- Accessible from vehicle profile page
- Uses Settings icon to differentiate from Alarms tab

## Event Types Supported

| Event Type | Category | Default | Description |
|------------|----------|---------|-------------|
| `critical_battery` | Safety | ✅ Enabled | Battery drops below 10% |
| `low_battery` | Safety | ❌ Disabled | Battery drops below 20% |
| `offline` | Status | ✅ Enabled | Vehicle loses GPS connection |
| `anomaly_detected` | Safety | ✅ Enabled | Unusual vehicle behavior |
| `overspeeding` | Driving | ❌ Disabled | Vehicle exceeds speed limit |
| `harsh_braking` | Driving | ❌ Disabled | Sudden hard braking detected |
| `rapid_acceleration` | Driving | ❌ Disabled | Aggressive acceleration |
| `ignition_on` | Status | ❌ Disabled | Vehicle engine starts |
| `ignition_off` | Status | ❌ Disabled | Vehicle engine stops |
| `online` | Status | ❌ Disabled | Vehicle reconnects |
| `geofence_enter` | Status | ❌ Disabled | Enters geofence zone |
| `geofence_exit` | Status | ❌ Disabled | Leaves geofence zone |
| `idle_too_long` | Status | ❌ Disabled | Extended idle period |
| `trip_completed` | Status | ❌ Disabled | Trip ends |
| `maintenance_due` | Maintenance | ✅ Enabled | Scheduled maintenance due |
| `morning_greeting` | Special | ❌ Disabled | Daily AI briefing at 7 AM |

## Next Steps (Edge Function Integration)

To make these preferences functional, edge functions that generate proactive events should check these preferences before sending notifications:

1. **`handle-vehicle-event`** - Check preferences before generating AI chat messages
2. **`proactive-alarm-to-chat`** - Check preferences before posting to chat
3. **`morning-briefing`** - Check `morning_greeting` preference before generating briefing

### Example Query Pattern:
```typescript
// Check if user wants notifications for this event type
const { data: prefs } = await supabase
  .from('vehicle_notification_preferences')
  .select(eventType)
  .eq('user_id', userId)
  .eq('device_id', deviceId)
  .maybeSingle();

if (prefs && prefs[eventType] === false) {
  console.log(`Skipping ${eventType} notification - user disabled`);
  return;
}
```

## Database Migration

Run the migration in Supabase SQL Editor:
```sql
-- File: supabase/migrations/20260117000001_create_vehicle_notification_preferences.sql
```

## Testing Checklist

- [ ] Run database migration
- [ ] Navigate to vehicle profile page
- [ ] Click "Notifications" tab in Reports section
- [ ] Verify all event types are listed and categorized
- [ ] Toggle notifications on/off
- [ ] Verify preferences save successfully
- [ ] Refresh page and verify preferences persist
- [ ] Test with multiple vehicles (preferences should be per-vehicle)

## UI Screenshots

The notification settings UI features:
- Clean, organized layout with category sections
- Icon-based visual indicators for each event type
- Toggle switches for easy enable/disable
- Helpful descriptions for each notification type
- Tip message explaining default critical alerts
