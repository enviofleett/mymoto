# Investigation: Why Reconciliation Fixed 0 Trips

**Issue:** Reconciliation checked 264 trips but fixed 0, even though 188 trips are missing coordinates (28.79% completeness)

**Possible Causes:**
1. Trips might have NULL coordinates instead of (0,0)
2. `position_history` might not have data for those time periods
3. Backfill window (±15 min) might not be finding matching positions

---

## 🔍 Investigation Queries

### Query 1: Check Actual Coordinate Values

**Run in SQL Editor:**

```sql
-- Check what values missing coordinates actually have
SELECT 
  COUNT(*) as trips_missing_coords,
  COUNT(*) FILTER (WHERE start_latitude = 0) as start_lat_zero,
  COUNT(*) FILTER (WHERE start_latitude IS NULL) as start_lat_null,
  COUNT(*) FILTER (WHERE end_latitude = 0) as end_lat_zero,
  COUNT(*) FILTER (WHERE end_latitude IS NULL) as end_lat_null
FROM vehicle_trips
WHERE device_id = '358657106048551'
  AND (start_latitude = 0 OR start_latitude IS NULL OR end_latitude = 0 OR end_latitude IS NULL);
```

**This will show:** Whether missing coordinates are 0 or NULL

---

### Query 2: Check Position History Coverage

**Run in SQL Editor:**

```sql
-- Check if position_history has data for this device
SELECT 
  COUNT(*) as total_positions,
  MIN(gps_time) as earliest_position,
  MAX(gps_time) as latest_position,
  COUNT(*) FILTER (WHERE gps_time >= '2025-12-22' AND gps_time <= '2026-01-21') as positions_in_range
FROM position_history
WHERE device_id = '358657106048551';
```

**This will show:** If position_history has data available for backfilling

---

### Query 3: Check Specific Trip Times

**Run in SQL Editor:**

```sql
-- Check if position_history has data near specific trip times
WITH sample_trips AS (
  SELECT 
    id,
    start_time,
    end_time
  FROM vehicle_trips
  WHERE device_id = '358657106048551'
    AND (start_latitude = 0 OR end_latitude = 0)
  LIMIT 5
)
SELECT 
  st.id as trip_id,
  st.start_time,
  st.end_time,
  COUNT(ph.id) FILTER (
    WHERE ph.gps_time >= st.start_time - INTERVAL '15 minutes'
      AND ph.gps_time <= st.start_time + INTERVAL '15 minutes'
      AND ph.latitude != 0
      AND ph.longitude != 0
  ) as positions_near_start,
  COUNT(ph.id) FILTER (
    WHERE ph.gps_time >= st.end_time - INTERVAL '15 minutes'
      AND ph.gps_time <= st.end_time + INTERVAL '15 minutes'
      AND ph.latitude != 0
      AND ph.longitude != 0
  ) as positions_near_end
FROM sample_trips st
LEFT JOIN position_history ph ON ph.device_id = '358657106048551'
GROUP BY st.id, st.start_time, st.end_time;
```

**This will show:** If position_history has data within ±15 minutes of trip times

---

## 🔧 Potential Fixes

### Fix 1: Handle NULL Coordinates

If trips have NULL instead of 0, update the reconciliation function to handle NULL:

```typescript
const needsBackfill =
  trip.start_latitude === 0 || trip.start_latitude === null ||
  trip.start_longitude === 0 || trip.start_longitude === null ||
  trip.end_latitude === 0 || trip.end_latitude === null ||
  trip.end_longitude === 0 || trip.end_longitude === null;
```

### Fix 2: Check Position History Availability

If `position_history` has no data, coordinates cannot be backfilled. In this case:
- New trips will get coordinates from GPS51 (if provided)
- Existing trips without coordinates cannot be fixed without position_history data

---

## 📋 Next Steps

1. **Run Query 1** - Check if coordinates are 0 or NULL
2. **Run Query 2** - Check if position_history has data
3. **Run Query 3** - Check if positions exist near trip times
4. **Share results** - So we can determine the root cause

---

**Run the investigation queries above and share the results!**
