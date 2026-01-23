#!/bin/bash

# Quick test script for realtime location updates
# Usage: ./scripts/test-realtime-location.sh [DEVICE_ID]

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

DEVICE_ID="${1:-358657105966092}"
BASE_URL="http://localhost:8081"
VEHICLE_URL="${BASE_URL}/owner/vehicle/${DEVICE_ID}"

echo -e "${BLUE}🚀 Realtime Location Updates Test${NC}"
echo -e "${BLUE}================================${NC}"
echo ""
echo -e "Device ID: ${YELLOW}${DEVICE_ID}${NC}"
echo -e "Vehicle URL: ${YELLOW}${VEHICLE_URL}${NC}"
echo ""

# Check if server is running
if curl -s "${BASE_URL}" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Server is already running on ${BASE_URL}${NC}"
else
    echo -e "${BLUE}⏳ Starting dev server...${NC}"
    npm run dev > /tmp/vite-dev-server.log 2>&1 &
    SERVER_PID=$!
    
    # Wait for server to be ready (max 30 seconds)
    for i in {1..30}; do
        if curl -s "${BASE_URL}" > /dev/null 2>&1; then
            echo -e "${GREEN}✅ Server is ready on ${BASE_URL}${NC}"
            break
        fi
        sleep 1
    done
    
    if ! curl -s "${BASE_URL}" > /dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  Server did not start within 30 seconds${NC}"
        echo -e "${BLUE}📝 Check logs: tail -f /tmp/vite-dev-server.log${NC}"
        exit 1
    fi
fi

echo ""
echo -e "${BLUE}📖 Opening browser to vehicle profile...${NC}"

# Open browser
if command -v open > /dev/null; then
    # macOS
    open "${VEHICLE_URL}"
elif command -v xdg-open > /dev/null; then
    # Linux
    xdg-open "${VEHICLE_URL}"
elif command -v start > /dev/null; then
    # Windows
    start "${VEHICLE_URL}"
else
    echo -e "${YELLOW}⚠️  Could not auto-open browser${NC}"
    echo -e "${BLUE}Please manually open: ${VEHICLE_URL}${NC}"
fi

echo ""
echo -e "${GREEN}✅ Test Setup Complete${NC}"
echo ""
echo -e "${BLUE}📋 Next Steps:${NC}"
echo "1. Open browser DevTools (F12) → Console tab"
echo "2. Look for subscription logs:"
echo "   - [Realtime] ✅ Successfully subscribed to vehicle_positions updates"
echo "3. Check Network tab → WS filter for WebSocket connection"
echo "4. Run TRIGGER_UPDATE_TEST.sql in Supabase SQL Editor"
echo "5. Watch console for position update logs"
echo ""
echo -e "${BLUE}📝 Server logs: tail -f /tmp/vite-dev-server.log${NC}"
echo -e "${BLUE}🛑 To stop server: kill ${SERVER_PID:-$(lsof -ti:8081)}${NC}"
