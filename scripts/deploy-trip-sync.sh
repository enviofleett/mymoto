#!/bin/bash

# Trip Sync Deployment Script
# Automatically deploys Option 2: Intelligent Sync with Background Processing

set -e

echo "🚀 Starting Trip Sync Deployment..."
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo -e "${RED}❌ Supabase CLI not found. Please install it first:${NC}"
    echo "   npm install -g supabase"
    exit 1
fi

echo -e "${BLUE}Step 1: Checking environment...${NC}"
if [ ! -f ".env" ]; then
    echo -e "${RED}❌ .env file not found!${NC}"
    exit 1
fi

# Verify Supabase credentials
echo -e "${GREEN}✅ Environment file found${NC}"
SUPABASE_URL=$(grep VITE_SUPABASE_URL .env | cut -d '=' -f2 | tr -d '"')
SUPABASE_PROJECT_ID=$(grep VITE_SUPABASE_PROJECT_ID .env | cut -d '=' -f2 | tr -d '"')

if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_PROJECT_ID" ]; then
    echo -e "${RED}❌ Supabase credentials missing in .env${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Supabase URL: $SUPABASE_URL${NC}"
echo -e "${GREEN}✅ Project ID: $SUPABASE_PROJECT_ID${NC}"
echo ""

# Step 2: Apply Database Migrations
echo -e "${BLUE}Step 2: Applying database migrations...${NC}"
echo -e "${YELLOW}⚠️  This will create:${NC}"
echo "   - trip_sync_status table"
echo "   - Cron job for automatic sync (every 15 minutes)"
echo "   - Helper functions for manual sync"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled."
    exit 1
fi

echo "Pushing migrations to Supabase..."
supabase db push || {
    echo -e "${YELLOW}⚠️  Migration push failed. You may need to apply migrations manually via Supabase Dashboard.${NC}"
    echo "   Files to apply:"
    echo "   - supabase/migrations/20260113180000_trip_sync_status.sql"
    echo "   - supabase/migrations/20260113180100_setup_trip_sync_cron.sql"
}
echo ""

# Step 3: Deploy Edge Functions
echo -e "${BLUE}Step 3: Deploying Edge Functions...${NC}"
echo "Deploying sync-trips-incremental function..."
supabase functions deploy sync-trips-incremental || {
    echo -e "${RED}❌ Edge Function deployment failed!${NC}"
    echo "   Please deploy manually using:"
    echo "   npx supabase functions deploy sync-trips-incremental"
    exit 1
}
echo -e "${GREEN}✅ Edge Function deployed successfully${NC}"
echo ""

# Step 4: Instructions for manual steps
echo -e "${BLUE}Step 4: Manual Configuration Required${NC}"
echo ""
echo -e "${YELLOW}⚠️  IMPORTANT: Complete these steps manually:${NC}"
echo ""
echo "1. Set Service Role Key for Cron Job:"
echo "   - Go to Supabase Dashboard > SQL Editor"
echo "   - Run this SQL (replace YOUR_SERVICE_ROLE_KEY):"
echo ""
echo "   ALTER DATABASE postgres SET \"app.settings.supabase_service_role_key\" = 'YOUR_SERVICE_ROLE_KEY';"
echo ""
echo "   Get your service role key from:"
echo "   Supabase Dashboard > Settings > API > service_role"
echo ""
echo "2. Enable Realtime:"
echo "   - Go to Supabase Dashboard > Database > Replication"
echo "   - Enable realtime for these tables:"
echo "     ✓ vehicle_trips"
echo "     ✓ trip_sync_status"
echo ""
echo "3. Verify Cron Job:"
echo "   - Run this SQL to check cron status:"
echo "   SELECT * FROM cron_job_status;"
echo ""

# Step 5: Frontend deployment instructions
echo -e "${BLUE}Step 5: Frontend Deployment${NC}"
echo ""
echo "Install dependencies and build:"
echo "  npm install"
echo "  npm run build"
echo ""
echo "Deploy to your hosting platform (Vercel, Netlify, etc.)"
echo ""

# Step 6: Testing
echo -e "${BLUE}Step 6: Testing${NC}"
echo ""
echo "After deployment, test the sync functionality:"
echo ""
echo "1. Manual Test (SQL):"
echo "   SELECT trigger_trip_sync('YOUR_DEVICE_ID', true);"
echo ""
echo "2. UI Test:"
echo "   - Open vehicle profile page"
echo "   - Click the 'Sync' button in Reports section"
echo "   - Verify sync status indicators appear"
echo "   - Check that trips populate"
echo ""
echo "3. Monitor Logs:"
echo "   npx supabase functions logs sync-trips-incremental --tail"
echo ""

# Summary
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "What was deployed:"
echo "  ✓ trip_sync_status table"
echo "  ✓ Automatic cron job (every 15 minutes)"
echo "  ✓ sync-trips-incremental Edge Function"
echo "  ✓ React hooks for trip sync"
echo "  ✓ Enhanced UI with Force Sync button"
echo "  ✓ Realtime subscriptions for trip updates"
echo ""
echo "Next steps:"
echo "  1. Complete manual configuration (see above)"
echo "  2. Deploy frontend"
echo "  3. Test sync functionality"
echo ""
echo "Documentation: TRIP_SYNC_SETUP.md"
echo ""
echo -e "${BLUE}Happy syncing! 🚗💨${NC}"
