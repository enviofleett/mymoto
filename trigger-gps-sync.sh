#!/bin/bash

# Manually trigger GPS data sync to test normalizer
# This will immediately process new data with the normalizer

echo "🚀 Triggering GPS data sync..."
echo ""

# Get Supabase URL and anon key from environment or config
SUPABASE_URL="${SUPABASE_URL:-https://cmvpnsqiefbsqkwnraka.supabase.co}"
SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtdnBuc3FpZWZic3Frd25yYWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MjIwMDEsImV4cCI6MjA4MzI5ODAwMX0.nJLb5znjUiGsCk_S2QubhBtqIl3DB3I8LbZihIMJdwo}"

echo "📡 Calling gps-data function..."
echo "URL: ${SUPABASE_URL}/functions/v1/gps-data"
echo ""

response=$(curl -X POST "${SUPABASE_URL}/functions/v1/gps-data" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"action": "lastposition", "use_cache": false}' \
  -w "\nHTTP Status: %{http_code}\n" \
  2>&1)

echo "$response"
echo ""
echo "✅ Sync triggered!"
echo ""
echo "Wait 10-15 seconds, then run the verification SQL to check new data."


