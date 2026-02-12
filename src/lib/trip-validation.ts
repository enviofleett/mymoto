import { VehicleTrip } from "@/hooks/useVehicleProfile";

export interface ContinuityIssue {
  tripId: string; // The trip *after* the gap
  prevTripId: string;
  distanceGapKm: number;
  timeGapMinutes: number;
  severity: 'warning' | 'error';
}

/**
 * Validates the continuity between sequential trips.
 * Checks if the end location of trip N matches the start location of trip N+1.
 * 
 * @param trips Array of trips, can be unsorted (will be sorted internally)
 * @returns Array of continuity issues found
 */
export function validateTripContinuity(trips: VehicleTrip[]): ContinuityIssue[] {
  // Sort trips by start time ascending
  const sortedTrips = [...trips].sort((a, b) => 
    new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );

  const issues: ContinuityIssue[] = [];

  for (let i = 1; i < sortedTrips.length; i++) {
    const prevTrip = sortedTrips[i - 1];
    const currentTrip = sortedTrips[i];

    // Only validate if we have coordinates for both ends of the gap
    // Use loose check for 0/null as coordinates could be 0 (rare but possible, mostly 0 means invalid in this system)
    const hasPrevEnd = prevTrip.end_latitude && prevTrip.end_longitude && prevTrip.end_latitude !== 0;
    const hasCurrStart = currentTrip.start_latitude && currentTrip.start_longitude && currentTrip.start_latitude !== 0;

    if (hasPrevEnd && hasCurrStart) {
        const dist = calculateDistance(
            prevTrip.end_latitude, prevTrip.end_longitude,
            currentTrip.start_latitude, currentTrip.start_longitude
        );

        // Gap Thresholds
        // Warning: > 1km (Vehicle likely moved without tracking)
        // Error: > 10km (Significant data loss)
        if (dist > 1.0) {
            const timeGap = prevTrip.end_time 
                ? (new Date(currentTrip.start_time).getTime() - new Date(prevTrip.end_time).getTime()) / 60000
                : 0;

            issues.push({
                tripId: currentTrip.id,
                prevTripId: prevTrip.id,
                distanceGapKm: Number(dist.toFixed(2)),
                timeGapMinutes: Math.round(timeGap),
                severity: dist > 10 ? 'error' : 'warning'
            });
        }
    }
  }
  return issues;
}

/**
 * Calculates the Haversine distance between two points in kilometers
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number) {
  return deg * (Math.PI / 180);
}
