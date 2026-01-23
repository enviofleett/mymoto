# Trip Report Audit & Fixes - Device 358657105966092

## Issues Identified

### 🔴 **CRITICAL ISSUES**

#### 1. **Auto-Filtering to Last 24 Hours Hides Older Trips**
**Location:** `src/hooks/useVehicleProfile.ts` lines 135-142

**Problem:**
When no date range is provided, the query automatically filters to last 24 hours. This means:
- Users expecting to see all recent trips (e.g., last 7 days) only see last 24 hours
- Older trips are hidden even if they're within the limit
- The limit of 200 trips is effectively reduced to trips in last 24 hours

**Impact:** HIGH - Users miss trips that should be visible

**Fix:** Remove auto-filtering, rely on limit and ordering instead

---

#### 2. **Date Range Filter Logic Issue**
**Location:** `src/hooks/useVehicleProfile.ts` lines 128-154

**Problem:**
- When `dateRange.from` is provided but `dateRange.to` is not, it filters from that date to infinity
- The timezone handling might cause trips to be excluded incorrectly
- Setting hours to 0,0,0,0 might miss trips that start late at night

**Impact:** MEDIUM - Some trips might be filtered out incorrectly

**Fix:** Improve date range filtering with proper timezone handling

---

#### 3. **Distance Calculation Not Applied to All Cases**
**Location:** `src/hooks/useVehicleProfile.ts` lines 218-240

**Problem:**
- Distance is only calculated if stored distance is 0
- If stored distance is NULL, it might not be calculated
- The calculation order might miss some valid cases

**Impact:** MEDIUM - Some trips show 0 distance when they should have calculated distance

**Fix:** Improve distance calculation logic to handle all cases

---

### 🟡 **MODERATE ISSUES**

#### 4. **Trip Grouping Timezone Issues**
**Location:** `src/pages/owner/OwnerVehicleProfile/components/ReportsSection.tsx` lines 140-179

**Problem:**
- Date extraction from ISO string might have timezone issues
- Comparing UTC dates might not match user's local timezone expectations
- "Today" and "Yesterday" labels might be incorrect

**Impact:** MEDIUM - Trips might be grouped under wrong dates

**Fix:** Use consistent timezone (Africa/Lagos) for date grouping

---

#### 5. **Missing Import: useState**
**Location:** `src/pages/owner/OwnerVehicleProfile/components/ReportsSection.tsx` line 75

**Problem:**
Uses `useState` but might not be imported

**Impact:** LOW - Code might not compile

**Fix:** Verify imports

---

#### 6. **Limit Might Be Too Restrictive**
**Location:** `src/hooks/useVehicleProfile.ts` line 112

**Problem:**
Default limit of 200 might not be enough for devices with many trips

**Impact:** LOW - Some trips might not be shown

**Fix:** Consider increasing limit or implementing pagination

---

## Fixes to Implement

1. ✅ Remove auto-filtering to last 24 hours
2. ✅ Improve date range filtering
3. ✅ Enhance distance calculation
4. ✅ Fix timezone handling in date grouping
5. ✅ Verify all imports
6. ✅ Add better error handling
