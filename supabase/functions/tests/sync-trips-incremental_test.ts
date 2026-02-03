
import { assertEquals, assertExists } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { extractTripsFromHistory, fetchTripsFromGps51, type PositionPoint } from "../sync-trips-incremental/index.ts";

declare const Deno: any;

// Mock Supabase client
const mockSupabase = {
  from: () => ({
    insert: () => Promise.resolve({ error: null }),
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: null, error: null })
      })
    })
  })
};

Deno.test("extractTripsFromHistory - detects simple trip", () => {
  const positions: PositionPoint[] = [
    // Trip Start
    { id: "1", device_id: "d1", latitude: 6.5, longitude: 3.3, speed: 0, gps_time: "2023-01-01T10:00:00Z", ignition_on: true, heading: 0 },
    { id: "2", device_id: "d1", latitude: 6.51, longitude: 3.31, speed: 20, gps_time: "2023-01-01T10:01:00Z", ignition_on: true, heading: 0 },
    { id: "3", device_id: "d1", latitude: 6.52, longitude: 3.32, speed: 40, gps_time: "2023-01-01T10:02:00Z", ignition_on: true, heading: 0 },
    // Trip End
    { id: "4", device_id: "d1", latitude: 6.52, longitude: 3.32, speed: 0, gps_time: "2023-01-01T10:05:00Z", ignition_on: false, heading: 0 },
    // Stopped
    { id: "5", device_id: "d1", latitude: 6.52, longitude: 3.32, speed: 0, gps_time: "2023-01-01T10:10:00Z", ignition_on: false, heading: 0 },
  ];

  const trips = extractTripsFromHistory(positions);
  
  assertEquals(trips.length, 1);
  assertEquals(trips[0].start_time, "2023-01-01T10:00:00Z");
  assertExists(trips[0].end_time);
  assertEquals(trips[0].device_id, "d1");
});

Deno.test("extractTripsFromHistory - ignores ghost trips (short duration/distance)", () => {
  const positions: PositionPoint[] = [
    { id: "1", device_id: "d1", latitude: 6.5, longitude: 3.3, speed: 0, gps_time: "2023-01-01T10:00:00Z", ignition_on: true, heading: 0 },
    { id: "2", device_id: "d1", latitude: 6.50001, longitude: 3.30001, speed: 1, gps_time: "2023-01-01T10:00:10Z", ignition_on: true, heading: 0 }, // Very short move
    { id: "3", device_id: "d1", latitude: 6.5, longitude: 3.3, speed: 0, gps_time: "2023-01-01T10:00:20Z", ignition_on: false, heading: 0 },
  ];

  const trips = extractTripsFromHistory(positions);
  
  assertEquals(trips.length, 0);
});

// Mock fetch for GPS51 test
globalThis.fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
  if (url.toString().includes("querytrips")) {
    return new Response(JSON.stringify({
      error: 0,
      record: [
        {
          deviceid: "d1",
          starttime: "2023-01-01 10:00:00",
          endtime: "2023-01-01 10:30:00",
          startlat: 6.5,
          startlon: 3.3,
          endlat: 6.6,
          endlon: 3.4,
          distance: 5000, // meters
          maxspeed: 60,
          avgspeed: 30
        }
      ]
    }));
  }
  return new Response("Not Found", { status: 404 });
};

Deno.test("fetchTripsFromGps51 - parses response correctly", async () => {
  const trips = await fetchTripsFromGps51(
    mockSupabase,
    "http://mock-proxy",
    "mock-token",
    "mock-server",
    "d1",
    "2023-01-01T00:00:00Z",
    "2023-01-01T23:59:59Z"
  );

  assertEquals(trips.length, 1);
  assertEquals(trips[0].distance_km, 5); // 5000m -> 5km
  assertEquals(trips[0].source, "gps51");
});
