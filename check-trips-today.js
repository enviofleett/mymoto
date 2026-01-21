// Quick script to check trips for device 13612332432 today
// Run with: node check-trips-today.js

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const deviceId = '13612332432';
const todayStart = new Date();
todayStart.setHours(0, 0, 0, 0);
const todayEnd = new Date();
todayEnd.setHours(23, 59, 59, 999);

console.log(`\n🔍 Checking trips for device ${deviceId} today (${todayStart.toLocaleDateString()})...\n`);

// Get summary
const { data: summary, error: summaryError } = await supabase
  .from('vehicle_trips')
  .select('distance_km, duration_seconds, start_time, end_time')
  .eq('device_id', deviceId)
  .gte('start_time', todayStart.toISOString())
  .lt('start_time', todayEnd.toISOString())
  .not('end_time', 'is', null);

if (summaryError) {
  console.error('Error:', summaryError);
  process.exit(1);
}

const tripCount = summary?.length || 0;
const totalDistance = summary?.reduce((sum, t) => sum + (t.distance_km || 0), 0) || 0;
const totalDuration = summary?.reduce((sum, t) => sum + (t.duration_seconds || 0), 0) || 0;

console.log('📊 SUMMARY:');
console.log(`   Total Trips Today: ${tripCount}`);
console.log(`   Total Distance: ${totalDistance.toFixed(2)} km`);
console.log(`   Total Duration: ${Math.round(totalDuration / 60)} minutes`);

if (tripCount > 0) {
  const firstTrip = summary[summary.length - 1];
  const lastTrip = summary[0];
  console.log(`   First Trip: ${new Date(firstTrip.start_time).toLocaleTimeString()}`);
  console.log(`   Last Trip: ${new Date(lastTrip.end_time).toLocaleTimeString()}`);
}

// Get detailed trips
const { data: trips, error: tripsError } = await supabase
  .from('vehicle_trips')
  .select('*')
  .eq('device_id', deviceId)
  .gte('start_time', todayStart.toISOString())
  .lt('start_time', todayEnd.toISOString())
  .not('end_time', 'is', null)
  .order('start_time', { ascending: false });

if (tripsError) {
  console.error('Error fetching trips:', tripsError);
} else if (trips && trips.length > 0) {
  console.log(`\n📋 DETAILED TRIPS (${trips.length}):`);
  trips.forEach((trip, i) => {
    const start = new Date(trip.start_time);
    const end = new Date(trip.end_time);
    const duration = trip.duration_seconds ? Math.round(trip.duration_seconds / 60) : 0;
    console.log(`\n   Trip ${i + 1}:`);
    console.log(`     Start: ${start.toLocaleString()}`);
    console.log(`     End: ${end.toLocaleString()}`);
    console.log(`     Distance: ${(trip.distance_km || 0).toFixed(2)} km`);
    console.log(`     Duration: ${duration} minutes`);
    console.log(`     Max Speed: ${trip.max_speed ? trip.max_speed.toFixed(1) : 'N/A'} km/h`);
    console.log(`     Avg Speed: ${trip.avg_speed ? trip.avg_speed.toFixed(1) : 'N/A'} km/h`);
  });
} else {
  console.log('\n   No trips found for today.');
}

console.log('\n');
