# Open Localhost Browser - Quick Guide

## 🚀 Quick Start

### Option 1: Using npm script (Recommended)
```bash
# Start server and open homepage
npm run dev:open

# Start server and open specific vehicle profile
npm run dev:vehicle
```

### Option 2: Using shell script
```bash
# Open homepage
./scripts/start-and-open.sh

# Open specific path
./scripts/start-and-open.sh /owner/vehicle/358657105966092
```

### Option 3: Using Node.js script
```bash
# Open homepage
node scripts/open-localhost.js

# Open specific path
node scripts/open-localhost.js /owner/vehicle/358657105966092
```

---

## 📋 What It Does

1. **Checks if server is running** on `http://localhost:8081`
2. **If running:** Opens browser immediately
3. **If not running:**
   - Starts dev server (`npm run dev`)
   - Waits for server to be ready (max 30 seconds)
   - Opens browser automatically
   - Shows server logs in terminal

---

## 🌐 Default URLs

- **Homepage:** `http://localhost:8081/`
- **Vehicle Profile:** `http://localhost:8081/owner/vehicle/358657105966092`
- **Settings:** `http://localhost:8081/owner/settings`

---

## 🛑 Stopping the Server

- **Press `Ctrl+C`** in the terminal where server is running
- Or find the process: `lsof -ti:8081 | xargs kill`

---

## 🔧 Troubleshooting

### Port Already in Use
If port 8081 is busy, Vite will automatically try the next available port. Check the terminal output for the actual port.

### Browser Doesn't Open
- **macOS:** Uses `open` command
- **Linux:** Uses `xdg-open` command  
- **Windows:** Uses `start` command

If auto-open fails, manually navigate to the URL shown in the terminal.

### Server Takes Too Long
- Check if another process is using the port
- Check terminal for error messages
- Try: `npm run dev` manually to see full output

---

## 📝 Examples

```bash
# Open homepage
npm run dev:open

# Open vehicle profile
npm run dev:vehicle

# Open custom path
./scripts/start-and-open.sh /owner/settings
./scripts/start-and-open.sh /admin/dashboard
```

---

**Ready to test!** 🎯
