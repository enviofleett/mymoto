# Enable Realtime Location Updates

## Problem
Location was not updating in realtime on the vehicle profile page. It was only polling every 15 seconds.

## Root Cause
1. **Missing Realtime Subscription**: The `OwnerVehicleProfile` component was not using `useRealtimeVehicleUpdates` hook
2. **Realtime Not Enabled**: The `vehicle_positions` table was not enabled for Supabase Realtime publication

## Solution

### 1. Added Realtime Hook to Vehicle Profile Page
- Imported `useRealtimeVehicleUpdates` hook
- Called it in `OwnerVehicleProfile` component
- This subscribes to `vehicle_positions` UPDATE events for instant cache updates

### 2. Created Migration to Enable Realtime
- Created migration: `20260123000001_enable_realtime_vehicle_positions.sql`
- Added `vehicle_positions` to `supabase_realtime` publication
- Set `REPLICA IDENTITY FULL` to get complete row data in updates

## Files Changed

1. **Updated:**
   - `src/pages/owner/OwnerVehicleProfile/index.tsx` - Added `useRealtimeVehicleUpdates` hook

2. **Created:**
   - `supabase/migrations/20260123000001_enable_realtime_vehicle_positions.sql` - Enable Realtime for vehicle_positions

## How It Works

1. **Realtime Subscription**: When the vehicle profile page loads, it subscribes to `vehicle_positions` UPDATE events for that specific device
2. **Instant Cache Updates**: When GPS data is synced (via CRON job), the database UPDATE triggers a Realtime event
3. **React Query Cache**: The hook updates the React Query cache directly, causing the UI to re-render instantly
4. **No Polling Delay**: Instead of waiting 15 seconds for the next poll, updates appear immediately

## Deployment Steps

1. **Run Migration:**
   ```sql
   -- In Supabase SQL Editor, run:
   ALTER PUBLICATION supabase_realtime ADD TABLE vehicle_positions;
   ALTER TABLE vehicle_positions REPLICA IDENTITY FULL;
   ```

   Or apply the migration file:
   ```bash
   supabase migration up
   ```

2. **Verify Realtime is Working:**
   - Open browser console
   - Navigate to vehicle profile page
   - Look for `[Realtime]` logs when position updates occur
   - Location should update instantly when GPS data syncs

## Expected Behavior

- **Before**: Location updates every 15 seconds (polling interval)
- **After**: Location updates instantly when GPS data is synced to database
- **Fallback**: Still polls every 15 seconds as backup if Realtime fails

## Testing

1. Open vehicle profile page
2. Check browser console for Realtime subscription status
3. Wait for GPS sync (or trigger manually)
4. Verify location updates appear immediately without waiting for poll interval
