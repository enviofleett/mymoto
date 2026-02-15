import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, "public");
const LOGO_PATH = path.join(PUBLIC_DIR, "mymoto-logo-new.png");

const BG = "#131618";
const GLOW = { r: 249, g: 115, b: 22, a: 0.35 };
const VIGNETTE_A = 0.25;

function rgba({ r, g, b, a }) {
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function backgroundSvg(size) {
  // Dark base + radial orange glow (top-right) + subtle vignette.
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <radialGradient id="glow" cx="80%" cy="20%" r="70%">
      <stop offset="0%" stop-color="${rgba(GLOW)}"/>
      <stop offset="65%" stop-color="rgba(19, 22, 24, 0)"/>
    </radialGradient>
    <radialGradient id="vignette" cx="50%" cy="50%" r="75%">
      <stop offset="0%" stop-color="rgba(0,0,0,0)"/>
      <stop offset="70%" stop-color="rgba(0,0,0,0)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,${VIGNETTE_A})"/>
    </radialGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="${BG}"/>
  <rect width="${size}" height="${size}" fill="url(#glow)"/>
  <rect width="${size}" height="${size}" fill="url(#vignette)"/>
</svg>`;
}

async function ensureLogo() {
  try {
    await fs.access(LOGO_PATH);
  } catch {
    throw new Error(`Missing logo at ${path.relative(ROOT, LOGO_PATH)}`);
  }
}

async function generateIcon({ size, paddingFrac, outFile }) {
  const outPath = path.join(PUBLIC_DIR, outFile);

  const bgSvg = backgroundSvg(size);
  const bg = sharp(Buffer.from(bgSvg)).png();

  const inset = Math.round(size * paddingFrac);
  const logoMax = Math.max(1, size - inset * 2);

  const logo = await sharp(LOGO_PATH)
    .resize(logoMax, logoMax, { fit: "inside" })
    .png()
    .toBuffer();

  await bg
    .composite([{ input: logo, gravity: "center" }])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(outPath);
}

async function main() {
  await ensureLogo();

  // PWA icons: any vs maskable (more padding).
  await generateIcon({ size: 192, paddingFrac: 0.18, outFile: "pwa-192x192.png" });
  await generateIcon({ size: 192, paddingFrac: 0.28, outFile: "pwa-192x192-maskable.png" });
  await generateIcon({ size: 512, paddingFrac: 0.18, outFile: "pwa-512x512.png" });
  await generateIcon({ size: 512, paddingFrac: 0.28, outFile: "pwa-512x512-maskable.png" });

  // iOS + favicon.
  await generateIcon({ size: 180, paddingFrac: 0.18, outFile: "apple-touch-icon.png" });
  await generateIcon({ size: 48, paddingFrac: 0.22, outFile: "favicon.png" });

  // eslint-disable-next-line no-console
  console.log("[icons] Generated PWA/iOS/favicon icons in public/");
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[icons] Failed:", err);
  process.exit(1);
});

