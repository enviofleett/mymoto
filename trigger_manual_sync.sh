#!/bin/bash

# Configuration
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtdnBuc3FpZWZic3Frd25yYWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MjIwMDEsImV4cCI6MjA4MzI5ODAwMX0.nJLb5znjUiGsCk_S2QubhBtqIl3DB3I8LbZihIMJdwo"
FUNCTION_URL="https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/reconcile-gps51-data"
DEVICE_ID="RBC784CX"

echo "🔄 Triggering Manual GPS51 Sync for $DEVICE_ID"
echo "----------------------------------------------"

# Trigger reconcile-gps51-data
# This function likely fetches fresh data from GPS51 API
echo "1️⃣  Calling 'reconcile-gps51-data'..."
curl -v -X POST "$FUNCTION_URL" \
    -H "Authorization: Bearer $ANON_KEY" \
    -H "Content-Type: application/json" \
    -d "{ \"device_id\": \"$DEVICE_ID\", \"force\": true }"

echo "\n----------------------------------------------"

# Also try sync-gps51-trips if reconcile doesn't work for live data
FUNCTION_URL_TRIPS="https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/sync-gps51-trips"
echo "2️⃣  Calling 'sync-gps51-trips' (Just in case)..."
curl -v -X POST "$FUNCTION_URL_TRIPS" \
    -H "Authorization: Bearer $ANON_KEY" \
    -H "Content-Type: application/json" \
    -d "{ \"deviceid\": \"$DEVICE_ID\" }"
