# Cleanup Invalid Timestamps - Quick Start Guide

## ⚠️ Still Getting Timeouts?

Try these options in order:

---

## Option 1: Ultra Fast Version (Recommended)

**File:** `CLEANUP_INVALID_TIMESTAMPS_ULTRA_FAST.sql`

- Processes **100 records at a time** (very small batches)
- Uses CTEs for better performance
- Only checks last **7 days** of records
- **Best for most cases**

**How to use:**
1. Run Step 1 to check counts
2. Run Step 2 (Option A) - first batch
3. Check progress query
4. Repeat batches until done

---

## Option 2: One-by-One Version (If Option 1 Still Times Out)

**File:** `CLEANUP_SIMPLE_ONE_BY_ONE.sql`

- Processes **ONE record at a time**
- **Guaranteed no timeout**
- Has automated loop (DO block) for hands-off processing
- Slower but reliable

**How to use:**
1. Run the automated DO block
2. It will process records one by one
3. Shows progress every 100 records
4. Stops automatically when done

---

## Option 3: Manual One-by-One (Most Reliable)

**File:** `CLEANUP_SIMPLE_ONE_BY_ONE.sql`

- Find one record
- Update that record
- Repeat manually
- **100% reliable, no timeouts ever**

---

## Quick Comparison

| Method | Batch Size | Speed | Reliability |
|--------|-----------|-------|-------------|
| Ultra Fast | 100 records | Fast | High |
| One-by-One (Auto) | 1 record | Slow | Very High |
| One-by-One (Manual) | 1 record | Very Slow | 100% |

---

## Recommended Workflow

1. **Try Ultra Fast first** (`CLEANUP_INVALID_TIMESTAMPS_ULTRA_FAST.sql`)
   - If it works, great!
   - If it times out, go to step 2

2. **Use One-by-One Auto** (`CLEANUP_SIMPLE_ONE_BY_ONE.sql`)
   - Run the DO block
   - Let it process automatically
   - Check progress periodically

3. **If DO block fails**, use manual one-by-one
   - Find one record
   - Update it
   - Repeat

---

## Example: Ultra Fast (100 records per batch)

```sql
-- Batch 1
WITH batch AS (
  SELECT id FROM position_history
  WHERE gps_time > NOW() + INTERVAL '1 day'
    AND recorded_at >= NOW() - INTERVAL '7 days'
  ORDER BY recorded_at DESC
  LIMIT 100
)
UPDATE position_history
SET gps_time = NULL
FROM batch
WHERE position_history.id = batch.id;

-- Check progress
SELECT COUNT(*) FROM position_history
WHERE gps_time > NOW() + INTERVAL '1 day'
  AND recorded_at >= NOW() - INTERVAL '7 days'
LIMIT 1;

-- If count > 0, run Batch 1 again (copy/paste)
-- Repeat until count = 0
```

---

## Example: One-by-One Auto

```sql
-- Just run this - it does everything automatically
DO $$
DECLARE
  record_id UUID;
  processed_count INTEGER := 0;
BEGIN
  LOOP
    SELECT id INTO record_id
    FROM position_history
    WHERE gps_time > NOW() + INTERVAL '1 day'
      AND recorded_at >= NOW() - INTERVAL '7 days'
    ORDER BY recorded_at DESC
    LIMIT 1;
    
    EXIT WHEN record_id IS NULL;
    
    UPDATE position_history
    SET gps_time = NULL
    WHERE id = record_id;
    
    processed_count := processed_count + 1;
    
    IF processed_count % 100 = 0 THEN
      RAISE NOTICE 'Processed % records', processed_count;
    END IF;
    
    EXIT WHEN processed_count >= 10000;
  END LOOP;
  
  RAISE NOTICE 'Completed. Processed % records total', processed_count;
END $$;
```

---

**Start with Ultra Fast, fall back to One-by-One if needed!**
