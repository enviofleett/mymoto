# PWA Production Fix Guide
**Quick Reference Guide for Production Deployment**

## 🚀 Quick Start: Run Cleanup Script

```bash
# Run the automated cleanup script
./scripts/cleanup-production.sh
```

This will:
- ✅ Remove all debug instrumentation blocks
- ✅ Remove debug fetch calls
- ✅ Clean service worker logs
- ✅ Report remaining issues

---

## 📋 Manual Fixes Required

### 1. Fix Hardcoded Password Hash (CRITICAL)

**File:** `supabase/functions/gps51-user-auth/index.ts`

**Current (Line 44):**
```typescript
const passwordHash = "c870255d7bfd5f284e12c61bbefe8fa9";
```

**Fix:**
```typescript
const GPS_PASSWORD = Deno.env.get('GPS_PASSWORD');
if (!GPS_PASSWORD) {
  throw new Error('GPS_PASSWORD environment variable not configured');
}
const passwordHash = await md5(GPS_PASSWORD);
```

**Action:** Update the function and set `GPS_PASSWORD` in Supabase Edge Function secrets.

---

### 2. Gate Console Logs (HIGH PRIORITY)

**Pattern to find:** All `console.log` statements without environment checks

**Fix Pattern:**
```typescript
// Before:
console.log('[Component] Debug info:', data);

// After:
if (import.meta.env.DEV) {
  console.log('[Component] Debug info:', data);
}
```

**Files to prioritize:**
- `src/hooks/useOwnerVehicles.ts` (20+ logs)
- `src/components/notifications/GlobalAlertListener.tsx` (9+ logs)
- `src/hooks/useFleetData.ts` (6+ logs)
- `public/sw-custom.js` (15+ logs - remove all)

---

### 3. Standardize Version Numbers

**Files to update:**
- `package.json`: `"version": "1.3.0"` (currently 1.1.0)
- `index.html`: `<meta name="build-version" content="1.3.0">` (currently 1.1.0)

**Action:** Update both to match `main.tsx` APP_VERSION (1.3.0)

---

## ✅ Already Fixed

1. ✅ **ErrorBoundary added to App.tsx** - Global error handling now active
2. ✅ **Cleanup script created** - Automated removal of debug code

---

## 🧪 Pre-Deployment Checklist

Run these commands before deploying:

```bash
# 1. Run cleanup script
./scripts/cleanup-production.sh

# 2. Verify no debug code remains
grep -r "#region agent log" src
grep -r "127.0.0.1:7242" src

# 3. Build production bundle
npm run build

# 4. Test production build locally
npm run preview

# 5. Check bundle sizes
ls -lh dist/assets/*.js

# 6. Verify no console errors
# Open browser console and check for errors
```

---

## 🔍 Verification Steps

After fixes, verify:

1. **No Debug Code:**
   ```bash
   grep -r "agent log" src
   grep -r "127.0.0.1:7242" src
   # Should return no results
   ```

2. **Console Logs Gated:**
   ```bash
   grep -r "console.log" src | grep -v "import.meta.env.DEV"
   # Should return minimal results (only essential logs)
   ```

3. **Error Boundary Active:**
   - Open browser DevTools
   - Intentionally break a component
   - Verify ErrorBoundary catches and displays error

4. **Service Worker Clean:**
   ```bash
   grep "console.log" public/sw-custom.js
   # Should return no results (only console.error allowed)
   ```

---

## 📊 Expected Results

After cleanup:
- **Debug instrumentation:** 0 instances
- **Debug fetch calls:** 0 instances  
- **Console.log statements:** < 50 (all gated with DEV check)
- **Service worker logs:** 0 console.log (only errors)

---

## 🚨 Critical Security Fix

**Priority:** Fix immediately before any deployment

The hardcoded password hash in `gps51-user-auth` function must be moved to environment variables. This is a security vulnerability.

---

## 📝 Notes

- The cleanup script is safe to run multiple times
- Always test after running cleanup
- Keep a backup before running cleanup script
- Review changes in git before committing

---

## 🆘 If Something Breaks

If the cleanup script breaks something:

1. **Revert changes:**
   ```bash
   git checkout -- src/
   git checkout -- public/sw-custom.js
   ```

2. **Manual cleanup:** Use the patterns in the audit report to remove specific blocks

3. **Test incrementally:** Clean one file at a time and test
