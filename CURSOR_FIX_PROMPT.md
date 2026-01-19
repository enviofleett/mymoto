# 🎯 CURSOR AI: FIX TRIP ACCURACY & IGNITION DETECTION

## 📋 MISSION OBJECTIVE

Fix critical issues in GPS trip reporting and ignition detection for a fleet management system that uses the GPS51 API. The current implementation has two major problems:

1. **IGNITION DETECTION IS INACCURATE** - Uses fragile string parsing instead of proper bit field parsing
2. **MISSING ACC REPORT API** - Should use GPS51's `reportaccsbytime` API for accurate ignition state changes

---

## 🎯 TASKS TO COMPLETE

### ✅ **TASK 1: Fix Ignition Detection (PRIORITY 1)**

**Problem:** Current implementation parses ignition state from a string field instead of using the proper status bit field.

**Current Code (BROKEN):**
```typescript
// File: supabase/functions/gps-data/index.ts:43-47
function parseIgnition(strstatus: string | null): boolean {
  if (!strstatus) return false
  return strstatus.toUpperCase().includes('ACC ON')  // ❌ TOO FRAGILE
}
```

**What's Wrong:**
- String format can vary: "ACC ON", "ACC:ON", "Acc On", "ACC_ON"
- Language variations possible
- No confidence scoring
- Ignores the proper `status` field which contains JT808 protocol bit flags

**API Documentation Reference:**
```
Section 4.1 - Last Position Response Fields:
- status (long): JT808 protocol status bits (AUTHORITATIVE SOURCE)
- strstatus (String): Human-readable status description
```

**YOUR TASK:**
1. Create improved ignition parser that uses BOTH `status` field and `strstatus` fallback
2. Update all 3 locations where ignition is parsed
3. Add logging for detection confidence

**Implementation Required:**

```typescript
/**
 * Parse ignition state from GPS51 lastposition response
 * Uses JT808 status bits (primary) with string parsing fallback
 *
 * @param status - JT808 protocol status bits (long integer)
 * @param strstatus - Human-readable status string
 * @returns Object with ignition state and confidence score
 */
interface IgnitionResult {
  ignition_on: boolean;
  confidence: number; // 0.0 to 1.0
  detection_method: 'status_bit' | 'string_parse' | 'unknown';
}

function parseIgnitionImproved(
  status: number | null,
  strstatus: string | null
): IgnitionResult {
  // METHOD 1: Parse JT808 status bits (MOST ACCURATE)
  // According to JT808 protocol, ACC is typically bit 0
  // status field from GPS51 API Section 4.1
  if (status !== null && status !== undefined && typeof status === 'number') {
    // JT808 Protocol: Bit 0 = ACC state (0=OFF, 1=ON)
    const ACC_BIT_MASK = 0x01; // Bit 0
    const ignitionFromBit = (status & ACC_BIT_MASK) !== 0;

    return {
      ignition_on: ignitionFromBit,
      confidence: 1.0, // Highest confidence
      detection_method: 'status_bit'
    };
  }

  // METHOD 2: String parsing fallback (LESS ACCURATE)
  if (strstatus && typeof strstatus === 'string') {
    const statusUpper = strstatus.toUpperCase();

    // Explicit ACC ON patterns
    const accOnPatterns = [
      'ACC ON',
      'ACC:ON',
      'ACC_ON',
      'ACCON',
      /\bACC\s*ON\b/,
      /\bACC\s*:\s*ON\b/
    ];

    // Explicit ACC OFF patterns
    const accOffPatterns = [
      'ACC OFF',
      'ACC:OFF',
      'ACC_OFF',
      'ACCOFF',
      /\bACC\s*OFF\b/,
      /\bACC\s*:\s*OFF\b/
    ];

    // Check for ACC ON
    for (const pattern of accOnPatterns) {
      if (typeof pattern === 'string') {
        if (statusUpper.includes(pattern)) {
          return {
            ignition_on: true,
            confidence: 0.7, // Medium confidence
            detection_method: 'string_parse'
          };
        }
      } else if (pattern instanceof RegExp) {
        if (pattern.test(statusUpper)) {
          return {
            ignition_on: true,
            confidence: 0.8, // Higher confidence for regex match
            detection_method: 'string_parse'
          };
        }
      }
    }

    // Check for ACC OFF
    for (const pattern of accOffPatterns) {
      if (typeof pattern === 'string') {
        if (statusUpper.includes(pattern)) {
          return {
            ignition_on: false,
            confidence: 0.7,
            detection_method: 'string_parse'
          };
        }
      } else if (pattern instanceof RegExp) {
        if (pattern.test(statusUpper)) {
          return {
            ignition_on: false,
            confidence: 0.8,
            detection_method: 'string_parse'
          };
        }
      }
    }

    // Unknown pattern
    console.warn(`[parseIgnition] Unknown strstatus format: "${strstatus}"`);
    return {
      ignition_on: false,
      confidence: 0.3, // Low confidence
      detection_method: 'unknown'
    };
  }

  // No data available
  console.warn('[parseIgnition] No status or strstatus data available');
  return {
    ignition_on: false,
    confidence: 0.0,
    detection_method: 'unknown'
  };
}
```

