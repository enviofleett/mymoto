
import { createClient } from "@supabase/supabase-js";

// Hardcoded keys from assign_vehicle.ts (for development environment)
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://cmvpnsqiefbsqkwnraka.supabase.co";
// Use Service Role Key if provided (required for RLS bypass), otherwise fall back to Anon Key (read-only likely)
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtdnBuc3FpZWZic3Frd25yYWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MjIwMDEsImV4cCI6MjA4MzI5ODAwMX0.nJLb5znjUiGsCk_S2QubhBtqIl3DB3I8LbZihIMJdwo";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  const email = "toolbuxdev+1@gmail.com";
  const licensePlate = "RBC784CX";

  console.log(`Using Supabase URL: ${SUPABASE_URL}`);
  console.log(`Using Key: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? "Service Role (Admin)" : "Anon (Public)"}`);

  console.log(`🔍 Looking up user: ${email}`);
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("email", email);

  if (profileError) {
    console.error("❌ Error fetching profile:", profileError);
    return;
  }

  if (!profiles || profiles.length === 0) {
    console.error("❌ Profile not found for email:", email);
    return;
  }

  const profile = profiles[0];
  console.log(`✅ Found profile: ${profile.id} (${profile.name || "No Name"})`);

  // Check if vehicle exists
  console.log(`🔍 Checking if vehicle ${licensePlate} exists...`);
  // Only check device_name as plate_number column might be missing
  const { data: vehicles, error: vehicleError } = await supabase
    .from("vehicles")
    .select("device_id, device_name")
    .eq("device_name", licensePlate);

  let vehicleId;

  if (vehicleError) {
    console.error("⚠️ Error checking vehicle:", vehicleError);
  }

  if (vehicles && vehicles.length > 0) {
    console.log(`✅ Vehicle exists: ${vehicles[0].device_id}`);
    vehicleId = vehicles[0].device_id;
  } else {
    console.log(`⚠️ Vehicle not found. Attempting to create...`);
    
    // Create vehicle with minimal columns to avoid schema errors
    const newVehicle = {
      device_id: licensePlate, // Using plate as ID for simplicity
      device_name: licensePlate,
      // Omit potentially missing columns: plate_number, make, model, year, color, primary_owner_profile_id
    };

    const { data: createdVehicle, error: createError } = await supabase
      .from("vehicles")
      .insert(newVehicle)
      .select()
      .single();

    if (createError) {
      console.error("❌ Failed to create vehicle:", createError);
      if (createError.code === '42501') {
          console.log("\n🚨 RLS ERROR: You need the SERVICE_ROLE_KEY to bypass Row Level Security.");
          console.log("Run this script with: SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/seed_and_assign_rbc784cx.ts");
      }
      return;
    }

    console.log(`✅ Vehicle created: ${createdVehicle.device_id}`);
    vehicleId = createdVehicle.device_id;
  }

  // Assign vehicle
  if (vehicleId) {
    console.log(`🔗 Assigning vehicle ${vehicleId} to profile ${profile.id}...`);
    const { data: assignment, error: assignError } = await supabase
      .from("vehicle_assignments")
      .insert({
        device_id: vehicleId,
        profile_id: profile.id,
        is_primary: true
      })
      .select();

    if (assignError) {
      if (assignError.code === '23505') { // Unique violation
        console.log("✅ Vehicle already assigned.");
      } else {
        console.error("❌ Failed to assign vehicle:", assignError);
      }
    } else {
      console.log("✅ Vehicle assigned successfully.");
    }
  }
}

main().catch(console.error);
