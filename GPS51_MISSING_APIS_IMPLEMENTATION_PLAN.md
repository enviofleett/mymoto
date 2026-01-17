# GPS51 Missing APIs Implementation Plan

**Date:** January 18, 2026  
**Status:** 📋 **PLAN READY FOR IMPLEMENTATION**

---

## Overview

This plan implements three missing GPS51 API integrations identified in the review:
1. **Mileage Report API** (`reportmileagedetail`) - 🔴 Critical
2. **Geofence GPS51 Integration** (`querygeosystemrecords`, `addgeosystemrecord`, `delgeosystemrecord`) - 🔴 Critical
3. **ACC Status Report API** (`reportaccsbytime`) - 🟡 Medium Priority

---

## Phase 1: Mileage Report API (reportmileagedetail) 🔴 **CRITICAL**

### 1.1 Vehicle Specifications Schema (NEW)

**File:** `supabase/migrations/20260119000000_create_vehicle_specifications.sql`

```sql
-- Vehicle Specifications Table
-- Stores vehicle manufacturer data for fuel consumption analysis

CREATE TABLE public.vehicle_specifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL UNIQUE,
  
  -- Vehicle identification
  brand TEXT NOT NULL, -- e.g., "Toyota", "Honda", "Ford"
  model TEXT, -- e.g., "Camry", "Civic", "F-150"
  year_of_manufacture INTEGER, -- e.g., 2020, 2018
  vehicle_age_years INTEGER, -- Calculated from year_of_manufacture
  
  -- Vehicle components (for fuel consumption calculation)
  engine_type TEXT, -- "petrol", "diesel", "hybrid", "electric"
  engine_size_cc INTEGER, -- Engine displacement in cc
  transmission_type TEXT, -- "manual", "automatic", "CVT"
  fuel_tank_capacity_liters INTEGER, -- Fuel tank capacity
  
  -- Manufacturer fuel consumption data (L/100km)
  manufacturer_fuel_consumption_city FLOAT, -- City driving (L/100km)
  manufacturer_fuel_consumption_highway FLOAT, -- Highway driving (L/100km)
  manufacturer_fuel_consumption_combined FLOAT, -- Combined (L/100km)
  
  -- Age-based degradation factors
  fuel_consumption_degradation_per_year FLOAT DEFAULT 0.02, -- 2% increase per year
  estimated_current_fuel_consumption FLOAT, -- Calculated: manufacturer * (1 + degradation)^age
  
  -- Additional metadata
  notes TEXT, -- User notes about vehicle condition, modifications, etc.
  is_verified BOOLEAN DEFAULT false, -- Whether user has verified the data
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  CONSTRAINT fk_device FOREIGN KEY (device_id) REFERENCES vehicles(device_id) ON DELETE CASCADE,
  CONSTRAINT valid_year CHECK (year_of_manufacture >= 1900 AND year_of_manufacture <= EXTRACT(YEAR FROM now()) + 1),
  CONSTRAINT valid_fuel_consumption CHECK (
    manufacturer_fuel_consumption_combined IS NULL OR 
    manufacturer_fuel_consumption_combined > 0
  )
);

-- Calculate vehicle age automatically
CREATE OR REPLACE FUNCTION calculate_vehicle_age()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.year_of_manufacture IS NOT NULL THEN
    NEW.vehicle_age_years := EXTRACT(YEAR FROM now()) - NEW.year_of_manufacture;
  END IF;
  
  -- Calculate estimated current fuel consumption based on age
  IF NEW.manufacturer_fuel_consumption_combined IS NOT NULL AND NEW.vehicle_age_years IS NOT NULL THEN
    NEW.estimated_current_fuel_consumption := 
      NEW.manufacturer_fuel_consumption_combined * 
      POWER(1 + COALESCE(NEW.fuel_consumption_degradation_per_year, 0.02), NEW.vehicle_age_years);
  END IF;
  
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_vehicle_age_trigger
BEFORE INSERT OR UPDATE ON vehicle_specifications
FOR EACH ROW
EXECUTE FUNCTION calculate_vehicle_age();

-- Indexes
CREATE INDEX idx_vehicle_specs_device ON vehicle_specifications(device_id);
CREATE INDEX idx_vehicle_specs_brand_year ON vehicle_specifications(brand, year_of_manufacture);

-- Enable RLS
ALTER TABLE public.vehicle_specifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their vehicle specifications"
ON public.vehicle_specifications FOR SELECT
TO authenticated
USING (
  device_id IN (
    SELECT device_id FROM vehicle_assignments WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can manage their vehicle specifications"
ON public.vehicle_specifications FOR ALL
TO authenticated
USING (
  device_id IN (
    SELECT device_id FROM vehicle_assignments WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  device_id IN (
    SELECT device_id FROM vehicle_assignments WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Service role can manage all specifications"
ON public.vehicle_specifications FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

COMMENT ON TABLE vehicle_specifications IS 'Stores vehicle manufacturer data for intelligent fuel consumption analysis. Fuel consumption estimates are assumptions based on manufacturer data and vehicle age.';
```

### 1.2 Mileage Details Database Schema

**File:** `supabase/migrations/20260119000001_create_mileage_detail_table.sql`

