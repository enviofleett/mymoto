import { describe, expect, it } from "vitest";
import { cleanMapLinks, parseMessageParts } from "../chatMessageParser";

describe("chatMessageParser", () => {
  it("parses TRIP_TABLE markers into structured parts", () => {
    const content = `Trip summary\n[TRIP_TABLE: | Day | Trips |\n| --- | --- |\n| Mon | 3 | ]\nDone`;
    const parts = parseMessageParts(content);

    const tablePart = parts.find(
      (part) => typeof part !== "string" && part.type === "trip_table"
    );

    expect(tablePart && tablePart.type).toBe("trip_table");
    if (tablePart && tablePart.type === "trip_table") {
      expect(tablePart.markdown).toContain("| Day | Trips |");
      expect(tablePart.markdown).toContain("| Mon | 3 |");
    }
  });

  it("parses LOCATION markers and preserves surrounding text", () => {
    const content = `Current spot [LOCATION: 6.5244, 3.3792, "Victoria Island, Lagos"] now`;
    const parts = parseMessageParts(content);
    const locationPart = parts.find(
      (part) => typeof part !== "string" && part.type === "location"
    );

    expect(typeof parts[0]).toBe("string");
    expect(typeof parts[parts.length - 1]).toBe("string");
    expect(locationPart && locationPart.type).toBe("location");
    if (locationPart && locationPart.type === "location") {
      expect(locationPart.data.lat).toBeCloseTo(6.5244, 4);
      expect(locationPart.data.lng).toBeCloseTo(3.3792, 4);
      expect(locationPart.data.address).toContain("Victoria Island");
    }
  });

  it("removes markdown map links while keeping other text", () => {
    const cleaned = cleanMapLinks(
      `Vehicle parked.\n[Open in Maps](https://maps.google.com/?q=6.5,3.3)\nTry again.`
    );
    expect(cleaned).toContain("Vehicle parked.");
    expect(cleaned).toContain("Try again.");
    expect(cleaned).not.toContain("Open in Maps");
  });
});
