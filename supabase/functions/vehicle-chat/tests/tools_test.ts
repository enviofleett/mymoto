
import { assertEquals, assertExists } from "https://deno.land/std@0.192.0/testing/asserts.ts";
import { TOOLS } from "../tools.ts";

// Mock Supabase Client
const createMockSupabase = (mockData: any) => {
  return {
    from: (table: string) => ({
      update: (updates: any) => ({
        eq: (col: string, val: string) => ({
           then: async (cb: any) => cb({ data: null, error: null })
        })
      }),
      select: (cols: string) => ({
        eq: (col: string, val: string) => ({
          limit: (n: number) => ({
            maybeSingle: async () => ({ data: mockData[table]?.[0] || null, error: null }),
            then: async (cb: any) => cb({ data: mockData[table] || [], error: null })
          }),
          gte: (col: string, val: string) => ({
             lte: (col: string, val: string) => ({
                order: (col: string, opts: any) => ({
                    limit: (n: number) => ({
                         then: async (cb: any) => cb({ data: mockData[table] || [], error: null })
                    }),
                    then: async (cb: any) => cb({ data: mockData[table] || [], error: null })
                })
             })
          }),
          in: (col: string, vals: any[]) => ({
            order: (col: string, opts: any) => ({
                limit: (n: number) => ({
                     then: async (cb: any) => cb({ data: mockData[table] || [], error: null })
                })
            })
          })
        }),
        then: async (cb: any) => cb({ data: mockData[table] || [], error: null })
      })
    }),
    rpc: async (func: string, args: any) => {
        if (func === 'search_locations_fuzzy') {
            return { data: mockData['locations'] || [], error: null }
        }
        if (func === 'get_vehicle_health') {
            return { data: mockData['rpc_get_vehicle_health'] || null, error: null }
        }
        return { data: null, error: null }
    }
  } as any;
};

// TEST 1: get_vehicle_status (Online)
Deno.test("get_vehicle_status returns online status correctly", async () => {
  const mockData = {
    vehicle_positions: [{
      latitude: 9.0, longitude: 7.0, speed: 45, heading: 90,
      gps_time: new Date().toISOString(), // NOW
      is_online: true, ignition_on: true, battery_percent: 100, total_mileage: 5000
    }]
  };
  
  const tool = TOOLS.find(t => t.name === 'get_vehicle_status')!;
  const result = await tool.execute({}, { supabase: createMockSupabase(mockData), device_id: '123' });
  
  assertEquals(result.status, 'online');
  assertEquals(result.telemetry.speed_kmh, 45);
  assertEquals(result.data_quality, 'fresh');
});

// TEST 2: get_vehicle_status (Offline/Stale)
Deno.test("get_vehicle_status detects stale data", async () => {
  const twoHoursAgo = new Date();
  twoHoursAgo.setHours(twoHoursAgo.getHours() - 2);
  
  const mockData = {
    vehicle_positions: [{
      latitude: 9.0, longitude: 7.0, speed: 0, heading: 0,
      gps_time: twoHoursAgo.toISOString(),
      is_online: false, ignition_on: false, battery_percent: 90, total_mileage: 5000
    }]
  };
  
  const tool = TOOLS.find(t => t.name === 'get_vehicle_status')!;
  const result = await tool.execute({}, { supabase: createMockSupabase(mockData), device_id: '123' });
  
  assertEquals(result.status, 'offline');
  assertEquals(result.data_quality, 'stale');
  assertExists(result.last_updated_minutes_ago);
});

// TEST 3: get_trip_analytics (Aggregations)
Deno.test("get_trip_analytics aggregates correctly", async () => {
  const mockData = {
    vehicle_trips: [
      { start_time: '2024-01-01T10:00:00Z', end_time: '2024-01-01T11:00:00Z', duration_seconds: 3600, distance_km: 50 },
      { start_time: '2024-01-01T14:00:00Z', end_time: '2024-01-01T14:30:00Z', duration_seconds: 1800, distance_km: 20 }
    ]
  };
  
  const tool = TOOLS.find(t => t.name === 'get_trip_analytics')!;
  const result = await tool.execute({ period: 'custom', start_date: '2024-01-01', end_date: '2024-01-01' }, { supabase: createMockSupabase(mockData), device_id: '123' });
  
  assertEquals(result.summary.total_trips, 2);
  assertEquals(result.summary.total_distance_km, 70);
  assertEquals(result.summary.total_drive_time_seconds, 5400); // 3600 + 1800
});