```sql
-- Vehicle Mileage Details Table
-- Stores GPS51 reportmileagedetail API response data

CREATE TABLE public.vehicle_mileage_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  
  -- Date and time
  statisticsday DATE NOT NULL, -- Statistics date (yyyy-MM-dd)
  starttime BIGINT, -- Start time (ms, UTC)
  endtime BIGINT, -- End time (ms, UTC)
  
  -- Mileage data
  begindis INTEGER, -- Start mileage (meter)
  enddis INTEGER, -- End mileage (meter)
  totaldistance INTEGER, -- Total mileage in period (meter)
  
  -- Fuel data (all in 1/100L units from GPS51)
  beginoil INTEGER, -- Start fuel value (1/100L)
  endoil INTEGER, -- End fuel value (1/100L)
  ddoil INTEGER, -- Refuel volume (1/100L)
  idleoil INTEGER, -- Idling fuel value (1/100L)
  leakoil INTEGER, -- Steal fuel value (1/100L) - CRITICAL for theft detection
  
  -- Speed data (m/h from GPS51)
  avgspeed FLOAT, -- Average speed (m/h)
  overspeed INTEGER, -- Overspeed count
  
  -- Fuel efficiency from GPS51 (actual measured)
  oilper100km FLOAT, -- Comprehensive fuel consumption (L/100KM) - GPS51 measured
  runoilper100km FLOAT, -- Real driving fuel consumption (L/100KM) - GPS51 measured
  oilperhour FLOAT, -- Fuel consumption per hour (L/H) - GPS51 measured
  
  -- Estimated fuel consumption (manufacturer-based)
  estimated_fuel_consumption_combined FLOAT, -- Manufacturer + age estimate (L/100km)
  estimated_fuel_consumption_city FLOAT, -- Manufacturer city estimate (L/100km)
  estimated_fuel_consumption_highway FLOAT, -- Manufacturer highway estimate (L/100km)
  fuel_consumption_variance FLOAT, -- Difference between actual and estimated (%)
  
  -- ACC time
  totalacc BIGINT, -- Total time of ACC on (ms)
  
  -- GPS51 sync tracking
  gps51_record_id TEXT, -- GPS51 record identifier for deduplication
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  CONSTRAINT fk_device FOREIGN KEY (device_id) REFERENCES vehicles(device_id) ON DELETE CASCADE,
  CONSTRAINT unique_device_date UNIQUE (device_id, statisticsday, gps51_record_id)
);

-- Indexes
CREATE INDEX idx_mileage_details_device_date ON vehicle_mileage_details(device_id, statisticsday DESC);
CREATE INDEX idx_mileage_details_device_time ON vehicle_mileage_details(device_id, starttime DESC);
CREATE INDEX idx_mileage_details_fuel_theft ON vehicle_mileage_details(device_id, leakoil) WHERE leakoil > 0;

-- Enable RLS
ALTER TABLE public.vehicle_mileage_details ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can read mileage details"
ON public.vehicle_mileage_details FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Service role can manage mileage details"
ON public.vehicle_mileage_details FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

COMMENT ON TABLE vehicle_mileage_details IS 'Stores GPS51 reportmileagedetail API data including fuel consumption, efficiency, and ACC time. Includes manufacturer-based estimates for comparison.';
COMMENT ON COLUMN vehicle_mileage_details.estimated_fuel_consumption_combined IS 'Estimated fuel consumption based on manufacturer data and vehicle age. This is an ASSUMPTION and may vary from actual consumption.';
COMMENT ON COLUMN vehicle_mileage_details.fuel_consumption_variance IS 'Percentage difference between GPS51 measured consumption and manufacturer estimate. Positive = using more fuel than estimated, Negative = using less.';
```

### 1.2 Edge Function Implementation

**File:** `supabase/functions/fetch-mileage-detail/index.ts`

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callGps51WithRateLimit, getValidGps51Token } from "../_shared/gps51-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// Format date for GPS51 API (yyyy-MM-dd)
function formatDateForGps51(date: Date): string {
  return date.toISOString().split('T')[0];
}

// Get vehicle specifications for fuel consumption estimation
async function getVehicleSpecifications(supabase: any, deviceId: string): Promise<any | null> {
  const { data, error } = await supabase
    .from('vehicle_specifications')
    .select('*')
    .eq('device_id', deviceId)
    .maybeSingle();
  
  if (error) {
    console.warn(`[fetch-mileage-detail] Error fetching vehicle specs: ${error.message}`);
    return null;
  }
  
  return data;
}

// Calculate estimated fuel consumption based on manufacturer data and age
function calculateEstimatedFuelConsumption(
  vehicleSpecs: any | null,
  drivingType: 'city' | 'highway' | 'combined' = 'combined'
): number | null {
  if (!vehicleSpecs) return null;
  
  // Use estimated_current_fuel_consumption if available (already accounts for age)
  if (vehicleSpecs.estimated_current_fuel_consumption) {
    return vehicleSpecs.estimated_current_fuel_consumption;
  }
  
  // Otherwise calculate from manufacturer data
  let baseConsumption: number | null = null;
  
  switch (drivingType) {
    case 'city':
      baseConsumption = vehicleSpecs.manufacturer_fuel_consumption_city;
      break;
    case 'highway':
      baseConsumption = vehicleSpecs.manufacturer_fuel_consumption_highway;
      break;
    case 'combined':
      baseConsumption = vehicleSpecs.manufacturer_fuel_consumption_combined;
      break;
  }
  
  if (!baseConsumption) return null;
  
  // Apply age-based degradation
  const age = vehicleSpecs.vehicle_age_years || 0;
  const degradationPerYear = vehicleSpecs.fuel_consumption_degradation_per_year || 0.02; // 2% per year
  
  return baseConsumption * Math.pow(1 + degradationPerYear, age);
}

