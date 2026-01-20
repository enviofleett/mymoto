# Step-by-Step Fix Guide - Merge Conflicts Resolution

## 🎯 What You Need to Do

You have **5 files** with merge conflicts. Your local changes are **better** (they have performance optimizations), so we'll keep your version.

---

## ✅ Step 1: Accept Your Local Changes (Recommended)

Your local files have the **performance optimizations** we just implemented. Run this command:

```bash
git checkout --ours src/hooks/useVehicleProfile.ts
git checkout --ours src/pages/owner/OwnerChatDetail.tsx
git checkout --ours src/pages/owner/OwnerVehicleProfile/index.tsx
git checkout --ours src/pages/owner/OwnerVehicleProfile/components/MileageSection.tsx
git checkout --ours src/pages/owner/OwnerVehicleProfile/components/ReportsSection.tsx
```

**What this does**: Keeps your optimized version of each file.

---

## ✅ Step 2: Mark Files as Resolved

Tell git that you've resolved the conflicts:

```bash
git add src/hooks/useVehicleProfile.ts
git add src/pages/owner/OwnerChatDetail.tsx
git add src/pages/owner/OwnerVehicleProfile/index.tsx
git add src/pages/owner/OwnerVehicleProfile/components/MileageSection.tsx
git add src/pages/owner/OwnerVehicleProfile/components/ReportsSection.tsx
```

**What this does**: Stages the resolved files so git knows conflicts are fixed.

---

## ✅ Step 3: Complete the Merge

Finish the merge process:

```bash
git commit -m "Merge remote-tracking branch 'origin/main' - keep local performance optimizations"
```

**What this does**: Completes the merge and creates a commit.

---

## ✅ Step 4: Verify Everything is Good

Check that conflicts are resolved:

```bash
git status
```

**Expected result**: Should show "nothing to commit, working tree clean" or only show unstaged files (which is fine).

---

## ✅ Step 5: Stage All Your Production Changes

Now stage all your other changes:

```bash
git add .
```

**What this does**: Stages all modified and new files for commit.

---

## ✅ Step 6: Commit Everything

Create the final commit with all your production-ready changes:

```bash
git commit -m "feat: Production readiness - Performance optimizations, database migrations, and AI intelligence

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

## 🚀 Quick Copy-Paste Solution

If you want to do it all at once, copy and paste this entire block:

```bash
# Step 1: Accept your local changes
git checkout --ours src/hooks/useVehicleProfile.ts && \
git checkout --ours src/pages/owner/OwnerChatDetail.tsx && \
git checkout --ours src/pages/owner/OwnerVehicleProfile/index.tsx && \
git checkout --ours src/pages/owner/OwnerVehicleProfile/components/MileageSection.tsx && \
git checkout --ours src/pages/owner/OwnerVehicleProfile/components/ReportsSection.tsx && \

# Step 2: Mark as resolved
git add src/hooks/useVehicleProfile.ts src/pages/owner/OwnerChatDetail.tsx src/pages/owner/OwnerVehicleProfile/index.tsx src/pages/owner/OwnerVehicleProfile/components/MileageSection.tsx src/pages/owner/OwnerVehicleProfile/components/ReportsSection.tsx && \

# Step 3: Complete merge
git commit -m "Merge remote-tracking branch 'origin/main' - keep local performance optimizations" && \

# Step 4: Stage all changes
git add . && \

# Step 5: Final commit
git commit -m "feat: Production readiness - Performance optimizations, database migrations, and AI intelligence"
```

---

## ⚠️ If Something Goes Wrong

If you get an error, you can abort the merge and start fresh:

```bash
# Abort the merge
git merge --abort

# Then try again with the steps above
```

---

## 📊 What Your Local Changes Include (Why We Keep Them)

Your local files have:
- ✅ **Optimized queries**: `select("id, device_id, ...")` instead of `select("*")`
- ✅ **Performance improvements**: Better caching and realtime subscriptions
- ✅ **Security fixes**: Proper authentication handling
- ✅ **Production-ready code**: All the latest improvements

The remote files likely have the older `select("*")` version, which is less efficient.

---

## ✅ After Committing

Once you've completed all steps:

1. **Push to remote**:
   ```bash
   git push origin main
   ```

2. **Deploy edge functions** (if needed):
   ```bash
   supabase functions deploy gps-data
   supabase functions deploy check-upcoming-trips
   supabase functions deploy detect-anomalies
   supabase functions deploy monitor-active-trips
   ```

3. **Run database migrations**:
   - Use `RUN_ALL_MIGRATIONS.sql` in Supabase SQL Editor

---

**You're all set! Follow the steps above to resolve conflicts and commit everything.** 🎯
