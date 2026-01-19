# Lagos Timezone Enforcement Plan

## Goal
Ensure the entire system uses Lagos timezone (Africa/Lagos, UTC+1) consistently across:
- Database operations
- Edge functions
- Frontend displays
- Date calculations

---

## Current Status

### ✅ Already Implemented
- `src/lib/timezone.ts` - Frontend timezone utilities
- `supabase/functions/_shared/timezone.ts` - Edge function timezone utilities
- Some components use Lagos timezone

### ❌ Needs Update
- Many components use `format()` without timezone
- Many components use `toLocaleString()` without timezone
- Database timezone not set to Lagos
- Edge functions inconsistent timezone usage
- Invalid timestamps in database (2041 dates)

---

## Implementation Plan

### Phase 1: Database Timezone (Do First)

**File:** `SET_DATABASE_TIMEZONE.sql`

1. Set database default timezone to Lagos
2. Verify timezone is set correctly
3. Test timezone conversions

**Action:** Run `SET_DATABASE_TIMEZONE.sql` in Supabase SQL Editor

---

### Phase 2: Clean Invalid Timestamps

**Files:** 
- `FIND_INVALID_TIMESTAMPS.sql` - Find invalid dates
- `CLEANUP_INVALID_TIMESTAMPS.sql` - Clean them up

**Steps:**
1. Run `FIND_INVALID_TIMESTAMPS.sql` to see what needs cleaning
2. Review results
3. Run appropriate cleanup from `CLEANUP_INVALID_TIMESTAMPS.sql`

---

### Phase 3: Update Frontend Components

**Files to Update:**

1. **VehicleDetailsModal.tsx**
   - Replace `toLocaleString()` with `formatLagosDate()`

2. **RecentActivityFeed.tsx**
   - Replace `format()` calls with Lagos timezone-aware formatting

3. **OwnerChatDetail.tsx**
   - Use `formatLagosDate()` for message timestamps

4. **ReportsSection.tsx**
   - Use Lagos timezone for date calculations
   - Use `formatLagosDate()` for displays

5. **VehicleTrips.tsx**
   - Use Lagos timezone for trip time displays

6. **All other components** using `format()` or `toLocaleString()`

---

### Phase 4: Update Edge Functions

**Files to Update:**

1. **gps-data/index.ts**
   - Ensure timestamps use Lagos timezone context

2. **vehicle-chat/index.ts**
   - Already uses Lagos timezone (verify consistency)

3. **All other edge functions**
   - Use `getLagosNow()` from `_shared/timezone.ts`
   - Use `toLagosTimezone()` for date conversions

---

### Phase 5: Update Database Functions

**Check:**
- All `NOW()` calls will use Lagos timezone after Phase 1
- All timestamp defaults are correct
- All date calculations use Lagos timezone

---

## Quick Wins (Do These First)

### 1. Set Database Timezone (5 minutes)
```sql
SET timezone = 'Africa/Lagos';
ALTER DATABASE CURRENT_DATABASE SET timezone = 'Africa/Lagos';
```

### 2. Find Invalid Timestamps (2 minutes)
Run `FIND_INVALID_TIMESTAMPS.sql` to see what needs cleaning

### 3. Update Most Critical Components (30 minutes)
- VehicleDetailsModal.tsx
- RecentActivityFeed.tsx
- OwnerChatDetail.tsx

---

## Testing Checklist

After implementation, verify:

- [ ] Database timezone is set to Africa/Lagos
- [ ] All date displays show Lagos time
- [ ] Date calculations use Lagos timezone
- [ ] No invalid future dates (2041, etc.)
- [ ] Edge functions use Lagos timezone
- [ ] Frontend components use formatLagosDate()

---

## Files Created

1. `SET_DATABASE_TIMEZONE.sql` - Set database timezone
2. `FIND_INVALID_TIMESTAMPS.sql` - Find invalid dates
3. `CLEANUP_INVALID_TIMESTAMPS.sql` - Clean invalid dates
4. `TIMEZONE_ENFORCEMENT_PLAN.md` - This file

---

## Next Steps

1. **Run `SET_DATABASE_TIMEZONE.sql`** ← Do this first
2. **Run `FIND_INVALID_TIMESTAMPS.sql`** to see what needs cleaning
3. **Review cleanup options** in `CLEANUP_INVALID_TIMESTAMPS.sql`
4. **Update frontend components** to use Lagos timezone utilities
5. **Test all date displays** to ensure Lagos timezone
