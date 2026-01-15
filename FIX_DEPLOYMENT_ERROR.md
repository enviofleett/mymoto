# Fix: Deployment Error - Markdown in Code Editor

## Problem
The error shows markdown content (`# Gemini API Setup Guide for Production`) was accidentally pasted into the `index.ts` file in the Supabase Dashboard code editor.

## Solution

### Option 1: Fix in Dashboard (Quick Fix)

1. **Go to Edge Functions → `proactive-alarm-to-chat` → Code tab**
2. **Delete ALL content** in the `index.ts` file
3. **Copy the correct code** from your local file: `supabase/functions/proactive-alarm-to-chat/index.ts`
4. **Paste it** into the Dashboard editor
5. **Click "Deploy updates"**

### Option 2: Deploy via CLI (Recommended)

This uses your local file (which is correct):

```bash
cd /Users/alli/mymoto/fleet-heartbeat-dashboard-6f37655e
supabase functions deploy proactive-alarm-to-chat
```

This will deploy the correct code from your local file.

### Option 3: Reset from Local File

If you have the file open in the Dashboard:

1. **Open your local file** in your IDE: `supabase/functions/proactive-alarm-to-chat/index.ts`
2. **Select All** (Cmd+A / Ctrl+A)
3. **Copy** (Cmd+C / Ctrl+C)
4. **Go to Supabase Dashboard** → Edge Functions → `proactive-alarm-to-chat` → Code
5. **Select All** in the Dashboard editor
6. **Paste** the correct code
7. **Click "Deploy updates"**

## Verify

After deploying, check:
- ✅ No syntax errors in the editor
- ✅ Function deploys successfully
- ✅ Test alarm works

## Prevention

**Never paste markdown/documentation into code files!** Always use:
- CLI deployment (`supabase functions deploy`)
- Or copy-paste actual TypeScript code only
