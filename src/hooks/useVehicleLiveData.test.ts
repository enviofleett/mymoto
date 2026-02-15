import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mapDirectResponseToVehicleLiveData, fetchVehicleLiveDataDirect } from './useVehicleLiveData';

// Mock Supabase client
const mockInvoke = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: (...args: any[]) => mockInvoke(...args),
    },
  },
}));

describe('GPS 51 Direct Fetch Simulation', () => {
  const mockNormalizedRecord = {
    vehicle_id: 'TEST_DEVICE_123',
    lat: 6.5244,
    lon: 3.3792,
    speed_kmh: 45,
    heading: 180,
    battery_level: 85,
    ignition_on: true,
    is_online: true,
    last_updated_at: '2023-10-27T10:00:00Z',
    gps_fix_at: '2023-10-27T10:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should correctly map raw GPS 51 data to VehicleLiveData', () => {
    const result = mapDirectResponseToVehicleLiveData(mockNormalizedRecord);

    expect(result.deviceId).toBe('TEST_DEVICE_123');
    expect(result.latitude).toBe(6.5244);
    expect(result.longitude).toBe(3.3792);
    expect(result.speed).toBe(45);
    expect(result.heading).toBe(180);
    expect(result.batteryPercent).toBe(85);
    expect(result.ignitionOn).toBe(true);
    expect(result.isOnline).toBe(true);
    expect(result.totalMileageKm).toBeNull();
    expect(result.lastUpdate).toBeInstanceOf(Date);
    expect(result.lastUpdate?.toISOString()).toBe('2023-10-27T10:00:00.000Z');
    expect(result.syncPriority).toBe('high');
  });

  it('should handle null/missing values gracefully', () => {
    const sparseRecord = {
      vehicle_id: 'SPARSE_DEVICE',
      speed: 0,
      // missing lat/lon, mileage, etc.
    };

    const result = mapDirectResponseToVehicleLiveData(sparseRecord);

    expect(result.deviceId).toBe('SPARSE_DEVICE');
    expect(result.latitude).toBeNull();
    expect(result.longitude).toBeNull();
    expect(result.totalMileageKm).toBeNull();
    expect(result.ignitionOn).toBeNull();
    expect(result.isOnline).toBe(false); // Default to false
  });

  it('should simulate a successful direct API fetch', async () => {
    // Mock the Edge Function response
    mockInvoke.mockResolvedValueOnce({
      data: mockNormalizedRecord,
      error: null,
    });

    const result = await fetchVehicleLiveDataDirect('TEST_DEVICE_123');

    expect(mockInvoke).toHaveBeenCalledWith('get-vehicle-live-status', {
      body: {
        device_id: 'TEST_DEVICE_123',
      },
    });

    expect(result.deviceId).toBe('TEST_DEVICE_123');
    expect(result.speed).toBe(45);
    expect(result.totalMileageKm).toBeNull();
  });

  it('should throw error when Edge Function fails', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: { message: 'Network error' },
    });

    await expect(fetchVehicleLiveDataDirect('TEST_DEVICE_123'))
      .rejects
      .toThrow('Edge Function error: Network error');
  });

  it('should throw error when proxy returns no data', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    await expect(fetchVehicleLiveDataDirect('TEST_DEVICE_123'))
      .rejects
      .toThrow('No data returned from GPS 51 Proxy');
  });
});
