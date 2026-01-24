#!/bin/bash

# GPS51 Data Sync Deployment Script
# This script helps deploy the GPS51 direct data sync implementation

set -e  # Exit on error

echo "=========================================="
echo "GPS51 Direct Data Sync - Deployment"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_info() {
    echo -e "ℹ $1"
}

# Check if Supabase CLI is available
if ! command -v supabase &> /dev/null; then
    print_warning "Supabase CLI not found. Please install it first:"
    echo "  npm install -g supabase"
    echo ""
    print_info "Or follow manual deployment steps in DEPLOYMENT_GUIDE.md"
    exit 1
fi

print_success "Supabase CLI found"

# Check if we're in the right directory
if [ ! -f "supabase/config.toml" ]; then
    print_error "Not in the project root directory"
    exit 1
fi

print_success "Project directory verified"

# Get project ID from config
PROJECT_ID=$(grep "project_id" supabase/config.toml | cut -d '"' -f 2)
print_info "Project ID: $PROJECT_ID"

echo ""
echo "=========================================="
echo "Step 1: Link to Supabase Project"
echo "=========================================="
echo ""

# Link to project (if not already linked)
if [ ! -f ".supabase/config.toml" ]; then
    print_info "Linking to Supabase project..."
    supabase link --project-ref "$PROJECT_ID"
    print_success "Project linked"
else
    print_success "Project already linked"
fi

echo ""
echo "=========================================="
echo "Step 2: Apply Database Migrations"
echo "=========================================="
echo ""

print_info "Applying migrations..."
supabase db push

print_success "Migrations applied"

# Verify tables exist
print_info "Verifying tables..."
TABLES_EXIST=$(supabase db diff --schema public 2>&1 | grep -c "gps51_trips\|gps51_alarms\|gps51_sync_status" || true)

if [ "$TABLES_EXIST" -ge 3 ]; then
    print_success "GPS51 tables verified"
else
    print_warning "Could not verify all tables. Please check manually."
fi

echo ""
echo "=========================================="
echo "Step 3: Deploy Edge Functions"
echo "=========================================="
echo ""

print_info "Deploying sync-gps51-trips..."
supabase functions deploy sync-gps51-trips
print_success "sync-gps51-trips deployed"

print_info "Deploying sync-gps51-alarms..."
supabase functions deploy sync-gps51-alarms
print_success "sync-gps51-alarms deployed"

echo ""
echo "=========================================="
echo "Step 4: Configure App Settings"
echo "=========================================="
echo ""

print_warning "App settings must be configured manually!"
echo ""
echo "Run these SQL commands in Supabase SQL Editor:"
echo ""
echo "-- Set Supabase URL"
echo "SELECT set_app_setting("
echo "  'supabase_url',"
echo "  'https://$PROJECT_ID.supabase.co'"
echo ");"
echo ""
echo "-- Set service role key (get from Supabase Dashboard)"
echo "SELECT set_app_setting("
echo "  'supabase_service_role_key',"
echo "  'YOUR_SERVICE_ROLE_KEY_HERE'"
echo ");"
echo ""

read -p "Have you configured the app settings? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_error "Deployment incomplete. Please configure app settings first."
    exit 1
fi

print_success "App settings confirmed"

echo ""
echo "=========================================="
echo "Step 5: Test Manual Sync"
echo "=========================================="
echo ""

read -p "Enter a device ID to test (or press Enter to skip): " DEVICE_ID

if [ -n "$DEVICE_ID" ]; then
    print_info "Testing trip sync for device: $DEVICE_ID"

    # Note: This requires psql to be installed
    if command -v psql &> /dev/null; then
        # Get database connection string from Supabase
        print_info "Running manual sync test..."
        echo "SELECT trigger_gps51_trips_sync('$DEVICE_ID', 7);" | supabase db execute
        print_success "Trip sync test completed"

        echo ""
        print_info "Testing alarm sync..."
        echo "SELECT trigger_gps51_alarms_sync(ARRAY['$DEVICE_ID']);" | supabase db execute
        print_success "Alarm sync test completed"
    else
        print_warning "psql not found. Please test manually using SQL Editor."
    fi
else
    print_warning "Skipping manual sync test"
fi

echo ""
echo "=========================================="
echo "Step 6: Verify Deployment"
echo "=========================================="
echo ""

print_info "Checking cron jobs..."
echo "SELECT jobname, schedule, active FROM cron.job WHERE jobname LIKE 'sync-gps51%';" | supabase db execute || true
print_success "Cron jobs query completed"

echo ""
echo "=========================================="
echo "Deployment Complete! 🎉"
echo "=========================================="
echo ""

print_success "GPS51 Direct Data Sync deployment finished"
echo ""
print_info "Next steps:"
echo "  1. Review DEPLOYMENT_GUIDE.md for verification steps"
echo "  2. Check TESTING_GUIDE_GPS51_SYNC.md for data accuracy testing"
echo "  3. Use CURSOR_VALIDATION_PROMPT.md for code validation"
echo "  4. Monitor sync status for 24 hours"
echo ""
print_info "To verify data accuracy, compare dashboard with GPS51 platform:"
echo "  - Trip reports should match 100%"
echo "  - Mileage reports should match 100%"
echo "  - Alarm reports should match 100%"
echo ""

exit 0
