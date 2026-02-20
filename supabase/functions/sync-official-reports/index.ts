import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callGps51WithRateLimit, getValidGps51Token } from "../_shared/gps51-client.ts";
import { normalizeSpeed } from "../_shared/telemetry-normalizer.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

// Format date for GPS51 querytrips API (YYYY-MM-DD HH:mm:ss)
function formatDateForGps51DateTime(date: Date, isEndOfDay: boolean = false): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  if (isEndOfDay) {
    return `${year}-${month}-${day} 23:59:59`;
  }
  return `${year}-${month}-${day} 00:00:00`;
}

// Format date for GPS51 reportmileagedetail API (YYYY-MM-DD)
function formatDateForGps51Date(date: Date): string {
  return date.toISOString().split('T')[0];
}

async function getVehicleProfileForMileage(supabase: any, deviceId: string) {
  const { data, error } = await supabase
    .from('vehicles')
    .select('device_id, year, official_fuel_efficiency_l_100km')
    .eq('device_id', deviceId)
    .maybeSingle();

  if (error) {
    console.warn(`[sync-official-reports] Error fetching vehicle profile for mileage: ${error.message}`);
    return null;
  }

  return data;
}

function calculateEstimatedFuelConsumptionForMileage(
  vehicleProfile: any | null
): number | null {
  if (!vehicleProfile) return null;
  const baseConsumption = vehicleProfile.official_fuel_efficiency_l_100km;
  if (!baseConsumption) return null;

  const currentYear = new Date().getFullYear();
  const vehicleYear = typeof vehicleProfile.year === 'number' ? vehicleProfile.year : null;
  const age = vehicleYear ? Math.max(0, currentYear - vehicleYear) : 0;
  const degradationPerYear = 0.02;

  return baseConsumption * Math.pow(1 + degradationPerYear, age);
}

// Interface for GPS51 trip response
interface Gps51Trip {
  starttime?: number;
  endtime?: number;
  starttime_str?: string;
  endtime_str?: string;
  distance?: number;
  totaldistance?: number;
  maxspeed?: number;
  totalmaxspeed?: number;
  avgspeed?: number;
  totalaveragespeed?: number;
  totaltriptime?: number;
  startlat?: number;
  startlon?: number;
  endlat?: number;
  endlon?: number;
  [key: string]: any;
}

// Interface for GPS51 mileage detail response
interface Gps51MileageRecord {
  statisticsday?: string;
  totaldistance?: number;
  runoilper100km?: number;
  begindis?: number;
  enddis?: number;
  beginoil?: number;
  endoil?: number;
  ddoil?: number;
  idleoil?: number;
  leakoil?: number;
  avgspeed?: number;
  overspeed?: number;
  oilper100km?: number;
  oilperhour?: number;
  totalacc?: number;
  starttime?: number;
  endtime?: number;
  id?: string | number;
  [key: string]: any;
}

