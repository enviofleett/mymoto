# Deploy Vehicle Chat Edge Function

## 📁 File Location

**Main File:**
```
supabase/functions/vehicle-chat/index.ts
```

**Supporting Files:**
```
supabase/functions/vehicle-chat/
├── index.ts (3,693 lines - Main entry point)
├── command-parser.ts
├── conversation-manager.ts
├── data-formatter.ts
├── data-validator.ts
├── date-extractor.ts
├── date-extractor-v2.ts
├── intent-classifier.ts
├── preference-learner.ts
├── query-optimizer.ts
├── query-router.ts
├── spell-checker.ts
└── temporal-context.ts
```

---

## 🚀 Deployment Command

```bash
supabase functions deploy vehicle-chat
```

**Full deployment with project reference:**
```bash
supabase functions deploy vehicle-chat --project-ref YOUR_PROJECT_REF
```

---

## 🔑 Key Changes in This Deployment

### 1. Chat Message Saving Fix (Lines 3588-3630)

**Before:** Messages failed silently if embedding column had issues
**After:** Robust fallback logic with error handling

```typescript
// Try saving with embeddings first
const { error: insertError, data: insertedData } = await supabase
  .from('vehicle_chat_history')
  .insert(messagesToInsert)
  .select()

if (insertError) {
  // Fallback: Try saving without embeddings
  const { error: fallbackError } = await supabase
    .from('vehicle_chat_history')
    .insert([
      { device_id, user_id, role: 'user', content: message },
      { device_id, user_id, role: 'assistant', content: fullResponse }
    ])
  
  if (fallbackError) {
    // Send error to frontend via stream
    controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ 
      error: 'Failed to save message...' 
    })}\n\n`))
  }
}
```

### 2. Language Switching Fix (Lines 3068-3126)

**Before:** Language could switch unexpectedly
**After:** Strict validation with logging

```typescript
// Validate language preference against allowed values
const allowedLanguages = ['english', 'pidgin', 'yoruba', 'hausa', 'igbo', 'french']
if (!allowedLanguages.includes(languagePref)) {
  console.warn(`[LANGUAGE VALIDATION] Invalid: "${languagePref}", using english`)
  languagePref = 'english' // Use default, but don't change stored value
}

// Log language usage for debugging
if (llmSettings?.language_preference) {
  const originalLang = llmSettings.language_preference.toLowerCase().trim()
  if (originalLang !== languagePref) {
    console.warn(`[LANGUAGE SWITCH DETECTED] Original: "${originalLang}" -> Normalized: "${languagePref}"`)
  }
}
```

---

## 📋 Pre-Deployment Checklist

- [ ] Verify you're logged in: `supabase login`
- [ ] Link to your project: `supabase link --project-ref YOUR_PROJECT_REF`
- [ ] Check function exists: `supabase functions list`
- [ ] Review recent changes in `index.ts`

---

## 🔍 Key Sections in index.ts

1. **Lines 1-208:** Imports and semantic embedding generator
2. **Lines 209-343:** Date extraction system
3. **Lines 344-1076:** Data validation and formatting
4. **Lines 1077-2800:** Query routing and context building
5. **Lines 2801-3100:** Vehicle data fetching and processing
6. **Lines 3101-3300:** System prompt building with language/personality
7. **Lines 3301-3587:** LLM API calls and streaming
8. **Lines 3588-3640:** **Chat message saving (FIXED)**
9. **Lines 3068-3126:** **Language validation (FIXED)**

---

## ✅ Post-Deployment Verification

1. **Test Chat Saving:**
   ```bash
   # Send a test message and verify it saves
   # Check database:
   SELECT * FROM vehicle_chat_history 
   ORDER BY created_at DESC 
   LIMIT 5;
   ```

2. **Test Language Consistency:**
   - Set language to English
   - Send multiple messages
   - Verify all responses are in English
   - Check edge function logs for language warnings

3. **Check Edge Function Logs:**
   - Go to Supabase Dashboard → Edge Functions → vehicle-chat → Logs
   - Look for "Chat history saved successfully" messages
   - Check for any "[LANGUAGE VALIDATION]" warnings

---

## 🐛 Troubleshooting

### If deployment fails:
```bash
# Check Supabase CLI version
supabase --version

# Verify project link
supabase projects list

# Try with debug flag
supabase functions deploy vehicle-chat --debug
```

### If messages still don't save:
- Check edge function logs for errors
- Verify `vehicle_chat_history` table exists
- Check if `embedding` column exists (migration `20260110135952`)
- Verify RLS policies allow inserts

### If language still switches:
- Check logs for "[LANGUAGE VALIDATION]" warnings
- Verify `vehicle_llm_settings.language_preference` in database
- Check frontend language selection component

---

## 📊 File Size

- **Main file:** 3,693 lines
- **Total function size:** ~15,000+ lines (including all modules)
- **Dependencies:** All inlined for deployment compatibility

---

## 🔗 Related Files

- `DEPLOY_VEHICLE_CHAT_FIXES.md` - Detailed fix documentation
- `AI_LLM_SERVICE_AUDIT.md` - Full audit report
- `AI_LLM_FIXES_IMPLEMENTED.md` - Implementation details

---

**Ready to deploy!** Run `supabase functions deploy vehicle-chat` when ready.
