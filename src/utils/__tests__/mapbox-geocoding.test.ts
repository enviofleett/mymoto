import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeEdgeFunctionMock = vi.fn();

vi.mock("@/integrations/supabase/edge", () => ({
  invokeEdgeFunction: (...args: any[]) => invokeEdgeFunctionMock(...args),
}));

describe("searchAddresses", () => {
  beforeEach(() => {
    invokeEdgeFunctionMock.mockReset();
    // @ts-expect-error test
    globalThis.fetch = vi.fn();
    (globalThis as any).__VITE_MAPBOX_ACCESS_TOKEN__ = undefined;
    (globalThis as any).__VITE_MAPBOX_GEOCODING_COUNTRY__ = undefined;
  });

  it("uses global search by default (no country param)", async () => {
    (globalThis as any).__VITE_MAPBOX_ACCESS_TOKEN__ = "pk.test";
    // @ts-expect-error test
    globalThis.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ features: [{ id: "1", center: [3.3, 6.5], place_name: "A", type: "Feature", place_type: ["place"], relevance: 1, properties: {}, text: "A", geometry: { type: "Point", coordinates: [3.3, 6.5] } }] }),
    });

    const { searchAddresses } = await import("../mapbox-geocoding");
    await searchAddresses("Lagos");

    const url = String((globalThis.fetch as any).mock.calls[0][0]);
    expect(url).toContain("access_token=pk.test");
    expect(url).not.toContain("country=");
  });

  it("applies country from env override when provided", async () => {
    (globalThis as any).__VITE_MAPBOX_ACCESS_TOKEN__ = "pk.test";
    (globalThis as any).__VITE_MAPBOX_GEOCODING_COUNTRY__ = "US";
    // @ts-expect-error test
    globalThis.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ features: [] }),
    });

    const { searchAddresses } = await import("../mapbox-geocoding");
    await searchAddresses("Austin");

    const url = String((globalThis.fetch as any).mock.calls[0][0]);
    expect(url).toContain("country=US");
  });

  it("falls back to edge geocoding on auth/rate-limit responses", async () => {
    (globalThis as any).__VITE_MAPBOX_ACCESS_TOKEN__ = "pk.bad";
    // @ts-expect-error test
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 429,
    });
    invokeEdgeFunctionMock.mockResolvedValue({ features: [{ id: "edge", center: [1, 2] }] });

    const { searchAddresses } = await import("../mapbox-geocoding");
    const results = await searchAddresses("Ikeja");

    expect(invokeEdgeFunctionMock).toHaveBeenCalledWith("forward-geocode", {
      query: "Ikeja",
      country: undefined,
      limit: 5,
    });
    expect(results).toHaveLength(1);
  });

  it("uses edge geocoding when client token is missing", async () => {
    invokeEdgeFunctionMock.mockResolvedValue({ features: [{ id: "edge-only", center: [1, 2] }] });

    const { searchAddresses } = await import("../mapbox-geocoding");
    const results = await searchAddresses("Abuja");

    expect(invokeEdgeFunctionMock).toHaveBeenCalled();
    expect(results).toHaveLength(1);
  });
});