// Sync trips from GPS51 querytrips API
async function syncTripsFromGps51(
  supabase: any,
  proxyUrl: string,
  token: string,
  serverid: string,
  deviceId: string,
  targetDate: Date
): Promise<{ fetched: number; upserted: number; errors: string[] }> {
  const errors: string[] = [];
  let fetched = 0;
  let upserted = 0;

  try {
    const begintime = formatDateForGps51DateTime(targetDate, false);
    const endtime = formatDateForGps51DateTime(targetDate, true);

    console.log(`[sync-official-reports] Fetching trips for ${deviceId} on ${formatDateForGps51Date(targetDate)}`);

    const result = await callGps51WithRateLimit(
      supabase,
      proxyUrl,
      'querytrips',
      token,
      serverid,
      {
        deviceid: deviceId,
        begintime,
        endtime,
        timezone: 8, // GMT+8 (China time zone, default)
      }
    );

    if (result.status !== 0) {
      const errorMsg = `GPS51 querytrips error: ${result.cause || 'Unknown error'} (status: ${result.status})`;
      errors.push(errorMsg);
      throw new Error(errorMsg);
    }

    const trips = result.totaltrips || [];
    fetched = trips.length;
    console.log(`[sync-official-reports] Received ${fetched} trips from GPS51`);

    if (trips.length === 0) {
      console.log(`[sync-official-reports] No trips found for ${deviceId} on ${formatDateForGps51Date(targetDate)}`);
      return { fetched: 0, upserted: 0, errors: [] };
    }

    // Map GPS51 trips to our database format
    const tripsToUpsert = trips
      .filter((trip: Gps51Trip) => {
        // Only require start and end times
        const hasStartTime = trip.starttime || trip.starttime_str;
        const hasEndTime = trip.endtime || trip.endtime_str;
        
        if (!hasStartTime || !hasEndTime) {
          console.warn(`[sync-official-reports] Filtering out trip with missing times`);
          return false;
        }
        return true;
      })
      .map((trip: Gps51Trip) => {
        // Parse start time
        let startTime: string;
        if (trip.starttime) {
          startTime = new Date(trip.starttime).toISOString();
        } else if (trip.starttime_str) {
          // Parse yyyy-MM-dd HH:mm:ss format (GMT+8)
          startTime = new Date(trip.starttime_str.replace(' ', 'T') + '+08:00').toISOString();
        } else {
          throw new Error('Trip missing start time');
        }

        // Parse end time
        let endTime: string;
        if (trip.endtime) {
          endTime = new Date(trip.endtime).toISOString();
        } else if (trip.endtime_str) {
          endTime = new Date(trip.endtime_str.replace(' ', 'T') + '+08:00').toISOString();
        } else {
          throw new Error('Trip missing end time');
        }

        // Calculate distance (meters to km)
        // GPS51 querytrips returns distance in meters per trip
        let distanceKm = 0;
        if (trip.distance !== undefined && trip.distance !== null) {
          distanceKm = trip.distance / 1000;
        } else if (trip.totaldistance !== undefined && trip.totaldistance !== null) {
          distanceKm = trip.totaldistance / 1000;
        }

        // Normalize speeds (m/h to km/h)
        // GPS51 returns speeds in m/h, normalize using centralized function
        const maxSpeedKmh = (trip.maxspeed !== undefined && trip.maxspeed !== null)
          ? normalizeSpeed(trip.maxspeed)
          : (trip.totalmaxspeed !== undefined && trip.totalmaxspeed !== null)
          ? normalizeSpeed(trip.totalmaxspeed)
          : null;
        
        const avgSpeedKmh = (trip.avgspeed !== undefined && trip.avgspeed !== null)
          ? normalizeSpeed(trip.avgspeed)
          : (trip.totalaveragespeed !== undefined && trip.totalaveragespeed !== null)
          ? normalizeSpeed(trip.totalaveragespeed)
          : null;

        // Calculate duration
        // Use totaltriptime if available (ms), otherwise calculate from start/end times
        let durationSeconds: number;
        if (trip.totaltriptime !== undefined && trip.totaltriptime !== null) {
          durationSeconds = Math.floor(trip.totaltriptime / 1000);
        } else {
          const startDateObj = new Date(startTime);
          const endDateObj = new Date(endTime);
          durationSeconds = Math.floor((endDateObj.getTime() - startDateObj.getTime()) / 1000);
        }

        // Handle coordinates (use 0 as placeholder if missing)
        const startLat = trip.startlat && trip.startlat !== 0 ? trip.startlat : 0;
        const startLon = trip.startlon && trip.startlon !== 0 ? trip.startlon : 0;
        const endLat = trip.endlat && trip.endlat !== 0 ? trip.endlat : 0;
        const endLon = trip.endlon && trip.endlon !== 0 ? trip.endlon : 0;

        return {
          device_id: deviceId,
          start_time: startTime,
          end_time: endTime,
          start_latitude: startLat,
          start_longitude: startLon,
          end_latitude: endLat,
          end_longitude: endLon,
          distance_km: Math.round(distanceKm * 100) / 100,
          max_speed: maxSpeedKmh ? Math.round(maxSpeedKmh * 10) / 10 : null,
          avg_speed: avgSpeedKmh ? Math.round(avgSpeedKmh * 10) / 10 : null,
          duration_seconds: durationSeconds,
          source: 'gps51' as const, // Mark as GPS51 trip for 100% parity verification
        };
      });

    // Upsert trips to database
    if (tripsToUpsert.length > 0) {
      // Use batch upsert for efficiency
      const BATCH_SIZE = 50;
      for (let i = 0; i < tripsToUpsert.length; i += BATCH_SIZE) {
        const batch = tripsToUpsert.slice(i, i + BATCH_SIZE);
        
        const { error: upsertError } = await supabase
          .from('vehicle_trips')
          .upsert(batch, {
            onConflict: 'device_id,start_time,end_time',
            ignoreDuplicates: false,
          });

        if (upsertError) {
          const errorMsg = `Failed to upsert trips batch: ${upsertError.message}`;
          errors.push(errorMsg);
          console.error(`[sync-official-reports] ${errorMsg}`);
        } else {
          upserted += batch.length;
          console.log(`[sync-official-reports] Upserted ${batch.length} trips (batch ${Math.floor(i / BATCH_SIZE) + 1})`);
        }
      }
    }

    return { fetched, upserted, errors };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    errors.push(errorMsg);
    console.error(`[sync-official-reports] Trip sync error: ${errorMsg}`);
    return { fetched, upserted, errors };
  }
}

