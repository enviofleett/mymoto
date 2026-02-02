#!/bin/bash

# Configuration
FUNCTION_URL="https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/vehicle-chat"
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtdnBuc3FpZWZic3Frd25yYWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MjIwMDEsImV4cCI6MjA4MzI5ODAwMX0.nJLb5znjUiGsCk_S2QubhBtqIl3DB3I8LbZihIMJdwo"
DEVICE_ID="RBC784CX"
REST_URL="https://cmvpnsqiefbsqkwnraka.supabase.co/rest/v1"

echo "🚀 Running Full Agent Simulation for RBC784CX"
echo "URL: $FUNCTION_URL"
echo "----------------------------------------"

# 1. Get User ID (Real User Lookup)
echo "🔍 Finding owner for device $DEVICE_ID..."
USER_ID=$(curl -s -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
    "$REST_URL/vehicle_assignments?device_id=eq.$DEVICE_ID&select=profile_id" | \
    python3 -c "import sys, json; data=json.load(sys.stdin); print(data[0]['profile_id']) if data else print('')")

if [ -z "$USER_ID" ]; then
    echo "⚠️  No user found. Using fallback."
    USER_ID="00000000-0000-0000-0000-000000000000"
else
    echo "👤 Found User ID: $USER_ID"
fi

send_message() {
    local message="$1"
    echo "\n📝 USER: \"$message\""
    
    # Send request
    response=$(curl -s -X POST "$FUNCTION_URL" \
        -H "Authorization: Bearer $ANON_KEY" \
        -H "Content-Type: application/json" \
        -d "{
            \"message\": \"$message\",
            \"device_id\": \"$DEVICE_ID\",
            \"user_id\": \"$USER_ID\",
            \"client_timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
            \"user_timezone\": \"Africa/Lagos\"
        }")
    
    # Parse and display response
    echo "🤖 AGENT:"
    echo "$response" | python3 -c "
import sys, json
try:
    resp = json.load(sys.stdin)
    print(resp.get('text', 'No text response'))
    if 'metadata' in resp and resp['metadata']:
        print('   [Tool Used]:', list(resp['metadata'].keys()))
        # Print specific tool data if available
        if 'get_vehicle_status' in resp['metadata']:
            status = resp['metadata']['get_vehicle_status']
            # Simple concatenation to avoid f-string syntax issues in shell heredoc
            print('   [Live Status]: Online=' + str(status.get('status')) + ', Speed=' + str(status.get('telemetry', {}).get('speed_kmh')) + 'km/h')
        if 'get_trip_history' in resp['metadata']:
            trips = resp['metadata']['get_trip_history']
            print('   [History]: Found ' + str(trips.get('summary', {}).get('count')) + ' trips')
except Exception as e:
    print('Error parsing:', e)
    print('Raw response:', sys.stdin.read())
"
}

# --- SCENARIOS ---

# 1. Live Status (Hot Path)
send_message "Where are you right now?"

# 2. Live Telemetry Detail
send_message "What is your current speed and battery level?"

# 3. History - Yesterday (Cold Path)
send_message "How many trips did I do yesterday?"

# 4. History - Specific Date
# Calculate date for 'last Friday' just as an example, or stick to 'last week'
send_message "Show me my trips from last week"

echo "\n----------------------------------------"
echo "✅ Simulation Completed."
