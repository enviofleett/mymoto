# SQL Query Optimization Notes

## Issue
Some SQL queries were timing out due to full table scans on large tables (`position_history`, `vehicle_positions`).

## Optimizations Applied

### 1. CHECK_DATA_AVAILABILITY.sql
- **Query 1**: Added time-based filtering (last 30 days) to avoid full table scan
- **Query 2**: Limited to recently cached positions (last 7 days)
- **Query 5**: Split UNION ALL into two separate queries to reduce complexity

### 2. VERIFY_IGNITION_IMPLEMENTATION.sql
- **Query 5**: 
  - Reduced time window from 24 hours to 6 hours
  - Added LIMIT 100000 to sample size
  - Added LIMIT 100 to final results
  - Added NULLIF to prevent division by zero

## Best Practices for Future Queries

1. **Always use time-based filters** on large tables:
   ```sql
   WHERE gps_time >= NOW() - INTERVAL '7 days'
   ```

2. **Add LIMIT clauses** for exploratory queries:
   ```sql
   LIMIT 1000
   ```

3. **Use indexes** - Ensure these indexes exist:
   ```sql
   CREATE INDEX IF NOT EXISTS idx_position_history_gps_time 
   ON position_history(gps_time DESC);
   
   CREATE INDEX IF NOT EXISTS idx_vehicle_positions_cached_at 
   ON vehicle_positions(cached_at DESC);
   
   CREATE INDEX IF NOT EXISTS idx_vehicle_positions_gps_time 
   ON vehicle_positions(gps_time DESC);
   ```

4. **Split complex queries** - Break UNION ALL queries into separate queries

5. **Sample data** - For large tables, use CTEs with LIMIT to sample:
   ```sql
   WITH sample AS (
     SELECT * FROM large_table
     WHERE condition
     LIMIT 100000
   )
   SELECT ... FROM sample ...
   ```

## If Queries Still Timeout

1. **Reduce time window** (e.g., from 24h to 6h or 1h)
2. **Reduce sample size** (e.g., LIMIT 50000 instead of 100000)
3. **Run queries separately** instead of in batches
4. **Check for missing indexes** and create them
5. **Use EXPLAIN ANALYZE** to identify slow operations

## Recommended Indexes

Run these to improve query performance:

```sql
-- Indexes for position_history
CREATE INDEX IF NOT EXISTS idx_position_history_gps_time 
ON position_history(gps_time DESC);

CREATE INDEX IF NOT EXISTS idx_position_history_device_gps_time 
ON position_history(device_id, gps_time DESC);

CREATE INDEX IF NOT EXISTS idx_position_history_ignition_confidence 
ON position_history(ignition_confidence) 
WHERE ignition_confidence IS NOT NULL;

-- Indexes for vehicle_positions
CREATE INDEX IF NOT EXISTS idx_vehicle_positions_gps_time 
ON vehicle_positions(gps_time DESC);

CREATE INDEX IF NOT EXISTS idx_vehicle_positions_cached_at 
ON vehicle_positions(cached_at DESC);

CREATE INDEX IF NOT EXISTS idx_vehicle_positions_device_gps_time 
ON vehicle_positions(device_id, gps_time DESC);
```
