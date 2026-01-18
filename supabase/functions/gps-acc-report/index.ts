/**
 * GPS51 ACC Report Edge Function
 * 
 * Implements GPS51's reportaccsbytime API (Section 6.3) to get authoritative
 * ACC (ignition) state changes with precise timestamps and coordinates.
 * 
 * This provides GPS51's server-calculated ACC data, which is more accurate
 * than parsing status strings or inferring from position data.
 * 
 * API: action=reportaccsbytime
 * Request: { deviceids[], starttime, endtime, offset }
 * Response: { records: [{ accstate, begintime, endtime, slat, slon, elat, elon }] }
 * 
 * Mapping:
 * - accstate: 2 = OFF, 3 = ON
 * - begintime/endtime: timestamps in milliseconds
 * - slat/slon: start coordinates, elat/elon: end coordinates
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { callGps51WithRateLimit, getValidGps51Token } from "../_shared/gps51-client.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AccReportRequest {
  device_ids: string[];
  start_time: string; // ISO8601 or "yyyy-MM-dd HH:mm:ss"
  end_time: string; // ISO8601 or "yyyy-MM-dd HH:mm:ss"
  timezone?: number; // Default: 8 (GMT+8)
}

interface Gps51AccRecord {
  accstateid?: string;
  deviceid?: string;
  accstate: number; // 2 = OFF, 3 = ON
  begintime: number | string; // timestamp in milliseconds
  endtime: number | string; // timestamp in milliseconds
  slat?: number; // start latitude
  slon?: number; // start longitude
  elat?: number; // end latitude
  elon?: number; // end longitude
}

interface Gps51AccReportResponse {
  status: number;
  cause?: string;
  records?: Gps51AccRecord[];
}

/**
 * Format date for GPS51 API (yyyy-MM-dd HH:mm:ss)
 */
function formatDateForGps51(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date: ${date}`);
  }
  
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Convert GPS51 timestamp (ms) to ISO8601 string
 */
function convertGps51Timestamp(timestamp: number | string): string {
  const ms = typeof timestamp === 'string' ? parseInt(timestamp, 10) : timestamp;
  if (isNaN(ms)) {
    throw new Error(`Invalid timestamp: ${timestamp}`);
  }
  return new Date(ms).toISOString();
}

/**
 * Map GPS51 ACC record to acc_state_history format
 */
function mapAccRecordToDb(record: Gps51AccRecord, deviceId: string): any {
  // Map accstate: 2 = OFF, 3 = ON
  const accState = record.accstate === 3 ? 'ON' : record.accstate === 2 ? 'OFF' : null;
  
  if (accState === null) {
    console.warn(`[gps-acc-report] Unknown accstate value: ${record.accstate}, skipping`);
    return null;
  }
  
  try {
    const beginTime = convertGps51Timestamp(record.begintime);
    const endTime = convertGps51Timestamp(record.endtime);
    
    return {
      device_id: deviceId,
      acc_state: accState,
      begin_time: beginTime,
      end_time: endTime,
      start_latitude: record.slat || null,
      start_longitude: record.slon || null,
      end_latitude: record.elat || null,
      end_longitude: record.elon || null,
      source: 'gps51_api',
      synced_at: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`[gps-acc-report] Error mapping ACC record:`, error, record);
    return null;
  }
}

/**
 * Fetch ACC report from GPS51 API
 */
async function fetchAccReport(
  supabase: any,
  proxyUrl: string,
  token: string,
  serverid: string,
  deviceIds: string[],
  startTime: string,
  endTime: string,
  timezone: number = 8
): Promise<Gps51AccRecord[]> {
  console.log(`[gps-acc-report] Fetching ACC report for ${deviceIds.length} device(s) from ${startTime} to ${endTime}`);
  
  // Format dates for GPS51 API
  const startTimeFormatted = formatDateForGps51(startTime);
  const endTimeFormatted = formatDateForGps51(endTime);
  
  // Call GPS51 reportaccsbytime API
  const result = await callGps51WithRateLimit(
    supabase,
    proxyUrl,
    'reportaccsbytime',
    token,
    serverid,
    {
      deviceids: deviceIds,
      starttime: startTimeFormatted,
      endtime: endTimeFormatted,
      offset: timezone,
    }
  ) as Gps51AccReportResponse;
  
  if (result.status !== 0) {
    throw new Error(`GPS51 ACC report error: ${result.cause || 'Unknown error'} (status: ${result.status})`);
  }
  
  const records = result.records || [];
  console.log(`[gps-acc-report] Received ${records.length} ACC state changes from GPS51`);
  
  return records;
}

/**
 * Store ACC records in database
 */
async function storeAccRecords(
  supabase: any,
  records: any[]
): Promise<{ inserted: number; errors: number }> {
  if (records.length === 0) {
    return { inserted: 0, errors: 0 };
  }
  
  // Filter out null records (failed mappings)
  const validRecords = records.filter(r => r !== null);
  
  if (validRecords.length === 0) {
    return { inserted: 0, errors: records.length };
  }
  
  // Insert in batches to avoid memory limits
  const BATCH_SIZE = 50;
  let inserted = 0;
  let errors = 0;
  
  for (let i = 0; i < validRecords.length; i += BATCH_SIZE) {
    const batch = validRecords.slice(i, i + BATCH_SIZE);
    
    const { error, data } = await supabase
      .from('acc_state_history')
      .insert(batch)
      .select();
    
    if (error) {
      console.error(`[gps-acc-report] Error inserting batch ${i / BATCH_SIZE + 1}:`, error);
      errors += batch.length;
    } else {
      inserted += data?.length || 0;
      console.log(`[gps-acc-report] Inserted ${data?.length || 0} ACC records (batch ${i / BATCH_SIZE + 1})`);
    }
  }
  
  return { inserted, errors };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get request body
    const request: AccReportRequest = await req.json();
    
    const { device_ids, start_time, end_time, timezone = 8 } = request;
    
    if (!device_ids || !Array.isArray(device_ids) || device_ids.length === 0) {
      return new Response(
        JSON.stringify({ error: 'device_ids is required and must be a non-empty array' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (!start_time || !end_time) {
      return new Response(
        JSON.stringify({ error: 'start_time and end_time are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Get GPS51 credentials
    const { token, serverid } = await getValidGps51Token(supabase);
    if (!token || !serverid) {
      return new Response(
        JSON.stringify({ error: 'Failed to get valid GPS51 credentials' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Get proxy URL from environment or settings
    const proxyUrl = Deno.env.get('DO_PROXY_URL') || 
                     'https://fleet-flow-proxy-6f2qs.ondigitalocean.app/proxy';
    
    // Fetch ACC report from GPS51
    const accRecords = await fetchAccReport(
      supabase,
      proxyUrl,
      token,
      serverid,
      device_ids,
      start_time,
      end_time,
      timezone
    );
    
    // Map to database format
    const dbRecords = accRecords
      .map(record => {
        // Use deviceid from record or fall back to first device_id from request
        const deviceId = record.deviceid || device_ids[0];
        return mapAccRecordToDb(record, deviceId);
      })
      .filter(r => r !== null);
    
    // Store in database
    const { inserted, errors } = await storeAccRecords(supabase, dbRecords);
    
    return new Response(
      JSON.stringify({
        success: true,
        message: `Fetched ${accRecords.length} ACC records, stored ${inserted} in database`,
        fetched: accRecords.length,
        stored: inserted,
        errors,
        records: dbRecords.slice(0, 10), // Return first 10 for preview
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('[gps-acc-report] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    
    return new Response(
      JSON.stringify({
        success: false,
        error: message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
