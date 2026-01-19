# Cleanup Invalid Timestamps - Guide

## ⚠️ Timeout Issue

If you're getting timeouts, use the **BATCH PROCESSING** version instead.

## Two Cleanup Options

### Option 1: Standard Cleanup (May Timeout)
**File:** `CLEANUP_INVALID_TIMESTAMPS.sql`
- Processes all records at once
- May timeout on large tables
- Use only if you have few invalid records

### Option 2: Batch Processing (Recommended for Large Tables)
**File:** `CLEANUP_INVALID_TIMESTAMPS_BATCH.sql`
- Processes records in small batches (1000 at a time)
- No timeout issues
- You can check progress between batches
- **Use this if you got a timeout!**

---

## How to Use Batch Processing

### Step 1: Check How Many Records Need Cleanup

Run the first queries from `CLEANUP_INVALID_TIMESTAMPS_BATCH.sql` to see:
- How many invalid records exist
- Which tables have issues

### Step 2: Choose Cleanup Method

**Option A: Set to NULL (Safest - Recommended)**
- Preserves records
- Just sets invalid `gps_time` to NULL
- No data loss

**Option B: Delete Records**
- Permanently removes invalid records
- Use only if you're sure

**Option C: Update to Current Time**
- Preserves records
- Sets invalid dates to NOW()
- May affect analytics

### Step 3: Run Batches One at a Time

1. Run first batch (1000 records)
2. Check progress query
3. If more remain, run next batch
4. Repeat until done

### Step 4: Verify

Run the verification queries at the end to confirm cleanup worked.

---

## Quick Start (If You Got Timeout)

1. **Open:** `CLEANUP_INVALID_TIMESTAMPS_BATCH.sql`
2. **Run Step 1:** Check how many records need cleanup
3. **Run Step 2 (Option A):** Set invalid dates to NULL (safest)
4. **Check progress:** Run verification queries
5. **Repeat batches:** If more records remain, run more batches

---

## Example Workflow

```sql
-- 1. Check count
SELECT COUNT(*) FROM position_history
WHERE gps_time > NOW() + INTERVAL '1 day'
  AND recorded_at >= NOW() - INTERVAL '30 days';
-- Result: 5000 records

-- 2. Clean first batch (1000 records)
UPDATE position_history SET gps_time = NULL
WHERE id IN (
  SELECT id FROM position_history
  WHERE gps_time > NOW() + INTERVAL '1 day'
    AND recorded_at >= NOW() - INTERVAL '30 days'
  LIMIT 1000
);

-- 3. Check progress
SELECT COUNT(*) FROM position_history
WHERE gps_time > NOW() + INTERVAL '1 day'
  AND recorded_at >= NOW() - INTERVAL '30 days';
-- Result: 4000 records remaining

-- 4. Repeat batches until done
```

---

**Recommendation:** Use `CLEANUP_INVALID_TIMESTAMPS_BATCH.sql` if you're getting timeouts!
