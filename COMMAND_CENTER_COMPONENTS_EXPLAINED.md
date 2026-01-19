# Command Center Dashboard - Complete Component Breakdown

## Overview
The Command Center (`/` route) is the main operational dashboard providing real-time fleet telemetry, status monitoring, and quick access to fleet management actions. It serves as the central hub for fleet operators and administrators.

---

## Component Architecture

### Layout Structure
```
DashboardLayout (Wrapper)
├── TopNavigation (Desktop)
├── Mobile Header
├── Main Content Area
│   └── Command Center Components
├── Desktop Footer
└── BottomNavigation / AdminBottomNav (Mobile)
```

---

## 1. Page Header Section

**Location:** Top of the page
**Component:** Simple header div

```tsx
<h1>Command Center</h1>
<p>Real-time fleet telemetry and operational status.</p>
```

**Purpose:**
- Provides page title and context
- Sets user expectations for the dashboard content

---

## 2. Admin GPS Status Card (Admin Only)

**Component:** `AdminGpsStatus`
**File:** `src/components/fleet/AdminGpsStatus.tsx`
**Visibility:** Only shown to admin users

### Features:
- **GPS Token Management**
  - Displays current GPS API authentication token status
  - Shows token expiration time and validity
  - Auto-refreshes token when expired or missing
  - Manual refresh button for on-demand token renewal

### Data Displayed:
- **Token Status Badge:**
  - ✅ "Active" (green) - Token is valid
  - ❌ "Expired" or "No Token" (red) - Token needs refresh
  
- **Token Information:**
  - Last Refreshed: Timestamp of last token update
  - Expires: Time until token expiration (e.g., "23h 45m remaining")
  - Refreshed By: User who last refreshed the token (if available)

### Functionality:
- **Auto-Refresh Logic:**
  - Checks token status on component mount
  - Automatically refreshes if token is expired or missing
  - Prevents GPS API failures due to expired tokens

- **Manual Refresh:**
  - Calls `gps-auth` edge function
  - Updates token in `app_settings` table
  - Shows toast notification with new expiration time

### Technical Details:
- Fetches from `app_settings` table where `key = 'gps_token'`
- Token valid for 24 hours
- Uses Supabase Edge Function for secure token refresh

---

## 3. GPS Sync Health Dashboard (Admin Only)

**Component:** `GpsSyncHealthDashboard`
**File:** `src/components/fleet/GpsSyncHealthDashboard.tsx`
**Visibility:** Only shown to admin users

### Features:
- **Real-time Synchronization Monitoring**
  - Tracks GPS data freshness across entire fleet
  - Auto-refreshes every 30 seconds
  - Provides health status indicators

### Data Displayed:

#### Main Metrics Grid (4 cards):
1. **Total Fleet**
   - Total number of registered vehicles
   - Icon: Truck

2. **Online**
   - Count of vehicles currently online
   - Color: Green
   - Icon: Wifi

3. **Moving**
   - Count of vehicles currently in motion
   - Color: Blue
   - Icon: Activity

4. **Stale (>5min)**
   - Count of vehicles with data older than 5 minutes
   - Color: Red (if > 0)
   - Icon: WifiOff
   - Highlighted with red ring if stale vehicles exist

#### Sync Timing Details:
- **Avg Sync Age:** Average time since last GPS update (formatted as seconds/minutes/hours)
- **Oldest:** Time of oldest GPS sync in fleet
- **Newest:** Time of most recent GPS sync in fleet

### Health Status Badge:
- **Excellent:** Avg age < 60 seconds
- **Good:** Avg age < 180 seconds (3 minutes)
- **Fair:** Avg age < 300 seconds (5 minutes)
- **Degraded:** Avg age ≥ 300 seconds

### Technical Details:
- Queries `v_gps_sync_health` database view
- Refetch interval: 30 seconds
- Stale time: 10 seconds
- Uses React Query for caching and auto-refresh

---

## 4. Error State Display

**Component:** Inline error message
**Visibility:** Only shown when `error` exists

```tsx
<div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-destructive">
  Connection Error: {error}
</div>
```

**Purpose:**
- Displays connection errors from `useFleetData` hook
- Alerts users to data fetching issues
- Uses destructive styling for visibility

---

## 5. Metrics Grid (3 Key Performance Indicators)

