#!/bin/bash

# ============================================================================
# Start Dev Server and Test Realtime Updates
# ============================================================================

echo "🚀 Starting development server..."
echo ""

# Change to project directory
cd "$(dirname "$0")"

# Start dev server in background
npm run dev &
DEV_PID=$!

echo "⏳ Waiting for server to start..."
sleep 5

# Check if server is running
if curl -s http://localhost:5173 > /dev/null 2>&1; then
    echo "✅ Server is running on http://localhost:5173"
    echo ""
    echo "📋 Next Steps:"
    echo "1. Open browser: http://localhost:5173/owner/vehicle/358657105966092"
    echo "2. Open Console (F12)"
    echo "3. Look for: [Realtime] ✅ Successfully subscribed"
    echo "4. Run SQL update in Supabase SQL Editor:"
    echo ""
    echo "   UPDATE vehicle_positions"
    echo "   SET latitude = latitude + 0.0001, cached_at = NOW()"
    echo "   WHERE device_id = '358657105966092';"
    echo ""
    echo "5. Watch console for: [Realtime] Position update received"
    echo "6. Verify map marker moves instantly"
    echo ""
    echo "Press Ctrl+C to stop the server"
    echo ""
    
    # Keep script running
    wait $DEV_PID
else
    echo "❌ Server failed to start"
    echo "Check terminal output for errors"
    kill $DEV_PID 2>/dev/null
    exit 1
fi
