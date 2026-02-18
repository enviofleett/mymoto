import { describe, it, expect, vi, beforeEach } from "vitest";
import { runLiveRefresh, type LiveRefreshOptions } from "../OwnerVehiclesDashboard";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

interface TestLiveData {
  deviceId: string;
  lastUpdate: Date | null;
}

describe("runLiveRefresh", () => {
  const deviceId = "test-device";

  let getCurrent: () => TestLiveData | null;
  let fetchLive: (id: string) => Promise<TestLiveData>;
  let refetchDaily: () => Promise<unknown> | void;
  let applyNewData: (payload: { data: TestLiveData; fetchedAt: number }) => void;
  let onSuccess: (message: string) => void;
  let onError: (message: string, description?: string) => void;
  let onStale: () => void;

  beforeEach(() => {
    getCurrent = vi.fn();
    fetchLive = vi.fn();
    refetchDaily = vi.fn();
    applyNewData = vi.fn();
    onSuccess = vi.fn();
    onError = vi.fn();
    onStale = vi.fn();
  });

  async function runWithOptions(overrides: Partial<LiveRefreshOptions> = {}) {
    const options: LiveRefreshOptions = {
      deviceId,
      getCurrent: getCurrent as any,
      fetchLive: fetchLive as any,
      refetchDaily,
      applyNewData: applyNewData as any,
      onSuccess,
      onError,
      onStale,
      maxAttempts: 3,
      baseDelayMs: 0,
      now: () => 1234,
      ...overrides,
    };

    await runLiveRefresh(options);
  }

  it("applies fresher data and reports success", async () => {
    const current: TestLiveData = {
      deviceId,
      lastUpdate: new Date("2024-01-01T00:00:00Z"),
    };
    const fresh: TestLiveData = {
      deviceId,
      lastUpdate: new Date("2024-01-01T00:01:00Z"),
    };

    (getCurrent as any) = vi.fn(() => current);
    (fetchLive as any) = vi.fn().mockResolvedValue(fresh);

    await runWithOptions({
      getCurrent: getCurrent as any,
      fetchLive: fetchLive as any,
    });

    expect(fetchLive).toHaveBeenCalledTimes(1);
    expect(applyNewData).toHaveBeenCalledWith({ data: fresh, fetchedAt: 1234 });
    expect(refetchDaily).toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledWith("Updated live status");
    expect(onError).not.toHaveBeenCalled();
    expect(onStale).not.toHaveBeenCalled();
  });

  it("marks response as stale when data is not newer", async () => {
    const current: TestLiveData = {
      deviceId,
      lastUpdate: new Date("2024-01-01T00:02:00Z"),
    };
    const stale: TestLiveData = {
      deviceId,
      lastUpdate: new Date("2024-01-01T00:01:00Z"),
    };

    (getCurrent as any) = vi.fn(() => current);
    (fetchLive as any) = vi.fn().mockResolvedValue(stale);

    await runWithOptions({
      getCurrent: getCurrent as any,
      fetchLive: fetchLive as any,
    });

    expect(fetchLive).toHaveBeenCalledTimes(1);
    expect(applyNewData).not.toHaveBeenCalled();
    expect(onStale).toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("retries on failure and reports error after max attempts", async () => {
    const error = new Error("network failure");
    (getCurrent as any) = vi.fn(() => null);
    (fetchLive as any) = vi.fn().mockRejectedValue(error);

    await runWithOptions({
      getCurrent: getCurrent as any,
      fetchLive: fetchLive as any,
      maxAttempts: 3,
      baseDelayMs: 0,
    });

    expect(fetchLive).toHaveBeenCalledTimes(3);
    expect(applyNewData).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onStale).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith("Live refresh failed", "network failure");
  });
});
