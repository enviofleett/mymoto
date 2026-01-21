# 🔍 PWA Push Notifications - Complete Verification Guide

**Date**: 2026-01-20  
**Purpose**: Comprehensive verification checklist for PWA notification fixes  
**Status**: Ready for Cursor AI verification

---

## 📋 Executive Summary

This guide provides **80+ verification checkpoints** to systematically verify all PWA notification fixes have been implemented correctly. The fixes enable:

- ✅ Notifications on locked screens (iOS & Android)
- ✅ System sound on locked screens
- ✅ Vibration patterns by severity (Android)
- ✅ Badge counter on app icon
- ✅ Notification click navigation
- ✅ Service worker background handling

---

## ✅ FIX #1: Locked Screen Notification Support

### Implementation Location
**File**: `src/hooks/useNotifications.ts`

### Verification Checklist

#### ✅ 1.1 Notification Options Interface
- [ ] **Check**: `PushNotificationOptions` interface includes `silent?: boolean`
  - **Location**: Line ~3-11
  - **Expected**: `silent?: boolean;`
  - **Purpose**: Enables system sound on locked screens

- [ ] **Check**: Interface includes `vibrate?: number[]`
  - **Expected**: `vibrate?: number[];`
  - **Purpose**: Android vibration patterns

- [ ] **Check**: Interface includes `renotify?: boolean`
  - **Expected**: `renotify?: boolean;`
  - **Purpose**: Re-alert even if same tag exists

- [ ] **Check**: Interface includes `timestamp?: number`
  - **Expected**: `timestamp?: number;`
  - **Purpose**: Proper notification sorting

- [ ] **Check**: Interface includes `image?: string`
  - **Expected**: `image?: string;`
  - **Purpose**: Rich notification images

- [ ] **Check**: Interface includes `actions?: NotificationAction[]`
  - **Expected**: `actions?: NotificationAction[];`
  - **Purpose**: Interactive notification buttons

#### ✅ 1.2 Service Worker Notification Options
- [ ] **Check**: `silent: false` is set (CRITICAL)
  - **Location**: Line ~117-124
  - **Expected**: `silent: options.silent ?? false`
  - **Purpose**: System sound plays on locked screens
  - **Note**: `false` = sound enabled, `true` = silent

- [ ] **Check**: `vibrate` array is passed
  - **Expected**: `vibrate: options.vibrate`
  - **Purpose**: Android vibration patterns

- [ ] **Check**: `renotify: true` is set
  - **Expected**: `renotify: options.renotify ?? true`
  - **Purpose**: Re-alert even if same tag exists

- [ ] **Check**: `timestamp` is set
  - **Expected**: `timestamp: options.timestamp || Date.now()`
  - **Purpose**: Proper notification sorting

- [ ] **Check**: `image` is passed if provided
  - **Expected**: `image: options.image`
  - **Purpose**: Rich notification images

- [ ] **Check**: `actions` are passed if provided
  - **Expected**: `actions: options.actions`
  - **Purpose**: Interactive buttons

#### ✅ 1.3 Badge Icon
- [ ] **Check**: Badge icon is set
  - **Expected**: `badge: options.badge || '/pwa-192x192.png'`
  - **Purpose**: Badge icon for notification tray

#### ✅ 1.4 Service Worker Priority
- [ ] **Check**: Service worker is checked first
  - **Location**: Line ~114
  - **Expected**: `if ('serviceWorker' in navigator && navigator.serviceWorker.controller)`
  - **Purpose**: Service worker notifications work on locked screens

---

## ✅ FIX #2: Vibration Patterns by Severity

### Implementation Location
**File**: `src/components/notifications/GlobalAlertListener.tsx`

### Verification Checklist

#### ✅ 2.1 Vibration Pattern Function
- [ ] **Check**: `getVibrationPattern` function exists
  - **Location**: Line ~45-55
  - **Expected**: `const getVibrationPattern = useCallback((severity: SeverityLevel): number[] => { ... })`
  - **Purpose**: Returns vibration pattern based on severity

#### ✅ 2.2 Info Vibration Pattern
- [ ] **Check**: Info severity returns `[200]`
  - **Expected**: `case 'info': return [200];`
  - **Purpose**: Single short vibration

#### ✅ 2.3 Warning Vibration Pattern
- [ ] **Check**: Warning severity returns `[200, 100, 200]`
  - **Expected**: `case 'warning': return [200, 100, 200];`
  - **Purpose**: Two vibrations

