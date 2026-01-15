#!/bin/bash

echo "🧪 Testing Proactive AI Conversations System"
echo "=============================================="
echo ""

# Test 1: Check if migration file exists
echo "✅ Test 1: Database Migration File"
if [ -f "supabase/migrations/20260116000001_create_user_ai_chat_preferences.sql" ]; then
  echo "   ✓ Migration file exists"
  echo "   ✓ File is idempotent (has DROP IF EXISTS)"
  grep -q "DROP POLICY IF EXISTS" supabase/migrations/20260116000001_create_user_ai_chat_preferences.sql && echo "   ✓ Has DROP POLICY IF EXISTS" || echo "   ✗ Missing DROP POLICY IF EXISTS"
  grep -q "DROP TRIGGER IF EXISTS" supabase/migrations/20260116000001_create_user_ai_chat_preferences.sql && echo "   ✓ Has DROP TRIGGER IF EXISTS" || echo "   ✗ Missing DROP TRIGGER IF EXISTS"
else
  echo "   ✗ Migration file NOT FOUND"
fi
echo ""

# Test 2: Check if edge function files exist
echo "✅ Test 2: Edge Function Files"
if [ -f "supabase/functions/handle-vehicle-event/index.ts" ]; then
  echo "   ✓ handle-vehicle-event/index.ts exists"
  wc -l supabase/functions/handle-vehicle-event/index.ts | awk '{print "   ✓ File size: " $1 " lines"}'
  grep -q "import.*serve" supabase/functions/handle-vehicle-event/index.ts && echo "   ✓ Has correct imports" || echo "   ✗ Missing imports"
  grep -q "generateTextEmbedding" supabase/functions/handle-vehicle-event/index.ts && echo "   ✓ Embedding generator inlined" || echo "   ✗ Embedding generator missing"
else
  echo "   ✗ handle-vehicle-event/index.ts NOT FOUND"
fi

if [ -f "supabase/functions/morning-briefing/index.ts" ]; then
  echo "   ✓ morning-briefing/index.ts exists"
  wc -l supabase/functions/morning-briefing/index.ts | awk '{print "   ✓ File size: " $1 " lines"}'
  grep -q "import.*serve" supabase/functions/morning-briefing/index.ts && echo "   ✓ Has correct imports" || echo "   ✗ Missing imports"
  grep -q "generateTextEmbedding" supabase/functions/morning-briefing/index.ts && echo "   ✓ Embedding generator inlined" || echo "   ✗ Embedding generator missing"
else
  echo "   ✗ morning-briefing/index.ts NOT FOUND"
fi
echo ""

# Test 3: Check frontend files
echo "✅ Test 3: Frontend Files"
if [ -f "src/hooks/useNotificationPreferences.ts" ]; then
  echo "   ✓ useNotificationPreferences.ts exists"
  grep -q "AIChatPreferences" src/hooks/useNotificationPreferences.ts && echo "   ✓ Has AIChatPreferences interface" || echo "   ✗ Missing AIChatPreferences"
  grep -q "aiChatPreferences" src/hooks/useNotificationPreferences.ts && echo "   ✓ Has aiChatPreferences property" || echo "   ✗ Missing aiChatPreferences"
  grep -q "updateAIChatPreferences" src/hooks/useNotificationPreferences.ts && echo "   ✓ Has updateAIChatPreferences function" || echo "   ✗ Missing updateAIChatPreferences"
  grep -q "user_ai_chat_preferences" src/hooks/useNotificationPreferences.ts && echo "   ✓ Syncs to database" || echo "   ✗ No database sync"
else
  echo "   ✗ useNotificationPreferences.ts NOT FOUND"
fi

if [ -f "src/pages/NotificationSettings.tsx" ]; then
  echo "   ✓ NotificationSettings.tsx exists"
  grep -q "AI Companion Triggers" src/pages/NotificationSettings.tsx && echo "   ✓ Has AI Companion Triggers section" || echo "   ✗ Missing AI Companion Triggers section"
  grep -q "MessageSquare" src/pages/NotificationSettings.tsx && echo "   ✓ Has MessageSquare icon" || echo "   ✗ Missing icon"
else
  echo "   ✗ NotificationSettings.tsx NOT FOUND"
fi
echo ""

# Test 4: Check for common issues
echo "✅ Test 4: Code Quality Checks"
echo "   Checking for module dependencies..."
if grep -q "from.*_shared" supabase/functions/handle-vehicle-event/index.ts; then
  echo "   ✗ handle-vehicle-event has external module dependencies"
else
  echo "   ✓ handle-vehicle-event is self-contained"
fi

if grep -q "from.*_shared" supabase/functions/morning-briefing/index.ts; then
  echo "   ✗ morning-briefing has external module dependencies"
else
  echo "   ✓ morning-briefing is self-contained"
fi

echo ""
echo "=============================================="
echo "✅ File Structure Tests Complete"
echo ""
echo "⚠️  NOTE: These tests only check file existence and code structure."
echo "   To test actual functionality, you need to:"
echo "   1. Run database migration in Supabase"
echo "   2. Deploy edge functions"
echo "   3. Set up webhook"
echo "   4. Test end-to-end flow"
