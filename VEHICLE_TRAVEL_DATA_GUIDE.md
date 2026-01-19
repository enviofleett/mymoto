# Vehicle Travel Data Check Guide
## Vehicle ID: 13612332432

## Quick Start

### Option 1: Quick Status Check (Fastest)
**File:** `CHECK_VEHICLE_QUICK.sql`
- Current position and status
- Recent trips (last 7 days)
- Today's activity
- **Run this first for a quick overview**

### Option 2: Comprehensive Analysis
**File:** `CHECK_VEHICLE_TRAVEL_DATA.sql`
- Complete travel data analysis
- 14 different queries covering:
  - Basic vehicle info
  - Current position
  - Recent trips
  - Trip statistics
  - Position history
  - Daily summaries
  - Activity timeline
  - Speed analysis
  - Ignition patterns
  - Battery status
  - Longest trips
  - Data quality check
  - Quick status summary

---

## Query Categories

### 1. Current Status
- Vehicle basic information
- Current position & status
- Quick status summary

### 2. Trip Data
- Recent trips (last 30 days)
- Trip statistics summary
- Longest trips (all time)
- Most recent trip details

### 3. Activity Analysis
- Recent position history (last 24 hours)
- Daily travel summary (last 7 days)
- Recent activity timeline
- Today's activity

### 4. Performance Metrics
- Speed analysis
- Ignition patterns
- Battery status over time

### 5. Data Quality
- Data quality check
- Missing coordinates
- Invalid timestamps

---

## Usage

### Step 1: Quick Check
Run `CHECK_VEHICLE_QUICK.sql` to get immediate status.

### Step 2: Detailed Analysis (If Needed)
Run specific queries from `CHECK_VEHICLE_TRAVEL_DATA.sql` based on what you need:
- Query 1-2: Basic info and current status
- Query 3-4: Trip data
- Query 5-7: Activity analysis
- Query 8-10: Performance metrics
- Query 11-12: Trip details
- Query 13-14: Data quality and summary

---

## Expected Results

### If Vehicle is Active:
- Recent GPS updates
- Recent trips
- Current position data
- Battery status
- Speed data

### If Vehicle is Inactive:
- Old GPS timestamps
- No recent trips
- May show offline status
- Last known position

### If No Data:
- Vehicle may not exist in database
- Check device_id spelling
- Verify vehicle is assigned to users

---

## Troubleshooting

### No Results Found
1. Check device_id is correct: `13612332432`
2. Verify vehicle exists: Run Query 1 from comprehensive file
3. Check if vehicle is assigned to any users

### Old Data Only
1. Check last_synced_at in vehicle_positions
2. Verify GPS device is online
3. Check if vehicle needs manual sync

### Missing Trips
1. Check position_history has recent data
2. Verify trip processing is running
3. Check if trips exist but are filtered out

---

## Notes

- All timestamps use Lagos timezone (Africa/Lagos, UTC+1)
- Queries are optimized to prevent timeouts
- Recent data queries use time-based filters
- Large result sets are limited with LIMIT clauses