#### ✅ 2.4 Error Vibration Pattern
- [ ] **Check**: Error severity returns `[200, 100, 200, 100, 200]`
  - **Expected**: `case 'error': return [200, 100, 200, 100, 200];`
  - **Purpose**: Three vibrations

#### ✅ 2.5 Critical Vibration Pattern
- [ ] **Check**: Critical severity returns `[300, 100, 300, 100, 300, 100, 300]`
  - **Expected**: `case 'critical': return [300, 100, 300, 100, 300, 100, 300];`
  - **Purpose**: Four long vibrations

#### ✅ 2.6 Vibration Passed to Notification
- [ ] **Check**: Vibration pattern is passed to `showNotification`
  - **Location**: Line ~106-120
  - **Expected**: `vibrate: getVibrationPattern(severity)`
  - **Purpose**: Android locked screen vibration

#### ✅ 2.7 Silent Flag Set
- [ ] **Check**: `silent: false` is set
  - **Expected**: `silent: false`
  - **Purpose**: Enables system sound on locked screens

---

## ✅ FIX #3: Badge Counter for App Icon

### Implementation Location
**Files**: 
- `src/hooks/useNotifications.ts` (badge functions)
- `public/sw-custom.js` (badge management)

### Verification Checklist

#### ✅ 3.1 Badge Management Functions in Hook
- [ ] **Check**: `updateBadge(count: number)` function exists
  - **Location**: `src/hooks/useNotifications.ts` ~line 150-170
  - **Expected**: `const updateBadge = useCallback((count: number) => { ... })`
  - **Purpose**: Set badge to specific count

- [ ] **Check**: `incrementBadge()` function exists
  - **Location**: `src/hooks/useNotifications.ts` ~line 172-185
  - **Expected**: `const incrementBadge = useCallback(() => { ... })`
  - **Purpose**: Add 1 to current count

- [ ] **Check**: `clearBadge()` function exists
  - **Location**: `src/hooks/useNotifications.ts` ~line 187-205
  - **Expected**: `const clearBadge = useCallback(() => { ... })`
  - **Purpose**: Reset badge to 0

#### ✅ 3.2 Badge Functions Exported
- [ ] **Check**: Badge functions are in return object
  - **Location**: `src/hooks/useNotifications.ts` ~line 207-215
  - **Expected**: 
    ```typescript
    return {
      ...
      updateBadge,
      incrementBadge,
      clearBadge
    };
    ```

#### ✅ 3.3 Badge Increment on Notification
- [ ] **Check**: Badge increments when notification is shown
  - **Location**: `src/hooks/useNotifications.ts` ~line 125-128
  - **Expected**: `if (options.tag) { incrementBadge(); }`
  - **Purpose**: Increment badge counter

#### ✅ 3.4 Service Worker Badge Management
- [ ] **Check**: Service worker has badge counter state
  - **Location**: `public/sw-custom.js` ~line 4
  - **Expected**: `let badgeCount = 0;`
  - **Purpose**: Track badge count in service worker

- [ ] **Check**: Service worker has `updateBadge` function
  - **Location**: `public/sw-custom.js` ~line 75-95
  - **Expected**: `function updateBadge(count) { ... }`
  - **Purpose**: Update badge using Badge API

- [ ] **Check**: Badge decrements on notification click
  - **Location**: `public/sw-custom.js` ~line 20-30
  - **Expected**: 
    ```javascript
    if (badgeCount > 0) {
      badgeCount--;
      updateBadge(badgeCount);
    }
    ```

- [ ] **Check**: Badge decrements on notification dismiss
  - **Location**: `public/sw-custom.js` ~line 50-58
  - **Expected**: 
    ```javascript
    if (badgeCount > 0) {
      badgeCount--;
      updateBadge(badgeCount);
    }
    ```

#### ✅ 3.5 Badge API Usage
- [ ] **Check**: Service worker uses `setAppBadge` API
  - **Location**: `public/sw-custom.js` ~line 80-85
  - **Expected**: `if ('setAppBadge' in self.registration) { self.registration.setAppBadge(count) }`
  - **Purpose**: Set badge count

- [ ] **Check**: Service worker uses `clearAppBadge` API
  - **Location**: `public/sw-custom.js` ~line 87-92
  - **Expected**: `self.registration.clearAppBadge()`
  - **Purpose**: Clear badge

