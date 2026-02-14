
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://cmvpnsqiefbsqkwnraka.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtdnBuc3FpZWZic3Frd25yYWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MjIwMDEsImV4cCI6MjA4MzI5ODAwMX0.nJLb5znjUiGsCk_S2QubhBtqIl3DB3I8LbZihIMJdwo";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  console.log("Checking vehicle_onboarding_requests...");
  const { data, error } = await supabase
    .from("vehicle_onboarding_requests")
    .select("*");

  if (error) {
    console.error("Error:", error);
  } else {
    console.log(`Found ${data.length} requests.`);
    if (data.length > 0) {
      console.log(data);
    }
  }
}

main();
