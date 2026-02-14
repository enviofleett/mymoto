
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://cmvpnsqiefbsqkwnraka.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtdnBuc3FpZWZic3Frd25yYWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MjIwMDEsImV4cCI6MjA4MzI5ODAwMX0.nJLb5znjUiGsCk_S2QubhBtqIl3DB3I8LbZihIMJdwo";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function assignVehicle() {
  const email = "toolbuxdev+1@gmail.com";
  const licensePlate = "RBC784CX";

  console.log(`Looking up user: ${email}`);
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("email", email);

  if (profileError || !profiles || profiles.length === 0) {
    console.error("❌ User profile not found or error:", profileError);
    return;
  }

  console.log(`Found ${profiles.length} profiles. Using the first one with a valid user_id if possible.`);
  
  // Prefer profile with user_id
  let targetProfile = profiles.find(p => p.user_id);
  if (!targetProfile) {
      targetProfile = profiles[0];
      console.log("⚠️ No profile with user_id found, using the first available profile.");
  }
  
  const profileId = targetProfile.id;
  console.log(`✅ Selected User: ${targetProfile.name} (Profile ID: ${profileId}, User ID: ${targetProfile.user_id})`);

  console.log(`Looking up vehicle by device_name (License Plate): ${licensePlate}`);
  const { data: vehicles, error: vehicleError } = await supabase
    .from("vehicles")
    .select("device_id, make, model, device_name")
    .eq("device_name", licensePlate)
    .single();

  if (vehicleError || !vehicles) {
    console.error("❌ Vehicle not found:", vehicleError);
    // Fallback: search using like/ilike in case of whitespace or formatting
    console.log("Attempting fuzzy search...");
     const { data: fuzzyVehicles } = await supabase
      .from("vehicles")
      .select("device_id, make, model, device_name")
      .ilike("device_name", `%${licensePlate}%`)
      .limit(1);
      
     if (fuzzyVehicles && fuzzyVehicles.length > 0) {
         const v = fuzzyVehicles[0];
         console.log(`✅ Found vehicle via fuzzy search: ${v.make} ${v.model} (${v.device_name})`);
         
         console.log("Assigning vehicle to user...");
         const { data: assignment, error: assignError } = await supabase
            .from("vehicle_assignments")
            .insert({
            profile_id: profileId,
            device_id: v.device_id,
            is_primary: true
            })
            .select();

        if (assignError) {
            if (assignError.code === '23505') {
                console.log("⚠️ Vehicle is already assigned to this user.");
            } else {
                console.error("❌ Failed to assign vehicle:", assignError);
            }
        } else {
            console.log("✅ Vehicle assigned successfully:", assignment);
        }
        return;
     }

    return;
  }
  const deviceId = vehicles.device_id;
  console.log(`✅ Found vehicle: ${vehicles.make} ${vehicles.model} (${vehicles.device_name})`);

  console.log("Assigning vehicle to user...");
  const { data: assignment, error: assignError } = await supabase
    .from("vehicle_assignments")
    .insert({
      profile_id: profileId,
      device_id: deviceId,
      is_primary: true // Assuming primary assignment
    })
    .select();

  if (assignError) {
    // Check if it's a duplicate assignment error
    if (assignError.code === '23505') { // Unique violation
        console.log("⚠️ Vehicle is already assigned to this user.");
    } else {
        console.error("❌ Failed to assign vehicle:", assignError);
    }
  } else {
    console.log("✅ Vehicle assigned successfully:", assignment);
  }
}

assignVehicle();