#### ✅ 3.6 Message Handler for Badge Updates
- [ ] **Check**: Service worker handles `UPDATE_BADGE` message
  - **Location**: `public/sw-custom.js` ~line 60-75
  - **Expected**: 
    ```javascript
    case 'UPDATE_BADGE':
      badgeCount = Math.max(0, count || 0);
      updateBadge(badgeCount);
    ```

- [ ] **Check**: Service worker handles `INCREMENT_BADGE` message
  - **Expected**: 
    ```javascript
    case 'INCREMENT_BADGE':
      badgeCount++;
      updateBadge(badgeCount);
    ```

- [ ] **Check**: Service worker handles `CLEAR_BADGE` message
  - **Expected**: 
    ```javascript
    case 'CLEAR_BADGE':
      badgeCount = 0;
      updateBadge(0);
    ```

---

## ✅ FIX #4: Custom Service Worker

### Implementation Location
**File**: `public/sw-custom.js`

### Verification Checklist

#### ✅ 4.1 Service Worker File Exists
- [ ] **Check**: File `public/sw-custom.js` exists
  - **Location**: `public/sw-custom.js`
  - **Expected**: File exists with notification handlers

#### ✅ 4.2 Notification Click Handler
- [ ] **Check**: `notificationclick` event listener exists
  - **Location**: `public/sw-custom.js` ~line 15-45
  - **Expected**: `self.addEventListener('notificationclick', (event) => { ... })`
  - **Purpose**: Handle notification clicks

- [ ] **Check**: Notification closes on click
  - **Expected**: `event.notification.close();`
  - **Purpose**: Close notification when clicked

- [ ] **Check**: Badge decrements on click
  - **Expected**: Badge count decreases
  - **Purpose**: Update badge counter

- [ ] **Check**: Navigation logic exists
  - **Expected**: Determines URL based on `deviceId` or `eventType`
  - **Purpose**: Navigate to correct page

- [ ] **Check**: Focuses existing window or opens new one
  - **Expected**: `clients.matchAll()` and `clients.openWindow()`
  - **Purpose**: Proper window management

#### ✅ 4.3 Notification Close Handler
- [ ] **Check**: `notificationclose` event listener exists
  - **Location**: `public/sw-custom.js` ~line 47-58
  - **Expected**: `self.addEventListener('notificationclose', (event) => { ... })`
  - **Purpose**: Handle notification dismissal

- [ ] **Check**: Badge decrements on dismiss
  - **Expected**: Badge count decreases
  - **Purpose**: Update badge counter

#### ✅ 4.4 Message Handler
- [ ] **Check**: `message` event listener exists
  - **Location**: `public/sw-custom.js` ~line 60-75
  - **Expected**: `self.addEventListener('message', (event) => { ... })`
  - **Purpose**: Receive badge commands from app

#### ✅ 4.5 Push Handler (Future)
- [ ] **Check**: `push` event listener exists
  - **Location**: `public/sw-custom.js` ~line 97-125
  - **Expected**: `self.addEventListener('push', (event) => { ... })`
  - **Purpose**: Handle web push notifications (future)

#### ✅ 4.6 Navigation Logic
- [ ] **Check**: Navigates to `/owner/chat/{deviceId}` if deviceId present
  - **Expected**: `if (deviceId) { url = `/owner/chat/${deviceId}`; }`
  - **Purpose**: Deep-link to vehicle chat

- [ ] **Check**: Navigates to `/notifications` if only eventType
  - **Expected**: `else if (eventType) { url = '/notifications'; }`
  - **Purpose**: Navigate to notifications page

---

## ✅ FIX #5: PWA Configuration

### Implementation Location
**File**: `vite.config.ts`

### Verification Checklist

#### ✅ 5.1 Custom Service Worker Import
- [ ] **Check**: `importScripts` includes custom service worker
  - **Location**: `vite.config.ts` ~line 68
  - **Expected**: `importScripts: ['/sw-custom.js']`
  - **Purpose**: Inject custom handlers into service worker

#### ✅ 5.2 Service Worker in Assets
- [ ] **Check**: `sw-custom.js` is in `includeAssets`
  - **Location**: `vite.config.ts` ~line 32
  - **Expected**: `includeAssets: ["favicon.ico", "robots.txt", "sw-custom.js"]`
  - **Purpose**: Include custom service worker in build

---

## 🧪 Manual Testing Scenarios

