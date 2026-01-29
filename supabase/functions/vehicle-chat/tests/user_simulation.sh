#!/bin/bash

# Configuration
FUNCTION_URL="https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/vehicle-chat"
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtdnBuc3FpZWZic3Frd25yYWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MjIwMDEsImV4cCI6MjA4MzI5ODAwMX0.nJLb5znjUiGsCk_S2QubhBtqIl3DB3I8LbZihIMJdwo"
DEVICE_ID="RBC784CX"
REST_URL="https://cmvpnsqiefbsqkwnraka.supabase.co/rest/v1"

echo "🚀 Running User Simulation: $FUNCTION_URL"
echo "📱 Device ID: $DEVICE_ID"
echo "----------------------------------------"

# 1. Get User ID for the device
echo "🔍 Finding owner for device $DEVICE_ID..."
USER_ID=$(curl -s -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
    "$REST_URL/vehicle_assignments?device_id=eq.$DEVICE_ID&select=profile_id" | \
    python3 -c "import sys, json; data=json.load(sys.stdin); print(data[0]['profile_id']) if data else print('')")

if [ -z "$USER_ID" ]; then
    echo "⚠️  No user found for device $DEVICE_ID. Using fallback ID (might fail wallet check)."
    USER_ID="00000000-0000-0000-0000-000000000000"
else
    echo "👤 Found User ID: $USER_ID"
fi

# Function to send a message
send_message() {
    local message="$1"
    echo "\n📝 Sending: \"$message\""
    
    # Note: Using 'message' field (string) instead of 'messages' (array) as per function definition
    response=$(curl -s -X POST "$FUNCTION_URL" \
        -H "Authorization: Bearer $ANON_KEY" \
        -H "Content-Type: application/json" \
        -d "{
            \"message\": \"$message\",
            \"device_id\": \"$DEVICE_ID\",
            \"user_id\": \"$USER_ID\",
            \"client_timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
        }")
    
    # Print raw response if it looks like an error
    if echo "$response" | grep -q "error"; then
        echo "❌ Error Response:"
        echo "$response"
    else
        # Try to extract just the reply
        echo "✅ Response:"
        echo "$response" | python3 -c "import sys, json; print(json.load(sys.stdin).get('reply', 'No reply field found'))" 2>/dev/null || echo "$response"
    fi
}

# Test Scenarios Requested by User

# 1. Set Speed Limit
send_message "Set speed limit to 80"

# 2. Create Geofence
send_message "Create a geofence alert for my home location"

echo "\n----------------------------------------"
echo "✅ Simulation Completed."
