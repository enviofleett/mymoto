-- =====================================================
-- Check and Fix Duplicate Trips for Device 358657105966092
-- =====================================================
-- Run in Supabase SQL Editor. Duplicates = same (device_id, start_time, end_time).
-- We keep the newest row (by id) per unique timing and delete the rest.

-- STEP 1: Count duplicates (exact match on start_time, end_time)
WITH dupe_groups AS (
  SELECT
    device_id,
    start_time,
    end_time,
    COUNT(*) AS cnt,
    array_agg(id ORDER BY id DESC) AS ids
  FROM vehicle_trips
  WHERE device_id = '358657105966092'
  GROUP BY device_id, start_time, end_time
  HAVING COUNT(*) > 1
)
SELECT
  (SELECT COUNT(*) FROM dupe_groups) AS duplicate_groups,
  (SELECT COALESCE(SUM(cnt - 1), 0)::bigint FROM dupe_groups) AS rows_to_delete;

-- STEP 2: Preview rows that will be REMOVED (we keep the first id in ids, delete the rest)
WITH dupe_groups AS (
  SELECT
    device_id,
    start_time,
    end_time,
    array_agg(id ORDER BY id DESC) AS ids
  FROM vehicle_trips
  WHERE device_id = '358657105966092'
  GROUP BY device_id, start_time, end_time
  HAVING COUNT(*) > 1
),
ids_to_delete AS (
  SELECT unnest(ids[2:array_length(ids, 1)]) AS id
  FROM dupe_groups
)
SELECT vt.id, vt.start_time, vt.end_time, vt.distance_km, vt.created_at
FROM vehicle_trips vt
JOIN ids_to_delete d ON vt.id = d.id
ORDER BY vt.start_time DESC;

-- STEP 3: Delete duplicates (keep newest by id per unique start_time, end_time)
-- IMPORTANT: Run STEP 1 and STEP 2 first to verify.
DELETE FROM vehicle_trips
WHERE id IN (
  WITH dupe_groups AS (
    SELECT
      device_id,
      start_time,
      end_time,
      array_agg(id ORDER BY id DESC) AS ids
    FROM vehicle_trips
    WHERE device_id = '358657105966092'
    GROUP BY device_id, start_time, end_time
    HAVING COUNT(*) > 1
  ),
  ids_to_delete AS (
    SELECT unnest(ids[2:array_length(ids, 1)]) AS id
    FROM dupe_groups
  )
  SELECT id FROM ids_to_delete
);

-- STEP 4: Verify no duplicates remain
SELECT
  start_time,
  end_time,
  COUNT(*) AS cnt
FROM vehicle_trips
WHERE device_id = '358657105966092'
GROUP BY start_time, end_time
HAVING COUNT(*) > 1;
-- Expected: 0 rows

-- STEP 5: Summary after cleanup
SELECT
  COUNT(*) AS total_trips,
  COUNT(DISTINCT (start_time, end_time)) AS unique_trips,
  ROUND(SUM(distance_km)::numeric, 2) AS total_distance_km
FROM vehicle_trips
WHERE device_id = '358657105966092';