// Convert GPS51 units to app units
function convertMileageData(gps51Record: any, vehicleSpecs: any | null) {
  // Calculate estimated fuel consumption
  const estimatedCombined = calculateEstimatedFuelConsumption(vehicleSpecs, 'combined');
  const estimatedCity = calculateEstimatedFuelConsumption(vehicleSpecs, 'city');
  const estimatedHighway = calculateEstimatedFuelConsumption(vehicleSpecs, 'highway');
  
  // Calculate variance if we have both actual and estimated
  const actualConsumption = gps51Record.oilper100km;
  let variance: number | null = null;
  if (actualConsumption && estimatedCombined) {
    variance = ((actualConsumption - estimatedCombined) / estimatedCombined) * 100; // Percentage
  }
  
  return {
    // Distance: meters (GPS51) -> keep as meters
    begindis: gps51Record.begindis || null,
    enddis: gps51Record.enddis || null,
    totaldistance: gps51Record.totaldistance || null,
    
    // Fuel: 1/100L (GPS51) -> convert to L for display
    beginoil: gps51Record.beginoil || null,
    endoil: gps51Record.endoil || null,
    ddoil: gps51Record.ddoil || null,
    idleoil: gps51Record.idleoil || null,
    leakoil: gps51Record.leakoil || null, // CRITICAL: Fuel theft detection
    
    // Speed: m/h (GPS51) -> convert to km/h for display
    avgspeed: gps51Record.avgspeed ? gps51Record.avgspeed / 1000 : null, // m/h to km/h
    overspeed: gps51Record.overspeed || 0,
    
    // Fuel efficiency: Already in correct units from GPS51 (actual measured)
    oilper100km: gps51Record.oilper100km || null,
    runoilper100km: gps51Record.runoilper100km || null,
    oilperhour: gps51Record.oilperhour || null,
    
    // Estimated fuel consumption (manufacturer-based, age-adjusted)
    estimated_fuel_consumption_combined: estimatedCombined,
    estimated_fuel_consumption_city: estimatedCity,
    estimated_fuel_consumption_highway: estimatedHighway,
    fuel_consumption_variance: variance, // % difference from estimate
    
    // ACC time: ms (GPS51) -> keep as ms
    totalacc: gps51Record.totalacc || null,
    
    // Times: ms (GPS51) -> keep as ms
    starttime: gps51Record.starttime || null,
    endtime: gps51Record.endtime || null,
    
    // Date: string (GPS51) -> parse to DATE
    statisticsday: gps51Record.statisticsday || null,
    
    // GPS51 record ID for deduplication
    gps51_record_id: gps51Record.id?.toString() || null,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    const { deviceid, startday, endday, offset = 8 } = await req.json();

    if (!deviceid || !startday || !endday) {
      throw new Error('Missing required parameters: deviceid, startday, endday');
    }

    // Get GPS51 credentials
    const DO_PROXY_URL = Deno.env.get('DO_PROXY_URL');
    if (!DO_PROXY_URL) throw new Error('Missing DO_PROXY_URL secret');

    const { token, serverid } = await getValidGps51Token(supabase);

    // Format dates for GPS51 API (yyyy-MM-dd)
    const startDate = formatDateForGps51(new Date(startday));
    const endDate = formatDateForGps51(new Date(endday));

    console.log(`[fetch-mileage-detail] Fetching mileage for ${deviceid} from ${startDate} to ${endDate}`);

    // Call GPS51 API
    const result = await callGps51WithRateLimit(
      supabase,
      DO_PROXY_URL,
      'reportmileagedetail',
      token,
      serverid,
      {
        deviceid,
        startday: startDate,
        endday: endDate,
        offset, // Timezone (default GMT+8)
      }
    );

    if (result.status !== 0) {
      throw new Error(`GPS51 reportmileagedetail error: ${result.cause || 'Unknown error'} (status: ${result.status})`);
    }

    const records = result.records || [];
    console.log(`[fetch-mileage-detail] Received ${records.length} mileage detail records`);

    // Get vehicle specifications for fuel consumption estimation
    const vehicleSpecs = await getVehicleSpecifications(supabase, deviceid);
    if (vehicleSpecs) {
      console.log(`[fetch-mileage-detail] Using vehicle specs: ${vehicleSpecs.brand} ${vehicleSpecs.model} ${vehicleSpecs.year_of_manufacture} (age: ${vehicleSpecs.vehicle_age_years} years)`);
    } else {
      console.warn(`[fetch-mileage-detail] No vehicle specifications found for ${deviceid}. Fuel consumption estimates will be unavailable.`);
    }

    // Convert and store records
    const recordsToInsert = records.map((record: any) => ({
      device_id: deviceid,
      ...convertMileageData(record, vehicleSpecs),
    }));

    // Insert with conflict handling (upsert on device_id + statisticsday + gps51_record_id)
    const insertPromises = recordsToInsert.map((record: any) =>
      supabase
        .from('vehicle_mileage_details')
        .upsert(record, {
          onConflict: 'device_id,statisticsday,gps51_record_id',
          ignoreDuplicates: false,
        })
    );

    const results = await Promise.allSettled(insertPromises);
    const errors = results.filter((r) => r.status === 'rejected');

    if (errors.length > 0) {
      console.error('[fetch-mileage-detail] Some inserts failed:', errors);
    }

    const inserted = results.filter((r) => r.status === 'fulfilled').length;

    // Check for fuel theft (leakoil > 0)
    const theftAlerts = recordsToInsert.filter((r: any) => r.leakoil && r.leakoil > 0);

    return new Response(
      JSON.stringify({
        success: true,
        records_fetched: records.length,
        records_inserted: inserted,
        theft_alerts: theftAlerts.length,
        summary: {
          total_distance_km: records.reduce((sum: number, r: any) => sum + (r.totaldistance || 0), 0) / 1000,
          total_fuel_l: records.reduce((sum: number, r: any) => sum + ((r.ddoil || 0) / 100), 0),
          avg_efficiency_actual: records.length > 0
            ? records.reduce((sum: number, r: any) => sum + (r.oilper100km || 0), 0) / records.length
            : null,
          avg_efficiency_estimated: vehicleSpecs?.estimated_current_fuel_consumption || null,
          has_vehicle_specs: !!vehicleSpecs,
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[fetch-mileage-detail] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
```

### 1.3 Frontend: Vehicle Specifications Form

**File:** `src/pages/owner/OwnerVehicleProfile/components/VehicleSpecificationsForm.tsx` (NEW)

Create form component for users to input:
- Vehicle brand (dropdown or autocomplete)
- Model (autocomplete based on brand)
- Year of manufacture
- Engine type (petrol, diesel, hybrid, electric)
- Engine size (cc)
- Transmission type (manual, automatic, CVT)
- Fuel tank capacity (liters)
- Manufacturer fuel consumption (city, highway, combined) - optional, can be auto-filled from database
- Notes (optional)

**Features:**
- Auto-calculate vehicle age
- Auto-calculate estimated fuel consumption with age degradation
- Show disclaimer: "Fuel consumption estimates are assumptions based on manufacturer data and vehicle age. Actual consumption may vary."
- Validate required fields (brand, year minimum)

### 1.4 Frontend Integration

**File:** `src/hooks/useVehicleProfile.ts` (add new hooks)

```typescript
export function useMileageDetails(
  deviceId: string | null,
  startDate: string,
  endDate: string,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: ['mileage-details', deviceId, startDate, endDate],
    queryFn: async () => {
      if (!deviceId) return null;
      
      const { data, error } = await supabase.functions.invoke('fetch-mileage-detail', {
        body: {
          deviceid: deviceId,
          startday: startDate,
          endday: endDate,
          offset: 8, // GMT+8
        },
      });

      if (error) throw error;
      return data;
    },
    enabled: enabled && !!deviceId && !!startDate && !!endDate,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
```

**File:** `src/pages/owner/OwnerVehicleProfile/components/MileageSection.tsx` (update)

Add fuel consumption display:
- **Actual fuel efficiency** (L/100km) - from GPS51
- **Estimated fuel efficiency** (L/100km) - from manufacturer + age
- **Variance indicator** - Show if actual is higher/lower than estimated
- Fuel consumption per hour
- ACC time tracking
- Fuel theft alerts (if leakoil > 0)
- **Disclaimer banner**: "Fuel consumption estimates are assumptions based on manufacturer data and vehicle age. Actual consumption may vary based on driving conditions, vehicle condition, and other factors."

**Display Format:**
```
Actual: 8.5 L/100km (GPS51 measured)
Estimated: 7.2 L/100km (Toyota Camry 2020, age-adjusted)
Variance: +18% (using more fuel than estimated)
⚠️ Note: Estimates are assumptions and may not reflect actual consumption
```

---

## Phase 2: Geofence GPS51 Integration 🔴 **CRITICAL**

### 2.1 Database Schema Updates

**File:** `supabase/migrations/20260119000002_add_gps51_geofence_sync.sql`

```sql
-- Add GPS51 sync columns to geofence_zones
ALTER TABLE public.geofence_zones
ADD COLUMN IF NOT EXISTS gps51_geosystemrecordid INTEGER,
ADD COLUMN IF NOT EXISTS gps51_categoryid INTEGER,
ADD COLUMN IF NOT EXISTS gps51_georecorduuid TEXT,
ADD COLUMN IF NOT EXISTS gps51_synced_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS gps51_sync_status TEXT DEFAULT 'pending' CHECK (gps51_sync_status IN ('synced', 'pending', 'error'));

-- Add GPS51 sync columns to geofence_monitors
ALTER TABLE public.geofence_monitors
ADD COLUMN IF NOT EXISTS gps51_geosystemrecordid INTEGER,
ADD COLUMN IF NOT EXISTS gps51_synced BOOLEAN DEFAULT false;

-- Create index for GPS51 sync queries
CREATE INDEX IF NOT EXISTS idx_geofence_zones_gps51_sync ON geofence_zones(gps51_sync_status, gps51_synced_at) WHERE gps51_sync_status != 'synced';
CREATE INDEX IF NOT EXISTS idx_geofence_zones_gps51_id ON geofence_zones(gps51_geosystemrecordid) WHERE gps51_geosystemrecordid IS NOT NULL;

COMMENT ON COLUMN geofence_zones.gps51_geosystemrecordid IS 'GPS51 geofence ID - links to GPS51 platform';
COMMENT ON COLUMN geofence_zones.gps51_sync_status IS 'Sync status: synced, pending, error';
```

### 2.2 Geofence Sync Edge Function

**File:** `supabase/functions/sync-geofences-gps51/index.ts`

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callGps51WithRateLimit, getValidGps51Token } from "../_shared/gps51-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// Map local geofence shape to GPS51 type
function mapShapeToGps51Type(shapeType: string): number {
  const mapping: Record<string, number> = {
    'circle': 1,
    'polygon': 2,
    'rectangle': 2, // Rectangle is polygon in GPS51
  };
  return mapping[shapeType] || 1; // Default to circle
}

// Map GPS51 type to local shape
function mapGps51TypeToShape(gps51Type: number): string {
  const mapping: Record<number, string> = {
    1: 'circle',
    2: 'polygon',
    3: 'area',
    5: 'route',
  };
  return mapping[gps51Type] || 'circle';
}

// Convert local geofence to GPS51 format
function convertToGps51Format(localGeofence: any): any {
  const shapeType = mapShapeToGps51Type(localGeofence.shape_type);
  
  const gps51Fence: any = {
    name: localGeofence.name,
    categoryid: localGeofence.gps51_categoryid || 0, // Default category
    type: shapeType,
    useas: 0, // 0 = enter/exit, 1 = trips counting
    triggerevent: 0, // 0 = Platform notify (default)
  };

  // Circle geofence
  if (shapeType === 1 && localGeofence.center_point && localGeofence.radius_meters) {
    // Extract lat/lon from PostGIS POINT
    const point = localGeofence.center_point; // Assuming it's already extracted
    gps51Fence.lat1 = point.latitude || localGeofence.latitude;
    gps51Fence.lon1 = point.longitude || localGeofence.longitude;
    gps51Fence.radius1 = localGeofence.radius_meters;
  }

  // Polygon geofence
  if (shapeType === 2 && localGeofence.boundary) {
    // Convert PostGIS POLYGON to GPS51 points format
    // This requires parsing the PostGIS geometry
    // For now, we'll need to extract coordinates from boundary
    gps51Fence.points2 = extractPolygonPoints(localGeofence.boundary);
  }

  return gps51Fence;
}

// Query GPS51 geofences
async function queryGps51Geofences(
  supabase: any,
  proxyUrl: string,
  token: string,
  serverid: string
): Promise<any[]> {
  const result = await callGps51WithRateLimit(
    supabase,
    proxyUrl,
    'querygeosystemrecords',
    token,
    serverid,
    {}
  );

  if (result.status !== 0) {
    throw new Error(`GPS51 querygeosystemrecords error: ${result.cause || 'Unknown error'}`);
  }

  // Extract all geofences from categories
  const allGeofences: any[] = [];
  if (result.categorys) {
    for (const category of result.categorys) {
      if (category.records) {
        for (const record of category.records) {
          allGeofences.push({
            ...record,
            categoryid: category.categoryid,
            categoryname: category.name,
          });
        }
      }
    }
  }

  return allGeofences;
}

// Create geofence in GPS51
async function createGps51Geofence(
  supabase: any,
  proxyUrl: string,
  token: string,
  serverid: string,
  fenceData: any
): Promise<any> {
  const result = await callGps51WithRateLimit(
    supabase,
    proxyUrl,
    'addgeosystemrecord',
    token,
    serverid,
    fenceData
  );

  if (result.status !== 0) {
    throw new Error(`GPS51 addgeosystemrecord error: ${result.cause || 'Unknown error'}`);
  }

  return result.record;
}

// Delete geofence from GPS51
async function deleteGps51Geofence(
  supabase: any,
  proxyUrl: string,
  token: string,
  serverid: string,
  categoryid: number,
  geosystemrecordid: number
): Promise<void> {
  const result = await callGps51WithRateLimit(
    supabase,
    proxyUrl,
    'delgeosystemrecord',
    token,
    serverid,
    {
      categoryid,
      geosystemrecordid,
    }
  );

  if (result.status !== 0) {
    throw new Error(`GPS51 delgeosystemrecord error: ${result.cause || 'Unknown error'}`);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    const { action = 'sync', deviceid } = await req.json();

    const DO_PROXY_URL = Deno.env.get('DO_PROXY_URL');
    if (!DO_PROXY_URL) throw new Error('Missing DO_PROXY_URL secret');

    const { token, serverid } = await getValidGps51Token(supabase);

    if (action === 'sync') {
      // Sync all geofences
      console.log('[sync-geofences-gps51] Starting geofence sync');

      // 1. Get local geofences
      const { data: localGeofences, error: localError } = await supabase
        .from('geofence_zones')
        .select('*')
        .eq('is_active', true);

      if (localError) throw localError;

      // 2. Get GPS51 geofences
      const gps51Geofences = await queryGps51Geofences(supabase, DO_PROXY_URL, token, serverid);
      console.log(`[sync-geofences-gps51] Found ${localGeofences?.length || 0} local, ${gps51Geofences.length} GPS51 geofences`);

      // 3. Create geofences in GPS51 that don't exist
      const created: any[] = [];
      const updated: any[] = [];
      const errors: any[] = [];

      for (const localFence of localGeofences || []) {
        if (!localFence.gps51_geosystemrecordid) {
          // Not synced yet, create in GPS51
          try {
            const gps51Fence = convertToGps51Format(localFence);
            const result = await createGps51Geofence(supabase, DO_PROXY_URL, token, serverid, gps51Fence);

            // Update local geofence with GPS51 IDs
            await supabase
              .from('geofence_zones')
              .update({
                gps51_geosystemrecordid: result.geosystemrecordid,
                gps51_categoryid: result.categoryid,
                gps51_georecorduuid: result.georecorduuid,
                gps51_synced_at: new Date().toISOString(),
                gps51_sync_status: 'synced',
              })
              .eq('id', localFence.id);

            created.push(localFence.id);
          } catch (error) {
            console.error(`[sync-geofences-gps51] Error creating geofence ${localFence.id}:`, error);
            errors.push({ id: localFence.id, error: error instanceof Error ? error.message : 'Unknown' });
          }
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          created: created.length,
          updated: updated.length,
          errors: errors.length,
          details: { created, updated, errors },
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (action === 'create') {
      // Create single geofence in GPS51
      const { geofence_id } = await req.json();
      if (!geofence_id) throw new Error('Missing geofence_id');

      const { data: geofence, error } = await supabase
        .from('geofence_zones')
        .select('*')
        .eq('id', geofence_id)
        .single();

      if (error || !geofence) throw new Error('Geofence not found');

      const gps51Fence = convertToGps51Format(geofence);
      const result = await createGps51Geofence(supabase, DO_PROXY_URL, token, serverid, gps51Fence);

      // Update local geofence
      await supabase
        .from('geofence_zones')
        .update({
          gps51_geosystemrecordid: result.geosystemrecordid,
          gps51_categoryid: result.categoryid,
          gps51_georecorduuid: result.georecorduuid,
          gps51_synced_at: new Date().toISOString(),
          gps51_sync_status: 'synced',
        })
        .eq('id', geofence_id);

      return new Response(
        JSON.stringify({ success: true, gps51_id: result.geosystemrecordid }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (action === 'delete') {
      // Delete geofence from GPS51
      const { geofence_id } = await req.json();
      if (!geofence_id) throw new Error('Missing geofence_id');

      const { data: geofence, error } = await supabase
        .from('geofence_zones')
        .select('gps51_geosystemrecordid, gps51_categoryid')
        .eq('id', geofence_id)
        .single();

      if (error || !geofence) throw new Error('Geofence not found');

      if (geofence.gps51_geosystemrecordid && geofence.gps51_categoryid) {
        await deleteGps51Geofence(
          supabase,
          DO_PROXY_URL,
          token,
          serverid,
          geofence.gps51_categoryid,
          geofence.gps51_geosystemrecordid
        );

        // Update local geofence
        await supabase
          .from('geofence_zones')
          .update({
            gps51_geosystemrecordid: null,
            gps51_categoryid: null,
            gps51_georecorduuid: null,
            gps51_sync_status: 'pending',
          })
          .eq('id', geofence_id);
      }

      return new Response(
        JSON.stringify({ success: true }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    throw new Error('Invalid action');
  } catch (error) {
    console.error('[sync-geofences-gps51] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
```

### 2.3 Update Geofence Creation/Deletion

**File:** `supabase/functions/check-geofences/index.ts` (update existing)

Add GPS51 sync when geofences are created/deleted:
- After creating geofence locally, call `sync-geofences-gps51` with action='create'
- After deleting geofence locally, call `sync-geofences-gps51` with action='delete'

---

## Phase 1.5: Improved Trip Detection Logic 🔴 **CRITICAL FIX**

### Fix: Filter Trips with Same Coordinates

**File:** `supabase/functions/sync-trips-incremental/index.ts` (update existing)

**Problem:** Current logic creates trips even when start and end coordinates are the same (very short distances within same location).

**Solution:** Add coordinate-based filtering to prevent false trips.

**Update `extractTripsFromHistory` function:**

```typescript
// Add after calculating totalDistance (around line 643)

// CRITICAL FIX: Filter trips with same start/end coordinates
// Calculate distance between start and end points
const startEndDistance = calculateDistance(
  startPoint.latitude,
  startPoint.longitude,
  endPoint.latitude,
  endPoint.longitude
);

// Minimum distance threshold for valid trip (100 meters)
const MIN_START_END_DISTANCE = 0.1; // km

// Also check if all points are within small radius (GPS drift detection)
let maxPointDistance = 0;
for (let k = 1; k < tripPoints.length; k++) {
  const dist = calculateDistance(
    tripPoints[0].latitude,
    tripPoints[0].longitude,
    tripPoints[k].latitude,
    tripPoints[k].longitude
  );
  maxPointDistance = Math.max(maxPointDistance, dist);
}

// Record trip only if:
// 1. Total distance >= minimum (existing check)
// 2. Start-to-end distance >= minimum (NEW - prevents same-location trips)
// 3. Points are not all clustered in same location (NEW - prevents GPS drift)
if (totalDistance >= MIN_TRIP_DISTANCE && 
    startEndDistance >= MIN_START_END_DISTANCE &&
    maxPointDistance >= MIN_START_END_DISTANCE) {
  // Valid trip - proceed with insertion
} else {
  console.log(`[extractTripsFromHistory] Trip filtered: distance=${totalDistance.toFixed(2)}km, start-end=${startEndDistance.toFixed(2)}km, max-point=${maxPointDistance.toFixed(2)}km`);
  // Skip this trip
}
```

**Also update GPS51 trip processing** (around line 950):

```typescript
// Before inserting trip from GPS51, validate coordinates
if (trip.start_latitude && trip.start_longitude && 
    trip.end_latitude && trip.end_longitude) {
  
  const startEndDistance = calculateDistance(
    trip.start_latitude,
    trip.start_longitude,
    trip.end_latitude,
    trip.end_longitude
  );
  
  const MIN_START_END_DISTANCE = 0.1; // 100 meters
  
  if (startEndDistance < MIN_START_END_DISTANCE) {
    console.log(`[sync-trips-incremental] Skipping trip with same start/end coordinates: ${startEndDistance.toFixed(2)}km`);
    deviceTripsSkipped++;
    continue;
  }
}
```

---

## Phase 1.6: Trip Sync Progress Indicator 🔴 **CRITICAL UX**

### Update Sync Function to Report Progress

**File:** `supabase/functions/sync-trips-incremental/index.ts` (update existing)

**Current:** Function updates `trips_processed` but doesn't show real-time progress.

**Enhancement:** Add progress tracking and real-time updates.

**Update sync function to emit progress:**

```typescript
// Add progress tracking
let totalTripsToProcess = trips.length;
let tripsProcessed = 0;

// Update progress every 10 trips
const PROGRESS_UPDATE_INTERVAL = 10;

for (let j = 0; j < trips.length; j += BATCH_SIZE) {
  const batch = trips.slice(j, j + BATCH_SIZE);
  
  // ... existing batch processing ...
  
  tripsProcessed += batch.length;
  
  // Update progress in database (for real-time subscription)
  if (tripsProcessed % PROGRESS_UPDATE_INTERVAL === 0 || tripsProcessed === totalTripsToProcess) {
    await supabase
      .from("trip_sync_status")
      .update({
        trips_processed: tripsProcessed,
        trips_total: totalTripsToProcess,
        sync_progress_percent: Math.round((tripsProcessed / totalTripsToProcess) * 100),
      })
      .eq("device_id", deviceId);
  }
}
```

### Update Database Schema

**File:** `supabase/migrations/20260119000004_add_trip_sync_progress.sql`

```sql
-- Add progress tracking columns to trip_sync_status
ALTER TABLE trip_sync_status
ADD COLUMN IF NOT EXISTS trips_total INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS sync_progress_percent INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS current_operation TEXT, -- e.g., "Fetching trips from GPS51", "Processing trip 5 of 20"

COMMENT ON COLUMN trip_sync_status.trips_total IS 'Total number of trips to process in current sync';
COMMENT ON COLUMN trip_sync_status.sync_progress_percent IS 'Progress percentage (0-100)';
COMMENT ON COLUMN trip_sync_status.current_operation IS 'Current operation description for user feedback';
```

### Frontend Progress Display

**File:** `src/components/fleet/TripSyncProgress.tsx` (NEW)

```typescript
export function TripSyncProgress({ deviceId }: { deviceId: string }) {
  const { data: syncStatus } = useTripSyncStatus(deviceId);
  
  if (!syncStatus || syncStatus.sync_status !== 'processing') {
    return null;
  }
  
  const progress = syncStatus.sync_progress_percent || 0;
  const tripsProcessed = syncStatus.trips_processed || 0;
  const tripsTotal = syncStatus.trips_total || 0;
  
  return (
    <div className="p-4 border rounded-lg bg-muted/50">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">Syncing Trips</span>
        <span className="text-sm text-muted-foreground">
          {tripsProcessed} / {tripsTotal} trips
        </span>
      </div>
      <Progress value={progress} className="h-2" />
      <p className="text-xs text-muted-foreground mt-2">
        {syncStatus.current_operation || 'Processing trips...'}
      </p>
    </div>
  );
}
```

**File:** `src/pages/owner/OwnerVehicleProfile/components/ReportsSection.tsx` (update)

Add TripSyncProgress component to show sync status:
- Display when sync_status = 'processing'
- Show progress bar with percentage
- Show "X of Y trips" counter
- Show current operation description
- Auto-hide when sync completes

---

## Phase 3: ACC Status Report API (reportaccsbytime) 🟡 **MEDIUM**

### 3.1 Database Schema

**File:** `supabase/migrations/20260119000003_create_acc_status_table.sql`

```sql
-- Vehicle ACC Status Periods Table
-- Stores GPS51 reportaccsbytime API response data

CREATE TABLE public.vehicle_acc_status_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  
  -- GPS51 record identifier
  accstateid TEXT UNIQUE, -- GPS51 recorded UUID
  
  -- ACC status
  accstate INTEGER NOT NULL CHECK (accstate IN (2, 3)), -- 2=OFF, 3=ON
  
  -- Time period
  begintime BIGINT NOT NULL, -- Start time (ms, UTC)
  endtime BIGINT, -- End time (ms, UTC) - NULL if ongoing
  
  -- Location
  slat DOUBLE PRECISION, -- Start latitude
  slon DOUBLE PRECISION, -- Start longitude
  elat DOUBLE PRECISION, -- End latitude
  elon DOUBLE PRECISION, -- End longitude
  
  -- Calculated fields
  duration_ms BIGINT, -- Duration in milliseconds (calculated)
  is_idle BOOLEAN DEFAULT false, -- ACC ON but vehicle not moving (calculated from speed data)
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  CONSTRAINT fk_device FOREIGN KEY (device_id) REFERENCES vehicles(device_id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX idx_acc_status_device_time ON vehicle_acc_status_periods(device_id, begintime DESC);
CREATE INDEX idx_acc_status_device_state ON vehicle_acc_status_periods(device_id, accstate, begintime DESC);
CREATE INDEX idx_acc_status_idle ON vehicle_acc_status_periods(device_id, is_idle) WHERE is_idle = true;

-- Enable RLS
ALTER TABLE public.vehicle_acc_status_periods ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can read ACC status"
ON public.vehicle_acc_status_periods FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Service role can manage ACC status"
ON public.vehicle_acc_status_periods FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

COMMENT ON TABLE vehicle_acc_status_periods IS 'Stores GPS51 ACC on/off periods for idle time analysis and fuel consumption calculations';
```

### 3.2 Edge Function Implementation

**File:** `supabase/functions/fetch-acc-status/index.ts`

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callGps51WithRateLimit, getValidGps51Token } from "../_shared/gps51-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// Format date for GPS51 API (yyyy-MM-dd HH:mm:ss)
function formatDateTimeForGps51(date: Date): string {
  return date.toISOString().replace('T', ' ').substring(0, 19);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    const { deviceids, starttime, endtime, offset = 8 } = await req.json();

    if (!deviceids || !Array.isArray(deviceids) || deviceids.length === 0) {
      throw new Error('Missing required parameter: deviceids (array)');
    }
    if (!starttime || !endtime) {
      throw new Error('Missing required parameters: starttime, endtime');
    }

    const DO_PROXY_URL = Deno.env.get('DO_PROXY_URL');
    if (!DO_PROXY_URL) throw new Error('Missing DO_PROXY_URL secret');

    const { token, serverid } = await getValidGps51Token(supabase);

    // Format dates for GPS51 API
    const startDate = formatDateTimeForGps51(new Date(starttime));
    const endDate = formatDateTimeForGps51(new Date(endtime));

    console.log(`[fetch-acc-status] Fetching ACC status for ${deviceids.length} devices from ${startDate} to ${endDate}`);

    // Call GPS51 API
    const result = await callGps51WithRateLimit(
      supabase,
      DO_PROXY_URL,
      'reportaccsbytime',
      token,
      serverid,
      {
        deviceids,
        starttime: startDate,
        endtime: endDate,
        offset,
      }
    );

    if (result.status !== 0) {
      throw new Error(`GPS51 reportaccsbytime error: ${result.cause || 'Unknown error'} (status: ${result.status})`);
    }

    const records = result.records || [];
    console.log(`[fetch-acc-status] Received ${records.length} ACC status records`);

    // Process and store records
    const recordsToInsert = records.map((record: any) => {
      const duration = record.endtime && record.begintime
        ? record.endtime - record.begintime
        : null;

      return {
        device_id: record.deviceid || deviceids[0], // GPS51 may not return deviceid in each record
        accstateid: record.accstateid?.toString() || null,
        accstate: record.accstate, // 2=OFF, 3=ON
        begintime: record.begintime,
        endtime: record.endtime || null,
        slat: record.slat || null,
        slon: record.slon || null,
        elat: record.elat || null,
        elon: record.elon || null,
        duration_ms: duration,
        is_idle: false, // Will be calculated separately based on speed data
      };
    });

    // Insert with conflict handling (upsert on accstateid)
    const insertPromises = recordsToInsert.map((record: any) =>
      supabase
        .from('vehicle_acc_status_periods')
        .upsert(record, {
          onConflict: 'accstateid',
          ignoreDuplicates: false,
        })
    );

    const results = await Promise.allSettled(insertPromises);
    const errors = results.filter((r) => r.status === 'rejected');

    if (errors.length > 0) {
      console.error('[fetch-acc-status] Some inserts failed:', errors);
    }

    const inserted = results.filter((r) => r.status === 'fulfilled').length;

    // Calculate statistics
    const accOnRecords = recordsToInsert.filter((r: any) => r.accstate === 3);
    const totalAccOnTime = accOnRecords.reduce((sum: number, r: any) => sum + (r.duration_ms || 0), 0);

    return new Response(
      JSON.stringify({
        success: true,
        records_fetched: records.length,
        records_inserted: inserted,
        summary: {
          total_periods: records.length,
          acc_on_periods: accOnRecords.length,
          total_acc_on_time_ms: totalAccOnTime,
          total_acc_on_time_hours: totalAccOnTime / (1000 * 60 * 60),
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[fetch-acc-status] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
```

### 3.3 Frontend Integration

**File:** `src/hooks/useVehicleProfile.ts` (add new hook)

```typescript
export function useAccStatus(
  deviceId: string | null,
  startDate: Date,
  endDate: Date,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: ['acc-status', deviceId, startDate, endDate],
    queryFn: async () => {
      if (!deviceId) return null;
      
      const { data, error } = await supabase.functions.invoke('fetch-acc-status', {
        body: {
          deviceids: [deviceId],
          starttime: startDate.toISOString(),
          endtime: endDate.toISOString(),
          offset: 8,
        },
      });

      if (error) throw error;
      return data;
    },
    enabled: enabled && !!deviceId,
    staleTime: 5 * 60 * 1000,
  });
}
```

---

## Implementation Order & Timeline

### Week 1: Critical Fixes & Mileage Report
1. **Day 1:** 
   - Fix trip detection logic (filter same coordinates)
   - Add trip sync progress tracking
   - Update database schema for progress
2. **Day 2-3:** 
   - Create vehicle specifications schema
   - Create mileage details schema
3. **Day 4-5:** 
   - Implement fetch-mileage-detail edge function
   - Add manufacturer fuel consumption logic
4. **Day 6-7:** 
   - Frontend: Vehicle specifications form
   - Frontend: Mileage display with estimates
   - Testing

### Week 2: Geofence Sync (Critical)
1. Day 1-2: Database schema updates
2. Day 3-4: Implement sync function
3. Day 5: Update geofence creation/deletion
4. Day 6-7: Testing and bug fixes

### Week 3: ACC Status (Medium Priority)
1. Day 1-2: Database schema
2. Day 3-4: Implement edge function
3. Day 5: Frontend integration
4. Day 6-7: Testing

---

## Testing Checklist

### Trip Detection Fix
- [ ] Test with trips that have same start/end coordinates (should be filtered)
- [ ] Test with GPS drift (all points in same location - should be filtered)
- [ ] Verify valid trips are still detected correctly
- [ ] Test minimum distance thresholds

### Trip Sync Progress
- [ ] Verify progress updates in real-time
- [ ] Test progress display shows correct percentage
- [ ] Verify trip counter (X of Y trips) updates correctly
- [ ] Test progress disappears when sync completes

### Vehicle Specifications
- [ ] Test form validation (required fields)
- [ ] Verify age calculation
- [ ] Verify fuel consumption estimation with age degradation
- [ ] Test with different vehicle brands/models

### Mileage Report
- [ ] Test with valid device ID and date range
- [ ] Verify fuel consumption data is stored correctly
- [ ] Test fuel theft detection (leakoil > 0)
- [ ] Verify unit conversions (1/100L to L, m/h to km/h)
- [ ] Test manufacturer-based estimates calculation
- [ ] Verify variance calculation (actual vs estimated)
- [ ] Test error handling (invalid device, date range)
- [ ] Verify frontend displays fuel metrics with estimates
- [ ] Verify disclaimer is shown

### Geofence Sync
- [ ] Test creating geofence (should sync to GPS51)
- [ ] Test deleting geofence (should delete from GPS51)
- [ ] Test syncing existing geofences
- [ ] Verify GPS51 IDs are stored correctly
- [ ] Test error handling (GPS51 unavailable)
- [ ] Verify geofences appear in GPS51 platform

### ACC Status
- [ ] Test with valid device IDs and date range
- [ ] Verify ACC periods are stored correctly
- [ ] Test idle time calculation
- [ ] Verify statistics calculation
- [ ] Test error handling
- [ ] Verify frontend displays ACC timeline

---

## Success Criteria

1. ✅ Trip detection filters same-coordinate trips (no false trips)
2. ✅ Trip sync progress shows real-time updates (X of Y trips)
3. ✅ Users can input vehicle specifications (brand, year, model)
4. ✅ Fuel consumption estimates use manufacturer data + age
5. ✅ Mileage report shows actual vs estimated consumption
6. ✅ Disclaimer shown: "Estimates are assumptions"
7. ✅ Geofences created in app appear in GPS51 platform
8. ✅ ACC status periods are tracked and displayed
9. ✅ All APIs handle errors gracefully
10. ✅ Rate limiting prevents API errors
11. ✅ Frontend displays all new data correctly
12. ✅ Fuel theft detection works (leakoil > 0)

---

## Notes

### Fuel Consumption Analysis Disclaimer

**IMPORTANT:** All fuel consumption estimates based on manufacturer data are **ASSUMPTIONS** and should be clearly labeled as such. Actual fuel consumption may vary significantly based on:
- Driving conditions (city vs highway)
- Vehicle condition and maintenance
- Driver behavior
- Weather conditions
- Fuel quality
- Vehicle modifications
- Load weight

**Display Format:**
- Show actual consumption from GPS51 prominently
- Show estimated consumption as secondary information
- Always include disclaimer: "Fuel consumption estimates are assumptions based on manufacturer data and vehicle age. Actual consumption may vary."
- Show variance percentage to help users understand difference

### Trip Detection Improvements

**Key Changes:**
1. Filter trips where start and end coordinates are the same (within 100m)
2. Filter trips where all points are clustered in same location (GPS drift)
3. Maintain minimum distance threshold (0.1km)
4. Ensure valid trips are still detected correctly

### Trip Sync Progress

**User Experience:**
- Show progress bar with percentage
- Show "X of Y trips" counter
- Show current operation (e.g., "Processing trip 5 of 20")
- Auto-hide when sync completes
- Show success message with total trips synced

### Vehicle Specifications Collection

**Required Fields:**
- Brand (required)
- Year of manufacture (required)
- Model (optional but recommended)

**Optional but Recommended:**
- Engine type
- Engine size
- Transmission type
- Fuel tank capacity
- Manufacturer fuel consumption (can be auto-filled from database if available)

**Auto-Calculations:**
- Vehicle age (from year)
- Estimated fuel consumption (manufacturer + age degradation)
- Fuel consumption variance (actual vs estimated)

---

## Technical Implementation Details

### All Functions Use:
- Shared `gps51-client.ts` for rate limiting
- Shared `telemetry-normalizer.ts` for data normalization
- Logging to `gps_api_logs` table
- React Query for frontend caching
- Existing error handling patterns
- RLS policies for data privacy

### Fuel Consumption Calculation Formula:

```
Estimated Consumption = Manufacturer Consumption × (1 + Degradation Rate)^Vehicle Age

Example:
- Manufacturer: 7.0 L/100km
- Age: 5 years
- Degradation: 2% per year
- Estimated: 7.0 × (1.02)^5 = 7.73 L/100km

Variance = ((Actual - Estimated) / Estimated) × 100
```

---

**Ready for implementation!**
