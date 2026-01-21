#!/bin/bash
# Test Commands for EPE511GA Device
# Replace YOUR_SERVICE_ROLE_KEY with your actual key

# First, find the device_id (run the SQL query in TEST_EPE511GA.sql)
# Then use the numeric device_id in the commands below

# =====================================================
# Step 1: Sync trips for EPE511GA
# =====================================================
# Replace DEVICE_ID_HERE with the numeric device_id from SQL query
echo "Step 1: Syncing trips for EPE511GA..."
curl -X POST 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/sync-trips-incremental' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "device_ids": ["DEVICE_ID_HERE"],
    "force_full_sync": true
  }'

echo ""
echo "---"
echo ""

# =====================================================
# Step 2: Run reconciliation for EPE511GA
# =====================================================
echo "Step 2: Running reconciliation for EPE511GA..."
curl -X POST 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/reconcile-gps51-data' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "mode": "coordinates",
    "deviceId": "DEVICE_ID_HERE",
    "startDate": "2026-01-01",
    "endDate": "2026-01-21"
  }'

echo ""
echo "---"
echo ""

# =====================================================
# Step 3: Verify results
# =====================================================
echo "Step 3: Check results in Supabase SQL Editor using TEST_EPE511GA.sql"