// Sync daily mileage from GPS51 reportmileagedetail API
async function syncMileageFromGps51(
  supabase: any,
  proxyUrl: string,
  token: string,
  serverid: string,
  deviceId: string,
  targetDate: Date
): Promise<{ fetched: number; upserted: number; errors: string[] }> {
  const errors: string[] = [];
  let fetched = 0;
  let upserted = 0;

  try {
    const vehicleProfile = await getVehicleProfileForMileage(supabase, deviceId);
    const estimatedCombined = calculateEstimatedFuelConsumptionForMileage(vehicleProfile);
    const startday = formatDateForGps51Date(targetDate);
    const endday = formatDateForGps51Date(targetDate);

    console.log(`[sync-official-reports] Fetching mileage for ${deviceId} on ${startday}`);

    const result = await callGps51WithRateLimit(
      supabase,
      proxyUrl,
      'reportmileagedetail',
      token,
      serverid,
      {
        deviceid: deviceId,
        startday,
        endday,
      }
    );

    if (result.status !== 0) {
      const errorMsg = `GPS51 reportmileagedetail error: ${result.cause || 'Unknown error'} (status: ${result.status})`;
      errors.push(errorMsg);
      throw new Error(errorMsg);
    }

    const records = result.records || [];
    fetched = records.length;
    console.log(`[sync-official-reports] Received ${fetched} mileage records from GPS51`);

    if (records.length === 0) {
      console.log(`[sync-official-reports] No mileage data found for ${deviceId} on ${startday}`);
      return { fetched: 0, upserted: 0, errors: [] };
    }

    // Process all records (upsert each one)
    // GPS51 may return multiple records for the same day (different time periods)
    const mileageRecordsToUpsert = records.map((record: Gps51MileageRecord, index: number) => {
      let variance: number | null = null;
      if (
        typeof record.oilper100km === 'number' &&
        record.oilper100km > 0 &&
        typeof estimatedCombined === 'number' &&
        estimatedCombined > 0
      ) {
        variance = ((record.oilper100km - estimatedCombined) / estimatedCombined) * 100;
      }

      return {
        device_id: deviceId,
        statisticsday: record.statisticsday || startday,
        totaldistance:
          record.totaldistance !== undefined && record.totaldistance !== null
            ? record.totaldistance
            : null,
        runoilper100km: record.runoilper100km !== undefined && record.runoilper100km !== null ? record.runoilper100km : null,
        begindis: record.begindis !== undefined && record.begindis !== null ? record.begindis : null,
        enddis: record.enddis !== undefined && record.enddis !== null ? record.enddis : null,
        beginoil: record.beginoil !== undefined && record.beginoil !== null ? record.beginoil : null,
        endoil: record.endoil !== undefined && record.endoil !== null ? record.endoil : null,
        ddoil: record.ddoil !== undefined && record.ddoil !== null ? record.ddoil : null,
        idleoil: record.idleoil !== undefined && record.idleoil !== null ? record.idleoil : null,
        leakoil: record.leakoil !== undefined && record.leakoil !== null ? record.leakoil : null,
        avgspeed:
          record.avgspeed !== undefined && record.avgspeed !== null ? record.avgspeed / 1000 : null,
        overspeed: record.overspeed !== undefined && record.overspeed !== null ? record.overspeed : null,
        oilper100km: record.oilper100km !== undefined && record.oilper100km !== null ? record.oilper100km : null,
        oilperhour: record.oilperhour !== undefined && record.oilperhour !== null ? record.oilperhour : null,
        estimated_fuel_consumption_combined: estimatedCombined,
        estimated_fuel_consumption_city: estimatedCombined,
        estimated_fuel_consumption_highway: estimatedCombined,
        fuel_consumption_variance: variance,
        totalacc: record.totalacc !== undefined && record.totalacc !== null ? record.totalacc : null,
        starttime: record.starttime !== undefined && record.starttime !== null ? record.starttime : null,
        endtime: record.endtime !== undefined && record.endtime !== null ? record.endtime : null,
        gps51_record_id: record.id?.toString() || `sync_${deviceId}_${startday}_${index}`,
      };
    });

    // Upsert all mileage records to database
    if (mileageRecordsToUpsert.length > 0) {
      // Use batch upsert for efficiency
      const BATCH_SIZE = 50;
      for (let i = 0; i < mileageRecordsToUpsert.length; i += BATCH_SIZE) {
        const batch = mileageRecordsToUpsert.slice(i, i + BATCH_SIZE);
        
        const { error: upsertError } = await supabase
          .from('vehicle_mileage_details')
          .upsert(batch, {
            onConflict: 'device_id,statisticsday,gps51_record_id',
            ignoreDuplicates: false,
          });

        if (upsertError) {
          const errorMsg = `Failed to upsert mileage batch: ${upsertError.message}`;
          errors.push(errorMsg);
          console.error(`[sync-official-reports] ${errorMsg}`);
        } else {
          upserted += batch.length;
          console.log(`[sync-official-reports] Upserted ${batch.length} mileage records (batch ${Math.floor(i / BATCH_SIZE) + 1})`);
        }
      }
    }

    return { fetched, upserted, errors };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    errors.push(errorMsg);
    console.error(`[sync-official-reports] Mileage sync error: ${errorMsg}`);
    return { fetched, upserted, errors };
  }
}

