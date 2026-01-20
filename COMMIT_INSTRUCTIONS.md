# Commit Instructions - Production Readiness
**Date**: 2026-01-20

---

## 🚨 Current Git Status

**Branch Status**: Your branch and 'origin/main' have diverged
- **Local commits**: 1
- **Remote commits**: 7

**Merge Conflicts**: 5 files need resolution
**Staged Files**: 8 files ready
**Unstaged Changes**: 11 files modified
**Untracked Files**: 18 new files

---

## 📋 Step-by-Step Commit Process

### Step 1: Resolve Merge Conflicts (CRITICAL)

You have merge conflicts in 5 files. Check each file for conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`):

```bash
# Check for conflict markers
grep -n "<<<<<<< HEAD" src/hooks/useVehicleProfile.ts
grep -n "<<<<<<< HEAD" src/pages/owner/OwnerChatDetail.tsx
grep -n "<<<<<<< HEAD" src/pages/owner/OwnerVehicleProfile/components/MileageSection.tsx
grep -n "<<<<<<< HEAD" src/pages/owner/OwnerVehicleProfile/components/ReportsSection.tsx
grep -n "<<<<<<< HEAD" src/pages/owner/OwnerVehicleProfile/index.tsx
```

**If conflicts exist**, resolve them by:
1. Opening each file
2. Finding conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`)
3. Choosing the correct version (usually keep your changes)
4. Removing conflict markers
5. Saving the file

**After resolving**, mark as resolved:
```bash
git add src/hooks/useVehicleProfile.ts
git add src/pages/owner/OwnerChatDetail.tsx
git add src/pages/owner/OwnerVehicleProfile/components/MileageSection.tsx
git add src/pages/owner/OwnerVehicleProfile/components/ReportsSection.tsx
git add src/pages/owner/OwnerVehicleProfile/index.tsx
```

---

### Step 2: Stage Performance Optimizations

```bash
git add src/components/fleet/VehicleChat.tsx
git add src/hooks/useFleetData.ts
git add src/hooks/useFleetLiveData.ts
git add src/hooks/useOwnerVehicles.ts
git add src/hooks/useVehicleLiveData.ts
```

---

### Step 3: Stage Query Optimizations

```bash
git add src/components/profile/AlarmReport.tsx
git add src/components/profile/TripHistoryTable.tsx
git add src/pages/Fleet.tsx
```

---

### Step 4: Stage Database Migrations (CRITICAL)

```bash
git add supabase/migrations/20260120000010_daily_travel_stats_function.sql
git add supabase/migrations/20260120000011_add_performance_indexes.sql
git add supabase/migrations/20260120000012_alert_dismissals.sql
git add supabase/migrations/20260120000013_trip_pattern_functions.sql
```

---

### Step 5: Stage Edge Functions

```bash
git add supabase/functions/gps-data/index.ts
git add supabase/functions/_shared/alert-severity.ts
git add supabase/functions/check-upcoming-trips/
git add supabase/functions/detect-anomalies/
git add supabase/functions/monitor-active-trips/
```

---

### Step 6: Stage Production Scripts & Documentation

```bash
git add RUN_ALL_MIGRATIONS.sql
git add VERIFY_PRODUCTION_READY.sql
git add QUICK_VERIFY_PRODUCTION.sql
git add FIX_DATABASE_FUNCTIONS_SIMPLE.sql
git add PRODUCTION_FIX_PLAN.md
git add PRODUCTION_READINESS_REPORT.md
git add QUICK_FIX_GUIDE.md
git add FINAL_PRODUCTION_STATUS.md
git add MIGRATION_GUIDE.md
git add COMMIT_AUDIT_REPORT.md
git add COMMIT_INSTRUCTIONS.md
```

---

### Step 7: Stage Utilities

```bash
git add src/utils/autoScroll.ts
git add src/utils/streamingResponseHandler.ts
```

---

### Step 8: Stage Package Updates

```bash
git add package.json
git add package-lock.json
```

---

### Step 9: Complete Merge (if conflicts resolved)

```bash
# If you resolved conflicts, complete the merge:
git commit -m "Merge remote-tracking branch 'origin/main'"
```

---

### Step 10: Commit Production Readiness Changes

```bash
git commit -m "feat: Production readiness - Performance optimizations and AI intelligence

Performance Improvements:
- Remove polling (refetchInterval) from all hooks, use realtime subscriptions
- Optimize queries: replace select('*') with specific columns
- Add staleTime: 60s and refetchOnWindowFocus: false
- Remove artificial delays in chat components

Database Enhancements:
- Add performance indexes for chat, events, positions, trips
- Create alert_dismissals table with RLS for persistence learning
- Add get_daily_travel_stats function (7am-6pm Lagos time)
- Add get_trip_patterns and calculate_battery_drain functions

AI Intelligence Features:
- Proactive trip start alerts (check-upcoming-trips)
- Behavioral anomaly detection (detect-anomalies)
- Trip duration variance monitoring (monitor-active-trips)
- Context-aware battery alerts with trip pattern checking
- Time-of-day severity adjustment for alerts

Edge Functions:
- Update gps-data with context-aware battery logic
- Add alert-severity utility for time-based severity
- New proactive monitoring functions

Production Tools:
- Add production verification scripts
- Add migration guides and fix plans
- Add quick reference guides"
```

---

## 🎯 Quick Commit (All at Once)

If you want to commit everything at once (after resolving conflicts):

```bash
# Stage all changes
git add .

# Commit with comprehensive message
git commit -m "feat: Production readiness - Performance optimizations, database migrations, and AI intelligence

- Performance: Removed polling, added realtime subscriptions, optimized queries
- Database: Added performance indexes, alert dismissals table, trip pattern functions  
- AI Intelligence: Added proactive trip alerts, anomaly detection, battery drain calculation
- Edge Functions: Context-aware battery alerts, time-of-day severity adjustment
- Production: Added verification scripts and deployment guides"
```

---

## ⚠️ Before Committing

1. ✅ **Resolve merge conflicts** (5 files)
2. ✅ **Test locally** (`npm run dev`)
3. ✅ **Run verification** (`QUICK_VERIFY_PRODUCTION.sql`)
4. ✅ **Check for errors** (browser console)
5. ✅ **Review changes** (git diff)

---

## 📊 Files Summary

| Category | Count | Status |
|----------|-------|--------|
| Merge Conflicts | 5 | ⚠️ Must resolve |
| Staged Files | 8 | ✅ Ready |
| Modified Files | 11 | ⏳ Need staging |
| New Files | 18 | ⏳ Need staging |
| **Total** | **42** | **⏳ Ready after conflicts** |

---

## 🚀 After Committing

1. **Push to remote**:
   ```bash
   git push origin main
   ```

2. **Deploy edge functions**:
   ```bash
   supabase functions deploy gps-data
   supabase functions deploy check-upcoming-trips
   supabase functions deploy detect-anomalies
   supabase functions deploy monitor-active-trips
   ```

3. **Run database migrations**:
   - Use `RUN_ALL_MIGRATIONS.sql` in Supabase SQL Editor

4. **Verify production**:
   - Run `QUICK_VERIFY_PRODUCTION.sql`

---

**Next Step**: Resolve merge conflicts, then follow steps above to commit! 🎯
