# GitHub Setup Guide for Repository Push

## Current Status
- **Repository:** `https://github.com/toolbuxdev/fleet-heartbeat-dashboard-6f37655e.git`
- **Branch:** `main`
- **Issue:** SSL certificate verification errors when pushing

---

## Method 1: Personal Access Token (Recommended)

### Step 1: Generate GitHub Personal Access Token

1. Go to GitHub.com and sign in
2. Click your profile picture → **Settings**
3. Scroll down to **Developer settings** (bottom left)
4. Click **Personal access tokens** → **Tokens (classic)**
5. Click **Generate new token** → **Generate new token (classic)**
6. Give it a name: `Fleet Dashboard Push`
7. Set expiration: Choose your preference (90 days, 1 year, or no expiration)
8. Select scopes:
   - ✅ **repo** (Full control of private repositories)
     - This includes: repo:status, repo_deployment, public_repo, repo:invite, security_events
9. Click **Generate token**
10. **COPY THE TOKEN IMMEDIATELY** (you won't see it again!)

### Step 2: Configure Git Credentials

#### Option A: Use Token in URL (One-time)
```bash
# Update remote URL to include token
git remote set-url origin https://YOUR_TOKEN@github.com/toolbuxdev/fleet-heartbeat-dashboard-6f37655e.git

# Replace YOUR_TOKEN with your actual token
```

#### Option B: Use Git Credential Helper (Recommended)
```bash
# Configure credential helper to store token
git config --global credential.helper store

# On next push, enter:
# Username: toolbuxdev
# Password: YOUR_TOKEN (paste the token, not your GitHub password)
```

#### Option C: Use GitHub CLI (Best for long-term)
```bash
# Install GitHub CLI (if not installed)
# macOS: brew install gh
# Then authenticate:
gh auth login

# Follow prompts:
# - GitHub.com
# - HTTPS
# - Authenticate Git with your GitHub credentials
# - Login with a web browser
```

---

## Method 2: SSH Key (Alternative)

### Step 1: Generate SSH Key
```bash
# Generate new SSH key
ssh-keygen -t ed25519 -C "your_email@example.com"

# Press Enter to accept default file location
# Enter passphrase (optional but recommended)
```

### Step 2: Add SSH Key to GitHub
```bash
# Copy your public key
cat ~/.ssh/id_ed25519.pub

# Copy the entire output
```

1. Go to GitHub.com → Settings → **SSH and GPG keys**
2. Click **New SSH key**
3. Title: `MacBook - Fleet Dashboard`
4. Key: Paste your public key
5. Click **Add SSH key**

### Step 3: Update Remote URL
```bash
# Change remote from HTTPS to SSH
git remote set-url origin git@github.com:toolbuxdev/fleet-heartbeat-dashboard-6f37655e.git

# Test connection
ssh -T git@github.com
# Should see: "Hi toolbuxdev! You've successfully authenticated..."
```

---

## Method 3: Fix SSL Certificate Issue (Quick Fix)

If you just want to push without fixing certificates:

```bash
# Disable SSL verification for this repository only
git config http.sslVerify false

# Or globally (not recommended)
git config --global http.sslVerify false
```

**⚠️ Warning:** This is less secure but works if you're having certificate issues.

---

## Step-by-Step: Complete Setup (Recommended)

### 1. Set Git User Information
```bash
git config --global user.name "Your Name"
git config --global user.email "your_email@example.com"
```

### 2. Choose Authentication Method

**For Personal Access Token:**
```bash
# Update remote URL
git remote set-url origin https://github.com/toolbuxdev/fleet-heartbeat-dashboard-6f37655e.git

# Configure credential helper
git config --global credential.helper osxkeychain  # macOS
# OR
git config --global credential.helper store        # Linux/Windows
```

**For SSH:**
```bash
# Generate SSH key (if you don't have one)
ssh-keygen -t ed25519 -C "your_email@example.com"

# Add to GitHub (copy public key)
cat ~/.ssh/id_ed25519.pub

# Update remote
git remote set-url origin git@github.com:toolbuxdev/fleet-heartbeat-dashboard-6f37655e.git
```

### 3. Test Connection
```bash
# For HTTPS with token
git ls-remote origin

# For SSH
ssh -T git@github.com
```

### 4. Push Your Changes
```bash
# Check status
git status

# Add all changes (if needed)
git add -A

# Commit (if needed)
git commit -m "Your commit message"

# Push to repository
git push origin main
```

---

## Troubleshooting

### Issue: "Permission denied (publickey)"
**Solution:** Use Personal Access Token method instead, or ensure SSH key is added to GitHub.

### Issue: "SSL certificate problem"
**Solution:** 
```bash
# Update CA certificates (macOS)
brew install ca-certificates

# Or disable SSL verification (temporary)
git config http.sslVerify false
```

### Issue: "Authentication failed"
**Solution:**
1. Verify your token has `repo` scope
2. Check if token has expired
3. Regenerate token if needed

### Issue: "Remote origin already exists"
**Solution:**
```bash
# Remove existing remote
git remote remove origin

# Add new remote
git remote add origin https://github.com/toolbuxdev/fleet-heartbeat-dashboard-6f37655e.git
```

---

## Quick Setup Script

Save this as `setup-github.sh` and run it:

```bash
#!/bin/bash

# Set your GitHub username and token
GITHUB_USER="toolbuxdev"
GITHUB_TOKEN="YOUR_TOKEN_HERE"  # Replace with your actual token
REPO_URL="fleet-heartbeat-dashboard-6f37655e"

# Configure Git user (update with your info)
git config --global user.name "Your Name"
git config --global user.email "your_email@example.com"

# Set remote URL with token
git remote set-url origin https://${GITHUB_TOKEN}@github.com/${GITHUB_USER}/${REPO_URL}.git

# Configure credential helper
git config --global credential.helper store

# Test connection
echo "Testing connection..."
git ls-remote origin

echo "Setup complete! You can now push with: git push origin main"
```

**To use:**
```bash
chmod +x setup-github.sh
./setup-github.sh
```

---

## Security Best Practices

1. **Never commit tokens to repository**
   - Use `.gitignore` to exclude files with tokens
   - Use environment variables for sensitive data

2. **Use token with minimal permissions**
   - Only grant `repo` scope if needed
   - Set expiration dates

3. **Rotate tokens regularly**
   - Generate new tokens every 90 days
   - Revoke old tokens

4. **Use SSH keys for better security**
   - More secure than tokens
   - Can be password-protected

---

## Verify Setup

After configuration, verify everything works:

```bash
# Check remote URL
git remote -v

# Check git config
git config --list | grep -E "user\.|remote\."

# Test connection
git fetch origin

# Push test (if you have commits)
git push origin main
```

---

## Current Repository Status

Your repository is configured as:
- **Remote:** `origin`
- **URL:** `https://github.com/toolbuxdev/fleet-heartbeat-dashboard-6f37655e.git`
- **Branch:** `main`
- **Status:** 21 commits ahead of origin (ready to push)

---

## Next Steps

1. **Choose authentication method** (Token recommended for beginners)
2. **Generate Personal Access Token** (if using token method)
3. **Configure Git credentials**
4. **Test connection**
5. **Push your commits**

**Ready to push?** Run:
```bash
git push origin main
```

If prompted for credentials:
- **Username:** `toolbuxdev`
- **Password:** Your Personal Access Token (not your GitHub password)

---

**Need help?** Check GitHub documentation:
- [Creating a personal access token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token)
- [Setting up SSH keys](https://docs.github.com/en/authentication/connecting-to-github-with-ssh)
