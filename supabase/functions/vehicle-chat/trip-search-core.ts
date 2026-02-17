export interface Gps51TripRow {
  id: string
  start_time: string
  end_time?: string | null
  start_latitude?: number | null
  start_longitude?: number | null
  end_latitude?: number | null
  end_longitude?: number | null
  distance_meters?: number | null
  duration_seconds?: number | null
  max_speed_kmh?: number | null
  avg_speed_kmh?: number | null
}

export interface SearchTripData {
  id: string
  start_time: string
  end_time?: string | null
  start_location_name?: string
  end_location_name?: string
  start_address?: string
  end_address?: string
  distance_km: number
  duration_seconds: number
  start_latitude?: number | null
  start_longitude?: number | null
  end_latitude?: number | null
  end_longitude?: number | null
  max_speed?: number | null
  avg_speed?: number | null
  isGhost?: boolean
}

export interface AddressResolver {
  (lat?: number | null, lng?: number | null): Promise<string | undefined>
}

export interface TripValidator {
  (trip: SearchTripData): SearchTripData
}

export function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

export function mapGps51TripToSearchTrip(trip: Gps51TripRow): SearchTripData {
  return {
    id: trip.id,
    start_time: trip.start_time,
    end_time: trip.end_time,
    start_latitude: trip.start_latitude,
    start_longitude: trip.start_longitude,
    end_latitude: trip.end_latitude,
    end_longitude: trip.end_longitude,
    distance_km: trip.distance_meters == null ? 0 : Number(trip.distance_meters) / 1000,
    duration_seconds: trip.duration_seconds || 0,
    max_speed: trip.max_speed_kmh,
    avg_speed: trip.avg_speed_kmh,
  }
}

export async function filterTripsByLocation(
  trips: Gps51TripRow[],
  targetLocation: string,
  resolveAddress: AddressResolver,
  validateTrip: TripValidator,
  maxResults = 10
): Promise<SearchTripData[]> {
  const normalizedTarget = normalizeText(targetLocation)
  const results: SearchTripData[] = []

  for (const trip of trips || []) {
    const validated = validateTrip(mapGps51TripToSearchTrip(trip))
    if (validated.isGhost) continue

    const startAddress = await resolveAddress(trip.start_latitude, trip.start_longitude)
    const endAddress = await resolveAddress(trip.end_latitude, trip.end_longitude)
    const startText = normalizeText(startAddress || '')
    const endText = normalizeText(endAddress || '')

    if (!startText.includes(normalizedTarget) && !endText.includes(normalizedTarget)) {
      continue
    }

    results.push({
      ...validated,
      start_address: startAddress,
      end_address: endAddress,
      start_location_name: startAddress,
      end_location_name: endAddress,
    })

    if (results.length >= maxResults) break
  }

  return results
}
