# Local Testing Guide

## 🚀 Quick Start - Test on Localhost

### Step 1: Install Dependencies (if not already done)
```bash
cd /Users/alli/mymoto/fleet-heartbeat-dashboard-6f37655e
npm install
```

### Step 2: Start Development Server
```bash
npm run dev
```

You should see output like:
```
  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:8080/
  ➜  Network: use --host to expose
```

### Step 3: Open in Browser
Open your browser and go to:
**http://localhost:8080**

---

## 🧪 Testing the Vehicle Profile Page Fixes

### Test 1: Normal Vehicle Profile (Happy Path)
1. **Login** to the application
2. Navigate to **Vehicles** page (`/owner/vehicles`)
3. **Click on any vehicle** to open its profile
4. **Verify:**
   - ✅ Page loads without errors
   - ✅ Shows vehicle information
   - ✅ Map displays (if GPS data available)
   - ✅ Status shows correctly (online/offline/charging)
   - ✅ All sections load (Mileage, Reports, etc.)

### Test 2: Invalid Vehicle ID (Error Handling)
1. **Manually navigate** to an invalid vehicle ID:
   ```
   http://localhost:8080/owner/vehicle-profile/invalid-id-12345
   ```
2. **Verify:**
   - ✅ Shows "Vehicle not found" message
   - ✅ Shows "Back to Vehicles" button
   - ✅ **Does NOT crash** or show blank screen
   - ✅ No console errors

### Test 3: Loading States
1. **Open browser DevTools** (F12 or Cmd+Option+I)
2. Go to **Network** tab
3. Set throttling to **Slow 3G** (to simulate slow connection)
4. Navigate to a vehicle profile
5. **Verify:**
   - ✅ Shows skeleton loaders during initial load
   - ✅ Smooth transition when data loads
   - ✅ No layout shifts

### Test 4: Pull-to-Refresh
1. Navigate to a vehicle profile
2. **Pull down** on the page (or scroll to top and pull)
3. **Verify:**
   - ✅ Shows refresh indicator
   - ✅ Data refreshes without errors
   - ✅ No console errors
   - ✅ All sections update correctly

### Test 5: Error Handling (Network Failure)
1. **Open browser DevTools** → **Network** tab
2. Select **Offline** mode (or disconnect internet)
3. Navigate to a vehicle profile
4. **Verify:**
   - ✅ Shows error message: "Failed to load vehicle data"
   - ✅ Shows "Retry" button
   - ✅ Clicking retry attempts to reload
   - ✅ No blank screen or crash

### Test 6: Status Detection (Charging)
1. Navigate to a vehicle profile
2. **Check the status indicator:**
   - If vehicle is online with ignition off and battery present → should show "charging"
   - If vehicle is online with ignition on → should show "online"
   - If vehicle is offline → should show "offline"
3. **Verify:**
   - ✅ Status badge shows correct state
   - ✅ Status icon matches the state

### Test 7: Console Errors Check
1. **Open browser DevTools** → **Console** tab
2. Navigate through the app
3. **Verify:**
   - ✅ No red error messages
   - ✅ No warnings about missing data
   - ✅ Only expected logs (if any)

---

## 🔍 Browser DevTools Tips

### Open DevTools:
- **Chrome/Edge:** `F12` or `Cmd+Option+I` (Mac) / `Ctrl+Shift+I` (Windows)
- **Firefox:** `F12` or `Cmd+Option+I` (Mac) / `Ctrl+Shift+I` (Windows)
- **Safari:** Enable Developer menu first, then `Cmd+Option+I`

### Useful Tabs:
- **Console:** See errors and logs
- **Network:** Monitor API calls and loading times
- **Elements/Inspector:** Check HTML structure
- **React DevTools:** Install extension to debug React components

---

## 🐛 Troubleshooting

### Port Already in Use
If port 8080 is busy:
```bash
# Kill process on port 8080
lsof -ti:8080 | xargs kill -9

# Or use a different port
npm run dev -- --port 3000
```

### Dependencies Not Installed
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Environment Variables Missing
Check `.env` file exists and has:
```
VITE_SUPABASE_URL=https://cmvpnsqiefbsqkwnraka.supabase.co
VITE_SUPABASE_PROJECT_ID=cmvpnsqiefbsqkwnraka
VITE_SUPABASE_PUBLISHABLE_KEY=your_key_here
```

### Hot Reload Not Working
- Save the file again
- Check browser console for errors
- Try hard refresh: `Cmd+Shift+R` (Mac) / `Ctrl+Shift+R` (Windows)

---

## ✅ Testing Checklist

Before deploying to production, verify:

- [ ] App starts without errors (`npm run dev`)
- [ ] Can login successfully
- [ ] Vehicle list loads
- [ ] Vehicle profile page loads for valid vehicles
- [ ] Invalid vehicle ID shows error (not crash)
- [ ] Loading states work correctly
- [ ] Pull-to-refresh works
- [ ] Error handling displays properly
- [ ] Status detection works (online/offline/charging)
- [ ] No console errors
- [ ] All sections display correctly
- [ ] Map loads (if GPS data available)
- [ ] Charts render properly
- [ ] Navigation works smoothly

---

## 🎯 Quick Test Commands

```bash
# Start dev server
npm run dev

# Build for production (test build)
npm run build

# Preview production build
npm run preview

# Check for linting errors
npm run lint
```

---

**Happy Testing! 🚀**
