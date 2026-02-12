-- ============================================================================
-- VERIFY VEHICLE DATA FOR RBC784CX (2026-02-08)
-- ============================================================================
-- Run this script in the Supabase SQL Editor to confirm data for today.
-- Target Vehicle: RBC784CX (Device ID: 358657105966092)
-- Target Date: 2026-02-08
-- ============================================================================

-- 1. VEHICLE IDENTITY CHECK
SELECT device_id, device_name, model, year, fuel_type 
FROM public.vehicles 
WHERE device_id = '358657105966092';

-- 2. TRIP DETAILS (Start, End, Mileage, Drive Time, Speed)
-- Source: vehicle_trips (Synced from GPS51)
SELECT 
    start_time,
    end_time,
    duration_seconds / 60 AS duration_minutes,
    distance_km,
    max_speed AS max_speed_kmh,
    avg_speed AS avg_speed_kmh,
    start_address,
    end_address
FROM public.vehicle_trips
WHERE device_id = '358657105966092'
  AND start_time >= '2026-02-08 00:00:00'
  AND start_time <= '2026-02-08 23:59:59'
ORDER BY start_time ASC;

-- 3. FUEL & MILEAGE SUMMARY
-- Source: vehicle_mileage_details (GPS51 Daily Report)
SELECT 
    statisticsday AS date,
    totaldistance AS total_daily_km,
    oilper100km AS fuel_efficiency_l_100km,
    beginoil AS start_fuel_level,
    endoil AS end_fuel_level,
    leakoil AS potential_theft_amount
FROM public.vehicle_mileage_details
WHERE device_id = '358657105966092'
  AND statisticsday = '2026-02-08';

-- 4. BATTERY LEVEL (Latest & History)
-- Source: vehicle_positions (Live) and position_history (Trend)
SELECT 
    'Current Status' as type,
    battery_percent, 
    gps_time as timestamp
FROM public.vehicle_positions
WHERE device_id = '358657105966092'
UNION ALL
(SELECT 
    'History' as type,
    battery_percent,
    gps_time
 FROM public.position_history
 WHERE device_id = '358657105966092'
   AND gps_time >= '2026-02-08 00:00:00'
 ORDER BY gps_time DESC
 LIMIT 5);

-- 5. DAILY AGGREGATES
-- Source: vehicle_daily_stats
SELECT * 
FROM public.vehicle_daily_stats
WHERE device_id = '358657105966092'
  AND stat_date = '2026-02-08';
