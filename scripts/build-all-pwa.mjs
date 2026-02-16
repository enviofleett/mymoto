import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const providerDir = path.resolve(rootDir, "service-provider-pwa");
const rootDistDir = path.resolve(rootDir, "dist");
const providerDistDir = path.resolve(providerDir, "dist");
const partnerDistDir = path.resolve(rootDistDir, "partner");

function run(cmd, args, cwd) {
  const result = spawnSync(cmd, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function assertExists(filePath) {
  if (!existsSync(filePath)) {
    console.error(`[build:all:pwa] Missing expected artifact: ${filePath}`);
    process.exit(1);
  }
}

console.log("[build:all:pwa] Building main app...");
run("npm", ["run", "build"], rootDir);

console.log("[build:all:pwa] Building provider app...");
run("npm", ["run", "build"], providerDir);

console.log("[build:all:pwa] Copying provider build to dist/partner...");
rmSync(partnerDistDir, { recursive: true, force: true });
mkdirSync(partnerDistDir, { recursive: true });
cpSync(providerDistDir, partnerDistDir, { recursive: true });

assertExists(path.resolve(rootDistDir, "index.html"));
assertExists(path.resolve(rootDistDir, "sw.js"));
assertExists(path.resolve(partnerDistDir, "index.html"));
assertExists(path.resolve(partnerDistDir, "sw.js"));

console.log("[build:all:pwa] Done. Main and provider PWAs are compiled.");
