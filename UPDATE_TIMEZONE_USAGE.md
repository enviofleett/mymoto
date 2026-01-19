# Update Timezone Usage Across Codebase

## Summary
All date/time displays and calculations should use Lagos timezone (Africa/Lagos, UTC+1).

## Files Created

1. **`SET_DATABASE_TIMEZONE.sql`** - Set database timezone to Lagos
2. **`FIND_INVALID_TIMESTAMPS.sql`** - Find invalid dates (like 2041)
3. **`CLEANUP_INVALID_TIMESTAMPS.sql`** - Clean up invalid dates
4. **`TIMEZONE_ENFORCEMENT_PLAN.md`** - Complete implementation plan

## Components Updated (So Far)

✅ **VehicleDetailsModal.tsx** - Uses Lagos timezone for time displays
✅ **RecentActivityFeed.tsx** - Uses Lagos timezone for time/date displays  
✅ **OwnerChatDetail.tsx** - Uses Lagos timezone for message timestamps
✅ **src/lib/timezone.ts** - Added `formatLagos()` helper function

## Components Still Needing Updates

The following files use `format()` from date-fns without timezone:

1. `src/components/fleet/VehicleTrips.tsx`
2. `src/pages/owner/OwnerVehicleProfile/components/ReportsSection.tsx`
3. `src/components/profile/TripHistoryTable.tsx`
4. `src/components/profile/AlarmReport.tsx`
5. `src/components/profile/TripPlaybackDialog.tsx`
6. `src/components/profile/TripPlayback.tsx`
7. `src/pages/AdminAlerts.tsx`
8. `src/pages/Insights.tsx`
9. `src/pages/AdminPrivacySettings.tsx`
10. `src/components/admin/InactiveVehiclesCleanup.tsx`
11. And 16 more files...

## Quick Fix Pattern

**Before:**
```typescript
import { format } from "date-fns";
format(new Date(date), "MMM d, HH:mm")
```

**After:**
```typescript
import { formatLagos } from "@/lib/timezone";
formatLagos(date, "MMM d, HH:mm")
```

Or use Intl.DateTimeFormat directly:
```typescript
new Date(date).toLocaleString('en-US', {
  timeZone: 'Africa/Lagos',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})
```

## Next Steps

1. **Run `SET_DATABASE_TIMEZONE.sql`** - Set database timezone
2. **Run `FIND_INVALID_TIMESTAMPS.sql`** - See what needs cleaning
3. **Update remaining components** - Replace format() with formatLagos() or Intl.DateTimeFormat
4. **Test all date displays** - Verify Lagos timezone is used everywhere
