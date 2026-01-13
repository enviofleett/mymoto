# Testing and Deployment Guide

## 🧪 Part 1: Testing Locally

### Step 1: Install Dependencies
```bash
cd /Users/alli/mymoto/fleet-heartbeat-dashboard-6f37655e
npm install
```

### Step 2: Set Up Environment Variables
Create a `.env` file in the root directory (if not already exists):
```bash
VITE_SUPABASE_URL=https://cmvpnsqiefbsqkwnraka.supabase.co
VITE_SUPABASE_PROJECT_ID=cmvpnsqiefbsqkwnraka
VITE_SUPABASE_PUBLISHABLE_KEY=your_publishable_key_here
```

### Step 3: Start Development Server
```bash
npm run dev
```

The app will be available at: **http://localhost:8080**

### Step 4: Test the Vehicle Profile Page Fixes

1. **Navigate to a vehicle profile page:**
   - Login to the app
   - Go to `/owner/vehicles`
   - Click on any vehicle to open its profile

2. **Test Critical Fixes:**
   - ✅ **Null Check:** Try accessing `/owner/vehicle-profile/invalid-id` - should show "Vehicle not found" instead of crashing
   - ✅ **Error Handling:** Disconnect internet temporarily - should show error message with retry button
   - ✅ **Status Detection:** Check if "charging" status appears when vehicle is charging
   - ✅ **Loading States:** Page should show skeleton loaders during initial load
   - ✅ **Pull-to-Refresh:** Pull down on the page - should refresh without errors

3. **Test Edge Cases:**
   - Vehicle with no GPS data
   - Vehicle with no trips
   - Vehicle with no battery data
   - Slow network connection

### Step 5: Build for Production (Test Build)
```bash
npm run build
```

This creates a `dist/` folder with production-ready files. Test the build:
```bash
npm run preview
```

---

## 🚀 Part 2: Deploy to Live Environment

### Option A: Deploy via Lovable (Recommended - Easiest)

1. **Go to Lovable Dashboard:**
   - Visit: https://lovable.dev/projects/YOUR_PROJECT_ID
   - Or check your README.md for the project URL

2. **Publish:**
   - Click on **"Share"** → **"Publish"**
   - Lovable will automatically build and deploy your app
   - Your app will be live at: `https://your-project.lovable.app`

3. **Custom Domain (Optional):**
   - Go to **Project > Settings > Domains**
   - Click **"Connect Domain"**
   - Follow the DNS setup instructions

---

### Option B: Deploy to Vercel (Popular Choice)

1. **Install Vercel CLI:**
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel:**
   ```bash
   vercel login
   ```

3. **Deploy:**
   ```bash
   vercel --prod
   ```

4. **Set Environment Variables:**
   - Go to Vercel Dashboard → Your Project → Settings → Environment Variables
   - Add:
     - `VITE_SUPABASE_URL`
     - `VITE_SUPABASE_PROJECT_ID`
     - `VITE_SUPABASE_PUBLISHABLE_KEY`

5. **Redeploy after adding env vars:**
   ```bash
   vercel --prod
   ```

---

### Option C: Deploy to Netlify

1. **Install Netlify CLI:**
   ```bash
   npm install -g netlify-cli
   ```

2. **Login:**
   ```bash
   netlify login
   ```

3. **Deploy:**
   ```bash
   # Build first
   npm run build

   # Deploy
   netlify deploy --prod --dir=dist
   ```

4. **Set Environment Variables:**
   - Go to Netlify Dashboard → Site Settings → Environment Variables
   - Add your Supabase environment variables

---

### Option D: Deploy to Any Static Hosting

1. **Build the app:**
   ```bash
   npm run build
   ```

2. **Upload `dist/` folder to your hosting:**
   - **GitHub Pages:** Push `dist/` to `gh-pages` branch
   - **AWS S3:** Upload `dist/` contents to S3 bucket
   - **DigitalOcean App Platform:** Connect GitHub repo, set build command: `npm run build`, output: `dist`
   - **Any static host:** Upload `dist/` folder contents

3. **Set Environment Variables:**
   - Configure your hosting platform to set:
     - `VITE_SUPABASE_URL`
     - `VITE_SUPABASE_PROJECT_ID`
     - `VITE_SUPABASE_PUBLISHABLE_KEY`

---

## 🔍 Part 3: Verify Deployment

### 1. Check Build Output
```bash
npm run build
# Check that dist/ folder is created
ls -la dist/
```

### 2. Test Production Build Locally
```bash
npm run preview
# Visit http://localhost:4173
```

### 3. Verify Environment Variables
After deployment, check that your live app can connect to Supabase:
- Open browser console on live site
- Check for any Supabase connection errors
- Verify API calls are working

### 4. Test Vehicle Profile Page on Live Site
- Navigate to a vehicle profile
- Test all the fixes we implemented
- Check browser console for errors

---

## 📋 Pre-Deployment Checklist

Before pushing to production, verify:

- [ ] All tests pass locally (`npm run dev` works)
- [ ] Production build succeeds (`npm run build` works)
- [ ] No console errors in browser
- [ ] Environment variables are set correctly
- [ ] Vehicle profile page loads without errors
- [ ] Error handling displays properly
- [ ] Loading states work correctly
- [ ] Pull-to-refresh works
- [ ] Status detection works (online/offline/charging)

---

## 🐛 Troubleshooting

### Build Fails
```bash
# Clear cache and rebuild
rm -rf node_modules dist
npm install
npm run build
```

### Environment Variables Not Working
- Make sure variables start with `VITE_` prefix
- Restart dev server after changing `.env`
- For production, set variables in hosting platform

### Deployment Fails
- Check build logs for errors
- Verify all dependencies are in `package.json`
- Ensure Node.js version matches (check `package.json` engines if specified)

---

## 🔄 Continuous Deployment Setup

### GitHub Actions (Auto-deploy on push)

Create `.github/workflows/deploy.yml`:
```yaml
name: Deploy to Production

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm run build
      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v20
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.ORG_ID }}
          vercel-project-id: ${{ secrets.PROJECT_ID }}
```

---

## 📞 Need Help?

- **Lovable Support:** Check Lovable dashboard for support
- **Vercel Docs:** https://vercel.com/docs
- **Netlify Docs:** https://docs.netlify.com

---

**Last Updated:** After vehicle profile page critical fixes (commit 31aa831)
