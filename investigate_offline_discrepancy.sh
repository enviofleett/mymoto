#!/bin/bash

# Configuration
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtdnBuc3FpZWZic3Frd25yYWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MjIwMDEsImV4cCI6MjA4MzI5ODAwMX0.nJLb5znjUiGsCk_S2QubhBtqIl3DB3I8LbZihIMJdwo"
REST_URL="https://cmvpnsqiefbsqkwnraka.supabase.co/rest/v1"
DEVICE_ID="RBC784CX"

echo "🔍 Investigating Data Discrepancy for $DEVICE_ID"
echo "------------------------------------------------"

# 1. Check Vehicle Positions (Live Status)
echo "1️⃣  Checking 'vehicle_positions' (Live Status)..."
curl -s -X GET "$REST_URL/vehicle_positions?device_id=eq.$DEVICE_ID&select=device_id,gps_time,is_online,latitude,longitude,speed,ignition_on" \
    -H "apikey: $ANON_KEY" \
    -H "Authorization: Bearer $ANON_KEY" | python3 -m json.tool

echo "\n------------------------------------------------"

# 2. Check Recent Trips (Last 24 Hours)
echo "2️⃣  Checking 'vehicle_trips' (Recent History)..."
# Get trips from yesterday onwards
YESTERDAY=$(date -v-1d +%Y-%m-%d)
curl -s -X GET "$REST_URL/vehicle_trips?device_id=eq.$DEVICE_ID&start_time=gte.$YESTERDAY&order=start_time.desc&limit=5" \
    -H "apikey: $ANON_KEY" \
    -H "Authorization: Bearer $ANON_KEY" | python3 -m json.tool

echo "\n------------------------------------------------"

# 3. Check Raw GPS51 Sync Log (if available)
# Assuming there might be a log table or we check the raw position history
echo "3️⃣  Checking raw 'position_history' (Last 5 points)..."
curl -s -X GET "$REST_URL/position_history?device_id=eq.$DEVICE_ID&order=gps_time.desc&limit=5&select=device_id,gps_time,speed" \
    -H "apikey: $ANON_KEY" \
    -H "Authorization: Bearer $ANON_KEY" | python3 -m json.tool
