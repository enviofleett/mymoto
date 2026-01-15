# Push to Lovable AI - Complete Guide

## How Lovable AI Works

Lovable AI automatically syncs with your GitHub repository. When you push to GitHub, Lovable automatically pulls the changes.

**Workflow:**
1. Push to GitHub → Lovable syncs automatically
2. Open Lovable → See your changes
3. Click "Publish" in Lovable → Deploy to production

---

## Step 1: Push to GitHub (Lovable Will Auto-Sync)

### Generate GitHub Token
1. Go to: https://github.com/settings/tokens
2. Click **"Generate new token"** → **"Generate new token (classic)"**
3. Name: `Fleet Dashboard Push`
4. Scopes: ✅ **repo**
5. Click **Generate token** and **COPY IT**

### Push Command
```bash
git push origin main
```

**When prompted:**
- Username: `toolbuxdev`
- Password: Your Personal Access Token

---

## Step 2: Access Your Lovable Project

### Find Your Lovable Project URL

Your project URL should be in the format:
```
https://lovable.dev/projects/YOUR_PROJECT_ID
```

**To find it:**
1. Check your email for Lovable project creation notification
2. Check Lovable dashboard: https://lovable.dev
3. Look in your browser history for Lovable project URLs

### Or Check README.md
The README mentions:
```
URL: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID
```

**If you don't know your project ID:**
1. Go to https://lovable.dev
2. Sign in
3. Find your "Fleet Heartbeat Dashboard" project
4. Copy the project ID from the URL

---

## Step 3: Verify Sync in Lovable

After pushing to GitHub:

1. **Wait 1-2 minutes** for Lovable to sync
2. **Open your Lovable project:**
   - Go to: `https://lovable.dev/projects/YOUR_PROJECT_ID`
3. **Check for updates:**
   - Lovable should show your latest commits
   - Files should reflect your changes

---

## Step 4: Publish from Lovable

### Publish Steps

1. **Open Lovable Project:**
   - Go to your project URL
   - Wait for sync to complete

2. **Click "Share" Button:**
   - Usually in the top-right corner
   - Or in the project menu

3. **Click "Publish":**
   - Lovable will build your app
   - Deploy to production
   - Give you a live URL

4. **Your App Will Be Live At:**
   - `https://your-project.lovable.app`
   - Or your custom domain if configured

---

## Alternative: Direct Git Push to Lovable (If Available)

If Lovable provides a direct Git remote, you can add it:

```bash
# Check if Lovable remote exists
git remote -v

# If Lovable provides a Git URL, add it:
git remote add lovable https://git.lovable.dev/YOUR_PROJECT_ID.git

# Then push to both:
git push origin main    # GitHub
git push lovable main  # Lovable (if available)
```

**Note:** Most Lovable projects sync from GitHub automatically, so this may not be necessary.

---

## Troubleshooting

### Lovable Not Syncing
1. **Check GitHub push was successful:**
   ```bash
   git log origin/main -1
   ```

2. **Wait a few minutes** - Sync can take 1-5 minutes

3. **Refresh Lovable project page**

4. **Check Lovable dashboard** for sync status

### Can't Find Lovable Project
1. Go to https://lovable.dev
2. Sign in with your account
3. Check "My Projects" section
4. Look for "Fleet Heartbeat Dashboard" or similar name

### Publish Button Not Working
1. Ensure all changes are pushed to GitHub
2. Wait for Lovable to finish syncing
3. Check for build errors in Lovable
4. Verify environment variables are set in Lovable

---

## Quick Workflow

```bash
# 1. Push to GitHub
git push origin main

# 2. Wait 1-2 minutes

# 3. Open Lovable: https://lovable.dev/projects/YOUR_PROJECT_ID

# 4. Click "Share" → "Publish"

# 5. Your app is live! 🎉
```

---

## Environment Variables in Lovable

When publishing from Lovable, make sure these are set:

1. **Go to Lovable Project Settings**
2. **Find "Environment Variables" or "Secrets"**
3. **Add:**
   - `VITE_SUPABASE_URL` = Your Supabase URL
   - `VITE_SUPABASE_ANON_KEY` = Your Supabase anon key

---

## Current Status

✅ **24 commits ready to push**
✅ **GitHub remote configured**
✅ **Ready to sync to Lovable**

**Next:** Push to GitHub, then publish from Lovable!

---

## Need Help?

- **Lovable Support:** Check Lovable dashboard help section
- **Lovable Docs:** https://docs.lovable.dev
- **GitHub Sync:** Lovable automatically syncs from GitHub

---

**Ready!** Push to GitHub first, then publish from Lovable. 🚀
