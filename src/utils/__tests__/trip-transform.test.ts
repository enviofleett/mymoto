import { describe, it, expect } from 'vitest';
import { splitRouteIntoSegments, computeTripSummary } from '@/utils/trip-transform';

describe('trip-transform', () => {
  it('handles zero movement (all points same)', () => {
    const samples = [
      { latitude: 6, longitude: 3, gps_time: '2024-01-01T00:00:00Z', speed_kmh: 0 },
      { latitude: 6, longitude: 3, gps_time: '2024-01-01T00:02:00Z', speed_kmh: 0 },
      { latitude: 6, longitude: 3, gps_time: '2024-01-01T00:04:00Z', speed_kmh: 0 },
    ];
    const segments = splitRouteIntoSegments(samples as any);
    expect(segments.length).toBeGreaterThanOrEqual(1);
    const summary = computeTripSummary(segments);
    expect(summary.totalDistanceKm).toBeCloseTo(0, 5);
    expect(summary.stopCount).toBeGreaterThanOrEqual(1);
  });

  it('computes movement segments with speeds and idle detection', () => {
    const samples = [
      { latitude: 6.0, longitude: 3.0, gps_time: '2024-01-01T10:00:00Z', speed_kmh: 5 },
      { latitude: 6.001, longitude: 3.001, gps_time: '2024-01-01T10:02:00Z', speed_kmh: 10 },
      { latitude: 6.001, longitude: 3.001, gps_time: '2024-01-01T10:03:30Z', speed_kmh: 0 }, // idle 90s
      { latitude: 6.002, longitude: 3.002, gps_time: '2024-01-01T10:06:00Z', speed_kmh: 15 },
    ];
    const segments = splitRouteIntoSegments(samples as any);
    expect(segments.length).toBeGreaterThanOrEqual(2);
    const s0 = segments[0];
    expect(s0.distanceKm).toBeGreaterThan(0);
    expect(s0.maxSpeedKmh).toBeGreaterThanOrEqual(0);
    const summary = computeTripSummary(segments);
    expect(summary.longestIdleMin).toBeGreaterThanOrEqual(1.4);
    expect(summary.totalDistanceKm).toBeGreaterThan(0);
  });

  it('gracefully handles missing speed values by deriving from distance/time', () => {
    const samples = [
      { latitude: 6.0, longitude: 3.0, gps_time: '2024-01-01T10:00:00Z' },
      { latitude: 6.010, longitude: 3.010, gps_time: '2024-01-01T10:10:00Z' },
    ];
    const segments = splitRouteIntoSegments(samples as any);
    expect(segments.length).toBe(1);
    expect(segments[0].avgSpeedKmh).toBeGreaterThan(0);
  });
});
