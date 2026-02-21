import { describe, it, expect } from "vitest";
import { getMarkerBreathingState } from "../VehicleLocationMap";

describe("VehicleLocationMap marker breathing state", () => {
  it("disables breathing animation and sets offline aria label when status is offline", () => {
    const state = getMarkerBreathingState("offline");
    expect(state.breathing).toBe(false);
    expect(state.ariaLabel).toBe("Vehicle offline");
  });

  it("enables breathing animation and sets online aria label when status is moving", () => {
    const state = getMarkerBreathingState("moving");
    expect(state.breathing).toBe(true);
    expect(state.ariaLabel).toBe("Vehicle online");
  });

  it("enables breathing animation and sets online aria label when status is parked", () => {
    const state = getMarkerBreathingState("parked");
    expect(state.breathing).toBe(true);
    expect(state.ariaLabel).toBe("Vehicle online");
  });
});
