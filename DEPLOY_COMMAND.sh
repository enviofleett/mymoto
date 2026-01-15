#!/bin/bash

# Quick deployment script for vehicle-chat edge function
# Usage: ./DEPLOY_COMMAND.sh

echo "🚀 Deploying vehicle-chat edge function..."
echo ""

# Navigate to project root
cd "$(dirname "$0")"

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found. Install it with: npm install -g supabase"
    exit 1
fi

# Check if logged in
if ! supabase projects list &> /dev/null; then
    echo "⚠️  Not logged in to Supabase. Run: supabase login"
    exit 1
fi

# Deploy the function
echo "📦 Deploying function..."
supabase functions deploy vehicle-chat

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Deployment successful!"
    echo ""
    echo "📊 To view logs:"
    echo "   supabase functions logs vehicle-chat"
    echo ""
    echo "🔍 To tail logs:"
    echo "   supabase functions logs vehicle-chat --tail"
    echo ""
    echo "🧪 Test the function by asking in chat:"
    echo "   'Show me my trips yesterday'"
else
    echo ""
    echo "❌ Deployment failed. Check the error above."
    exit 1
fi
