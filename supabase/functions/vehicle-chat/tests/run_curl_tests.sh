#!/bin/bash

# Configuration
FUNCTION_URL="${FUNCTION_URL:-http://localhost:54321/functions/v1/vehicle-chat}"
ANON_KEY="${SUPABASE_ANON_KEY:-your-anon-key}"
DEVICE_ID="${DEVICE_ID:-test-device-123}"

echo "🚀 Testing Vehicle Chat Endpoint: $FUNCTION_URL"
echo "📱 Device ID: $DEVICE_ID"
echo "----------------------------------------"

# Function to send a message
send_message() {
    local message="$1"
    echo "\n📝 Sending: \"$message\""
    
    curl -s -X POST "$FUNCTION_URL" \
        -H "Authorization: Bearer $ANON_KEY" \
        -H "Content-Type: application/json" \
        -d "{
            \"message\": \"$message\",
            \"device_id\": \"$DEVICE_ID\",
            \"user_id\": \"test-user\",
            \"conversation_id\": \"test-conv-$(date +%s)\"
        }" | python3 -c "import sys, json; print(json.load(sys.stdin).get('text', 'No text field found'))"
}

# Test Scenarios

# 1. Location
send_message "Where is my vehicle right now?"

# 2. History
send_message "Show me my last trip"

# 3. Date Context
send_message "Did I drive anywhere yesterday?"

# 4. Stats
send_message "What is my total mileage this week?"

# 5. Command
send_message "Check battery health"

echo "\n----------------------------------------"
echo "✅ Tests Completed."
