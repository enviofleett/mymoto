import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeEdgeFunctionMock = vi.fn();

vi.mock("@/integrations/supabase/edge", () => ({
  invokeEdgeFunction: (...args: any[]) => invokeEdgeFunctionMock(...args),
}));

describe("getAddressFromCoordinates", () => {
  beforeEach(() => {
    invokeEdgeFunctionMock.mockReset();
    // @ts-expect-error test
    globalThis.fetch = vi.fn();
    (globalThis as any).__VITE_MAPBOX_ACCESS_TOKEN__ = undefined;
  });

  it("uses Mapbox when token exists and fetch succeeds", async () => {
    (globalThis as any).__VITE_MAPBOX_ACCESS_TOKEN__ = "pk.test";

    // @ts-expect-error test
    globalThis.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ features: [{ place_name: "A Place" }] }),
    });

    const { getAddressFromCoordinates } = await import("../geocoding");
    const addr = await getAddressFromCoordinates(6.5, 3.3);
    expect(addr).toBe("A Place");
    expect(invokeEdgeFunctionMock).not.toHaveBeenCalled();
  });

  it("falls back to edge when Mapbox returns 401/403", async () => {
    (globalThis as any).__VITE_MAPBOX_ACCESS_TOKEN__ = "pk.bad";

    // @ts-expect-error test
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers(),
    });

    invokeEdgeFunctionMock.mockResolvedValue({ address: "Edge Address" });

    const { getAddressFromCoordinates } = await import("../geocoding");
    const addr = await getAddressFromCoordinates(6.5, 3.3);
    expect(addr).toBe("Edge Address");
    expect(invokeEdgeFunctionMock).toHaveBeenCalledWith("reverse-geocode", { lat: 6.5, lng: 3.3 });
  });

  it("uses edge when token is missing", async () => {
    (globalThis as any).__VITE_MAPBOX_ACCESS_TOKEN__ = "";

    invokeEdgeFunctionMock.mockResolvedValue({ address: "Edge Only" });

    const { getAddressFromCoordinates } = await import("../geocoding");
    const addr = await getAddressFromCoordinates(6.5, 3.3);
    expect(addr).toBe("Edge Only");
  });

  it("throws when both Mapbox and edge fail", async () => {
    (globalThis as any).__VITE_MAPBOX_ACCESS_TOKEN__ = "pk.test";

    // @ts-expect-error test
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers(),
    });

    invokeEdgeFunctionMock.mockRejectedValue(new Error("edge down"));

    const { getAddressFromCoordinates } = await import("../geocoding");
    await expect(getAddressFromCoordinates(6.5, 3.3)).rejects.toThrow(/Reverse geocoding failed/);
  });
});
