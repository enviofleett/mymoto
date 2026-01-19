/**
 * Data Validation & Cross-Validation Layer
 * 
 * Validates and cross-checks data before sending to LLM to ensure accuracy
 * and flag data quality issues.
 */

import { DateContext } from './date-extractor.ts'

export interface ValidatedTrip {
  id: string
  start_time: string
  end_time: string
  start_latitude: number | null
  start_longitude: number | null
  end_latitude: number | null
  end_longitude: number | null
  distance_km: number
  duration_seconds: number | null
  max_speed: number | null
  avg_speed: number | null
  dataQuality: 'high' | 'medium' | 'low'
  validationIssues: string[]
  confidence: number // 0-1
}

export interface ValidatedPosition {
  latitude: number
  longitude: number
  speed: number
  gps_time: string
  ignition_on: boolean | null
  dataQuality: 'high' | 'medium' | 'low'
  validationIssues: string[]
}

export interface ValidatedData {
  trips: ValidatedTrip[]
  positions: ValidatedPosition[]
  overallQuality: 'high' | 'medium' | 'low'
  validationSummary: {
    totalTrips: number
    validTrips: number
    totalPositions: number
    validPositions: number
    issues: string[]
    crossValidationWarnings: string[]
  }
}

/**
 * Calculate Haversine distance between two coordinates
 */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371 // Earth's radius in km
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180)
}

/**
 * Validate a single trip record
 */
function validateTrip(trip: any, index: number, allTrips: any[]): ValidatedTrip {
  const issues: string[] = []
  let confidence = 1.0
  let dataQuality: 'high' | 'medium' | 'low' = 'high'

  // Check for required fields
  if (!trip.start_time || !trip.end_time) {
    issues.push('Missing start_time or end_time')
    confidence -= 0.3
    dataQuality = 'low'
  }

  // Validate time order
  if (trip.start_time && trip.end_time) {
    const startTime = new Date(trip.start_time)
    const endTime = new Date(trip.end_time)
    if (endTime <= startTime) {
      issues.push('end_time is before or equal to start_time')
      confidence -= 0.2
      dataQuality = dataQuality === 'high' ? 'medium' : 'low'
    }
  }

  // Validate coordinates
  const hasStartCoords = trip.start_latitude && trip.start_longitude
  const hasEndCoords = trip.end_latitude && trip.end_longitude
  
  if (!hasStartCoords || !hasEndCoords) {
    issues.push('Missing start or end coordinates')
    confidence -= 0.2
    if (dataQuality === 'high') dataQuality = 'medium'
  } else {
    // Validate coordinate ranges
    if (Math.abs(trip.start_latitude) > 90 || Math.abs(trip.start_longitude) > 180) {
      issues.push('Invalid start coordinates')
      confidence -= 0.3
      dataQuality = 'low'
    }
    if (Math.abs(trip.end_latitude) > 90 || Math.abs(trip.end_longitude) > 180) {
      issues.push('Invalid end coordinates')
      confidence -= 0.3
      dataQuality = 'low'
    }
  }

  // Validate distance
  if (trip.distance_km !== null && trip.distance_km !== undefined) {
    if (trip.distance_km < 0) {
      issues.push('Negative distance')
      confidence -= 0.2
    }
    
    // Cross-validate distance with coordinates if available
    if (hasStartCoords && hasEndCoords) {
      const calculatedDistance = haversineDistance(
        trip.start_latitude,
        trip.start_longitude,
        trip.end_latitude,
        trip.end_longitude
      )
      const reportedDistance = trip.distance_km || 0
      const distanceDiff = Math.abs(calculatedDistance - reportedDistance)
      
      // Allow 20% tolerance for GPS inaccuracy
      if (distanceDiff > reportedDistance * 0.2 && reportedDistance > 0.1) {
        issues.push(`Distance mismatch: reported ${reportedDistance.toFixed(2)}km, calculated ${calculatedDistance.toFixed(2)}km`)
        confidence -= 0.1
        if (dataQuality === 'high') dataQuality = 'medium'
      }
    }
  } else {
    issues.push('Missing distance_km')
    confidence -= 0.1
  }

  // Validate duration
  if (trip.duration_seconds !== null && trip.duration_seconds !== undefined) {
    if (trip.duration_seconds < 0) {
      issues.push('Negative duration')
      confidence -= 0.2
    }
    
    // Check if duration matches time difference
    if (trip.start_time && trip.end_time) {
      const startTime = new Date(trip.start_time)
      const endTime = new Date(trip.end_time)
      const calculatedDuration = (endTime.getTime() - startTime.getTime()) / 1000
      const reportedDuration = trip.duration_seconds
      const durationDiff = Math.abs(calculatedDuration - reportedDuration)
      
      // Allow 5 second tolerance
      if (durationDiff > 5) {
        issues.push(`Duration mismatch: reported ${reportedDuration}s, calculated ${calculatedDuration.toFixed(0)}s`)
        confidence -= 0.1
      }
    }
  }

  // Validate speed
  if (trip.max_speed !== null && trip.max_speed !== undefined) {
    if (trip.max_speed < 0 || trip.max_speed > 300) {
      issues.push(`Unrealistic max_speed: ${trip.max_speed} km/h`)
      confidence -= 0.1
    }
  }

  // Check for duplicate trips (same start/end within 1 minute)
  const duplicateTrips = allTrips.filter((t, i) => 
    i !== index &&
    t.start_time &&
    t.end_time &&
    Math.abs(new Date(t.start_time).getTime() - new Date(trip.start_time).getTime()) < 60000 &&
    Math.abs(new Date(t.end_time).getTime() - new Date(trip.end_time).getTime()) < 60000
  )
  
  if (duplicateTrips.length > 0) {
    issues.push(`Possible duplicate trip (${duplicateTrips.length} similar trips found)`)
    confidence -= 0.1
  }

  // Determine final quality
  if (confidence < 0.6) {
    dataQuality = 'low'
  } else if (confidence < 0.8) {
    dataQuality = 'medium'
  }

  return {
    ...trip,
    dataQuality,
    validationIssues: issues,
    confidence: Math.max(0, Math.min(1, confidence))
  }
}