**Component:** `MetricCard` (reused 3 times)
**File:** `src/components/fleet/MetricCard.tsx`
**Layout:** Responsive grid (1 column mobile, 3 columns desktop)

### Metric Cards:

#### A. Online Vehicles
- **Icon:** Wifi
- **Value:** `metrics.onlineCount` - Number of vehicles currently online
- **Change Text:**
  - Shows: `"X tracked / Y registered"` if some vehicles have no data
  - Shows: `"Y total"` if all vehicles have data
- **Change Type:** Positive (if onlineCount > 0) or Neutral

#### B. Moving Now
- **Icon:** MapPin
- **Value:** `metrics.movingNow` - Number of vehicles currently in motion
- **Change Text:** `"X% of online"` - Percentage of online vehicles that are moving
- **Change Type:** Positive (if movingNow > 0) or Neutral

#### C. Low Battery
- **Icon:** BatteryWarning
- **Value:** `metrics.lowBatteryCount` - Number of vehicles with low battery
- **Change Text:**
  - `"Needs attention"` if lowBatteryCount > 0
  - `"All healthy"` if lowBatteryCount === 0
- **Change Type:** Negative (if > 0) or Positive (if 0)

### MetricCard Component Structure:
- **Card Container:** Hover effect with border color change
- **Content Layout:**
  - Left: Title, value, change text
  - Right: Icon in colored background circle
- **Styling:**
  - Title: Small, muted text
  - Value: Large, bold (3xl)
  - Change: Colored based on type (green/red/gray)

---

## 6. Quick Actions Card

**Component:** Card with action buttons
**Purpose:** Provides quick access to common fleet management tasks

### Actions Available:

#### A. Add Vehicle
- **Icon:** Plus
- **Action:** Navigates to `/fleet` page
- **Purpose:** Add new vehicle to fleet

#### B. Refresh GPS
- **Icon:** RefreshCw (spins when loading)
- **Action:** Calls `refetch()` from `useFleetData` hook
- **State:** Disabled while `loading === true`
- **Purpose:** Manually refresh fleet data from GPS API

#### C. Add Driver
- **Icon:** UserPlus
- **Action:** Navigates to `/fleet?tab=drivers`
- **Purpose:** Add new driver to system

### Layout:
- Flex wrap layout for responsive design
- Buttons use outline variant
- Icons positioned before text

---

## 7. Recent Activity Feed

**Component:** `RecentActivityFeed`
**File:** `src/components/fleet/RecentActivityFeed.tsx`
**Purpose:** Real-time activity stream of fleet events

### Features:

#### Activity Types Detected:
1. **Movement** (Info)
   - Vehicle moving at speed
   - Icon: Navigation (green)
   - Message: "Moving at X km/h"

2. **Ignition On** (Info)
   - Engine started
   - Icon: Power (green)
   - Message: "Engine started - Battery X%"

3. **Stop** (Info)
   - Vehicle stopped
   - Icon: MapPin (gray)
   - Message: "Vehicle stopped"

4. **Overspeeding** (Error)
   - Speed exceeds 100 km/h threshold
   - Icon: AlertTriangle (red)
   - Message: "Overspeeding detected at X km/h"

5. **Low Battery** (Warning)
   - Battery drops below 20%
   - Icon: Battery (yellow)
   - Message: "Low battery warning - X%"

### Data Source:
- Queries `position_history` table
- Derives events by comparing consecutive position records
- Fetches vehicle names from `vehicles` table for display

### Real-time Updates:
- Subscribes to `position_history` INSERT events via Supabase Realtime
- Auto-refreshes feed when new positions arrive
- Live indicator dot (pulsing green) when showing fleet-wide activity

### Display Features:
- **Scrollable Area:** Fixed height (320px) with scroll
- **Activity Items:**
  - Icon in circular background
  - Vehicle name (or activity message if filtered by device)
  - Activity message
  - Severity badge (info/warning/error)
  - Relative time (e.g., "2 minutes ago")
- **Animations:** Slide-in and fade-in effects with staggered delays
- **Loading State:** Skeleton loaders while fetching
- **Empty State:** Message when no activities found

### Filtering:
- Can filter by specific `deviceId` (optional prop)
- Shows device-specific activity when filtered
- Shows fleet-wide activity when not filtered

---

## 8. Data Flow & Hooks

### useFleetData Hook
**File:** `src/hooks/useFleetData.ts`

