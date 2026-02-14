import { describe, it, expect } from "vitest";
import { mapGps51TripRowToVehicleTrip } from "../useVehicleProfile";

describe("useVehicleProfile gps51_trips mapping", () => {
  it("parses numeric strings and computes distance_km from distance_meters", () => {
    const mapped = mapGps51TripRowToVehicleTrip({
      id: "t1",
      device_id: "d1",
      start_time: "2026-02-14T00:00:00.000Z",
      end_time: "2026-02-14T00:10:00.000Z",
      start_latitude: "6.5000",
      start_longitude: "3.3000",
      end_latitude: "6.6000",
      end_longitude: "3.4000",
      distance_meters: "1234",
      avg_speed_kmh: "45.6",
      max_speed_kmh: "78.9",
      duration_seconds: "600",
    });

    expect(mapped.distance_km).toBeCloseTo(1.234);
    expect(mapped.avg_speed).toBeCloseTo(45.6);
    expect(mapped.max_speed).toBeCloseTo(78.9);
    expect(mapped.duration_seconds).toBe(600);
    expect(mapped.start_latitude).toBeCloseTo(6.5);
    expect(mapped.source).toBe("gps51");
  });

  it("handles nulls without producing NaN", () => {
    const mapped = mapGps51TripRowToVehicleTrip({
      id: "t2",
      device_id: "d1",
      start_time: "2026-02-14T00:00:00.000Z",
      end_time: null,
      start_latitude: null,
      start_longitude: null,
      end_latitude: null,
      end_longitude: null,
      distance_meters: null,
      avg_speed_kmh: null,
      max_speed_kmh: null,
      duration_seconds: null,
    });

    expect(mapped.distance_km).toBe(null);
    expect(mapped.avg_speed).toBe(null);
    expect(mapped.max_speed).toBe(null);
    expect(mapped.duration_seconds).toBe(null);
    expect(mapped.start_latitude).toBe(null);
    expect(mapped.end_time).toBe(null);
  });
});
