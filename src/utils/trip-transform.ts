type Coord = { lat: number; lon: number };

export type Segment = {
  startTime: string;
  endTime: string;
  start: Coord;
  end: Coord;
  coords: Coord[];
  distanceKm: number;
  durationMin: number;
  avgSpeedKmh: number;
  maxSpeedKmh: number;
  idleMinutes: number;
};

type Sample = {
  latitude: number;
  longitude: number;
  gps_time: string;
  speed_kmh?: number | null;
  speed?: number | null;
};

function haversineKm(a: Coord, b: Coord): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function splitRouteIntoSegments(samples: Sample[]): Segment[] {
  if (!samples || samples.length < 2) return [];
  const SPEED_IDLE_THRESHOLD = 0.5; // km/h
  const IDLE_MIN_SECONDS = 60;

  const coords = samples.map(s => ({ lat: s.latitude, lon: s.longitude }));
  const speeds = samples.map(s => (s.speed ?? s.speed_kmh ?? null));
  const times = samples.map(s => new Date(s.gps_time).getTime());

  const segments: Segment[] = [];
  let current: Segment | null = null;
  let currentStartMs = 0;
  let idleAccumSec = 0;
  let maxSpeed = 0;
  let distance = 0;

  for (let i = 1; i < samples.length; i++) {
    const prev = { lat: coords[i - 1].lat, lon: coords[i - 1].lon };
    const curr = { lat: coords[i].lat, lon: coords[i].lon };
    const dtSec = Math.max(0, (times[i] - times[i - 1]) / 1000);
    const dKm = haversineKm(prev, curr);
    const sp = (speeds[i] ?? ((dtSec > 0) ? (dKm / (dtSec / 3600)) : 0)) || 0;
    maxSpeed = Math.max(maxSpeed, sp);

    const isIdle = sp < SPEED_IDLE_THRESHOLD;
    if (isIdle) {
      idleAccumSec += dtSec;
    } else {
      idleAccumSec = 0;
    }

    if (!current) {
      current = {
        startTime: samples[i - 1].gps_time,
        endTime: samples[i].gps_time,
        start: prev,
        end: curr,
        coords: [prev, curr],
        distanceKm: 0,
        durationMin: 0,
        avgSpeedKmh: 0,
        maxSpeedKmh: 0,
        idleMinutes: 0,
      };
      currentStartMs = times[i - 1];
      distance = 0;
      maxSpeed = 0;
    } else {
      current.endTime = samples[i].gps_time;
      current.end = curr;
      current.coords.push(curr);
    }
    distance += dKm;
    current.distanceKm = distance;
    current.durationMin = Math.max(0, (times[i] - currentStartMs) / 60000);
    current.maxSpeedKmh = maxSpeed;
    current.idleMinutes = idleAccumSec / 60;
    current.avgSpeedKmh = current.durationMin > 0 ? (current.distanceKm / (current.durationMin / 60)) : 0;

    // Split segment when prolonged idle detected transitioning back to movement
    const nextSpeed = i + 1 < samples.length
      ? ((speeds[i + 1] ?? ((times[i + 1] - times[i]) > 0 ? haversineKm(curr, { lat: coords[i + 1].lat, lon: coords[i + 1].lon }) / (((times[i + 1] - times[i]) / 1000) / 3600) : 0)) || 0)
      : 0;
    const idleLongEnough = idleAccumSec >= IDLE_MIN_SECONDS;
    const movementAfterIdle = idleLongEnough && nextSpeed >= SPEED_IDLE_THRESHOLD;
    if (movementAfterIdle) {
      segments.push(current);
      current = null;
      idleAccumSec = 0;
      distance = 0;
      maxSpeed = 0;
    }
  }
  if (current) segments.push(current);
  return segments;
}

export function computeTripSummary(segments: Segment[]) {
  const totalDistanceKm = segments.reduce((s, seg) => s + seg.distanceKm, 0);
  const totalDurationMin = segments.reduce((s, seg) => s + seg.durationMin, 0);
  const avgSpeedKmh = totalDurationMin > 0 ? (totalDistanceKm / (totalDurationMin / 60)) : 0;
  const stopCount = segments.filter(s => s.idleMinutes >= 1).length;
  const longestIdleMin = segments.reduce((m, s) => Math.max(m, s.idleMinutes), 0);
  return { totalDistanceKm, totalDurationMin, avgSpeedKmh, stopCount, longestIdleMin };
}
