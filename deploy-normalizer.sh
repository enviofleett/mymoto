#!/bin/bash

# Quick Deploy Script for Telemetry Normalizer
# Run: bash deploy-normalizer.sh

echo "🚀 Deploying Telemetry Normalizer Functions..."
echo ""

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found!"
    echo ""
    echo "Install with:"
    echo "  brew install supabase/tap/supabase"
    echo "  # OR"
    echo "  npm install -g supabase"
    exit 1
fi

# Check login
if ! supabase projects list &> /dev/null; then
    echo "⚠️  Please login first:"
    echo "  supabase login"
    exit 1
fi

# Link project if needed
if [ ! -f ".supabase/config.toml" ]; then
    echo "🔗 Linking project..."
    supabase link --project-ref cmvpnsqiefbsqkwnraka
fi

# Deploy functions
echo ""
echo "📦 Deploying gps-data..."
supabase functions deploy gps-data

echo ""
echo "📦 Deploying gps-history-backfill..."
supabase functions deploy gps-history-backfill

echo ""
echo "📦 Deploying sync-trips-incremental..."
supabase functions deploy sync-trips-incremental

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Next: Run the verification SQL script to confirm speeds are normalized."


