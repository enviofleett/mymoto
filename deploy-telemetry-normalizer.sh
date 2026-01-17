#!/bin/bash

# Deploy Telemetry Normalizer - All Functions
# This script deploys all functions that use the new telemetry normalizer

set -e

echo "🚀 Deploying Telemetry Normalizer Functions..."
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo -e "${RED}❌ Supabase CLI not found!${NC}"
    echo ""
    echo "Install it with:"
    echo "  brew install supabase/tap/supabase"
    echo "  # OR"
    echo "  npm install -g supabase"
    echo ""
    echo "Then run this script again."
    exit 1
fi

echo -e "${BLUE}Checking Supabase connection...${NC}"

# Check if logged in
if ! supabase projects list &> /dev/null; then
    echo -e "${YELLOW}⚠️  Not logged in. Please login:${NC}"
    echo "  supabase login"
    exit 1
fi

# Check if project is linked
if [ ! -f ".supabase/config.toml" ]; then
    echo -e "${YELLOW}⚠️  Project not linked. Linking now...${NC}"
    supabase link --project-ref cmvpnsqiefbsqkwnraka
fi

echo -e "${GREEN}✅ Supabase CLI ready${NC}"
echo ""

# Deploy functions
echo -e "${BLUE}Deploying functions...${NC}"
echo ""

echo -e "${BLUE}1. Deploying gps-data...${NC}"
supabase functions deploy gps-data || {
    echo -e "${RED}❌ Failed to deploy gps-data${NC}"
    exit 1
}
echo -e "${GREEN}✅ gps-data deployed${NC}"
echo ""

echo -e "${BLUE}2. Deploying gps-history-backfill...${NC}"
supabase functions deploy gps-history-backfill || {
    echo -e "${RED}❌ Failed to deploy gps-history-backfill${NC}"
    exit 1
}
echo -e "${GREEN}✅ gps-history-backfill deployed${NC}"
echo ""

echo -e "${BLUE}3. Deploying sync-trips-incremental...${NC}"
supabase functions deploy sync-trips-incremental || {
    echo -e "${RED}❌ Failed to deploy sync-trips-incremental${NC}"
    exit 1
}
echo -e "${GREEN}✅ sync-trips-incremental deployed${NC}"
echo ""

echo -e "${GREEN}✅ All functions deployed successfully!${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "1. Check function logs:"
echo "   supabase functions logs gps-data --tail"
echo ""
echo "2. Verify speed normalization:"
echo "   - Check vehicle_positions table"
echo "   - Speed should be in km/h (not m/h)"
echo ""
echo "3. Test ignition detection:"
echo "   - Check vehicle_positions.ignition_on"
echo "   - Should use confidence scoring (more accurate)"
echo ""