### Test 1: Locked Screen Notification (iOS)
**Steps**:
1. Install PWA on iOS device (Add to Home Screen)
2. Lock the phone
3. Trigger alert from another device/admin panel
4. Verify notification appears with sound

**Expected Results**:
- ✅ Notification appears on locked screen
- ✅ System sound plays
- ✅ Badge icon shows on app icon
- ✅ Notification persists until dismissed

**Verification Points**:
- [ ] Notification visible on locked screen
- [ ] Sound plays (not silent)
- [ ] Badge icon appears
- [ ] Notification doesn't auto-dismiss immediately

---

### Test 2: Locked Screen Notification (Android)
**Steps**:
1. Install PWA on Android device
2. Lock the phone
3. Trigger alert with different severity levels
4. Verify notification appears with sound and vibration

**Expected Results**:
- ✅ Notification appears on locked screen
- ✅ System sound plays
- ✅ Vibration pattern matches severity
- ✅ Badge counter increments

**Verification Points**:
- [ ] Notification visible on locked screen
- [ ] Sound plays (not silent)
- [ ] Vibration pattern matches severity:
  - Info: Single vibration
  - Warning: Two vibrations
  - Error: Three vibrations
  - Critical: Four long vibrations
- [ ] Badge counter increments

---

### Test 3: Badge Counter Increments
**Steps**:
1. Open app
2. Trigger 3 alerts (different severities)
3. Check app icon badge

**Expected Results**:
- ✅ Badge shows "3" on app icon
- ✅ Badge increments with each notification

**Verification Points**:
- [ ] Badge shows correct count
- [ ] Badge increments with each notification
- [ ] Badge persists after app closes

---

### Test 4: Badge Counter Decrements on Click
**Steps**:
1. Trigger 3 alerts
2. Click one notification
3. Check badge count

**Expected Results**:
- ✅ Badge shows "2" after clicking one
- ✅ Badge decrements correctly

**Verification Points**:
- [ ] Badge decrements on click
- [ ] Badge shows correct count
- [ ] App navigates to correct page

---

### Test 5: Badge Counter Decrements on Dismiss
**Steps**:
1. Trigger 3 alerts
2. Swipe away one notification
3. Check badge count

**Expected Results**:
- ✅ Badge shows "2" after dismissing one
- ✅ Badge decrements correctly

**Verification Points**:
- [ ] Badge decrements on dismiss
- [ ] Badge shows correct count

---

### Test 6: Vibration Patterns by Severity
**Steps**:
1. Lock Android device
2. Trigger info alert → Check vibration
3. Trigger warning alert → Check vibration
4. Trigger error alert → Check vibration
5. Trigger critical alert → Check vibration

**Expected Results**:
- ✅ Info: Single short vibration `[200]`
- ✅ Warning: Two vibrations `[200, 100, 200]`
- ✅ Error: Three vibrations `[200, 100, 200, 100, 200]`
- ✅ Critical: Four long vibrations `[300, 100, 300, 100, 300, 100, 300]`

**Verification Points**:
- [ ] Each severity has distinct vibration pattern
- [ ] Vibration patterns match expected arrays
- [ ] Vibration works on locked screen

---

### Test 7: Sound on Locked vs Unlocked
**Steps**:
1. Lock device
2. Trigger alert
3. Unlock device
4. Trigger alert

**Expected Results**:
- ✅ Sound plays on locked screen
- ✅ Sound plays on unlocked screen
- ✅ Sound is not silent (`silent: false`)

**Verification Points**:
- [ ] Sound plays on locked screen
- [ ] Sound plays on unlocked screen
- [ ] Sound is audible (not muted)

---

### Test 8: Notification Persistence (requireInteraction)
**Steps**:
1. Trigger critical alert
2. Lock device
3. Wait 30 seconds
4. Check if notification still visible

