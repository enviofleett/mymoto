import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const appPath = path.resolve(process.cwd(), "src/App.tsx");
const ownerProfilePath = path.resolve(process.cwd(), "src/pages/owner/OwnerProfile.tsx");

describe("Support agent routing", () => {
  it("registers owner and admin support routes", () => {
    const app = readFileSync(appPath, "utf8");
    expect(app).toContain('path="/owner/help"');
    expect(app).toContain('path="/admin/support-agent"');
  });

  it("keeps profile Help & Support menu path wired to /owner/help", () => {
    const ownerProfile = readFileSync(ownerProfilePath, "utf8");
    expect(ownerProfile).toContain('label: "Help & Support", path: "/owner/help"');
  });
});

