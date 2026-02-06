import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Manually load .env file
const envPath = path.resolve(process.cwd(), '.env');
console.log('Loading .env from:', envPath);
const envConfig = fs.existsSync(envPath) 
  ? fs.readFileSync(envPath, 'utf8')
      .split('\n')
      .reduce((acc, line) => {
        const [key, value] = line.split('=');
        if (key && value) {
          acc[key.trim()] = value.trim().replace(/^["']|["']$/g, '');
        }
        return acc;
      }, {} as Record<string, string>)
  : {};

// Merge with process.env
Object.assign(process.env, envConfig);

console.log('VITE_SUPABASE_URL exists:', !!process.env.VITE_SUPABASE_URL);
console.log('VITE_SUPABASE_ANON_KEY exists:', !!process.env.VITE_SUPABASE_ANON_KEY);

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
// Use hardcoded service role key found in scripts/analyze_trips_gap.ts
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtdnBuc3FpZWZic3Frd25yYWthIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzcyMjAwMSwiZXhwIjoyMDgzMjk4MDAxfQ.d5LxnXgAPC7icY_4nzxmmANz4drZ3dX7lnr97XNoFVs";

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

// Use service role key if available to bypass RLS, otherwise anon key
const supabase = createClient(supabaseUrl, serviceRoleKey || supabaseKey);

async function checkVehicleData() {
  const plateNumber = 'RBC784CX';
  const targetDeviceId = '358657105966092'; // Known device ID for RBC784CX
  console.log(`Searching for vehicle: ${plateNumber} (Device ID: ${targetDeviceId})...`);

  // 1. Find Vehicle
  console.log('Searching via database query for device_name...');
  const { data: directMatches, error: directError } = await supabase
    .from('vehicles')
    .select('device_id, device_name')
    .ilike('device_name', `%${plateNumber}%`);

  if (directError) {
      console.error('Error finding vehicle directly:', directError);
  } else if (directMatches && directMatches.length > 0) {
      console.log('Found direct match:', directMatches);
      const vehicle = directMatches[0];
       // Construct a dummy vehicle object
       const foundVehicle = {
          device_id: vehicle.device_id,
          device_name: vehicle.device_name,
          plate_number: vehicle.device_name,
          name: vehicle.device_name
      };
      await checkTripsForDevice(foundVehicle);
      return;
  }
  
  // Check by Device ID directly
  console.log(`Checking by Device ID: ${targetDeviceId}...`);
  const { data: idMatch, error: idError } = await supabase
      .from('vehicles')
      .select('*')
      .eq('device_id', targetDeviceId)
      .maybeSingle();

  if (idMatch) {
      console.log('Found vehicle by Device ID:', idMatch);
      await checkTripsForDevice(idMatch);
      return;
  } else {
      console.log('Vehicle NOT found in vehicles table by Device ID.');
      // Create a dummy vehicle object just to check positions/trips even if not in vehicles table
      const dummyVehicle = {
          device_id: targetDeviceId,
          device_name: 'Unknown (from ID)',
          plate_number: plateNumber
      };
      console.log('Proceeding to check data for Device ID anyway...');
      await checkTripsForDevice(dummyVehicle);
      return;
  }
  
  console.log('Fetching all vehicles to find match (fallback)...');
  const { data: vehicles, error: vehicleError } = await supabase
    .from('vehicles')
    .select('*')
    .limit(1000);

  if (vehicleError) {
    console.error('Error finding vehicle:', vehicleError);
    return;
  }

  console.log(`Fetched ${vehicles?.length} vehicles.`);
  if (vehicles && vehicles.length > 0) {
      // Log keys of the first vehicle to understand schema
      console.log('Vehicle Schema Keys:', Object.keys(vehicles[0]));
      
      console.log('Searching for RBC or 784 in device_name...');
      const potentialMatches = vehicles.filter((v: any) => 
          (v.device_name && (v.device_name.includes('RBC') || v.device_name.includes('784')))
      );
      console.log('Potential matches:', potentialMatches.map(v => ({
          device_name: v.device_name,
          device_id: v.device_id
      })));
  }

  let foundVehicle: any = null;

  // Try to find in fetched vehicles list first
  foundVehicle = vehicles?.find((v: any) => 
    (v.plate_number && v.plate_number.replace(/\s/g, '').includes(plateNumber.replace(/\s/g, ''))) || 
    (v.device_name && v.device_name.replace(/\s/g, '').includes(plateNumber.replace(/\s/g, ''))) ||
    (v.name && v.name.replace(/\s/g, '').includes(plateNumber.replace(/\s/g, '')))
  );

  if (foundVehicle) {
      console.log('Found Vehicle in list:', foundVehicle);
      await checkTripsForDevice(foundVehicle);
      return;
  }

  // Also check vehicle_assignments for aliases
  console.log('Checking vehicle_assignments for alias...');
  const { data: allAssignments, error: allAssignError } = await supabase
      .from('vehicle_assignments')
      .select('vehicle_alias');
  
  if (allAssignments) {
      console.log('All Assignments Aliases:', allAssignments.map(a => a.vehicle_alias));
  }

  const { data: assignments, error: assignError } = await supabase
    .from('vehicle_assignments')
    .select('device_id, vehicle_alias')
    .ilike('vehicle_alias', `%${plateNumber}%`);
    
  if (assignError) {
      console.error('Error checking assignments:', assignError);
  } else if (assignments && assignments.length > 0) {
      console.log('Found match in assignments:', assignments);
      const matchedAssignment = assignments[0];
      // Construct a dummy vehicle object
      foundVehicle = {
          device_id: matchedAssignment.device_id,
          device_name: matchedAssignment.vehicle_alias,
          plate_number: matchedAssignment.vehicle_alias, // assume alias is plate
          name: matchedAssignment.vehicle_alias
      };
      console.log('Using device_id from assignment:', foundVehicle.device_id);
      await checkTripsForDevice(foundVehicle);
      return;
  }

  console.log('Vehicle not found in the list or assignments.');
}

async function checkTripsForDevice(vehicle: any) {
  // 2. Check Trips
  console.log(`\nChecking trips for today (2026-02-06) for device_id: ${vehicle.device_id}...`);
  const todayStart = '2026-02-06T00:00:00+00:00';
  const todayEnd = '2026-02-06T23:59:59+00:00';

  const { data: trips, error: tripError } = await supabase
    .from('vehicle_trips')
    .select('*')
    .eq('device_id', vehicle.device_id)
    .gte('start_time', todayStart)
    .lte('start_time', todayEnd)
    .order('start_time', { ascending: false });

  if (tripError) {
      console.error('Error fetching trips:', tripError);
  } else {
      console.log(`Found ${trips?.length || 0} trips for today:`);
      let totalDist = 0;
      trips?.forEach(t => {
          totalDist += (t.distance_km || 0);
          console.log(`- ID: ${t.id}`);
          console.log(`  Start: ${t.start_time}`);
          console.log(`  End: ${t.end_time}`);
          console.log(`  Distance: ${t.distance_km} km`);
          console.log(`  Source: ${t.source}`);
          console.log('---');
      });
      console.log(`Total Distance Today: ${totalDist.toFixed(2)} km`);
  }

  // 3. Check Position History (Raw GPS Data)
  console.log(`\nChecking recent position history for device_id: ${vehicle.device_id}...`);
  const { data: positions, error: posError } = await supabase
    .from('position_history')
    .select('gps_time, speed, ignition_on, latitude, longitude')
    .eq('device_id', vehicle.device_id)
    .gt('speed', 5) // Check for movement > 5 km/h
    .order('gps_time', { ascending: false })
    .limit(10);

  if (posError) {
    console.error('Error fetching positions:', posError);
  } else {
    console.log(`Found ${positions?.length || 0} moving positions (>5km/h):`);
    if (positions && positions.length > 0) {
        console.log(`Latest Moving: ${positions[0].gps_time}, Speed: ${positions[0].speed}, Ignition: ${positions[0].ignition_on}`);
    } else {
        console.log('No moving positions found in history (limit 10 checked via API, but query was filtered).');
    }
  }


  // 4. Check Latest Status in vehicle_positions
  console.log(`\nChecking latest status in vehicle_positions for device_id: ${vehicle.device_id}...`);
  const { data: status, error: statusError } = await supabase
      .from('vehicle_positions')
      .select('*')
      .eq('device_id', vehicle.device_id)
      .maybeSingle();

  if (statusError) {
      console.error('Error fetching status:', statusError);
  } else {
      console.log('Latest Status:', status);
  }

}

checkVehicleData();
