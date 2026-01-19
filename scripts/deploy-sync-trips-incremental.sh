#!/bin/bash

# Deploy sync-trips-incremental Edge Function
# This script deploys the updated sync-trips-incremental function with enhanced error handling

set -e  # Exit on error

echo "🚀 Deploying sync-trips-incremental Edge Function..."
echo ""

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Error: Supabase CLI is not installed."
    echo "   Install it with: npm install -g supabase"
    exit 1
fi

# Check if logged in to Supabase
if ! supabase projects list &> /dev/null; then
    echo "❌ Error: Not logged in to Supabase."
    echo "   Login with: supabase login"
    exit 1
fi

# Deploy the function
echo "📦 Deploying function..."
supabase functions deploy sync-trips-incremental \
  --no-verify-jwt \
  --project-ref "$(grep 'project_id' supabase/config.toml 2>/dev/null | cut -d'"' -f2 || echo '')"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Successfully deployed sync-trips-incremental function!"
    echo ""
    echo "📋 Next Steps:"
    echo "   1. Test the sync by clicking 'Sync Trips' on a vehicle profile page"
    echo "   2. Check Edge Function logs in Supabase Dashboard if errors occur"
    echo "   3. Verify trip_sync_status table has progress columns (if migration applied)"
    echo ""
    echo "🔍 To view logs:"
    echo "   supabase functions logs sync-trips-incremental"
    echo ""
else
    echo ""
    echo "❌ Deployment failed!"
    echo "   Check the error messages above and try again."
    exit 1
fi
