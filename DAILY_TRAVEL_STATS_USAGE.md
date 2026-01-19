# Daily Travel Stats Endpoint - Usage Guide

## Overview

This endpoint provides daily travel statistics (distance and time) for trips between **7am and 6pm** (Lagos timezone) for any vehicle.

## API Endpoint

**URL:** `/functions/v1/daily-travel-stats`

**Method:** GET

**Query Parameters:**
- `device_id` (required): Vehicle device ID
- `start_date` (optional): Start date in YYYY-MM-DD format (default: 30 days ago)
- `end_date` (optional): End date in YYYY-MM-DD format (default: today)

## Example Usage

### 1. Using the React Hook (Recommended)

```typescript
import { useDailyTravelStats } from '@/hooks/useDailyTravelStats'

function MyComponent() {
  const { data, isLoading, error } = useDailyTravelStats({
    deviceId: '13612332432',
    startDate: '2026-01-01',
    endDate: '2026-01-31',
  })

  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>

  return (
    <div>
      <h2>Total Distance: {data.summary.total_distance_km} km</h2>
      <h2>Total Time: {data.summary.total_travel_time_minutes} minutes</h2>
      {/* ... */}
    </div>
  )
}
```

### 2. Using the React Component

```typescript
import { DailyTravelStats } from '@/components/fleet/DailyTravelStats'

function MyPage() {
  return (
    <DailyTravelStats 
      deviceId="13612332432"
      startDate="2026-01-01"
      endDate="2026-01-31"
    />
  )
}
```

### 3. Direct API Call (cURL)

```bash
curl -X GET \
  "https://your-project.supabase.co/functions/v1/daily-travel-stats?device_id=13612332432&start_date=2026-01-01&end_date=2026-01-31" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "apikey: YOUR_ANON_KEY"
```

### 4. Direct API Call (JavaScript)

```javascript
const response = await fetch(
  `https://your-project.supabase.co/functions/v1/daily-travel-stats?device_id=13612332432&start_date=2026-01-01&end_date=2026-01-31`,
  {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'apikey': anonKey,
    },
  }
)

const data = await response.json()
```

## Response Format

```json
{
  "device_id": "13612332432",
  "date_range": {
    "start": "2026-01-01",
    "end": "2026-01-31"
  },
  "time_window": {
    "start": "07:00",
    "end": "18:00",
    "timezone": "Africa/Lagos"
  },
  "daily_stats": [
    {
      "travel_date": "2026-01-19",
      "total_distance_km": 45.5,
      "total_travel_time_minutes": 120.5,
      "trip_count": 3,
      "avg_speed_kmh": 45.2,
      "max_speed_kmh": 85.0,
      "first_trip_start": "2026-01-19T07:15:00Z",
      "last_trip_end": "2026-01-19T17:45:00Z"
    }
  ],
  "summary": {
    "total_days": 5,
    "total_distance_km": "225.50",
    "total_travel_time_minutes": "600.25",
    "total_trips": 15
  }
}
```

## Features

### Time Window Filtering
- Only includes trips that occur between **7am and 6pm** (Lagos timezone)
- Uses `EXTRACT(HOUR FROM ... AT TIME ZONE 'Africa/Lagos')` to filter by local time

### Daily Aggregation
- Groups trips by date (Lagos timezone)
- Calculates totals per day
- Provides summary statistics

### Metrics Included
- **Distance**: Total kilometers traveled
- **Travel Time**: Total minutes of travel
- **Trip Count**: Number of trips per day
- **Average Speed**: Average speed across all trips
- **Max Speed**: Maximum speed recorded
- **Time Range**: First and last trip times

## Database Function

The endpoint uses the `get_daily_travel_stats()` PostgreSQL function:

```sql
SELECT * FROM get_daily_travel_stats(
  '13612332432',  -- device_id
  '2026-01-01',   -- start_date
  '2026-01-31'    -- end_date
);
```

## Files Created

1. **Migration**: `supabase/migrations/20260120000010_daily_travel_stats_function.sql`
   - Creates the `get_daily_travel_stats()` database function

2. **Edge Function**: `supabase/functions/daily-travel-stats/index.ts`
   - API endpoint that calls the database function
   - Handles GET requests with query parameters

3. **React Hook**: `src/hooks/useDailyTravelStats.ts`
   - React Query hook for fetching stats
   - Handles loading, error, and caching

4. **React Component**: `src/components/fleet/DailyTravelStats.tsx`
   - UI component to display daily travel stats
   - Shows summary cards and daily breakdown

## Testing

### Test the Database Function

```sql
-- Test with specific vehicle
SELECT * FROM get_daily_travel_stats('13612332432');

-- Test with date range
SELECT * FROM get_daily_travel_stats(
  '13612332432',
  '2026-01-01',
  '2026-01-31'
);
```

### Test the Edge Function

After deploying, test with:
```bash
curl -X GET \
  "https://your-project.supabase.co/functions/v1/daily-travel-stats?device_id=13612332432" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Notes

- All times are in **Lagos timezone** (Africa/Lagos, UTC+1)
- Only trips between **7am-6pm** are included
- Results are cached for 5 minutes (React Query)
- Function is optimized with proper indexing on `vehicle_trips` table