**Files to Update:**

1. **`supabase/functions/gps-data/index.ts`**
   - Replace function at line 43-47
   - Update usage at line 143:
   ```typescript
   // OLD (line 143):
   ignition_on: parseIgnition(record.strstatus),

   // NEW:
   const ignitionResult = parseIgnitionImproved(record.status, record.strstatus);
   // Store result
   ignition_on: ignitionResult.ignition_on,
   ignition_confidence: ignitionResult.confidence,
   ignition_detection_method: ignitionResult.detection_method
   ```

2. **`supabase/functions/gps-history-backfill/index.ts`**
   - Replace function at line 33-36
   - Update usage at line 89:
   ```typescript
   // OLD (line 89):
   ignition_on: parseIgnition(record.strstatus || record.status)

   // NEW:
   const ignitionResult = parseIgnitionImproved(
     record.status,
     record.strstatus || record.statusstr
   );
   ignition_on: ignitionResult.ignition_on
   ```

3. **`supabase/functions/vehicle-chat/index.ts`**
   - Replace inline parsing at line 1157:
   ```typescript
   // OLD (line 1157):
   ignition_on: freshData.strstatus?.toUpperCase().includes('ACC ON') || false,

   // NEW:
   const ignitionResult = parseIgnitionImproved(freshData.status, freshData.strstatus);
   ignition_on: ignitionResult.ignition_on,
   ```

**Add Logging:**
```typescript
// In syncPositions function (gps-data/index.ts around line 164)
// After batch upsert
const lowConfidenceCount = positions.filter(p =>
  p.ignition_confidence && p.ignition_confidence < 0.5
).length;

if (lowConfidenceCount > 0) {
  console.warn(
    `[syncPositions] ${lowConfidenceCount}/${positions.length} positions have low ignition detection confidence`
  );
}
```

---

### ✅ **TASK 2: Implement ACC Report API (PRIORITY 2)**

**Problem:** Missing implementation of GPS51's `reportaccsbytime` API which provides authoritative ignition state changes.

**API Documentation:**
```
Section 6.3: ACC Report
Action: reportaccsbytime

Request:
{
  "deviceids": ["device1", "device2"],  // Array of device IDs
  "starttime": "2024-01-01 00:00:00",   // Format: yyyy-MM-dd HH:mm:ss
  "endtime": "2024-01-02 00:00:00",
  "offset": 8                            // Timezone offset (GMT+8)
}

Response:
{
  "status": 0,                           // 0 = success
  "cause": "OK",
  "records": [
    {
      "accstateid": 123456,
      "accstate": 3,                     // 2=OFF, 3=ON (EXPLICIT STATE)
      "begintime": 1704067200000,        // Timestamp in ms
      "endtime": 1704070800000,
      "slat": 23.123456,                 // Start latitude
      "slon": 113.123456,                // Start longitude
      "elat": 23.234567,                 // End latitude
      "elon": 113.234567                 // End longitude
    }
  ]
}
```

