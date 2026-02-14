
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://cmvpnsqiefbsqkwnraka.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtdnBuc3FpZWZic3Frd25yYWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MjIwMDEsImV4cCI6MjA4MzI5ODAwMX0.nJLb5znjUiGsCk_S2QubhBtqIl3DB3I8LbZihIMJdwo";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function inspectVehicles() {
  console.log("Fetching one vehicle to inspect columns...");
  const { data: vehicles, error } = await supabase
    .from("vehicles")
    .select("*")
    .limit(1);

  if (error) {
    console.error("Error fetching vehicles:", error);
    return;
  }

  if (vehicles && vehicles.length > 0) {
    console.log("Vehicle columns:", Object.keys(vehicles[0]));
    console.log("First vehicle sample:", vehicles[0]);
  } else {
    console.log("No vehicles found in table.");
  }
}

inspectVehicles();
