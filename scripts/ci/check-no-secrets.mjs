import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const patterns = [
  // Env-style assignments (e.g. .env). This avoids false positives in code like `Deno.env.get(...)`.
  /(VITE_MAPBOX_ACCESS_TOKEN|VITE_MAPBOX_STYLE_TOKEN|MAPBOX_ACCESS_TOKEN)\s*=\s*["']/,
  // Raw Mapbox token literals embedded in source.
  /(["'])(pk|sk)\.[A-Za-z0-9._-]{20,}\1/,
];

function run(cmd) {
  return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function main() {
  // Scan tracked files only (prevents false positives from local .env files).
  const filesRaw = run("git ls-files");
  const files = filesRaw.split("\n").map((s) => s.trim()).filter(Boolean);
  const offenders = [];

  for (const f of files) {
    if (f.includes("package-lock.json") || f.includes("node_modules/")) continue;
    let content;
    try {
      content = readFileSync(f, "utf8");
    } catch {
      continue;
    }
    for (const re of patterns) {
      if (re.test(content)) {
        offenders.push({ file: f, pattern: String(re) });
      }
    }
  }

  if (offenders.length) {
    console.error("Secret scan failed. Remove tokens from tracked files:");
    for (const o of offenders) {
      console.error(`- ${o.file} matched ${o.pattern}`);
    }
    process.exit(1);
  }

  console.log("Secret scan OK.");
}

main();
