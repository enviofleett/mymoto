// Quick query to check trips for device 13612332432 today
import { supabase } from "@/integrations/supabase/client";

async function checkTripsToday() {
  const deviceId = '13612332432';
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  console.log(`Checking trips for device ${deviceId} today...`);

  const { data, error } = await supabase
    .from('vehicle_trips')
    .select('*')
    .eq('device_id', deviceId)
    .gte('start_time', todayStart.toISOString())
    .lt('start_time', todayEnd.toISOString())
    .not('end_time', 'is', null)
    .order('start_time', { ascending: false });

  if (error) {
    console.error('Error:', error);
    return;
  }

  const tripCount = data?.length || 0;
  const totalDistance = data?.reduce((sum, t) => sum + (t.distance_km || 0), 0) || 0;
  const totalDuration = data?.reduce((sum, t) => sum + (t.duration_seconds || 0), 0) || 0;

  console.log(`\n📊 RESULTS FOR DEVICE ${deviceId}:`);
  console.log(`   Total Trips Today: ${tripCount}`);
  console.log(`   Total Distance: ${totalDistance.toFixed(2)} km`);
  console.log(`   Total Duration: ${Math.round(totalDuration / 60)} minutes`);

  if (data && data.length > 0) {
    console.log(`\n   Individual Trips:`);
    data.forEach((trip, i) => {
      const start = new Date(trip.start_time);
      const end = new Date(trip.end_time);
      console.log(`   ${i + 1}. ${start.toLocaleTimeString()} - ${end.toLocaleTimeString()} | ${(trip.distance_km || 0).toFixed(2)} km | ${trip.duration_seconds ? Math.round(trip.duration_seconds / 60) : 0} min`);
    });
  }

  return { tripCount, totalDistance, totalDuration, trips: data };
}

// Export for use in browser console or as a function
if (typeof window !== 'undefined') {
  (window as any).checkTripsToday = checkTripsToday;
}

export { checkTripsToday };
