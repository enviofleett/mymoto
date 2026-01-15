# Localhost Testing Setup Guide

## Quick Start

### 1. Install Dependencies (if needed)
```bash
npm install
```

### 2. Start Development Server
```bash
npm run dev
```

### 3. Access Application
Once the server starts, you'll see output like:
```
  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:8080/
  ➜  Network: http://[your-ip]:8080/
```

**Your localhost URL:** `http://localhost:8080`

---

## Server Configuration

The development server is configured in `vite.config.ts`:
- **Port:** 8080
- **Host:** `::` (all interfaces - accessible from network)
- **Hot Module Replacement:** Enabled
- **PWA Support:** Enabled

---

## Testing Features

### 1. Authentication
- Navigate to: `http://localhost:8080/auth`
- Sign in with your credentials

### 2. Admin Features
- **Privacy & Security Terms:** `http://localhost:8080/admin/privacy-settings`
- **AI Settings:** `http://localhost:8080/admin/ai-settings`
- **Notification Settings:** Available in vehicle profile

### 3. Owner Features
- **Owner Dashboard:** `http://localhost:8080/owner`
- **Vehicle Profile:** `http://localhost:8080/owner/vehicle/[deviceId]`
- **Notifications:** `http://localhost:8080/owner/notifications`

### 4. New Features to Test

#### Privacy & Security Terms
1. Sign in as admin
2. Go to "Privacy & Terms" in admin menu
3. Edit terms content
4. Save new version
5. Sign out and sign in as new user
6. Verify terms agreement dialog appears

#### Vehicle Notification Settings
1. Sign in as owner
2. Go to vehicle profile
3. Click "Notifications" tab
4. Toggle notification preferences
5. Verify settings save correctly

#### Proactive AI Conversations
1. Enable notification preferences for a vehicle
2. Trigger an event (e.g., low battery, ignition on)
3. Verify AI chat message appears
4. Check morning briefing (if enabled)

---

## Environment Variables

Make sure your `.env` file (if needed) is configured with:
- `VITE_SUPABASE_URL` - Your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Your Supabase anon key

---

## Troubleshooting

### Port Already in Use
If port 8080 is already in use:
```bash
# Kill process on port 8080
lsof -ti:8080 | xargs kill -9

# Or change port in vite.config.ts
```

### Dependencies Not Installing
```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Build Errors
```bash
# Clear Vite cache
rm -rf node_modules/.vite

# Restart dev server
npm run dev
```

---

## Network Access

The server is configured to be accessible from your local network:
- **Local:** `http://localhost:8080`
- **Network:** `http://[your-local-ip]:8080`

To find your local IP:
```bash
# macOS/Linux
ifconfig | grep "inet " | grep -v 127.0.0.1

# Or
ipconfig getifaddr en0  # macOS
```

---

## Development Tips

1. **Hot Reload:** Changes to files automatically reload the browser
2. **Console Logs:** Check browser console for debugging
3. **Network Tab:** Monitor API calls to Supabase
4. **React DevTools:** Install browser extension for React debugging

---

## Production Build

To test production build locally:
```bash
npm run build
npm run preview
```

This will build and serve the production version on a different port.

---

**Ready to test!** 🚀
