import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { VehicleIntelligenceCard } from "../VehicleIntelligenceCard";
import type { VehicleIntelligenceSummary } from "@/hooks/useTripAnalytics";

function makeSampleSummary(overrides: Partial<VehicleIntelligenceSummary> = {}): VehicleIntelligenceSummary {
  return {
    fatigue_index: 65,
    fatigue_level: "moderate",
    total_engine_hours_24h: 6,
    has_long_haul_24h: true,
    late_night_trips_7d: 3,
    idle_minutes_7d: 120,
    offline_events_7d: 2,
    connectivity_score: 80,
    hard_braking_events_7d: 4,
    overspeed_events_7d: 5,
    safety_events_this_week: 10,
    safety_events_last_week: 12,
    updated_at: "2026-02-21T00:00:00.000Z",
    ...overrides,
  };
}

describe("VehicleIntelligenceCard", () => {
  it("renders loading state with skeletons", () => {
    const html = renderToString(
      <VehicleIntelligenceCard summary={null} isLoading error={null} onRetry={undefined} />
    );
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("animate-pulse");
  });

  it("renders empty state when no summary is available", () => {
    const html = renderToString(
      <VehicleIntelligenceCard summary={null} isLoading={false} error={null} onRetry={undefined} />
    );
    expect(html).toContain("Intelligence &amp; Behavior");
    expect(html).toContain("No analytics available yet");
  });

  it("renders error state with retry affordance", () => {
    const error = new Error("Network error");
    const html = renderToString(
      <VehicleIntelligenceCard
        summary={null}
        isLoading={false}
        error={error}
        onRetry={() => {}}
      />
    );
    expect(html).toContain("Unable to load intelligence data.");
    expect(html).toContain("Network error");
    expect(html).toContain("Retry");
  });

  it("renders populated state with key metrics and filters", () => {
    const summary = makeSampleSummary();
    const html = renderToString(
      <VehicleIntelligenceCard
        summary={summary}
        isLoading={false}
        error={null}
        onRetry={undefined}
      />
    );

    expect(html).toContain("Intelligence &amp; Behavior");
    expect(html).toContain("Late Night Trips");
    expect(html).toContain("Total Idle Time");
    expect(html).toContain("Connectivity Score");
    expect(html).toContain("Hard Braking");
    expect(html).toContain("Overspeeding Events");
    expect(html).toContain("Fatigue Level");

    expect(html).toContain("Overview");
    expect(html).toContain("Safety");
    expect(html).toContain("Connectivity");
  });
});
