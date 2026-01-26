/**
 * Script to get today's mileage for a vehicle from GPS51 data
 * Usage: node scripts/get-today-mileage.js <device_id>
 * Example: node scripts/get-today-mileage.js 358657105966092
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://cmvpnsqiefbsqkwnraka.supabase.co';
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtdnBuc3FpZWZic3Frd25yYWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MjIwMDEsImV4cCI6MjA4MzI5ODAwMX0.nJLb5znjUiGsCk_S2QubhBtqIl3DB3I8LbZihIMJdwo';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function getTodayMileage(deviceId) {
  try {
    // Get today's start in Lagos timezone
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    todayStart.setHours(0, 0, 0, 0);
    
    // Query vehicle_trips for today
    const { data, error } = await supabase
      .from('vehicle_trips')
      .select('distance_km, start_time, end_time, duration_seconds, avg_speed, max_speed')
      .eq('device_id', deviceId)
      .gte('start_time', todayStart.toISOString())
      .lt('start_time', new Date(todayStart.getTime() + 24 * 60 * 60 * 1000).toISOString())
      .not('end_time', 'is', null);

    if (error) {
      console.error('Error:', error);
      return;
    }

    if (!data || data.length === 0) {
      console.log(`\n📊 Today's Mileage Report for Device: ${deviceId}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('❌ No trips found for today');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      return;
    }

    const totalDistance = data.reduce((sum, trip) => sum + (trip.distance_km || 0), 0);
    const totalDuration = data.reduce((sum, trip) => sum + (trip.duration_seconds || 0), 0);
    const avgSpeed = data.reduce((sum, trip) => sum + (trip.avg_speed || 0), 0) / data.length;
    const maxSpeed = Math.max(...data.map(trip => trip.max_speed || 0));

    console.log(`\n📊 Today's Mileage Report for Device: ${deviceId}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🚗 Total Distance: ${totalDistance.toFixed(2)} km`);
    console.log(`📈 Number of Trips: ${data.length}`);
    console.log(`⏱️  Total Duration: ${Math.round(totalDuration / 60)} minutes`);
    console.log(`📊 Average Speed: ${avgSpeed.toFixed(1)} km/h`);
    console.log(`⚡ Max Speed: ${maxSpeed.toFixed(1)} km/h`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n📋 Trip Details:');
    data.forEach((trip, index) => {
      const start = new Date(trip.start_time).toLocaleString('en-US', { timeZone: 'Africa/Lagos' });
      const end = new Date(trip.end_time).toLocaleString('en-US', { timeZone: 'Africa/Lagos' });
      console.log(`  ${index + 1}. ${(trip.distance_km || 0).toFixed(2)} km | ${start} - ${end}`);
    });
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('Error fetching mileage:', error);
  }
}

// Get device ID from command line argument
const deviceId = process.argv[2];

if (!deviceId) {
  console.error('Usage: node scripts/get-today-mileage.js <device_id>');
  console.error('Example: node scripts/get-today-mileage.js 358657105966092');
  process.exit(1);
}

getTodayMileage(deviceId);
