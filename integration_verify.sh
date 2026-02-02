#!/bin/bash

# Configuration
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtdnBuc3FpZWZic3Frd25yYWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MjIwMDEsImV4cCI6MjA4MzI5ODAwMX0.nJLb5znjUiGsCk_S2QubhBtqIl3DB3I8LbZihIMJdwo"
FUNCTION_URL="https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/vehicle-chat"
DEVICE_NAME="RBC784CX"
DEVICE_ID_NUM="13077994484" # Using a known ID from investigation if RBC784CX doesn't resolve (but we test resolution first)

echo "🚀 Running Integration Verification for Vehicle Chat Agent"
echo "--------------------------------------------------------"

call_agent() {
    local device_id="$1"
    local message="$2"
    local conv_id="$3"
    
    echo "📨 Sending: '$message' (Device: $device_id)"
    curl -s -X POST "$FUNCTION_URL" \
        -H "Authorization: Bearer $ANON_KEY" \
        -H "Content-Type: application/json" \
        -d "{
            \"device_id\": \"$device_id\",
            \"message\": \"$message\",
            \"conversation_id\": \"$conv_id\",
            \"user_id\": \"00000000-0000-0000-0000-000000000000\", 
            \"client_timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
            \"user_timezone\": \"Africa/Lagos\"
        }" | python3 -c "
import sys, json
try:
    resp = json.load(sys.stdin)
    print(f'🤖 Response: {resp.get(\"text\", \"No text\")}')
    if 'metadata' in resp and resp['metadata']:
        print(f'   [Metadata]: {list(resp[\"metadata\"].keys())}')
        if 'get_vehicle_status' in resp['metadata']:
             status = resp['metadata']['get_vehicle_status']
             print(f'   [Status]: {status.get(\"status\", \"unknown\")}')
             if \"location\" in status:
                 print(f'   [Location]: {status[\"location\"]}')
    if 'error' in resp:
        print(f'❌ Error: {resp[\"error\"]}')
except Exception as e:
    print(f'❌ Parse Error: {e}')
"
    echo "\n--------------------------------------------------------"
}

# Test 1: Device Name Resolution
echo "🧪 Test 1: Device Name Resolution ('$DEVICE_NAME')"
call_agent "$DEVICE_NAME" "Where is my car?" "test-001"

# Test 2: Location Query (Numeric ID)
# Note: Using the resolved ID from previous step would be better, but we assume one exists or RBC784CX works now.
echo "🧪 Test 2: Location Query (Numeric ID)"
# If resolution works, we can use the name again, or use a hardcoded valid ID if we know one.
# Let's try with the name again to confirm consistency, or use a known valid ID from DB if we had one.
call_agent "$DEVICE_NAME" "What is the current location?" "test-002"

# Test 3: Status Query
echo "🧪 Test 3: Status Query"
call_agent "$DEVICE_NAME" "Is my vehicle online? What's the status?" "test-003"

# Test 4: Stats Query
echo "🧪 Test 4: Stats Query"
call_agent "$DEVICE_NAME" "How far have I driven this month?" "test-004"

# Test 5: Historical Query
echo "🧪 Test 5: Historical Query"
call_agent "$DEVICE_NAME" "Did I drive yesterday?" "test-005"