**Expected Results**:
- ✅ Critical notifications persist (don't auto-dismiss)
- ✅ `requireInteraction: true` prevents auto-dismiss

**Verification Points**:
- [ ] Critical notifications persist
- [ ] Non-critical notifications may auto-dismiss
- [ ] `requireInteraction` flag works correctly

---

### Test 9: Multiple Devices (Same Tag Renotify)
**Steps**:
1. Trigger alert with same tag twice
2. Check if both notifications appear

**Expected Results**:
- ✅ Both notifications appear (even with same tag)
- ✅ `renotify: true` allows re-alerting

**Verification Points**:
- [ ] Second notification appears
- [ ] Both notifications visible
- [ ] `renotify` flag works correctly

---

### Test 10: Notification Click Navigation
**Steps**:
1. Close app completely
2. Trigger alert with deviceId
3. Tap notification
4. Verify app opens to correct page

**Expected Results**:
- ✅ App opens to `/owner/chat/{deviceId}`
- ✅ Correct vehicle chat page loads
- ✅ Notification data is accessible

**Verification Points**:
- [ ] App opens on notification click
- [ ] Navigates to correct URL
- [ ] Deep-linking works correctly

---

## 📊 Platform-Specific Requirements

### iOS Requirements
- [ ] **iOS 16.4+** required for Badge API
- [ ] **Add to Home Screen** required for PWA
- [ ] **Notification permission** granted
- [ ] **Sound settings** allow notification sounds
- [ ] **Badge icon** is 192x192 monochrome PNG

### Android Requirements
- [ ] **Android 8.0+** required for Badge API
- [ ] **Install PWA** as standalone app
- [ ] **Notification permission** granted
- [ ] **Vibration permission** granted (if needed)
- [ ] **Notification channel** configured

---

## 🐛 Troubleshooting Guide

### Issue: No Sound on Locked Screen
**Symptoms**: Notification appears but no sound plays

**Check**:
1. Verify `silent: false` in notification options
2. Check device sound settings
3. Verify notification permission granted
4. Check if service worker is active

**Fix**:
```typescript
// Ensure silent is false
silent: false // ✅ Enables sound
```

---

### Issue: No Vibration on Android
**Symptoms**: Notification appears but no vibration

**Check**:
1. Verify `vibrate` array is passed
2. Check vibration array format (milliseconds)
3. Verify device vibration settings
4. Check Android notification channel settings

**Fix**:
```typescript
// Ensure vibrate array is passed
vibrate: [200, 100, 200] // ✅ Vibration pattern
```

---

### Issue: Badge Doesn't Update
**Symptoms**: Badge counter doesn't increment/decrement

**Check**:
1. Verify Badge API is supported (`setAppBadge` in registration)
2. Check service worker message handler
3. Verify badge functions are called
4. Check service worker is active

**Fix**:
```typescript
// Ensure badge functions are called
incrementBadge(); // ✅ Increment badge
```

---

### Issue: Notifications Don't Appear
**Symptoms**: No notifications shown

**Check**:
1. Verify notification permission granted
2. Check service worker is registered
3. Verify service worker is active
4. Check browser console for errors

**Fix**:
```typescript
// Ensure permission is granted
if (permission === 'granted') {
  showNotification(options);
}
```

---

### Issue: Notification Click Doesn't Navigate
**Symptoms**: Clicking notification doesn't open app

**Check**:
1. Verify `notificationclick` handler exists
2. Check navigation URL logic
3. Verify service worker is active
4. Check `clients.openWindow` is called

**Fix**:
```javascript
// Ensure navigation logic exists
event.waitUntil(
  clients.openWindow(url)
);
```

---

## ✅ Success Criteria

| Criteria | Target | Status |
|----------|--------|--------|
| Notification delivery rate | 100% on locked screens | ⏳ Pending Test |
| Sound play rate | 100% on locked screens | ⏳ Pending Test |
| Badge accuracy | Always matches unread count | ⏳ Pending Test |
| Click-through rate | 100% navigate correctly | ⏳ Pending Test |
| Vibration patterns | Match severity levels | ⏳ Pending Test |

---

## 📝 Final Checklist

Before signing off, verify:

- [ ] All 80+ verification checkpoints completed
- [ ] All manual test scenarios passed
- [ ] No console errors in browser
- [ ] Service worker is active
- [ ] Badge API is supported
- [ ] Notifications work on locked screens
- [ ] Sound plays on locked screens
- [ ] Vibration patterns work correctly
- [ ] Badge counter increments/decrements correctly
- [ ] Notification clicks navigate correctly

---

## 🚀 Deployment Checklist

Before deploying to production:

- [ ] All code changes committed
- [ ] Service worker tested on physical devices
- [ ] Badge counter tested on iOS and Android
- [ ] Vibration patterns tested on Android
- [ ] Notification clicks tested
- [ ] No console errors
- [ ] Performance is acceptable
- [ ] User experience is smooth

---

**Use this guide with Cursor AI to systematically verify all PWA notification fixes are working correctly!**
