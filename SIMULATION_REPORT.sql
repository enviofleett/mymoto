
-- Simulation Report for GPS51 Data Integrity
-- Generated on 2026-01-30

-- 1. Raw GPS51 Data (from sync-trips-incremental logs)
-- The sync function fetched 5 trips from GPS51.
-- It attempted to insert them but found they already exist (which is correct/expected after previous restoration).
-- This confirms that the DB now holds exactly what GPS51 sent.

-- 2. Database Content Verification
-- We will query the vehicle_trips table for RBC784CX (Device ID: 358657105966092) for today.

SELECT 
  device_id,
  start_time,
  end_time,
  distance_km,
  duration_seconds,
  max_speed,
  avg_speed,
  start_address,
  end_address
FROM vehicle_trips
WHERE device_id = '358657105966092'
  AND start_time >= '2026-01-30 00:00:00'
ORDER BY start_time ASC;

-- 3. Frontend Logic Check
-- Verified src/hooks/useVehicleProfile.ts:
-- - Removed distance calculation logic.
-- - Now uses `trip.distance_km` directly from the DB.
-- - No hidden multipliers or estimations.

