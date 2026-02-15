import { describe, it, expect } from 'vitest';
import { splitRouteIntoSegments } from '@/utils/trip-transform';

describe('TripPlaybackModal helpers', () => {
  it('returns coords for selected segment', async () => {
    (globalThis as any).localStorage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      length: 0,
      key: () => null,
    };
    const { getSegmentRouteCoordsForTest } = await import('../TripPlaybackModal');
    const samples = [
      { latitude: 6.0, longitude: 3.0, gps_time: '2024-01-01T10:00:00Z', speed_kmh: 10 },
      { latitude: 6.005, longitude: 3.005, gps_time: '2024-01-01T10:05:00Z', speed_kmh: 12 },
      { latitude: 6.005, longitude: 3.005, gps_time: '2024-01-01T10:06:30Z', speed_kmh: 0 }, // idle
      { latitude: 6.010, longitude: 3.010, gps_time: '2024-01-01T10:10:00Z', speed_kmh: 15 },
    ];
    const segments = splitRouteIntoSegments(samples as any);
    const coords0 = getSegmentRouteCoordsForTest(segments, 0);
    expect(coords0.length).toBeGreaterThan(1);
    const coords1 = getSegmentRouteCoordsForTest(segments, 1);
    expect(coords1.length).toBeGreaterThan(1);
  });
});
