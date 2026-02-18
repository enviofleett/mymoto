import { describe, expect, it } from "vitest";
import { normalizeAutomotiveTranscript } from "../useVoiceAgent";

describe("normalizeAutomotiveTranscript", () => {
  it("normalizes common automotive terms", () => {
    expect(normalizeAutomotiveTranscript("Check engine light is on")).toBe("Check engine light is on");
    expect(normalizeAutomotiveTranscript("Engine light is on")).toBe("Engine light is on");
    expect(normalizeAutomotiveTranscript("Low battery warning")).toBe("Low battery warning");
    expect(normalizeAutomotiveTranscript("Battery level is low")).toBe("Battery level is low");
  });

  it("maps regional vocabulary to canonical forms", () => {
    expect(normalizeAutomotiveTranscript("Tyre pressure is low")).toBe("Tire pressure is low");
    expect(normalizeAutomotiveTranscript("Handbrake is engaged")).toBe("Parking brake is engaged");
    expect(normalizeAutomotiveTranscript("Turn on the aircon")).toBe("Air conditioning on");
  });

  it("handles ignition and driving related phrases", () => {
    expect(normalizeAutomotiveTranscript("Ignition on")).toBe("Ignition on");
    expect(normalizeAutomotiveTranscript("Ignition off")).toBe("Ignition off");
    expect(normalizeAutomotiveTranscript("Start the car now")).toBe("Ignition on now");
    expect(normalizeAutomotiveTranscript("Stop the car here")).toBe("Ignition off here");
  });

  it("handles overspeeding and emergency style language", () => {
    expect(normalizeAutomotiveTranscript("You are overspeeding")).toBe("You are over speeding");
    expect(normalizeAutomotiveTranscript("Over speeding alert")).toBe("Over speeding alert");
  });

  it("returns empty string for empty or whitespace input", () => {
    expect(normalizeAutomotiveTranscript("")).toBe("");
    expect(normalizeAutomotiveTranscript("   ")).toBe("");
  });
});