// TEST 4: get_vehicle_health
Deno.test("get_vehicle_health returns comprehensive status", async () => {
  const mockData = {
    rpc_get_vehicle_health: { overall_health_score: 85, battery_health_score: 90, driving_behavior_score: 80, connectivity_score: 95 },
    maintenance_recommendations: [
        { title: 'Check Tire Pressure', description: 'Low pressure in FR tire', recommendation_type: 'maintenance', priority: 'medium', status: 'active' }
    ],
    vehicle_positions: [{ battery_percent: 88, ignition_on: true }]
  };

  const tool = TOOLS.find(t => t.name === 'get_vehicle_health')!;
  const result = await tool.execute({}, { supabase: createMockSupabase(mockData), device_id: '123' });

  assertEquals(result.health_score, 85);
  assertEquals(result.battery.level_percent, 88);
  assertEquals(result.active_issues_count, 1);
  assertEquals(result.active_issues[0].issue, 'Check Tire Pressure');
});

// TEST 5: get_fuel_stats
Deno.test("get_fuel_stats aggregates fuel data correctly", async () => {
  const mockData = {
    vehicle_mileage_details: [
        { statisticsday: '2024-01-01', totaldistance: 10000, oilper100km: 8.5, leakoil: 0, oilperhour: 2.1 },
        { statisticsday: '2024-01-02', totaldistance: 5000, oilper100km: 9.0, leakoil: 500, oilperhour: 2.2 } // 5L leak
    ]
  };

  const tool = TOOLS.find(t => t.name === 'get_fuel_stats')!;
  const result = await tool.execute({ start_date: '2024-01-01', end_date: '2024-01-02' }, { supabase: createMockSupabase(mockData), device_id: '123' });

  assertEquals(result.found, true);
  assertEquals(result.summary.total_distance_meters, 15000);
  assertEquals(result.summary.potential_theft_detected, true);
  assertEquals(result.summary.total_leak_amount_liters, 5); // 500 / 100
});

// TEST 6: get_recent_alerts
Deno.test("get_recent_alerts fetches critical events", async () => {
  const mockData = {
    proactive_vehicle_events: [
        { created_at: '2024-01-01T10:00:00Z', severity: 'critical', title: 'Engine Overheat', event_type: 'dtc_alert', description: 'Engine temp > 110C' },
        { created_at: '2024-01-01T12:00:00Z', severity: 'warning', title: 'Low Battery', event_type: 'battery_low', description: 'Voltage < 11.5V' }
    ]
  };

  const tool = TOOLS.find(t => t.name === 'get_recent_alerts')!;
  const result = await tool.execute({ limit: 5 }, { supabase: createMockSupabase(mockData), device_id: '123' });

  assertEquals(result.found, true);
  assertEquals(result.count, 2);
  assertEquals(result.alerts[0].title, 'Engine Overheat');
});

// TEST 7: update_vehicle_profile
Deno.test("update_vehicle_profile updates fields correctly", async () => {
  const mockData = {
    vehicles: [] // Update doesn't return data in this mock, but we check if it runs without error
  };

  const tool = TOOLS.find(t => t.name === 'update_vehicle_profile')!;
  const result = await tool.execute({ 
    make: 'Ford', 
    model: 'Ranger', 
    year: 2021, 
    official_fuel_efficiency: 7.2 
  }, { supabase: createMockSupabase(mockData), device_id: '123' });

  assertEquals(result.status, 'success');
  assertEquals(result.updated_fields.includes('make'), true);
  assertEquals(result.updated_fields.includes('official_fuel_efficiency_l_100km'), true);
});

// TEST 8: get_fuel_stats with comparison
Deno.test("get_fuel_stats compares with rated efficiency", async () => {
  const mockData = {
    vehicle_mileage_details: [
        { statisticsday: '2024-01-01', totaldistance: 10000, oilper100km: 8.5, leakoil: 0, oilperhour: 2.1 }
    ],
    vehicles: [
        { make: 'Ford', model: 'Ranger', year: 2021, official_fuel_efficiency_l_100km: 7.2 }
    ]
  };

  const tool = TOOLS.find(t => t.name === 'get_fuel_stats')!;
  const result = await tool.execute({ start_date: '2024-01-01', end_date: '2024-01-01' }, { supabase: createMockSupabase(mockData), device_id: '123' });

  assertEquals(result.found, true);
  assertEquals(result.missing_rated_data, false);
  assertExists(result.comparison);
  assertEquals(result.comparison.rated_l_100km, 7.2);
  assertEquals(result.comparison.status, 'inefficient'); // 8.5 > 7.2
});
