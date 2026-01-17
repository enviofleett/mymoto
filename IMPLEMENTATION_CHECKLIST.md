# Implementation Checklist for Cursor AI

## 📁 Files That Need Changes

### Existing Files to Modify

1. **`supabase/functions/gps-data/index.ts`**
   - Line 43-47: Replace `parseIgnition()` function
   - Line 143: Update usage to use new function with confidence scoring
   - Status: ⏳ PENDING

2. **`supabase/functions/gps-history-backfill/index.ts`**
   - Line 33-36: Replace `parseIgnition()` function
   - Line 89: Update usage to use new function
   - Status: ⏳ PENDING

3. **`supabase/functions/vehicle-chat/index.ts`**
   - Line 1157: Replace inline ignition parsing
   - Status: ⏳ PENDING

### New Files to Create

4. **`supabase/functions/gps-acc-report/index.ts`**
   - New edge function for ACC Report API
   - Implements GPS51 `reportaccsbytime` endpoint
   - Status: ⏳ TO CREATE

5. **`supabase/migrations/YYYYMMDDHHMMSS_create_acc_state_history.sql`**
   - Create `acc_state_history` table
   - Indexes and RLS policies
   - Status: ⏳ TO CREATE

6. **`supabase/migrations/YYYYMMDDHHMMSS_add_ignition_confidence.sql`**
   - Add confidence columns to existing tables
   - Status: ⏳ TO CREATE

7. **`supabase/migrations/YYYYMMDDHHMMSS_monitoring_functions.sql`**
   - Create monitoring function and view
   - Status: ⏳ TO CREATE

8. **`TEST_IGNITION_FIX.sql`**
   - Test queries to validate fixes
   - Status: ⏳ TO CREATE

---

## Quick Start for Cursor AI

Copy this exact prompt into Cursor Composer:

```
I need to fix ignition detection and trip accuracy in my GPS fleet management system.

Read and understand:
1. CURSOR_FIX_PROMPT.md - Main implementation guide
2. API_REFERENCE_IGNITION.md - GPS51 API reference
3. IMPLEMENTATION_CHECKLIST.md - This file

Then implement in this order:
1. Task 1: Fix parseIgnition() function in 3 files
2. Task 2: Create acc_state_history database table
3. Task 3: Add confidence tracking columns
4. Task 4: Create gps-acc-report edge function
5. Task 5: Create monitoring functions
6. Task 6: Create test queries

After each task, show me what changed and ask if I want to proceed.
```

---

## Success Criteria

You'll know it's working when:
- [ ] Confidence scores average > 0.8
- [ ] Detection method is primarily 'status_bit'
- [ ] Ignition shows mix of ON/OFF (not 100% OFF)
- [ ] Trip count increases by 50-200%
- [ ] All tests pass
