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
    
    // Fuel: 1/100L (GPS51) -> keep as 1/100L (convert in frontend if needed)
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
