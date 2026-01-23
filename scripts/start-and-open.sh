#!/bin/bash

# Script to start dev server and open browser
# Usage: ./scripts/start-and-open.sh [url_path]

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default port from vite.config.ts
PORT=8081
BASE_URL="http://localhost:${PORT}"
URL_PATH="${1:-/}"

# Full URL
FULL_URL="${BASE_URL}${URL_PATH}"

echo -e "${BLUE}🚀 Starting development server...${NC}"

# Check if server is already running
if curl -s "${BASE_URL}" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Server is already running on ${BASE_URL}${NC}"
    echo -e "${YELLOW}📖 Opening browser to: ${FULL_URL}${NC}"
    
    # Open browser
    if command -v open > /dev/null; then
        # macOS
        open "${FULL_URL}"
    elif command -v xdg-open > /dev/null; then
        # Linux
        xdg-open "${FULL_URL}"
    elif command -v start > /dev/null; then
        # Windows
        start "${FULL_URL}"
    else
        echo -e "${YELLOW}⚠️  Could not auto-open browser. Please manually open: ${FULL_URL}${NC}"
    fi
    exit 0
fi

# Start server in background
echo -e "${BLUE}⏳ Starting server...${NC}"
npm run dev > /tmp/vite-dev-server.log 2>&1 &
SERVER_PID=$!

# Wait for server to be ready (max 30 seconds)
echo -e "${BLUE}⏳ Waiting for server to start...${NC}"
for i in {1..30}; do
    if curl -s "${BASE_URL}" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Server is ready on ${BASE_URL}${NC}"
        echo -e "${YELLOW}📖 Opening browser to: ${FULL_URL}${NC}"
        
        # Open browser
        if command -v open > /dev/null; then
            # macOS
            open "${FULL_URL}"
        elif command -v xdg-open > /dev/null; then
            # Linux
            xdg-open "${FULL_URL}"
        elif command -v start > /dev/null; then
            # Windows
            start "${FULL_URL}"
        else
            echo -e "${YELLOW}⚠️  Could not auto-open browser. Please manually open: ${FULL_URL}${NC}"
        fi
        
        echo -e "${GREEN}✅ Server running (PID: ${SERVER_PID})${NC}"
        echo -e "${BLUE}📝 Server logs: tail -f /tmp/vite-dev-server.log${NC}"
        echo -e "${BLUE}🛑 To stop: kill ${SERVER_PID}${NC}"
        exit 0
    fi
    sleep 1
done

echo -e "${YELLOW}⚠️  Server did not start within 30 seconds${NC}"
echo -e "${BLUE}📝 Check logs: cat /tmp/vite-dev-server.log${NC}"
kill $SERVER_PID 2>/dev/null || true
exit 1
