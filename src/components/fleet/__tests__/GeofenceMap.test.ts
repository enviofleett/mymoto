import { describe, it, expect } from "vitest";
import { mapboxErrorToMessage } from "../GeofenceMap";

describe("GeofenceMap mapboxErrorToMessage", () => {
  it("returns auth message for 401 status", () => {
    const msg = mapboxErrorToMessage({ status: 401, message: "Unauthorized" });
    expect(msg).toContain("not authorized");
  });

  it("returns auth message for forbidden error text", () => {
    const msg = mapboxErrorToMessage({ message: "Request failed: Forbidden" });
    expect(msg).toContain("not authorized");
  });

  it("returns network message for aborted request", () => {
    const msg = mapboxErrorToMessage({ message: "net::ERR_ABORTED" });
    expect(msg).toContain("Network error");
  });

  it("returns null for unrelated errors", () => {
    const msg = mapboxErrorToMessage({ message: "Some other error" });
    expect(msg).toBeNull();
  });
});