**YOUR TASK:**
Create a new edge function to call the ACC Report API.

**File to Create: `supabase/functions/gps-acc-report/index.ts`**

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callGps51WithRateLimit, getValidGps51Token } from "../_shared/gps51-client.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * GPS51 ACC Report Edge Function
 * Fetches accurate ignition state changes from GPS51 API
 * API Documentation: Section 6.3 - reportaccsbytime
 */

interface AccReportRecord {
  accstateid: number;
  accstate: number;      // 2=OFF, 3=ON
  begintime: number;     // Timestamp in ms
  endtime: number;
  slat: number;          // Start latitude
  slon: number;          // Start longitude
  elat: number;          // End latitude
  elon: number;          // End longitude
}

interface AccStateChange {
  device_id: string;
  acc_state: 'ON' | 'OFF';
  begin_time: string;    // ISO timestamp
  end_time: string;
  start_latitude: number;
  start_longitude: number;
  end_latitude: number;
  end_longitude: number;
  raw_state_id: number;
}

// Format date for GPS51 API (yyyy-MM-dd HH:mm:ss)
function formatDateForGps51(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// Map GPS51 ACC state to our format
function mapAccState(gps51State: number): 'ON' | 'OFF' {
  // Per GPS51 API Section 6.3:
  // 2 = ACC OFF
  // 3 = ACC ON
  return gps51State === 3 ? 'ON' : 'OFF';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  try {
    const { device_ids, start_date, end_date, timezone = 8 } = await req.json()

    if (!device_ids || !Array.isArray(device_ids) || device_ids.length === 0) {
      throw new Error('device_ids array is required')
    }

    if (!start_date || !end_date) {
      throw new Error('start_date and end_date are required')
    }

    const DO_PROXY_URL = Deno.env.get('DO_PROXY_URL')
    if (!DO_PROXY_URL) throw new Error('Missing DO_PROXY_URL')

    // Get GPS51 token
    const { token, serverid } = await getValidGps51Token(supabase)

    // Format dates
    const startTime = formatDateForGps51(new Date(start_date))
    const endTime = formatDateForGps51(new Date(end_date))

    console.log(`[gps-acc-report] Fetching ACC report for ${device_ids.length} devices from ${startTime} to ${endTime}`)

    // Call GPS51 API: reportaccsbytime (Section 6.3)
    const result = await callGps51WithRateLimit(
      supabase,
      DO_PROXY_URL,
      'reportaccsbytime',  // API action
      token,
      serverid,
      {
        deviceids: device_ids,
        starttime: startTime,
        endtime: endTime,
        offset: timezone
      }
    )

    if (result.status !== 0) {
      throw new Error(`GPS51 ACC report error: ${result.cause || 'Unknown error'} (status: ${result.status})`)
    }

    // Map to standardized format
    const accChanges: AccStateChange[] = (result.records || []).map((rec: AccReportRecord) => ({
      device_id: rec.deviceid || device_ids[0], // Some responses may not include deviceid per record
      acc_state: mapAccState(rec.accstate),
      begin_time: new Date(rec.begintime).toISOString(),
      end_time: new Date(rec.endtime).toISOString(),
      start_latitude: rec.slat,
      start_longitude: rec.slon,
      end_latitude: rec.elat,
      end_longitude: rec.elon,
      raw_state_id: rec.accstateid
    }))

    console.log(`[gps-acc-report] Retrieved ${accChanges.length} ACC state changes`)

    // Optionally store in database
    if (accChanges.length > 0) {
      const { error: insertError } = await supabase
        .from('acc_state_history')
        .upsert(
          accChanges.map(change => ({
            device_id: change.device_id,
            acc_state: change.acc_state,
            begin_time: change.begin_time,
            end_time: change.end_time,
            start_latitude: change.start_latitude,
            start_longitude: change.start_longitude,
            end_latitude: change.end_latitude,
            end_longitude: change.end_longitude,
            raw_state_id: change.raw_state_id,
            synced_at: new Date().toISOString()
          })),
          {
            onConflict: 'device_id,begin_time',
            ignoreDuplicates: false
          }
        )

      if (insertError) {
        console.error('[gps-acc-report] Error storing ACC changes:', insertError)
      } else {
        console.log(`[gps-acc-report] Stored ${accChanges.length} ACC changes to database`)
      }
    }

    return new Response(JSON.stringify({
      success: true,
      count: accChanges.length,
      records: accChanges
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[gps-acc-report] Error:', message)

    return new Response(JSON.stringify({
      success: false,
      error: message
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
```

**Database Migration to Create:**

**File: `supabase/migrations/[timestamp]_create_acc_state_history.sql`**

```sql
-- =====================================================
-- ACC State History Table
-- Stores ignition state changes from GPS51 API
-- Data Source: GPS51 reportaccsbytime API (Section 6.3)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.acc_state_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL REFERENCES public.vehicles(device_id) ON DELETE CASCADE,
  acc_state TEXT NOT NULL CHECK (acc_state IN ('ON', 'OFF')),
  begin_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  start_latitude DOUBLE PRECISION,
  start_longitude DOUBLE PRECISION,
  end_latitude DOUBLE PRECISION,
  end_longitude DOUBLE PRECISION,
  raw_state_id INTEGER,  -- GPS51's accstateid
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicate entries for same device and time
  UNIQUE(device_id, begin_time)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_acc_history_device_time
ON public.acc_state_history(device_id, begin_time DESC);

CREATE INDEX IF NOT EXISTS idx_acc_history_state
ON public.acc_state_history(acc_state, begin_time DESC);

-- Index for finding ACC changes within time range
CREATE INDEX IF NOT EXISTS idx_acc_history_time_range
ON public.acc_state_history(begin_time, end_time);

-- RLS Policies
ALTER TABLE public.acc_state_history ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read ACC history
CREATE POLICY "Allow authenticated read access to acc_state_history"
ON public.acc_state_history
FOR SELECT
TO authenticated
USING (true);

-- Allow service role full access
CREATE POLICY "Allow service role full access to acc_state_history"
ON public.acc_state_history
FOR ALL
TO service_role
USING (true);

-- Grant permissions
GRANT SELECT ON public.acc_state_history TO authenticated;
GRANT ALL ON public.acc_state_history TO service_role;

-- Comments
COMMENT ON TABLE public.acc_state_history IS 'Ignition state changes from GPS51 reportaccsbytime API (Section 6.3)';
COMMENT ON COLUMN public.acc_state_history.acc_state IS 'ACC state: ON or OFF (from GPS51 accstate: 2=OFF, 3=ON)';
COMMENT ON COLUMN public.acc_state_history.begin_time IS 'Timestamp when ACC state began';
COMMENT ON COLUMN public.acc_state_history.end_time IS 'Timestamp when ACC state ended';
COMMENT ON COLUMN public.acc_state_history.raw_state_id IS 'Original accstateid from GPS51 API';
```

---

### ✅ **TASK 3: Update Database Schema (PRIORITY 3)**

**YOUR TASK:**
Add confidence tracking columns to existing tables.

**File: `supabase/migrations/[timestamp]_add_ignition_confidence.sql`**

```sql
-- =====================================================
-- Add Ignition Detection Confidence Tracking
-- =====================================================

-- Add confidence columns to vehicle_positions
ALTER TABLE public.vehicle_positions
ADD COLUMN IF NOT EXISTS ignition_confidence DECIMAL(3,2) DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS ignition_detection_method TEXT DEFAULT 'unknown';

-- Add confidence columns to position_history
ALTER TABLE public.position_history
ADD COLUMN IF NOT EXISTS ignition_confidence DECIMAL(3,2),
ADD COLUMN IF NOT EXISTS ignition_detection_method TEXT;

-- Add index for monitoring low confidence detections
CREATE INDEX IF NOT EXISTS idx_position_history_low_confidence
ON public.position_history(device_id, ignition_confidence)
WHERE ignition_confidence < 0.5;

-- Comments
COMMENT ON COLUMN public.vehicle_positions.ignition_confidence IS 'Confidence score for ignition detection (0.0-1.0)';
COMMENT ON COLUMN public.vehicle_positions.ignition_detection_method IS 'Method used: status_bit, string_parse, or unknown';
COMMENT ON COLUMN public.position_history.ignition_confidence IS 'Confidence score for ignition detection (0.0-1.0)';
COMMENT ON COLUMN public.position_history.ignition_detection_method IS 'Method used: status_bit, string_parse, or unknown';
```

---

### ✅ **TASK 4: Add Monitoring Query (PRIORITY 4)**

**YOUR TASK:**
Create a helper function to monitor ignition detection quality.

**File: `supabase/migrations/[timestamp]_monitoring_functions.sql`**

```sql
-- =====================================================
-- Monitoring Function: Check Ignition Detection Quality
-- =====================================================

CREATE OR REPLACE FUNCTION public.check_ignition_detection_quality(
  p_hours INTEGER DEFAULT 24
)
RETURNS TABLE (
  device_id TEXT,
  total_readings BIGINT,
  low_confidence_count BIGINT,
  avg_confidence NUMERIC,
  detection_methods JSONB,
  acc_on_count BIGINT,
  acc_off_count BIGINT,
  quality_status TEXT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ph.device_id,
    COUNT(*) AS total_readings,
    COUNT(*) FILTER (WHERE ph.ignition_confidence < 0.5) AS low_confidence_count,
    ROUND(AVG(ph.ignition_confidence)::numeric, 3) AS avg_confidence,
    jsonb_object_agg(
      COALESCE(ph.ignition_detection_method, 'unknown'),
      COUNT(*) FILTER (WHERE ph.ignition_detection_method IS NOT NULL)
    ) AS detection_methods,
    COUNT(*) FILTER (WHERE ph.ignition_on = true) AS acc_on_count,
    COUNT(*) FILTER (WHERE ph.ignition_on = false) AS acc_off_count,
    CASE
      WHEN AVG(ph.ignition_confidence) >= 0.9 THEN 'EXCELLENT'
      WHEN AVG(ph.ignition_confidence) >= 0.7 THEN 'GOOD'
      WHEN AVG(ph.ignition_confidence) >= 0.5 THEN 'FAIR'
      ELSE 'POOR'
    END AS quality_status
  FROM public.position_history ph
  WHERE ph.gps_time >= NOW() - (p_hours || ' hours')::INTERVAL
    AND ph.ignition_confidence IS NOT NULL
  GROUP BY ph.device_id
  HAVING COUNT(*) >= 10  -- At least 10 readings
  ORDER BY avg_confidence ASC, low_confidence_count DESC;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.check_ignition_detection_quality(INTEGER) TO authenticated;

COMMENT ON FUNCTION public.check_ignition_detection_quality IS 'Monitor ignition detection quality across all devices';

-- =====================================================
-- View: Low Quality Ignition Detection Alerts
-- =====================================================

CREATE OR REPLACE VIEW public.ignition_detection_alerts AS
SELECT
  device_id,
  total_readings,
  low_confidence_count,
  avg_confidence,
  quality_status,
  ROUND((low_confidence_count::NUMERIC / total_readings * 100)::numeric, 1) AS low_confidence_pct
FROM public.check_ignition_detection_quality(24)
WHERE quality_status IN ('POOR', 'FAIR')
ORDER BY avg_confidence ASC;

GRANT SELECT ON public.ignition_detection_alerts TO authenticated;

COMMENT ON VIEW public.ignition_detection_alerts IS 'Devices with poor ignition detection quality in last 24 hours';
```

---

### ✅ **TASK 5: Testing & Validation (PRIORITY 5)**

**YOUR TASK:**
Create test queries to validate the fixes.

**File: `TEST_IGNITION_FIX.sql`**

```sql
-- =====================================================
-- TEST SUITE: Ignition Detection Fix Validation
-- =====================================================

-- TEST 1: Check if confidence columns exist
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'position_history'
  AND column_name IN ('ignition_confidence', 'ignition_detection_method');
-- Expected: 2 rows returned

-- TEST 2: Check recent ignition detection quality
SELECT * FROM public.check_ignition_detection_quality(24);
-- Expected: Shows confidence scores for all active devices

-- TEST 3: View devices with poor detection
SELECT * FROM public.ignition_detection_alerts;
-- Expected: List of devices needing attention (if any)

-- TEST 4: Check ACC state history table
SELECT
  device_id,
  acc_state,
  begin_time,
  end_time
FROM public.acc_state_history
ORDER BY begin_time DESC
LIMIT 10;
-- Expected: Recent ACC state changes (if ACC report API has been called)

-- TEST 5: Verify ignition detection methods being used
SELECT
  ignition_detection_method,
  COUNT(*) AS count,
  AVG(ignition_confidence) AS avg_confidence,
  MIN(ignition_confidence) AS min_confidence,
  MAX(ignition_confidence) AS max_confidence
FROM public.position_history
WHERE gps_time >= NOW() - INTERVAL '24 hours'
  AND ignition_detection_method IS NOT NULL
GROUP BY ignition_detection_method
ORDER BY count DESC;
-- Expected: Should see 'status_bit' as primary method

-- TEST 6: Check for devices with inconsistent ignition data
SELECT
  device_id,
  COUNT(*) AS total_readings,
  COUNT(*) FILTER (WHERE ignition_on = true) AS on_count,
  COUNT(*) FILTER (WHERE ignition_on = false) AS off_count,
  ROUND(
    (COUNT(*) FILTER (WHERE ignition_on = true)::NUMERIC / COUNT(*) * 100)::numeric,
    1
  ) AS pct_on
FROM public.position_history
WHERE gps_time >= NOW() - INTERVAL '7 days'
GROUP BY device_id
HAVING COUNT(*) >= 100  -- At least 100 readings
ORDER BY pct_on DESC;
-- Expected: Mix of ON/OFF states, not 100% OFF for all devices

-- TEST 7: Test ACC Report API (manual test)
-- Run this after implementing the edge function:
/*
SELECT net.http_post(
  url := 'https://YOUR_PROJECT.supabase.co/functions/v1/gps-acc-report',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer YOUR_ANON_KEY'
  ),
  body := jsonb_build_object(
    'device_ids', ARRAY['YOUR_DEVICE_ID'],
    'start_date', (NOW() - INTERVAL '24 hours')::text,
    'end_date', NOW()::text,
    'timezone', 8
  )
);
*/

-- TEST 8: Compare trips before and after fix
WITH trip_stats AS (
  SELECT
    DATE(start_time) AS trip_date,
    COUNT(*) AS trip_count,
    AVG(distance_km) AS avg_distance,
    SUM(CASE WHEN distance_km > 0 THEN 1 ELSE 0 END) AS valid_trips
  FROM vehicle_trips
  WHERE start_time >= NOW() - INTERVAL '7 days'
  GROUP BY DATE(start_time)
)
SELECT
  trip_date,
  trip_count,
  ROUND(avg_distance::numeric, 2) AS avg_distance_km,
  valid_trips,
  ROUND((valid_trips::NUMERIC / trip_count * 100)::numeric, 1) AS valid_trip_pct
FROM trip_stats
ORDER BY trip_date DESC;
-- Expected: Should see more trips detected after fix

-- =====================================================
-- CLEANUP (if needed during testing)
-- =====================================================
-- CAUTION: This will delete test data
/*
DELETE FROM public.acc_state_history
WHERE synced_at >= NOW() - INTERVAL '1 hour';

UPDATE public.position_history
SET ignition_confidence = NULL,
    ignition_detection_method = NULL
WHERE gps_time >= NOW() - INTERVAL '1 hour';
*/
```

---

## 📦 DELIVERABLES CHECKLIST

After completing all tasks, verify:

- [ ] **Task 1 Complete:** `parseIgnitionImproved()` function created and used in 3 files
- [ ] **Task 2 Complete:** `gps-acc-report/index.ts` edge function created
- [ ] **Task 3 Complete:** Database migration for `acc_state_history` table created
- [ ] **Task 4 Complete:** Database migration for confidence columns created
- [ ] **Task 5 Complete:** Monitoring functions and views created
- [ ] **Task 6 Complete:** Test queries run successfully
- [ ] **Code compiles:** No TypeScript errors
- [ ] **Tests pass:** All test queries return expected results
- [ ] **Logs show improvement:** `status_bit` method is primary detection method
- [ ] **Confidence scores:** Average confidence > 0.8 for most devices

---

## 🚀 DEPLOYMENT STEPS

1. **Apply database migrations:**
   ```bash
   supabase db push
   ```

2. **Deploy edge functions:**
   ```bash
   supabase functions deploy gps-acc-report
   supabase functions deploy gps-data
   supabase functions deploy gps-history-backfill
   supabase functions deploy vehicle-chat
   ```

3. **Test ACC Report API:**
   ```bash
   # Test the new ACC report endpoint
   curl -X POST 'https://YOUR_PROJECT.supabase.co/functions/v1/gps-acc-report' \
     -H 'Authorization: Bearer YOUR_ANON_KEY' \
     -H 'Content-Type: application/json' \
     -d '{
       "device_ids": ["YOUR_DEVICE_ID"],
       "start_date": "2024-01-17 00:00:00",
       "end_date": "2024-01-18 00:00:00",
       "timezone": 8
     }'
   ```

4. **Monitor results:**
   ```sql
   -- Check ignition detection quality
   SELECT * FROM public.ignition_detection_alerts;

   -- Check ACC state changes
   SELECT * FROM public.acc_state_history
   ORDER BY begin_time DESC LIMIT 20;
   ```

---

## ⚠️ IMPORTANT NOTES

1. **JT808 Bit Position:** The ACC bit position may vary by device manufacturer. If bit 0 doesn't work, try:
   - Bit 1: `0x02`
   - Bit 2: `0x04`
   - Check GPS51 documentation or test with known ignition states

2. **Rate Limiting:** The ACC Report API is subject to the same rate limits. Process devices in batches with delays.

3. **Timezone:** Default is GMT+8 (China). Adjust based on your fleet location.

4. **Backward Compatibility:** The new code includes fallbacks, so existing data will still work.

5. **Performance:** ACC Report API should be called periodically (e.g., daily) via cron, not on every page load.

---

## 🐛 TROUBLESHOOTING

**If ignition detection still shows low confidence:**
1. Check actual `status` field values:
   ```sql
   SELECT device_id, status, strstatus, ignition_on
   FROM vehicle_positions
   LIMIT 10;
   ```
2. Try different bit masks (0x01, 0x02, 0x04)
3. Compare with known vehicle states

**If ACC Report API returns empty:**
1. Check if devices have ACC data for the time range
2. Verify timezone is correct
3. Check GPS51 API logs for errors

**If trips are still inaccurate:**
1. Verify ignition detection is working first
2. Check if GPS51 `querytrips` is returning data
3. Review trip extraction logic in `sync-trips-incremental`

---

## ✅ SUCCESS CRITERIA

You'll know the fix is working when:

1. **Ignition Detection Quality Report** shows:
   - Average confidence > 0.8 for most devices
   - `status_bit` as primary detection method
   - Mix of ON/OFF states (not 100% OFF)

2. **ACC State History** table contains:
   - Actual state changes from GPS51
   - Matching timestamps with vehicle usage
   - Coordinates where changes occurred

3. **Trip Reports** show:
   - More trips detected (especially short trips)
   - Accurate start/end times matching ignition
   - Reduced "zero distance" trips

4. **Logs** show:
   - `[parseIgnition] Using status bit detection`
   - Low or zero warnings about unknown status formats
   - Successful ACC report API calls

---

## 📚 REFERENCE FILES

**Key Files to Understand:**
- `supabase/functions/gps-data/index.ts` - Main GPS data sync
- `supabase/functions/sync-trips-incremental/index.ts` - Trip synchronization
- `supabase/functions/_shared/gps51-client.ts` - GPS51 API client
- API documentation: Section 4.1 (Last Position), Section 6.3 (ACC Report)

**Database Schema:**
- `vehicles` - Vehicle metadata
- `vehicle_positions` - Current positions
- `position_history` - Historical GPS data
- `vehicle_trips` - Trip records
- `acc_state_history` - (NEW) Ignition state changes

---

## 💡 CURSOR-SPECIFIC INSTRUCTIONS

**Use Cursor Composer Mode:**
1. Select all files mentioned in Tasks 1-5
2. Copy this entire prompt into Composer
3. Ask Cursor to implement all tasks in sequence
4. Review each generated file before accepting
5. Test after each major change

**Cursor Commands to Use:**
- `@workspace` - Reference workspace context
- `@file` - Reference specific files
- `/edit` - Make targeted edits
- `/commit` - Create git commit after each task

**Recommended Approach:**
1. Start with Task 1 (ignition detection fix) - highest impact
2. Test thoroughly before moving to Task 2
3. Create database migrations next (Tasks 3-4)
4. Implement ACC Report API (Task 2)
5. Add monitoring and testing (Tasks 5-6)

---

## 🎉 FINAL VALIDATION

Run this comprehensive check after all tasks:

```sql
-- Final validation query
SELECT
  'Ignition Confidence Columns' AS test_name,
  CASE WHEN COUNT(*) = 2 THEN '✅ PASS' ELSE '❌ FAIL' END AS result
FROM information_schema.columns
WHERE table_name = 'position_history'
  AND column_name IN ('ignition_confidence', 'ignition_detection_method')

UNION ALL

SELECT
  'ACC State History Table',
  CASE WHEN COUNT(*) > 0 THEN '✅ PASS' ELSE '❌ FAIL' END
FROM information_schema.tables
WHERE table_name = 'acc_state_history'

UNION ALL

SELECT
  'Monitoring Function',
  CASE WHEN COUNT(*) > 0 THEN '✅ PASS' ELSE '❌ FAIL' END
FROM information_schema.routines
WHERE routine_name = 'check_ignition_detection_quality'

UNION ALL

SELECT
  'Recent High Confidence Detections',
  CASE WHEN AVG(ignition_confidence) > 0.7 THEN '✅ PASS' ELSE '⚠️ NEEDS REVIEW' END
FROM position_history
WHERE gps_time >= NOW() - INTERVAL '1 hour'
  AND ignition_confidence IS NOT NULL;
```

**Expected Output:**
```
test_name                          | result
-----------------------------------|---------
Ignition Confidence Columns        | ✅ PASS
ACC State History Table            | ✅ PASS
Monitoring Function                | ✅ PASS
Recent High Confidence Detections  | ✅ PASS
```

---

## 🎯 SUMMARY

This fix addresses two critical issues:

1. **Ignition detection** - Switches from fragile string parsing to robust bit field parsing with confidence scoring
2. **ACC Report API** - Implements GPS51's authoritative ignition state change tracking

These changes will dramatically improve trip accuracy by ensuring ignition states are detected correctly, which is the foundation of trip start/end detection.

**Estimated Time:** 2-3 hours
**Difficulty:** Medium
**Impact:** HIGH - Fixes core trip detection accuracy
**Risk:** LOW - Includes fallbacks and backward compatibility

Good luck! 🚀
