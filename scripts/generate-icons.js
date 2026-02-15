#!/usr/bin/env node

/**
 * Icon Generator Script
 * Generates PWA icons and favicon from source logo
 * 
 * Usage:
 *   1. Install sharp: npm install --save-dev sharp
 *   2. Place your logo as: public/logo-source.png (or update SOURCE_PATH)
 *   3. Run: node scripts/generate-icons.js
 */

import sharp from 'sharp';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const publicDir = join(rootDir, 'public');

// Source logo path - update this to your logo file
const SOURCE_PATH = join(publicDir, 'mymoto-logo-new.png');

// Output paths
const OUTPUTS = {
  'pwa-192x192.png': { size: 192, format: 'png' },
  'pwa-512x512.png': { size: 512, format: 'png' },
  'apple-touch-icon.png': { size: 180, format: 'png' },
};

async function generateIcons() {
  console.log('🎨 Generating PWA icons and favicon...\n');

  // Check if source file exists
  if (!existsSync(SOURCE_PATH)) {
    console.error(`❌ Source logo not found at: ${SOURCE_PATH}`);
    console.error('   Please update SOURCE_PATH in the script or place your logo there.');
    process.exit(1);
  }

  try {
    // Generate PNG icons
    for (const [filename, config] of Object.entries(OUTPUTS)) {
      const outputPath = join(publicDir, filename);
      
      console.log(`📦 Generating ${filename} (${config.size}x${config.size})...`);
      
      // Calculate padding to ensure logo is well-fitted (approx 75% of icon size)
      // Slightly larger inner logo with fully transparent background to blend in dark/light modes
      const innerSize = Math.floor(config.size * 0.75);
      const padding = Math.floor((config.size - innerSize) / 2);
      // Handle odd pixel differences
      const paddingBottom = config.size - innerSize - padding;
      const paddingRight = config.size - innerSize - padding;

      await sharp(SOURCE_PATH)
        .resize(innerSize, innerSize, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 } // Transparent background for inner logo
        })
        .extend({
          top: padding,
          bottom: paddingBottom,
          left: padding,
          right: paddingRight,
          background: { r: 0, g: 0, b: 0, alpha: 0 } // Fully transparent container to blend on dark/light
        })
        .png()
        .toFile(outputPath);
      
      console.log(`   ✅ Created: ${outputPath}`);
    }

    // Generate favicon.ico (multi-size ICO)
    console.log('\n📦 Generating favicon.ico...');
    const faviconPath = join(publicDir, 'favicon.ico');
    
    // Generate multiple sizes for ICO
    const faviconSizes = [16, 32, 48];
    const faviconBuffers = await Promise.all(
      faviconSizes.map(size => {
        // For favicons, we use less padding as they are small
        const innerSize = Math.floor(size * 0.85); 
        const padding = Math.floor((size - innerSize) / 2);
        const paddingBottom = size - innerSize - padding;
        const paddingRight = size - innerSize - padding;

        return sharp(SOURCE_PATH)
          .resize(innerSize, innerSize, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 }
          })
          .extend({
            top: padding,
            bottom: paddingBottom,
            left: padding,
            right: paddingRight,
            background: { r: 0, g: 0, b: 0, alpha: 0 }
          })
          .png()
          .toBuffer();
      })
    );

    // Note: sharp doesn't support ICO directly, so we'll create a PNG favicon
    // For true ICO, use an online converter or ImageMagick
    await sharp(faviconBuffers[1]) // Use 32x32 for favicon
      .png()
      .toFile(join(publicDir, 'favicon.png'));
    
    console.log(`   ✅ Created: ${join(publicDir, 'favicon.png')}`);
    console.log(`   ⚠️  Note: For true .ico file, convert favicon.png using:`);
    console.log(`      https://favicon.io/favicon-converter/`);

    console.log('\n✨ Icon generation complete!');
    console.log('\n📝 Next steps:');
    console.log('   1. Convert favicon.png to favicon.ico using: https://favicon.io/favicon-converter/');
    console.log('   2. Replace public/favicon.ico with the generated file');
    console.log('   3. Clear browser cache and rebuild: npm run build');
    console.log('   4. Test icons in browser and PWA installation\n');

  } catch (error) {
    console.error('❌ Error generating icons:', error);
    process.exit(1);
  }
}

generateIcons();
