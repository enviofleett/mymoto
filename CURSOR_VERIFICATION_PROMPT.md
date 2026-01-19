# 🔍 CURSOR VERIFICATION & DEBUGGING PROMPT

Use this prompt with Cursor AI to verify and debug the vehicle profile implementation.

---

## 📋 VERIFICATION PROMPT FOR CURSOR

```
I've just implemented auto-sync and unified mileage reporting for the vehicle profile page.
Please verify the implementation is correct and help me test it.

Key changes made:
1. Auto-sync on page load (src/pages/owner/OwnerVehicleProfile/index.tsx)
2. Unified mileage data source (src/pages/owner/OwnerVehicleProfile/components/MileageSection.tsx)
3. Optimized query stale times (src/hooks/useVehicleProfile.ts)
4. Trip GPS validation badges (src/pages/owner/OwnerVehicleProfile/components/ReportsSection.tsx)
5. Production-ready logging with development checks

User Story: "When customer loads the vehicle profile page, the most recent trip data should load automatically without clicking the sync button."

Please help me:

1. **Code Review**: Check if the implementation follows React best practices
   - Are hooks called in the correct order?
   - Are dependency arrays correct in useEffect/useMemo/useCallback?
   - Are there any potential memory leaks?
   - Is error handling robust?

2. **Logic Verification**: Verify the auto-sync logic
   - Does auto-sync trigger on page mount?
   - Does it properly invalidate queries after sync?
   - Is the 500ms delay appropriate?
   - Will it cause infinite loops?

3. **Data Consistency**: Verify single source of truth for mileage
   - Does MileageSection only use dailyStats now?
   - Are all calculations derived from the same source?
   - Will filtered vs unfiltered views show consistent data?

4. **Type Safety**: Check TypeScript types
   - Are all props properly typed?
   - Are there any 'any' types that should be specific?
   - Do interfaces match component usage?

5. **Performance**: Check for performance issues
   - Are there unnecessary re-renders?
   - Are memoization strategies correct?
   - Could any computations be optimized?

6. **Edge Cases**: Identify potential edge cases
   - What happens if deviceId is null?
   - What happens if dailyStats is empty?
   - What happens if sync fails?
   - What happens if network is offline?

7. **Testing Recommendations**: Suggest test cases
   - What should I test manually?
   - What unit tests should I write?
   - What integration tests are needed?

Review these files:
- src/pages/owner/OwnerVehicleProfile/index.tsx (lines 1-530)
- src/pages/owner/OwnerVehicleProfile/components/ReportsSection.tsx (lines 43-207)
- src/pages/owner/OwnerVehicleProfile/components/MileageSection.tsx (entire file)
- src/hooks/useVehicleProfile.ts (lines 407-421)

Implementation guide: VEHICLE_PROFILE_FIX_IMPLEMENTATION.md
```

---

## 🐛 DEBUGGING PROMPT FOR CURSOR

If you encounter issues, use this prompt:

```
I'm having issues with the vehicle profile auto-sync implementation. Here's what's happening:

**Issue Description:**
[Describe the problem you're seeing]

**Expected Behavior:**
[What should happen]

**Actual Behavior:**
[What actually happens]

**Steps to Reproduce:**
1. [Step 1]
2. [Step 2]
3. [Step 3]

**Browser Console Errors:**
[Paste any console errors here]

**Network Requests:**
[Any failed/slow network requests]

**Component State:**
[Any relevant React Query or component state]

Please help me debug by:
1. Identifying the root cause
2. Suggesting specific fixes with code examples
3. Explaining why the issue occurred
4. Recommending preventive measures

Files to check:
- src/pages/owner/OwnerVehicleProfile/index.tsx
- src/pages/owner/OwnerVehicleProfile/components/ReportsSection.tsx
- src/pages/owner/OwnerVehicleProfile/components/MileageSection.tsx
- src/hooks/useVehicleProfile.ts
```

---

## ✅ MANUAL TESTING CHECKLIST

Use this with Cursor to guide your testing:

```
Help me test the vehicle profile implementation systematically.

Test Scenarios:

1. **Auto-Sync on Load**
   - [ ] Open vehicle profile page
   - [ ] Check console for "[VehicleProfile] Auto-syncing trips on page load"
   - [ ] Verify "Auto-syncing..." appears briefly in Reports section
   - [ ] Confirm trips load without clicking sync button
   - [ ] Verify sync completes within 5 seconds

2. **Mileage Consistency**
   - [ ] Check "Today" trips count matches trip list
   - [ ] Check "This Week" distance is sum of last 7 days
   - [ ] Apply date filter - verify all cards update consistently
   - [ ] Remove filter - verify numbers return to unfiltered state
   - [ ] Check chart totals match summary cards

3. **Trip GPS Validation**
   - [ ] Find trip with missing GPS coordinates (0,0)
   - [ ] Verify "GPS incomplete" badge appears
   - [ ] Verify play button is disabled
   - [ ] Hover over button - verify tooltip shows explanation
   - [ ] Try clicking - verify nothing happens

4. **Pull-to-Refresh**
   - [ ] Pull down on mobile/desktop
   - [ ] Verify refresh indicator appears
   - [ ] Verify all data refreshes
   - [ ] Check trips query invalidated
   - [ ] Verify no duplicate data

5. **Error Handling**
   - [ ] Disable network - reload page
   - [ ] Verify cached data shows immediately
   - [ ] Verify auto-sync fails gracefully (no user error)
   - [ ] Re-enable network - verify data syncs

6. **Production Build**
   - [ ] Build for production: npm run build
   - [ ] Deploy to test environment
   - [ ] Check console - no development logs
   - [ ] Verify all features work in production

7. **Performance**
   - [ ] Open React DevTools Profiler
   - [ ] Load vehicle profile page
   - [ ] Check render times < 500ms
   - [ ] Verify no unnecessary re-renders
   - [ ] Check memory usage stays stable

For each test that fails, use the debugging prompt above.
```

