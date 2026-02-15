import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getLastEngineControlEvent,
  getLastEngineControlLabel,
} from "../EngineControlCard";
import type { VehicleEvent } from "@/hooks/useVehicleProfile";

describe("EngineControlCard helpers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-16T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null when there are no events", () => {
    const event = getLastEngineControlEvent([]);
    const label = getLastEngineControlLabel(event);
    expect(event).toBeNull();
    expect(label).toBeNull();
  });

  it("picks the latest engine control event and formats shutdown label", () => {
    const events: VehicleEvent[] = [
      {
        id: "old",
        device_id: "TEST_DEVICE",
        event_type: "engine_enable",
        severity: "info",
        title: "Engine enabled",
        message: "Engine enabled earlier",
        created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        acknowledged: false,
        metadata: {},
      },
      {
        id: "latest",
        device_id: "TEST_DEVICE",
        event_type: "engine_shutdown",
        severity: "info",
        title: "Engine shutdown",
        message: "Engine shutdown succeeded",
        created_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
        acknowledged: false,
        metadata: {},
      },
    ];

    const event = getLastEngineControlEvent(events);
    expect(event).not.toBeNull();
    const label = getLastEngineControlLabel(event);
    expect(label).toBe("Last action: Shutdown 2m ago");
  });

  it("formats enable and immobilize labels with relative time", () => {
    const enableEvent: VehicleEvent = {
      id: "enable",
      device_id: "TEST_DEVICE",
      event_type: "engine_demobilize",
      severity: "info",
      title: "Engine enabled",
      message: "Engine enabled",
      created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      acknowledged: false,
      metadata: {},
    };

    const immobilizeEvent: VehicleEvent = {
      id: "immobilize",
      device_id: "TEST_DEVICE",
      event_type: "engine_immobilize",
      severity: "info",
      title: "Engine immobilized",
      message: "Engine immobilized",
      created_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      acknowledged: false,
      metadata: {},
    };

    const enableLabel = getLastEngineControlLabel(enableEvent);
    const immobilizeLabel = getLastEngineControlLabel(immobilizeEvent);

    expect(enableLabel).toBe("Last action: Engine enabled 1h ago");
    expect(immobilizeLabel).toBe("Last action: Engine immobilized 3h ago");
  });
});

