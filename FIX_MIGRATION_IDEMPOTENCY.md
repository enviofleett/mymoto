# ✅ Fixed: Migration Idempotency Issue

## 🐛 Error
```
ERROR: 42710: policy "Users can manage their own AI chat preferences" for table "user_ai_chat_preferences" already exists
```

## ✅ Fix Applied

Updated the migration file to be **idempotent** (can be run multiple times safely).

**Changes:**
1. Added `DROP POLICY IF EXISTS` before creating policies
2. Added `DROP TRIGGER IF EXISTS` before creating trigger

## 🚀 Run Migration Again

The migration file is now fixed. You can run it again:

```sql
-- Copy and paste the ENTIRE file into Supabase SQL Editor
-- File: supabase/migrations/20260116000001_create_user_ai_chat_preferences.sql
```

The migration will now:
- ✅ Create table if it doesn't exist
- ✅ Drop and recreate policies (safe to run multiple times)
- ✅ Drop and recreate trigger (safe to run multiple times)
- ✅ Create indexes if they don't exist

---

**The migration is now safe to run multiple times!** ✅
