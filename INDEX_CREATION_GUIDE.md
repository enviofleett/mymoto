# How to Create Indexes (Step-by-Step)

## ⚠️ Important: Run ONE Index at a Time

Index creation can take 1-5 minutes each on large tables. Running multiple at once can cause timeouts.

---

## 📋 Step-by-Step Instructions

### Step 1: Open Supabase SQL Editor
1. Go to Supabase Dashboard
2. Click **SQL Editor** in the left sidebar
3. Click **New Query**

### Step 2: Create Index 1 (Most Important)
Copy and paste this **entire line** into the SQL Editor:

```sql
CREATE INDEX IF NOT EXISTS idx_position_history_gps_time ON position_history(gps_time DESC);
```

Click **Run** and wait for it to complete (may take 1-5 minutes).

**✅ Success message:** "Success. No rows returned"

### Step 3: Create Index 2
After Index 1 completes, copy and paste:

```sql
CREATE INDEX IF NOT EXISTS idx_position_history_device_gps_time ON position_history(device_id, gps_time DESC);
```

Click **Run** and wait.

### Step 4: Continue with Remaining Indexes
Continue with each index from `CREATE_INDEXES_SIMPLE.sql`, one at a time:

**Index 3:**
```sql
CREATE INDEX IF NOT EXISTS idx_position_history_ignition_confidence ON position_history(ignition_confidence) WHERE ignition_confidence IS NOT NULL;
```

**Index 4:**
```sql
CREATE INDEX IF NOT EXISTS idx_position_history_detection_method ON position_history(device_id, ignition_detection_method, gps_time DESC) WHERE ignition_detection_method IS NOT NULL;
```

**Index 5:**
```sql
CREATE INDEX IF NOT EXISTS idx_vehicle_positions_gps_time ON vehicle_positions(gps_time DESC);
```

**Index 6:**
```sql
CREATE INDEX IF NOT EXISTS idx_vehicle_positions_cached_at ON vehicle_positions(cached_at DESC);
```

**Index 7:**
```sql
CREATE INDEX IF NOT EXISTS idx_vehicle_positions_device_gps_time ON vehicle_positions(device_id, gps_time DESC);
```

**Index 8:**
```sql
CREATE INDEX IF NOT EXISTS idx_vehicle_positions_ignition_confidence ON vehicle_positions(ignition_confidence) WHERE ignition_confidence IS NOT NULL;
```

**Index 9:**
```sql
CREATE INDEX IF NOT EXISTS idx_acc_state_history_begin_time ON acc_state_history(begin_time DESC);
```

**Index 10:**
```sql
CREATE INDEX IF NOT EXISTS idx_acc_state_history_device_begin_time ON acc_state_history(device_id, begin_time DESC);
```

---

## ✅ Verification

After all indexes are created, run this to verify:

```sql
SELECT schemaname, tablename, indexname 
FROM pg_indexes 
WHERE tablename IN ('position_history', 'vehicle_positions', 'acc_state_history') 
  AND indexname LIKE 'idx_%' 
ORDER BY tablename, indexname;
```

**Expected:** Should show 10 indexes (4 for position_history, 4 for vehicle_positions, 2 for acc_state_history)

---

## ⚠️ Common Errors

### Error: "syntax error at or near 'idx_...'"
**Cause:** You copied only part of the statement (just the index name)
**Fix:** Copy the ENTIRE line including `CREATE INDEX IF NOT EXISTS ... ON ...`

### Error: "relation does not exist"
**Cause:** Table name is wrong or table doesn't exist
**Fix:** Check table names in Supabase Dashboard → Database → Tables

### Error: "timeout"
**Cause:** Table is very large, index creation is taking too long
**Fix:** 
- Wait longer (can take 5-10 minutes for very large tables)
- Or create indexes during off-peak hours
- Or contact Supabase support to increase timeout

---

## 🎯 Priority Order

If you're short on time, create these **3 most important indexes first**:

1. `idx_position_history_gps_time` - Most queries filter by time
2. `idx_vehicle_positions_gps_time` - Current positions queries
3. `idx_vehicle_positions_cached_at` - Cache-based queries

The rest can be created later.

---

## 📊 Estimated Time

- **Small tables (< 100k rows):** 30 seconds - 1 minute per index
- **Medium tables (100k - 1M rows):** 1-3 minutes per index
- **Large tables (> 1M rows):** 3-10 minutes per index

**Total time for all 10 indexes:** 10-30 minutes (depending on table sizes)

---

## 💡 Pro Tip

You can check index creation progress by running:

```sql
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE indexname LIKE 'idx_%'
ORDER BY tablename, indexname;
```

This shows which indexes already exist, so you can skip those.
