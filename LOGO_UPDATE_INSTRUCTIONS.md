# Logo Update Instructions

## Overview

This document explains how to update the MyMoto logo across all PWA touchpoints:
- Favicon (browser tab icon)
- PWA App Icons (installable app icons)
- Apple Touch Icon (iOS home screen)
- Splash Screen (app startup screen)

---

## Image Files That Need to Be Replaced

You need to create the following image files from your new logo (car with smile):

### 1. Favicon (`public/favicon.ico`)
- **Size:** 32x32 pixels (16x16, 32x32, 48x48 multi-size ICO file preferred)
- **Format:** `.ico` (multi-size ICO file) or `.png`
- **Usage:** Browser tab icon, bookmarks
- **Location:** `public/favicon.ico`

### 2. PWA Icon 192x192 (`public/pwa-192x192.png`)
- **Size:** 192x192 pixels (square)
- **Format:** PNG with transparency
- **Usage:** PWA manifest icon, Android home screen
- **Location:** `public/pwa-192x192.png`

### 3. PWA Icon 512x512 (`public/pwa-512x512.png`)
- **Size:** 512x512 pixels (square)
- **Format:** PNG with transparency
- **Usage:** PWA manifest icon, high-res Android icons, splash screens
- **Location:** `public/pwa-512x512.png`

### 4. Apple Touch Icon (`public/apple-touch-icon.png`)
- **Size:** 180x180 pixels (square)
- **Format:** PNG (no transparency needed - iOS adds rounded corners)
- **Usage:** iOS home screen icon, Safari bookmark icon
- **Location:** `public/apple-touch-icon.png`

### 5. Splash Screen Logo (`src/assets/mymoto-logo-new.png`)
- **Size:** Recommended 256x256 pixels or larger (square)
- **Format:** PNG with transparency
- **Usage:** In-app splash screen component
- **Location:** `src/assets/mymoto-logo-new.png`

---

## Design Guidelines

### Logo Requirements:

1. **Square Format:**
   - All icons should be square (1:1 aspect ratio)
   - Center the logo within the square
   - Leave appropriate padding around edges (10-15%)

2. **Background:**
   - PWA icons: Transparent or solid background (your choice)
   - Favicon: Can have transparent background or solid color
   - Apple Touch Icon: Solid or transparent (iOS adds white/black rounded corners)

3. **Size Guidelines:**
   - Logo should occupy 60-80% of the icon size
   - Leave padding for safe zone (especially for maskable icons)
   - Ensure logo is clearly visible at small sizes (favicon)

4. **Colors:**
   - Your logo uses white car and orange smile (as described)
   - Ensure good contrast against dark backgrounds (#131618 theme color)
   - Test visibility at small sizes

---

## How to Create the Icons

### Option 1: Online Icon Generator (Recommended)

1. **Favicon.io** (https://favicon.io)
   - Upload your logo PNG
   - Generates favicon.ico and multiple sizes
   - Download and place in `public/` folder

2. **RealFaviconGenerator** (https://realfavicongenerator.net)
   - Upload your logo
   - Generates all icons (favicon, PWA, Apple touch)
   - Provides HTML code snippets

3. **PWA Asset Generator** (https://github.com/elegantapp/pwa-asset-generator)
   - CLI tool for generating PWA assets
   - Creates all required sizes automatically

### Option 2: Manual Creation (Using Design Tools)

Use Photoshop, Figma, GIMP, or similar:

1. Create canvas at required size (e.g., 512x512 for PWA)
2. Center your logo
3. Export as PNG
4. Scale down for smaller sizes (maintain quality)
5. For favicon.ico, use online converter or specialized tool

---

## File Replacement Steps

### Step 1: Prepare Your Logo

1. Start with your highest resolution logo (car with smile)
2. Ensure it's square or create a square version with padding
3. Export as PNG with transparency

### Step 2: Generate Icons

Using one of the tools above, generate:
- `favicon.ico` (32x32 or multi-size)
- `pwa-192x192.png`
- `pwa-512x512.png`
- `apple-touch-icon.png` (180x180)

### Step 3: Replace Files

**Public Folder Files:**
```bash
# Replace these files in public/ folder:
public/favicon.ico
public/pwa-192x192.png
public/pwa-512x512.png
public/apple-touch-icon.png
```

**Assets Folder File:**
```bash
# Replace this file in src/assets/ folder:
src/assets/mymoto-logo-new.png
```

### Step 4: Test

1. **Favicon:**
   - Open app in browser
   - Check browser tab icon
   - Verify bookmarks show correct icon

2. **PWA Icons:**
   - Install PWA on device
   - Check home screen icon appears correctly
   - Verify icon in app switcher

3. **Splash Screen:**
   - Open app on mobile device
   - Verify logo is centered and properly aligned
   - Check on both iOS and Android

4. **Apple Touch Icon:**
   - Add to home screen on iOS device
   - Verify icon appears correctly

---

## Current Configuration

All icon references are already configured in:

1. **`index.html`** (lines 17-18):
   - Favicon link
   - Apple touch icon link
   - PWA manifest link

2. **`vite.config.ts`** (lines 43-60):
   - PWA manifest icons (192x192, 512x512)
   - Maskable icon configuration

3. **`src/components/SplashScreen.tsx`** (line 2):
   - Splash screen logo import
   - Logo alignment fixed (centered with proper padding)

---

## Splash Screen Alignment Fix

The splash screen alignment has been fixed:
- Logo container: `w-32 h-32` (128px) - increased from 112px
- Logo padding: `p-4` (16px padding) - added for better centering
- Logo image: `w-full h-full object-contain object-center` - ensures proper centering
- Container: `flex items-center justify-center` - proper flex centering

This ensures the logo is perfectly centered in the splash screen.

---

## Verification Checklist

After replacing files, verify:

- [ ] Favicon appears in browser tab
- [ ] PWA icon appears when installing app
- [ ] Apple touch icon appears on iOS home screen
- [ ] Splash screen logo is centered
- [ ] All icons are clear and visible at small sizes
- [ ] Logo maintains aspect ratio (not stretched)
- [ ] Colors are correct (white car, orange smile)
- [ ] Icons work on both light and dark backgrounds

---

## Notes

- **Cache Clearing:** After replacing icons, clear browser cache or hard refresh (Ctrl+Shift+R / Cmd+Shift+R)
- **PWA Update:** Users may need to reinstall PWA to see new icons
- **Service Worker:** Icons are cached by service worker - version bump may be needed
- **Testing:** Test on real devices, not just browser emulators

---

## Quick Reference

| File | Size | Location | Used For |
|------|------|----------|----------|
| `favicon.ico` | 32x32 | `public/` | Browser tab, bookmarks |
| `pwa-192x192.png` | 192x192 | `public/` | PWA manifest, Android |
| `pwa-512x512.png` | 512x512 | `public/` | PWA manifest, splash |
| `apple-touch-icon.png` | 180x180 | `public/` | iOS home screen |
| `mymoto-logo-new.png` | 256x256+ | `src/assets/` | In-app splash screen |

---

**Last Updated:** January 20, 2026  
**Status:** Ready for logo replacement
