# How to Start the Development Server

## Quick Start

1. **Open Terminal** in the project directory
2. **Run the dev server:**
   ```bash
   npm run dev
   ```

3. **Wait for the server to start** - You should see:
   ```
   VITE v5.x.x  ready in xxx ms
   
   ➜  Local:   http://localhost:8080/
   ➜  Network: http://0.0.0.0:8080/
   ```

4. **Open your browser** and navigate to:
   - **http://localhost:8080** (recommended)
   - Or **http://127.0.0.1:8080**

## Troubleshooting

### Port Already in Use
If port 8080 is already in use, Vite will automatically try the next available port (8081, 8082, etc.). Check the terminal output for the actual port.

### Server Not Starting
1. **Check for errors** in the terminal
2. **Clear node_modules and reinstall:**
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   npm run dev
   ```

### Browser Not Loading
1. **Check the terminal** for the correct URL
2. **Try a different browser** or clear browser cache
3. **Check firewall settings** if using the network URL

## Configuration

The dev server is configured in `vite.config.ts`:
- **Host:** `0.0.0.0` (listens on all interfaces)
- **Port:** `8080` (default, will try next available if busy)
- **Auto-reload:** Enabled (changes refresh automatically)

## Network Access

If you want to access from other devices on your network:
- Use the **Network URL** shown in the terminal (e.g., `http://192.168.x.x:8080`)
- Make sure your firewall allows connections on port 8080
