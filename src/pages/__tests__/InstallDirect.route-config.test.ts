import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const appPath = path.resolve(process.cwd(), "src/App.tsx");
const vercelConfigPath = path.resolve(process.cwd(), "vercel.json");

describe("Install direct route config", () => {
  it("registers /install/direct in the app router", () => {
    const app = readFileSync(appPath, "utf8");
    expect(app).toContain('path="/install/direct"');
  });

  it("keeps Vercel redirect compatibility for install deep links", () => {
    const raw = readFileSync(vercelConfigPath, "utf8");
    const config = JSON.parse(raw) as {
      routes?: Array<{ src?: string; dest?: string; status?: number }>;
    };

    const routes = config.routes ?? [];
    expect(
      routes.some(
        (route) =>
          route.src === "^/app/install/direct$" &&
          route.dest === "/install/direct" &&
          route.status === 308
      )
    ).toBe(true);
    expect(
      routes.some(
        (route) =>
          route.src === "^/app/install$" &&
          route.dest === "/install" &&
          route.status === 308
      )
    ).toBe(true);
    expect(
      routes.some(
        (route) =>
          route.src === "^/intall/direct$" &&
          route.dest === "/install/direct" &&
          route.status === 308
      )
    ).toBe(true);
  });
});
