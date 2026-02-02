#!/bin/bash

# Configuration
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtdnBuc3FpZWZic3Frd25yYWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MjIwMDEsImV4cCI6MjA4MzI5ODAwMX0.nJLb5znjUiGsCk_S2QubhBtqIl3DB3I8LbZihIMJdwo"
REST_URL="https://cmvpnsqiefbsqkwnraka.supabase.co/rest/v1"
DEVICE_ID="RBC784CX"

echo "🔍 Investigation Step 2: Fuzzy Search & Sync Check"
echo "------------------------------------------------"

# 1. Fuzzy Search for Device ID
echo "1️⃣  Fuzzy searching for device '$DEVICE_ID'..."
curl -s -X GET "$REST_URL/vehicles?device_id=ilike.%$DEVICE_ID%&select=device_id,device_name,updated_at" \
    -H "apikey: $ANON_KEY" \
    -H "Authorization: Bearer $ANON_KEY" | python3 -m json.tool

echo "\n------------------------------------------------"

# 2. Check for Sync Function Logs (Mock check or list functions)
# We can't list functions via REST easily, but we can check if data exists in a sync_log table if it exists
echo "2️⃣  Checking 'edge_function_logs' (if available)..."
curl -s -X GET "$REST_URL/edge_function_logs?limit=5&order=created_at.desc" \
    -H "apikey: $ANON_KEY" \
    -H "Authorization: Bearer $ANON_KEY" | python3 -m json.tool

echo "\n------------------------------------------------"

# 3. List all active devices (Limit 10) to see format
echo "3️⃣  Listing sample active devices..."
curl -s -X GET "$REST_URL/vehicle_positions?limit=5&select=device_id" \
    -H "apikey: $ANON_KEY" \
    -H "Authorization: Bearer $ANON_KEY" | python3 -m json.tool