**Returns:**
- `vehicles`: Array of FleetVehicle objects
- `metrics`: FleetMetrics object with aggregated stats
- `loading`: Boolean loading state
- `error`: Error message string (if any)
- `connectionStatus`: 'connecting' | 'connected' | 'disconnected'
- `refetch`: Function to manually refresh data

**Metrics Calculated:**
- `totalVehicles`: Total registered vehicles
- `onlineCount`: Vehicles with `is_online === true`
- `movingNow`: Vehicles with `speed > 0` and `is_online === true`
- `lowBatteryCount`: Vehicles with `battery_percent < 20`
- `overspeedingCount`: Vehicles with `speed > 100`
- `avgFleetSpeed`: Average speed of moving vehicles
- `assignedDrivers`: Count of vehicles with assigned drivers

**Data Sources:**
- `vehicle_positions` view (main data source)
- Joins with `vehicles`, `vehicle_assignments`, `profiles` tables
- Real-time subscriptions for live updates

---

## 9. Layout Components

### DashboardLayout
**File:** `src/components/layouts/DashboardLayout.tsx`

**Features:**
- Wraps all dashboard pages
- Provides consistent layout structure
- Handles navigation (TopNav, BottomNav, AdminBottomNav)
- Manages connection status display
- Includes global components:
  - `GlobalAlertListener` - Real-time alert notifications
  - `StickyAlertBanner` - Top banner for critical alerts

**Connection Status Display:**
- Desktop: Shown in TopNavigation
- Mobile: Shown in mobile header
- States: Connected (green), Connecting (yellow), Disconnected (red)

---

## Component Dependencies

### External Libraries:
- **React Router:** Navigation (`useNavigate`, `useLocation`)
- **TanStack Query:** Data fetching and caching (`useQuery`)
- **Supabase:** Database queries and real-time subscriptions
- **Lucide React:** Icons
- **date-fns:** Date formatting (`formatDistanceToNow`)

### Internal Components:
- `MetricCard` - Reusable metric display
- `Card`, `CardContent`, `CardHeader`, `CardTitle` - UI primitives
- `Button`, `Badge` - UI components
- `ScrollArea` - Scrollable container
- `Skeleton` - Loading placeholders

---

## Data Refresh Strategy

### Automatic Refresh:
1. **GPS Sync Health:** Every 30 seconds
2. **Activity Feed:** Real-time via Supabase subscriptions
3. **Fleet Data:** Via `useFleetData` hook (configurable intervals)

### Manual Refresh:
- **Refresh GPS Button:** Triggers `refetch()` from `useFleetData`
- **Token Refresh:** Manual button in AdminGpsStatus card

---

## Responsive Design

### Mobile (< 768px):
- Single column layout for metrics
- Stacked admin cards (GPS Status, Sync Health)
- Bottom navigation for quick access
- Compact header with connection status

### Desktop (≥ 768px):
- 3-column metrics grid
- Side-by-side admin cards (2 columns)
- Top navigation with all routes
- Full-width layout

---

## Performance Considerations

1. **Data Fetching:**
   - React Query caching reduces API calls
   - Stale time configuration prevents excessive refreshes
   - Selective data fetching (only needed fields)

2. **Real-time Updates:**
   - Efficient Supabase subscriptions
   - Channel cleanup on unmount
   - Debounced updates where appropriate

3. **Rendering:**
   - Conditional rendering (admin-only components)
   - Lazy loading for heavy components
   - Memoized calculations for metrics

---

## Security & Access Control

- **Admin-Only Components:**
  - `AdminGpsStatus` - Only visible to admin users
  - `GpsSyncHealthDashboard` - Only visible to admin users
  - Uses `isAdmin` from `useAuth()` hook

- **Protected Routes:**
  - All routes wrapped in `ProtectedRoute` component
  - Requires authentication to access

---

## Summary

The Command Center dashboard provides:
1. **Real-time Monitoring:** Live fleet status and activity
2. **Key Metrics:** At-a-glance KPIs (Online, Moving, Battery)
3. **Admin Tools:** GPS token management and sync health (admin only)
4. **Quick Actions:** Fast access to common tasks
5. **Activity Stream:** Real-time event feed
6. **Error Handling:** Clear error messages when issues occur

All components work together to provide a comprehensive operational dashboard for fleet management.
