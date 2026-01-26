#!/bin/bash
# Production Cleanup Script
# Removes debug instrumentation and prepares code for production

set -e

echo "🧹 Starting production cleanup..."

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 1. Remove debug instrumentation blocks
echo -e "${YELLOW}Step 1: Removing debug instrumentation blocks...${NC}"
find src -type f \( -name "*.ts" -o -name "*.tsx" \) -print0 | while IFS= read -r -d '' file; do
  # Remove lines between #region agent log and #endregion (inclusive)
  if grep -q "#region agent log" "$file"; then
    echo "  Cleaning: $file"
    # Use a temporary file for sed (macOS compatible)
    sed -i '' '/#region agent log/,/#endregion/d' "$file" 2>/dev/null || \
    sed -i '/#region agent log/,/#endregion/d' "$file" 2>/dev/null || true
  fi
done
echo -e "${GREEN}✓ Debug instrumentation removed${NC}"

# 2. Remove debug fetch calls (standalone lines)
echo -e "${YELLOW}Step 2: Removing debug fetch calls...${NC}"
find src -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' "s|fetch('http://127\.0\.0\.1:7242/.*')\.catch(()=>{});||g" {} \; 2>/dev/null || \
find src -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i "s|fetch('http://127\.0\.0\.1:7242/.*')\.catch(()=>{});||g" {} \; 2>/dev/null || true
echo -e "${GREEN}✓ Debug fetch calls removed${NC}"

# 3. Clean up service worker console.log (keep errors)
echo -e "${YELLOW}Step 3: Cleaning service worker logs...${NC}"
if [ -f "public/sw-custom.js" ]; then
  # Remove console.log but keep console.error
  sed -i '' '/console\.log/d' public/sw-custom.js 2>/dev/null || \
  sed -i '/console\.log/d' public/sw-custom.js 2>/dev/null || true
  echo -e "${GREEN}✓ Service worker cleaned${NC}"
else
  echo -e "${YELLOW}⚠ Service worker not found${NC}"
fi

# 4. Count remaining issues
echo -e "${YELLOW}Step 4: Checking for remaining issues...${NC}"
AGENT_LOGS=$(grep -r "#region agent log" src 2>/dev/null | wc -l | tr -d ' ')
DEBUG_FETCHES=$(grep -r "127.0.0.1:7242" src 2>/dev/null | wc -l | tr -d ' ')
CONSOLE_LOGS=$(grep -r "console\.log" src public/sw-custom.js 2>/dev/null | wc -l | tr -d ' ')

echo -e "  Remaining agent log blocks: ${AGENT_LOGS}"
echo -e "  Remaining debug fetches: ${DEBUG_FETCHES}"
echo -e "  Total console.log statements: ${CONSOLE_LOGS}"

if [ "$AGENT_LOGS" -eq 0 ] && [ "$DEBUG_FETCHES" -eq 0 ]; then
  echo -e "${GREEN}✓ All debug instrumentation removed!${NC}"
else
  echo -e "${RED}⚠ Some debug code remains. Please review manually.${NC}"
fi

echo -e "\n${GREEN}✅ Cleanup complete!${NC}"
echo -e "${YELLOW}⚠ Note: Console.log statements remain. Consider gating them with import.meta.env.DEV${NC}"
