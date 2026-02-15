import { describe, expect, it, vi, beforeEach } from "vitest";
import { useAddress } from "../useAddress";

const useQueryMock = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQuery: (args: any) => useQueryMock(args),
}));

vi.mock("@/utils/geocoding", () => ({
  getAddressFromCoordinates: vi.fn(),
}));

describe("useAddress", () => {
  beforeEach(() => {
    useQueryMock.mockReset();
  });

  it("disables query for invalid coords", () => {
    useQueryMock.mockReturnValue({ data: undefined, isLoading: false, error: null });
    const r = useAddress(0, 0);
    expect(r.address).toBeUndefined();
    expect(r.isLoading).toBe(false);
    expect(r.error).toBeNull();

    const call = useQueryMock.mock.calls[0][0];
    expect(call.enabled).toBe(false);
  });

  it("returns coord fallback on error but keeps error", () => {
    const err = new Error("boom");
    useQueryMock.mockReturnValue({ data: undefined, isLoading: false, error: err });
    const r = useAddress(6.5, 3.3);
    expect(r.address).toBe("6.5000, 3.3000");
    expect(r.error).toBe(err);

    const call = useQueryMock.mock.calls[0][0];
    expect(call.staleTime).toBe(10 * 60 * 1000);
    expect(call.refetchOnReconnect).toBe(true);
    expect(call.retry).toBe(2);
    expect(call.enabled).toBe(true);
  });
});

