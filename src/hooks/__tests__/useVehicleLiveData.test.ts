
import { describe, it, expect, vi } from 'vitest';
import { mapDirectResponseToVehicleLiveData } from '../useVehicleLiveData';

// Mock Supabase client to prevent localStorage access during tests
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}));

/**
 * Unit tests for Vehicle Status Synchronization Logic
 * 
 * Problem: The system was displaying "offline" for online vehicles because the Edge Function 
 * was returning raw GPS51 data (missing 'is_online' field) instead of normalized data.
 * 
 * Fix: The Edge Function now returns normalized data including 'is_online'.
 * These tests verify that the frontend correctly interprets this data.
 */
describe('useVehicleLiveData', () => {
  describe('mapDirectResponseToVehicleLiveData', () => {
    
    it('should correctly map normalized data with is_online=true', () => {
      // Mock data simulating the FIXED Edge Function response
      const normalizedInput = {
        vehicle_id: 'test-device-1',
        lat: 6.5244,
        lon: 3.3792,
        speed_kmh: 45,
        is_online: true, // This field is crucial
        last_updated_at: new Date().toISOString(),
        ignition_on: true
      };

      const result = mapDirectResponseToVehicleLiveData(normalizedInput);

      expect(result.deviceId).toBe('test-device-1');
      expect(result.isOnline).toBe(true); // Should be online
      expect(result.latitude).toBe(6.5244);
      expect(result.speed).toBe(45);
    });

    it('should correctly map normalized data with is_online=false', () => {
      const normalizedInput = {
        vehicle_id: 'test-device-2',
        is_online: false,
        last_updated_at: new Date().toISOString()
      };

      const result = mapDirectResponseToVehicleLiveData(normalizedInput);

      expect(result.isOnline).toBe(false);
    });

    it('should default isOnline to false if field is missing (regression test for raw data)', () => {
      // Mock data simulating the BROKEN/RAW Edge Function response
      const rawInput = {
        deviceid: 'test-device-3',
        // is_online is missing in raw data
        status: 123
      };

      const result = mapDirectResponseToVehicleLiveData(rawInput);

      // This confirms why the bug happened: missing field -> false
      expect(result.isOnline).toBe(false);
    });

    it('should correctly map battery percentage', () => {
      const input = {
        vehicle_id: 'test-device-1',
        battery_level: 85,
        is_online: true
      };

      const result = mapDirectResponseToVehicleLiveData(input);

      expect(result.batteryPercent).toBe(85);
    });
  });
});