// Main handler
Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Parse request body
    const { device_id, date, timezone = 8 } = await req.json();

    // Validate input
    if (!device_id || !date) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required parameters: device_id and date (YYYY-MM-DD format)',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid date format. Expected YYYY-MM-DD',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Parse target date
    const targetDate = new Date(date + 'T00:00:00Z');
    if (isNaN(targetDate.getTime())) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid date value',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get GPS51 credentials
    const DO_PROXY_URL = Deno.env.get('DO_PROXY_URL');
    if (!DO_PROXY_URL) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing DO_PROXY_URL environment variable',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { token, serverid } = await getValidGps51Token(supabase);
    console.log(`[sync-official-reports] Starting sync for device ${device_id} on ${date}`);

    // Sync trips
    const tripResult = await syncTripsFromGps51(
      supabase,
      DO_PROXY_URL,
      token,
      serverid,
      device_id,
      targetDate
    );

    // Sync mileage
    const mileageResult = await syncMileageFromGps51(
      supabase,
      DO_PROXY_URL,
      token,
      serverid,
      device_id,
      targetDate
    );

    const duration = Date.now() - startTime;

    // Build response
    const response = {
      success: true,
      device_id,
      date,
      trips: {
        fetched: tripResult.fetched,
        upserted: tripResult.upserted,
        ...(tripResult.errors.length > 0 && { errors: tripResult.errors }),
      },
      mileage: {
        fetched: mileageResult.fetched,
        upserted: mileageResult.upserted,
        ...(mileageResult.errors.length > 0 && { errors: mileageResult.errors }),
      },
      duration_ms: duration,
    };

    console.log(`[sync-official-reports] Completed sync for ${device_id} on ${date}: ${tripResult.upserted} trips, ${mileageResult.upserted} mileage records in ${duration}ms`);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error(`[sync-official-reports] Fatal error: ${errorMessage}`);

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        duration_ms: duration,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
