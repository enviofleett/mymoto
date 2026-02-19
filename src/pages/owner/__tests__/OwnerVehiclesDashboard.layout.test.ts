import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const dashboardPath = path.resolve(
  process.cwd(),
  "src/pages/owner/OwnerVehiclesDashboard.tsx"
);

function fileContent() {
  return readFileSync(dashboardPath, "utf8");
}

describe("OwnerVehiclesDashboard layout structure", () => {
  it("renders sync container before circular map and metric grid", () => {
    const source = fileContent();

    const syncIdx = source.indexOf('data-testid="owner-sync-container"');
    const circleIdx = source.indexOf('data-testid="owner-circular-map"');
    const metricIdx = source.indexOf('data-testid="owner-metric-grid"');
    const ctaIdx = source.indexOf('data-testid="owner-open-profile-button"');

    expect(syncIdx).toBeGreaterThan(-1);
    expect(circleIdx).toBeGreaterThan(-1);
    expect(metricIdx).toBeGreaterThan(-1);
    expect(ctaIdx).toBeGreaterThan(-1);
    expect(syncIdx).toBeLessThan(circleIdx);
    expect(circleIdx).toBeLessThan(metricIdx);
    expect(metricIdx).toBeLessThan(ctaIdx);
  });

  it("uses circular map container styling and fallback copy", () => {
    const source = fileContent();

    expect(source).toContain("rounded-full");
    expect(source).toContain("showAddressCard={false}");
    expect(source).toContain("Location unavailable");
  });

  it("does not include the old rectangular map/location section", () => {
    const source = fileContent();

    expect(source).not.toContain("Tap for details");
    expect(source).not.toContain("View full profile");
    expect(source).not.toContain("rounded-system rounded-fluid");
  });

  it("includes profile CTA navigation and disabled guard", () => {
    const source = fileContent();

    expect(source).toContain("data-testid=\"owner-open-profile-button\"");
    expect(source).toContain("navigate(`/owner/vehicle/${selectedDeviceId}`)");
    expect(source).toContain("disabled={!canOpenProfile}");
  });
});
