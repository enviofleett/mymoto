# Batch Update Timezone - Quick Reference

## Step 1: Set Database Timezone (Do This First)

Run in Supabase SQL Editor:
```sql
SET timezone = 'Africa/Lagos';
```

Verify:
```sql
SHOW timezone;
-- Should return: Africa/Lagos
```

## Step 2: Find Invalid Timestamps

Run `FIND_INVALID_TIMESTAMPS.sql` to see:
- How many invalid future dates exist
- Sample of invalid records
- Summary of timestamp issues

## Step 3: Clean Invalid Timestamps (After Review)

Review results from Step 2, then choose cleanup option from `CLEANUP_INVALID_TIMESTAMPS.sql`:
- Option 1: Delete invalid dates
- Option 2: Set to NULL (safer)
- Option 3: Set to current time

## Step 4: Update Components (Gradual)

Update components one by one, starting with most visible:

### Priority 1 (User-Facing):
- ✅ VehicleDetailsModal.tsx
- ✅ RecentActivityFeed.tsx  
- ✅ OwnerChatDetail.tsx

### Priority 2 (Admin/Reports):
- ReportsSection.tsx
- VehicleTrips.tsx
- TripHistoryTable.tsx
- AlarmReport.tsx

### Priority 3 (Other):
- All remaining components using format()

## Pattern for Updates

**Find:**
```typescript
format(new Date(...), "...")
```

**Replace with:**
```typescript
formatLagos(..., "...")
```

Or use Intl directly:
```typescript
new Date(...).toLocaleString('en-US', { timeZone: 'Africa/Lagos', ... })
```

## Testing

After updates, verify:
1. All dates show Lagos time (UTC+1)
2. No dates show in future (2041, etc.)
3. Date calculations use Lagos timezone
4. Edge functions use Lagos timezone
