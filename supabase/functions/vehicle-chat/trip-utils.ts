export interface TripData {
  id: string
  start_time: string
  end_time: string
  start_location_name?: string
  end_location_name?: string
  start_address?: string
  end_address?: string
  distance_km: number
  duration_seconds: number
  start_latitude?: number
  start_longitude?: number
  end_latitude?: number
  end_longitude?: number
  max_speed?: number
  avg_speed?: number
  dataQuality?: 'high' | 'medium' | 'low'
  validationIssues?: string[]
  confidence?: number
  isGhost?: boolean
}

export function haversineDistanceValidator(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLon = (lon2 - lon1) * (Math.PI / 180)
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export function validateTrip(trip: any): TripData {
  const issues: string[] = []
  let confidence = 1.0
  let dataQuality: 'high' | 'medium' | 'low' = 'high'
  let isGhost = false

  // 1. Basic Field Validation
  if (!trip.start_time || !trip.end_time) {
    issues.push('Missing start_time or end_time')
    confidence -= 0.3
    dataQuality = 'low'
  }

  if (trip.start_time && trip.end_time) {
    const startTime = new Date(trip.start_time)
    const endTime = new Date(trip.end_time)
    if (endTime <= startTime) {
      issues.push('end_time is before or equal to start_time')
      confidence -= 0.2
      dataQuality = dataQuality === 'high' ? 'medium' : 'low'
    }
  }

  const hasStartCoords = trip.start_latitude && trip.start_longitude
  const hasEndCoords = trip.end_latitude && trip.end_longitude
  
  if (!hasStartCoords || !hasEndCoords) {
    issues.push('Missing start or end coordinates')
    confidence -= 0.2
    if (dataQuality === 'high') dataQuality = 'medium'
  } else {
    if (Math.abs(trip.start_latitude!) > 90 || Math.abs(trip.start_longitude!) > 180) {
      issues.push('Invalid start coordinates')
      confidence -= 0.3
      dataQuality = 'low'
    }
    if (Math.abs(trip.end_latitude!) > 90 || Math.abs(trip.end_longitude!) > 180) {
      issues.push('Invalid end coordinates')
      confidence -= 0.3
      dataQuality = 'low'
    }
  }

  // 2. Ghost / Drift Detection
  const dist = trip.distance_km || 0
  const dur = trip.duration_seconds || 0

  // Criterion A: REMOVED (Zero distance trips can be valid "Idling" if duration is long enough)
  // if (dist === 0) { ... }

  // Criterion B: Short duration and negligible distance (e.g. ignition flicker)
  // < 2 mins (120s) and < 0.1 km
  if (dur < 120 && dist < 0.1) {
    issues.push('Ghost Trip: Negligible distance and duration')
    isGhost = true
    confidence = 0
    dataQuality = 'low'
  }
  // Criterion C: Unrealistic Speed (GPS Jump)
  // > 250 km/h
  else if (dur > 0) {
      const hours = dur / 3600
      const speed = dist / hours
      if (speed > 250) {
          issues.push(`Ghost Trip: Unrealistic speed (${speed.toFixed(0)} km/h)`)
          isGhost = true
          confidence = 0
          dataQuality = 'low'
      }
  }

  if (trip.distance_km !== null && trip.distance_km !== undefined) {
    if (trip.distance_km < 0) {
      issues.push('Negative distance')
      confidence -= 0.2
    }
    
    if (hasStartCoords && hasEndCoords && trip.start_latitude && trip.start_longitude && trip.end_latitude && trip.end_longitude) {
      const calculatedDistance = haversineDistanceValidator(
        trip.start_latitude,
        trip.start_longitude,
        trip.end_latitude,
        trip.end_longitude
      )
      const reportedDistance = trip.distance_km || 0
      const distanceDiff = Math.abs(calculatedDistance - reportedDistance)
      
      // If calculated straight-line distance is significantly larger than reported odometer distance, something is wrong
      // (Odometer distance should usually be larger than straight line, unless straight line is perfect)
      // Actually, if reported is 0 and calculated is > 0, it's a drift.
      
      if (distanceDiff > reportedDistance * 0.5 && reportedDistance > 0.5) {
        // Just a warning, roads curve. But if difference is massive?
      }
    }
  } else {
    issues.push('Missing distance_km')
    confidence -= 0.1
  }

  return {
    ...trip,
    dataQuality,
    validationIssues: issues,
    confidence: Math.max(0, Math.min(1, confidence)),
    isGhost
  }
}
