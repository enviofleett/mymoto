
const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const GPS_TOKEN = "560342507e51d5aabd0e221ad444d82c";
const SERVER_ID = "2";
const DEVICE_ID = "RBC784CX";

function normalizeSpeed(speed) {
  if (speed === null || speed === undefined) return null;
  // If speed > 200, it's likely a GPS jump or error, but let's keep it if reasonable
  // GPS51 returns km/h usually.
  return speed;
}

function formatDateForGps51(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

async function run() {
  // Time range: 2026-02-02 00:00:00 to 2026-02-02 23:59:59 (UTC+8 for GPS51)
  // Actually, let's just ask for the last 24 hours from now.
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  
  // Or better, specific day:
  const beginTime = "2026-02-02 00:00:00";
  const endTime = "2026-02-02 23:59:59";
  
  const url = `https://api.gps51.com/openapi?action=querytrips&token=${GPS_TOKEN}&serverid=${SERVER_ID}&deviceid=${DEVICE_ID}&begintime=${beginTime}&endtime=${endTime}&timezone=8`;
  
  console.log("Fetching URL:", url);
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    console.log("Response status:", data.status);
    console.log("Full Response:", JSON.stringify(data, null, 2));

    if (data.status === 0 && data.totaltrips && data.totaltrips.length > 0) {
      console.log(`Found ${data.totaltrips.length} trips.`);
      
      const tripsToInsert = data.totaltrips.map(trip => {
        let distanceKm = 0;
        if (trip.distance) distanceKm = trip.distance / 1000;
        else if (trip.totaldistance) distanceKm = trip.totaldistance / 1000;
        
        // Fix dates
        // GPS51 returns "yyyy-MM-dd HH:mm:ss" in the requested timezone (UTC+8)
        // We need to store as UTC ISO string.
        // If string is "2026-02-02 08:00:00" (Beijing), that is "2026-02-02 00:00:00 UTC".
        const parseGpsDate = (str) => {
             if (!str) return null;
             // Assume str is in UTC+8
             const d = new Date(str.replace(' ', 'T') + '+08:00');
             return d.toISOString();
        };

        const startTime = trip.starttime ? new Date(trip.starttime).toISOString() : parseGpsDate(trip.starttime_str);
        const endTime = trip.endtime ? new Date(trip.endtime).toISOString() : parseGpsDate(trip.endtime_str);

        return {
            device_id: DEVICE_ID,
            start_time: startTime,
            end_time: endTime,
            start_latitude: trip.startlat || 0,
            start_longitude: trip.startlon || 0,
            end_latitude: trip.endlat || 0,
            end_longitude: trip.endlon || 0,
            distance_km: Math.round(distanceKm * 100) / 100,
            max_speed: trip.maxspeed || 0,
            avg_speed: trip.avgspeed || 0,
            duration_seconds: (new Date(endTime) - new Date(startTime)) / 1000,
            source: 'gps51_manual_sync'
        };
      });

      console.log("Trips to insert:", tripsToInsert);

      // We need a way to insert.
      // 'vehicle_trips' table might have RLS.
      // But we can try with the client we have.
      // If RLS blocks, we'll need an RPC.
      
      // Try inserting one by one or batch
      const { data: insertData, error: insertError } = await supabase
        .from('vehicle_trips')
        .upsert(tripsToInsert, { onConflict: 'device_id,start_time' });

      if (insertError) {
        console.error("Insert Error:", insertError);
        // Fallback: Create RPC to insert
        console.log("Trying to create RPC for insertion...");
      } else {
        console.log("Inserted successfully:", insertData);
      }

    } else {
      console.log("No trips found or error.");
    }
  } catch (err) {
    console.error("Fetch error:", err);
  }
}

run();
