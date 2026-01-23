# GPS Sync Mystery - Quick Prompt

## Problem

Supabase Edge Function (`gps-data`) says it's updating 2,635 vehicle positions, returns HTTP 200, and CRON job logs show "succeeded", but the database `cached_at` timestamps don't change after the first run.

---

## Evidence

**Edge Function Logs**:
```
✅ Status: 200
✅ "Updated 2635 positions (218 moving)"
✅ "Smart history: 2634/2634 positions recorded"
```

**Database Reality**:
```sql
SELECT device_id, cached_at 
FROM vehicle_positions 
ORDER BY cached_at DESC LIMIT 20;

-- ALL 2665 vehicles have IDENTICAL timestamp:
-- cached_at: "2026-01-23 13:21:06.33+00"
-- No updates for 20+ minutes despite CRON running every 5 min
```

**CRON Job Logs**:
```json
{
  "jobid": 20,
  "status": "succeeded",
  "return_message": "1 row",
  "start_time": "2026-01-23 13:20:00",
  "duration_seconds": "0.019742"
}
// Runs every 5 minutes, all showing "succeeded"
```

---

## The Disconnect

- Edge Function claims: "Updated 2635 positions" ✅
- Database shows: No new `cached_at` timestamps ❌
- CRON job says: "succeeded" ✅
- Actual updates: None since 13:21:06 ❌

---

## Key Code Section

```typescript
async function syncPositions(supabase: any, records: any[]) {
  const now = new Date().toISOString()
  
  const positions = records.map(record => ({
    device_id: record.deviceid,
    latitude: record.lat,
    longitude: record.lon,
    cached_at: now,  // Should update timestamp
    // ... other fields
  }))

  // Batch upsert
  for (let i = 0; i < positions.length; i += 50) {
    const batch = positions.slice(i, i + 50)
    await supabase.from('vehicle_positions').upsert(batch, { 
      onConflict: 'device_id',
      ignoreDuplicates: false  // Should always update
    })
  }
  
  console.log(`[syncPositions] Updated ${positions.length} positions`)
}
```

**Question**: Why does this log "Updated X positions" but database timestamps don't change?

---

## What Works

1. ✅ Manual SQL UPDATE → instant realtime → browser updates (<1s)
2. ✅ First GPS sync run (manual job 21) → updated all 2665 vehicles
3. ✅ Realtime subscription stable and working
4. ✅ WebSocket connection active

---

## What Doesn't Work

1. ❌ Automatic GPS sync (Job 20) → no database updates
2. ❌ `cached_at` stuck at 13:21:06 despite function running every 5 min
3. ❌ Edge Function logs vs database reality don't match

---

## Environment

- **Platform**: Supabase (PostgreSQL + Edge Functions)
- **Runtime**: Deno
- **CRON**: pg_cron extension
- **Client**: @supabase/supabase-js@2
- **Fleet Size**: 2,665 vehicles
- **Batch Size**: 50 vehicles per upsert

---

## Questions

1. Could Supabase client be using wrong credentials despite service role key?
2. Could upsert be silently failing without throwing errors?
3. Is there a transaction issue causing rollback?
4. Could the Edge Function be returning cached response despite `use_cache: false`?
5. How can we verify the upsert SQL is actually executing?

---

## Desired Outcome

When CRON job runs every 5 minutes:
1. Edge Function fetches fresh GPS data
2. Database `vehicle_positions` gets updated
3. `cached_at` timestamps change to current time
4. Realtime pushes updates to browser
5. Users see live vehicle positions

Currently stuck at step 2-3: Database not updating despite function claiming success.

---

**What could cause this disconnect between function logs and database reality?**