/**
 * Validate a single position record
 */
function validatePosition(position: any): ValidatedPosition {
  const issues: string[] = []
  let dataQuality: 'high' | 'medium' | 'low' = 'high'

  // Validate coordinates
  if (!position.latitude || !position.longitude) {
    issues.push('Missing coordinates')
    dataQuality = 'low'
  } else {
    if (Math.abs(position.latitude) > 90 || Math.abs(position.longitude) > 180) {
      issues.push('Invalid coordinates')
      dataQuality = 'low'
    }
    
    // Check for null island (0,0) - often indicates invalid GPS
    if (position.latitude === 0 && position.longitude === 0) {
      issues.push('Null island coordinates (0,0) - likely invalid GPS')
      dataQuality = 'low'
    }
  }

  // Validate speed
  if (position.speed !== null && position.speed !== undefined) {
    if (position.speed < 0 || position.speed > 300) {
      issues.push(`Unrealistic speed: ${position.speed} km/h`)
      if (dataQuality === 'high') dataQuality = 'medium'
    }
  }

  // Validate timestamp
  if (!position.gps_time) {
    issues.push('Missing gps_time')
    if (dataQuality === 'high') dataQuality = 'medium'
  }

  return {
    ...position,
    dataQuality,
    validationIssues: issues
  }
}

/**
 * Cross-validate trips and positions for consistency
 */
function crossValidate(
  trips: ValidatedTrip[],
  positions: ValidatedPosition[],
  dateContext: DateContext
): string[] {
  const warnings: string[] = []

  // Check if trip count matches position movement
  if (trips.length > 0 && positions.length > 0) {
    const totalTripDistance = trips.reduce((sum, t) => sum + (t.distance_km || 0), 0)
    
    // Calculate distance from positions
    let positionDistance = 0
    for (let i = 1; i < positions.length; i++) {
      const prev = positions[i - 1]
      const curr = positions[i]
      if (prev.latitude && prev.longitude && curr.latitude && curr.longitude) {
        positionDistance += haversineDistance(
          prev.latitude,
          prev.longitude,
          curr.latitude,
          curr.longitude
        )
      }
    }
    
    // Compare distances (allow 30% tolerance)
    if (totalTripDistance > 0 && positionDistance > 0) {
      const distanceDiff = Math.abs(totalTripDistance - positionDistance)
      if (distanceDiff > totalTripDistance * 0.3) {
        warnings.push(
          `Distance mismatch: trips report ${totalTripDistance.toFixed(2)}km, positions calculate ${positionDistance.toFixed(2)}km`
        )
      }
    }
  }

  // Check date range coverage
  const startDate = new Date(dateContext.startDate)
  const endDate = new Date(dateContext.endDate)
  
  if (trips.length > 0) {
    const earliestTrip = trips.reduce((earliest, trip) => {
      const tripStart = new Date(trip.start_time)
      return tripStart < earliest ? tripStart : earliest
    }, new Date(trips[0].start_time))
    
    const latestTrip = trips.reduce((latest, trip) => {
      const tripEnd = new Date(trip.end_time)
      return tripEnd > latest ? tripEnd : latest
    }, new Date(trips[0].end_time))
    
    if (earliestTrip > startDate) {
      warnings.push(`Earliest trip (${earliestTrip.toISOString()}) is after requested start date (${startDate.toISOString()})`)
    }
    
    if (latestTrip < endDate) {
      warnings.push(`Latest trip (${latestTrip.toISOString()}) is before requested end date (${endDate.toISOString()})`)
    }
  }

  return warnings
}

/**
 * Main validation function
 */
export function validateAndEnrichData(
  trips: any[],
  positions: any[],
  dateContext: DateContext
): ValidatedData {
  // Validate all trips
  const validatedTrips = trips.map((trip, index) => validateTrip(trip, index, trips))
  
  // Validate all positions
  const validatedPositions = positions.map(validatePosition)
  
  // Cross-validate
  const crossValidationWarnings = crossValidate(validatedTrips, validatedPositions, dateContext)
  
  // Calculate overall quality
  const tripQualities = validatedTrips.map(t => t.dataQuality)
  const positionQualities = validatedPositions.map(p => p.dataQuality)
  
  const hasLowQuality = [...tripQualities, ...positionQualities].includes('low')
  const hasMediumQuality = [...tripQualities, ...positionQualities].includes('medium')
  
  let overallQuality: 'high' | 'medium' | 'low' = 'high'
  if (hasLowQuality) {
    overallQuality = 'low'
  } else if (hasMediumQuality || crossValidationWarnings.length > 0) {
    overallQuality = 'medium'
  }
  
  // Collect all issues
  const allIssues: string[] = []
  validatedTrips.forEach(t => allIssues.push(...t.validationIssues))
  validatedPositions.forEach(p => allIssues.push(...p.validationIssues))
  allIssues.push(...crossValidationWarnings)
  
  return {
    trips: validatedTrips,
    positions: validatedPositions,
    overallQuality,
    validationSummary: {
      totalTrips: trips.length,
      validTrips: validatedTrips.filter(t => t.dataQuality !== 'low').length,
      totalPositions: positions.length,
      validPositions: validatedPositions.filter(p => p.dataQuality !== 'low').length,
      issues: allIssues,
      crossValidationWarnings
    }
  }
}


