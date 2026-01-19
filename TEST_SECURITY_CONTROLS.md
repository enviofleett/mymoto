# Security Controls Testing Guide

This guide helps you test the vehicle security controls (Immobilize/Mobilize Engine) to ensure they work correctly.

## Overview

The security control system allows users to remotely immobilize (cut fuel) or mobilize (restore fuel) vehicle engines. The flow is:

1. **UI** → User clicks "Immobilize" or "Mobilize" button in `EngineControlCard`
2. **Confirmation** → Alert dialog appears for safety
3. **API Call** → `useVehicleCommand` hook calls `execute-vehicle-command` Edge Function
4. **GPS51 Integration** → Edge Function sends `RELAY,1` (immobilize) or `RELAY,0` (mobilize) to GPS51
5. **Database Logging** → Command is logged in `vehicle_command_logs` table
6. **Response** → Success/error message returned to UI

---

## Test 1: UI Component Testing

### Prerequisites
- Vehicle profile page is accessible
- Vehicle is online (`isOnline = true`)
- User is authenticated

### Steps

1. **Navigate to Vehicle Profile**
   - Go to `/owner/vehicle/:deviceId` or Fleet page → Click vehicle → View Details
   - Locate the "Security Control" card

2. **Test "Mobilize (Enable Engine)" Button**
   - ✅ Button should be visible and enabled (if vehicle is online)
   - ✅ Click button → Confirmation dialog should appear
   - ✅ Dialog should say "Mobilize Vehicle?" with description
   - ✅ Click "Cancel" → Dialog should close, no command sent
   - ✅ Click "Confirm" → Loading spinner should appear
   - ✅ Button should be disabled during execution

3. **Test "Immobilize (Cut Fuel)" Button**
   - ✅ Button should be visible with red/destructive styling
   - ✅ Click button → Confirmation dialog should appear
   - ✅ Dialog should say "Immobilize Vehicle?" with warning about cutting fuel
   - ✅ Click "Cancel" → Dialog should close, no command sent
   - ✅ Click "Confirm" → Loading spinner should appear
   - ✅ Button should be disabled during execution

4. **Test Offline State**
   - ✅ When vehicle is offline, buttons should be disabled
   - ✅ Status should show "Offline" in red/gray
   - ✅ Hovering disabled buttons should show tooltip (if implemented)

5. **Test Ignition Warning**
   - ✅ If `ignitionOn = true`, should show "⚠ Ignition On" warning
   - ✅ Warning should be visible near status text

---

## Test 2: API Integration Testing

### Test via Browser Console

1. **Open Browser DevTools** (F12)
2. **Navigate to Console tab**
3. **Get your session token:**
   ```javascript
   const { data: { session } } = await supabase.auth.getSession();
   console.log('Token:', session?.access_token);
   ```

4. **Test Immobilize Command:**
   ```javascript
   const response = await fetch('https://YOUR_PROJECT.supabase.co/functions/v1/execute-vehicle-command', {
     method: 'POST',
     headers: {
       'Authorization': `Bearer ${session.access_token}`,
       'Content-Type': 'application/json'
     },
     body: JSON.stringify({
       device_id: 'YOUR_DEVICE_ID',
       command_type: 'immobilize_engine',
       confirmed: true
     })
   });
   
   const result = await response.json();
   console.log('Result:', result);
   ```

5. **Test Mobilize Command:**
   ```javascript
   const response = await fetch('https://YOUR_PROJECT.supabase.co/functions/v1/execute-vehicle-command', {
     method: 'POST',
     headers: {
       'Authorization': `Bearer ${session.access_token}`,
       'Content-Type': 'application/json'
     },
     body: JSON.stringify({
       device_id: 'YOUR_DEVICE_ID',
       command_type: 'demobilize_engine',
       confirmed: true
     })
   });
   
   const result = await response.json();
   console.log('Result:', result);
   ```

### Expected API Response

```json
{
  "success": true,
  "message": "Command 'immobilize_engine' executed successfully",
  "command_id": "uuid-here",
  "executed_at": "2026-01-20T...",
  "data": {
    "commandId": "gps51-command-id",
    "response": "Command sent to device"
  }
}
```

---

## Test 3: Database Verification

### Check Command Logs in Supabase SQL Editor