---

## 🔧 COMMON ISSUES & FIXES

```
Cursor, help me troubleshoot these common issues:

Issue 1: Auto-sync not triggering
Symptoms: No "[VehicleProfile] Auto-syncing..." in console
Possible causes:
- deviceId is null on mount
- useEffect dependencies missing
- Cleanup function clearing timer too early
Fix: Check that deviceId exists before sync, verify dependencies array

Issue 2: Mileage numbers still inconsistent
Symptoms: Different numbers in different cards
Possible causes:
- Still using old useMileageStats/useDailyMileage hooks
- Cache not cleared properly
- Multiple data sources in calculations
Fix: Verify MileageSection only uses dailyStats prop, clear React Query cache

Issue 3: "GPS incomplete" badge not showing
Symptoms: All trips show play button enabled even with 0,0 coords
Possible causes:
- canPlayback logic incorrect
- hasValidStartCoords/hasValidEndCoords logic wrong
Fix: Check coordinate validation (must check !== 0 not just truthy)

Issue 4: Infinite sync loop
Symptoms: Auto-sync runs continuously
Possible causes:
- Missing dependencies in useEffect
- Query invalidation triggering re-mount
- Stale closure issue
Fix: Add deviceId and queryClient to dependency array, ensure cleanup function works

Issue 5: TypeScript errors after changes
Symptoms: Build fails with type errors
Possible causes:
- MileageSection props interface outdated
- ReportsSection props missing isAutoSyncing
Fix: Update interfaces to match new prop structure

For each issue, provide:
1. Root cause analysis
2. Step-by-step fix
3. Code snippet to apply
4. Prevention strategy
```

---

## 📊 PERFORMANCE ANALYSIS PROMPT

```
Cursor, help me analyze the performance impact of these changes:

Analyze:
1. How many network requests are made on page load?
2. What is the total data transferred?
3. How long does initial render take?
4. How long does auto-sync take?
5. Are there any render blocking operations?

Compare before vs after:
- Page load time
- Time to interactive
- Number of re-renders
- Memory usage
- Network waterfall

Suggest optimizations for:
- Reducing network requests
- Improving render performance
- Minimizing re-renders
- Optimizing bundle size

Use Chrome DevTools or React DevTools Profiler to measure.
```

---

## 🚀 DEPLOYMENT CHECKLIST PROMPT

```
Cursor, help me prepare for production deployment:

Pre-deployment checks:
1. [ ] All TypeScript errors resolved?
2. [ ] All console.logs wrapped in development checks?
3. [ ] No unused imports or variables?
4. [ ] All tests passing?
5. [ ] Build succeeds: npm run build
6. [ ] No console errors in production build?

Code quality:
1. [ ] Run ESLint: npm run lint
2. [ ] Run Prettier: npm run format
3. [ ] Check bundle size: analyze production build
4. [ ] Review for security issues
5. [ ] Check for hardcoded secrets

Documentation:
1. [ ] Update CHANGELOG.md
2. [ ] Add deployment notes
3. [ ] Document breaking changes
4. [ ] Update API documentation if needed

Rollback plan:
1. [ ] Tag current version in git
2. [ ] Document rollback procedure
3. [ ] Have previous working commit ready
4. [ ] Test rollback in staging

Monitoring:
1. [ ] Set up error tracking for auto-sync failures
2. [ ] Monitor sync completion rates
3. [ ] Track page load times
4. [ ] Set up alerts for query failures

Help me verify each item and provide commands to run.
```

---

## 💡 USAGE TIPS

1. **Copy the verification prompt** to Cursor when you first want to check the code
2. **Use the debugging prompt** when you encounter specific issues
3. **Follow the testing checklist** systematically before deployment
4. **Reference common issues** if you see known symptoms
5. **Run performance analysis** if the page feels slow
6. **Complete deployment checklist** before pushing to production

---

## 📞 WHEN TO USE EACH PROMPT

| Situation | Use This Prompt |
|-----------|----------------|
| Just finished implementing | Verification Prompt |
| Something doesn't work | Debugging Prompt |
| Ready to test manually | Testing Checklist |
| Hit a known issue | Common Issues & Fixes |
| Page feels slow | Performance Analysis |
| Ready to deploy | Deployment Checklist |

---

## ✨ BEST PRACTICES FOR CURSOR

1. **Be specific**: Include exact error messages, line numbers, and file paths
2. **Provide context**: Mention what you were trying to do when the issue occurred
3. **Share logs**: Copy relevant console output or network errors
4. **Show state**: Include React Query DevTools or component state snapshots
5. **Test hypotheses**: Let Cursor suggest fixes, test them, report back results

---

**Remember**: The implementation guide is in `VEHICLE_PROFILE_FIX_IMPLEMENTATION.md`

All changes are committed to git, so you can always revert if needed:
```bash
git log -1  # See latest commit
git show HEAD  # View changes
git revert HEAD  # Undo if needed
```
