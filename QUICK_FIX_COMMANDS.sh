#!/bin/bash
# Quick Fix Commands for Missing Coordinates
# Run these in Terminal/Command Prompt (NOT SQL Editor!)

# Replace YOUR_SERVICE_ROLE_KEY with your actual service role key
# Get it from: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/settings/api

SERVICE_KEY="YOUR_SERVICE_ROLE_KEY"
BASE_URL="https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1"

echo "🚀 Starting Coordinate Reconciliation..."

# Test on single device first (recommended)
echo ""
echo "📋 Testing on device 13612330240 (319 trips)..."
curl -X POST "${BASE_URL}/reconcile-gps51-data" \
  -H "Authorization: Bearer ${SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "13612330240",
    "mode": "coordinates",
    "startDate": "2026-01-06",
    "endDate": "2026-01-21"
  }'

echo ""
echo ""
echo "✅ Test complete! Check the results above."
echo ""
echo "If successful, run the full reconciliation:"
echo "curl -X POST '${BASE_URL}/reconcile-gps51-data' \\"
echo "  -H 'Authorization: Bearer ${SERVICE_KEY}' \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"mode\": \"coordinates\", \"startDate\": \"2026-01-06\", \"endDate\": \"2026-01-21\"}'"
