import { describe, expect, it } from "vitest";
import {
  filterTripsByLocation,
  mapGps51TripToSearchTrip,
  type Gps51TripRow,
} from "../../../supabase/functions/vehicle-chat/trip-search-core";

describe("trip-search-core", () => {
  it("maps gps51 fields to search-trip shape", () => {
    const mapped = mapGps51TripToSearchTrip({
      id: "t1",
      start_time: "2026-02-01T10:00:00Z",
      end_time: "2026-02-01T10:30:00Z",
      distance_meters: 12345,
      duration_seconds: 1800,
      max_speed_kmh: 88,
      avg_speed_kmh: 40,
    });

    expect(mapped.distance_km).toBeCloseTo(12.345, 3);
    expect(mapped.duration_seconds).toBe(1800);
    expect(mapped.max_speed).toBe(88);
    expect(mapped.avg_speed).toBe(40);
  });

  it("filters gps51 trips by resolved address text", async () => {
    const trips: Gps51TripRow[] = [
      {
        id: "match",
        start_time: "2026-02-01T10:00:00Z",
        end_time: "2026-02-01T10:20:00Z",
        start_latitude: 6.5,
        start_longitude: 3.3,
        end_latitude: 6.52,
        end_longitude: 3.4,
        distance_meters: 5000,
        duration_seconds: 1200,
      },
      {
        id: "other",
        start_time: "2026-02-02T10:00:00Z",
        end_time: "2026-02-02T10:20:00Z",
        start_latitude: 9.0,
        start_longitude: 7.0,
        end_latitude: 9.1,
        end_longitude: 7.1,
        distance_meters: 7000,
        duration_seconds: 1200,
      },
    ];

    const resolveAddress = async (lat?: number | null, lng?: number | null) => {
      const key = `${lat},${lng}`;
      if (key === "6.52,3.4") return "Ikeja, Lagos";
      if (key === "9.1,7.1") return "Wuse 2, Abuja";
      return "Unknown";
    };

    const results = await filterTripsByLocation(
      trips,
      "ikeja",
      resolveAddress,
      (trip) => ({ ...trip, isGhost: false })
    );

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("match");
    expect(results[0].end_address).toContain("Ikeja");
    expect(results[0].distance_km).toBe(5);
  });

  it("drops ghost trips via validator callback", async () => {
    const trips: Gps51TripRow[] = [
      {
        id: "ghost",
        start_time: "2026-02-01T10:00:00Z",
        end_time: "2026-02-01T10:01:00Z",
        end_latitude: 6.52,
        end_longitude: 3.4,
        distance_meters: 3,
        duration_seconds: 10,
      },
    ];

    const results = await filterTripsByLocation(
      trips,
      "ikeja",
      async () => "Ikeja, Lagos",
      (trip) => ({ ...trip, isGhost: true })
    );

    expect(results).toHaveLength(0);
  });
});
