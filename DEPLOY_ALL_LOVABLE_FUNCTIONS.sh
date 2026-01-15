#!/bin/bash

# Deploy all functions that now use only Lovable AI Gateway
# Make sure LOVABLE_API_KEY is set in Supabase secrets first!

echo "🚀 Deploying all LLM functions (Lovable AI Gateway only)..."
echo ""

cd "$(dirname "$0")"

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found. Install it with: npm install -g supabase"
    exit 1
fi

# Deploy functions
echo "📦 Deploying vehicle-chat..."
supabase functions deploy vehicle-chat

echo ""
echo "📦 Deploying proactive-alarm-to-chat..."
supabase functions deploy proactive-alarm-to-chat

echo ""
echo "📦 Deploying analyze-completed-trip..."
supabase functions deploy analyze-completed-trip

echo ""
echo "📦 Deploying fleet-insights..."
supabase functions deploy fleet-insights

echo ""
echo "✅ All functions deployed!"
echo ""
echo "⚠️  IMPORTANT: Make sure LOVABLE_API_KEY is set in Supabase secrets:"
echo "   supabase secrets set LOVABLE_API_KEY=your_key_here"
echo ""
echo "📊 To view logs:"
echo "   supabase functions logs vehicle-chat --tail"