```sql
-- View recent commands for a device
SELECT 
  id,
  device_id,
  command_type,
  status,
  created_at,
  executed_at,
  result,
  error_message
FROM vehicle_command_logs
WHERE device_id = 'YOUR_DEVICE_ID'
ORDER BY created_at DESC
LIMIT 10;
```

### Expected Database Record

After executing a command, you should see:
- `command_type`: `'immobilize_engine'` or `'demobilize_engine'`
- `status`: `'success'` or `'failed'`
- `result`: JSON with GPS51 response
- `executed_at`: Timestamp when command was executed
- `error_message`: `NULL` if successful, error text if failed

---

## Test 4: End-to-End Flow

### Full Integration Test

1. **Prerequisites:**
   - Vehicle is online in the system
   - User has permission to control the vehicle
   - GPS51 API is accessible

2. **Test Immobilize Flow:**
   ```
   Step 1: Navigate to vehicle profile page
   Step 2: Click "Immobilize (Cut Fuel)" button
   Step 3: Confirm in dialog
   Step 4: Wait for loading to complete
   Step 5: Check for success toast/notification
   Step 6: Verify command in database (status = 'success')
   Step 7: Verify GPS51 received command (check logs or GPS51 dashboard)
   ```

3. **Test Mobilize Flow:**
   ```
   Step 1: Navigate to vehicle profile page
   Step 2: Click "Mobilize (Enable Engine)" button
   Step 3: Confirm in dialog
   Step 4: Wait for loading to complete
   Step 5: Check for success toast/notification
   Step 6: Verify command in database (status = 'success')
   Step 7: Verify GPS51 received command
   ```

---

## Test 5: Error Handling

### Test Offline Vehicle

1. Set vehicle to offline in database or disconnect GPS tracker
2. Click "Immobilize" or "Mobilize"
3. ✅ Should show error: "Vehicle is offline" or similar
4. ✅ Button should be disabled

### Test GPS51 API Failure

1. Temporarily break GPS51 integration (wrong credentials, network error)
2. Try to execute command
3. ✅ Should show error message in UI
4. ✅ Database should log `status = 'failed'` with `error_message`

### Test Unauthorized User

1. Login as non-admin user without vehicle assignment
2. Try to execute command
3. ✅ Should show permission denied error
4. ✅ Edge Function should return 403

---

## Test 6: GPS51 Command Mapping

### Verify GPS51 Commands

The Edge Function maps commands to GPS51 API:

- `immobilize_engine` → `RELAY,1` (cut fuel)
- `demobilize_engine` → `RELAY,0` (restore fuel)

### Check GPS51 Dashboard

1. Log into GPS51 tracking platform
2. Go to device command history
3. Verify `RELAY,1` or `RELAY,0` commands were sent
4. Verify device executed the command

---

## Troubleshooting

### Command Not Executing

**Check:**
1. Vehicle is online (`isOnline = true`)
2. GPS51 credentials are configured in Edge Function environment variables
3. Device ID exists in `vehicles` table
4. User has permission (vehicle assignment or admin role)

### Database Not Logging Commands

**Check:**
1. `vehicle_command_logs` table exists (migration applied)
2. RLS policies allow user to insert records
3. Edge Function has service_role access

### GPS51 Not Responding

**Check:**
1. GPS51 API credentials are valid
2. Device ID matches GPS51 device ID
3. Network connectivity to GPS51 API
4. GPS51 API rate limits not exceeded

---

## Quick Test Checklist

- [ ] UI buttons render correctly
- [ ] Confirmation dialogs appear
- [ ] Loading states work (spinner during execution)
- [ ] Success/error messages display
- [ ] Commands log to database
- [ ] GPS51 receives commands
- [ ] Offline vehicles are disabled
- [ ] Error handling works (network errors, API failures)
- [ ] Permission checks work (unauthorized users blocked)

---

## Notes

- **Safety**: Immobilize commands cut fuel supply and can stop moving vehicles abruptly. Always test on stationary vehicles first.
- **GPS51 Rate Limiting**: The system uses rate limiting to prevent API abuse. Multiple rapid commands may be throttled.
- **Command Status**: Commands are logged immediately with `status = 'pending'`, then updated to `'success'` or `'failed'` after execution.
