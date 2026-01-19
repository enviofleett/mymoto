/**
 * Structured Data Formatter
 * 
 * Formats vehicle data into structured JSON for LLM consumption
 * Replaces unstructured text dumps in system prompts
 */

import { DateContext } from './date-extractor.ts'
import { ValidatedData } from './data-validator.ts'
import { ConversationContext } from './conversation-manager.ts'

export interface StructuredVehicleData {
  realtime: {
    timestamp: string
    freshness: 'live' | 'cached' | 'stale'
    ageSeconds: number
    location: {
      lat: number | null
      lon: number | null
      address: string
      quality: 'high' | 'medium' | 'low'
    }
    status: {
      speed: number
      battery: number | null
      ignition: boolean
      isOnline: boolean
      isOverspeeding: boolean
    }
    dataQuality: 'high' | 'medium' | 'low'
  }
  historical: {
    period: {
      start: string
      end: string
      label: string
      timezone?: string
    }
    trips: Array<{
      id: string
      start: {
        time: string
        location: string
        coordinates: { lat: number | null; lon: number | null }
      }
      end: {
        time: string
        location: string
        coordinates: { lat: number | null; lon: number | null }
      }
      distance: number
      duration: number
      maxSpeed: number | null
      avgSpeed: number | null
      quality: 'high' | 'medium' | 'low'
      confidence: number
    }>
    positions: Array<{
      time: string
      lat: number
      lon: number
      speed: number
      quality: 'high' | 'medium' | 'low'
    }>
    dataQuality: 'high' | 'medium' | 'low'
    validationSummary: {
      totalTrips: number
      validTrips: number
      totalPositions: number
      validPositions: number
      issues: string[]
      warnings: string[]
    }
  }
  context: {
    conversationSummary: string | null
    relevantMemories: Array<{
      date: string
      content: string
      relevance: number
    }>
    temporalLinks: Array<{
      query: string
      date: string
      resolvedDate: string
    }>
  }
}

/**
 * Format realtime vehicle data
 */
export function formatRealtimeData(
  position: any,
  currentLocationName: string,
  dataFreshness: 'live' | 'cached' | 'stale',
  dataTimestamp: string,
  dataAgeSeconds: number
): StructuredVehicleData['realtime'] {
  return {
    timestamp: dataTimestamp,
    freshness: dataFreshness,
    ageSeconds: dataAgeSeconds,
    location: {
      lat: position?.latitude || null,
      lon: position?.longitude || null,
      address: currentLocationName,
      quality: (position?.latitude && position?.longitude && 
                position.latitude !== 0 && position.longitude !== 0) ? 'high' : 'low'
    },
    status: {
      speed: position?.speed || 0,
      battery: position?.battery_percent ?? null,
      ignition: position?.ignition_on || false,
      isOnline: position?.is_online || false,
      isOverspeeding: position?.is_overspeeding || false
    },
    dataQuality: dataFreshness === 'live' ? 'high' : dataFreshness === 'cached' ? 'medium' : 'low'
  }
}

/**
 * Format historical data (trips and positions)
 */
export function formatHistoricalData(
  validatedData: ValidatedData | null,
  dateContext: DateContext,
  tripNarrativeData: string | null
): StructuredVehicleData['historical'] {
  if (!validatedData) {
    return {
      period: {
        start: dateContext.startDate,
        end: dateContext.endDate,
        label: dateContext.humanReadable,
        timezone: dateContext.timezone
      },
      trips: [],
      positions: [],
      dataQuality: 'low',
      validationSummary: {
        totalTrips: 0,
        validTrips: 0,
        totalPositions: 0,
        validPositions: 0,
        issues: [],
        warnings: []
      }
    }
  }

  return {
    period: {
      start: dateContext.startDate,
      end: dateContext.endDate,
      label: dateContext.humanReadable,
      timezone: dateContext.timezone
    },
    trips: validatedData.trips.map(trip => ({
      id: trip.id || '',
      start: {
        time: trip.start_time,
        location: 'Unknown', // Will be geocoded if needed
        coordinates: {
          lat: trip.start_latitude,
          lon: trip.start_longitude
        }
      },
      end: {
        time: trip.end_time,
        location: 'Unknown', // Will be geocoded if needed
        coordinates: {
          lat: trip.end_latitude,
          lon: trip.end_longitude
        }
      },
      distance: trip.distance_km || 0,
      duration: trip.duration_seconds || 0,
      maxSpeed: trip.max_speed,
      avgSpeed: trip.avg_speed,
      quality: trip.dataQuality,
      confidence: trip.confidence
    })),
    positions: validatedData.positions.map(pos => ({
      time: pos.gps_time,
      lat: pos.latitude,
      lon: pos.longitude,
      speed: pos.speed,
      quality: pos.dataQuality
    })),
    dataQuality: validatedData.overallQuality,
    validationSummary: {
      totalTrips: validatedData.validationSummary.totalTrips,
      validTrips: validatedData.validationSummary.validTrips,
      totalPositions: validatedData.validationSummary.totalPositions,
      validPositions: validatedData.validationSummary.validPositions,
      issues: validatedData.validationSummary.issues,
      warnings: validatedData.validationSummary.crossValidationWarnings
    }
  }
}

/**
 * Format conversation context
 */
export function formatConversationContext(
  conversationContext: ConversationContext,
  ragContext: {
    memories: string[]
    semanticTripMatches: string[]
  }
): StructuredVehicleData['context'] {
  // Parse semantic memories into structured format
  const relevantMemories = ragContext.memories.map(memory => {
    // Extract date and relevance from memory string
    // Format: "[2026-01-15] (similarity: 85%) user: message..."
    const dateMatch = memory.match(/\[([^\]]+)\]/)
    const relevanceMatch = memory.match(/similarity:\s*(\d+)%/)
    
    return {
      date: dateMatch ? dateMatch[1] : new Date().toISOString(),
      content: memory,
      relevance: relevanceMatch ? parseInt(relevanceMatch[1]) / 100 : 0.5
    }
  })

  return {
    conversationSummary: conversationContext.conversation_summary,
    relevantMemories: relevantMemories.slice(0, 5), // Top 5 most relevant
    temporalLinks: [] // Will be populated by temporal context manager
  }
}

/**
 * Main formatter function
 */
export function formatStructuredVehicleData(
  realtime: StructuredVehicleData['realtime'],
  historical: StructuredVehicleData['historical'],
  context: StructuredVehicleData['context']
): StructuredVehicleData {
  return {
    realtime,
    historical,
    context
  }
}

/**
 * Convert structured data to LLM-friendly text format
 * (For backward compatibility while transitioning)
 */
export function structuredDataToPrompt(data: StructuredVehicleData): string {
  let prompt = '## STRUCTURED VEHICLE DATA\n\n'
  
  // Realtime data
  prompt += `### REALTIME STATUS [${data.realtime.freshness.toUpperCase()}]\n`
  prompt += `- Timestamp: ${data.realtime.timestamp} (${data.realtime.ageSeconds}s ago)\n`
  prompt += `- Location: ${data.realtime.location.address} (${data.realtime.location.lat}, ${data.realtime.location.lon})\n`
  prompt += `- Speed: ${data.realtime.status.speed} km/h\n`
  prompt += `- Battery: ${data.realtime.status.battery ?? 'Unknown'}%\n`
  prompt += `- Ignition: ${data.realtime.status.ignition ? 'ON' : 'OFF'}\n`
  prompt += `- Online: ${data.realtime.status.isOnline ? 'YES' : 'NO'}\n`
  prompt += `- Data Quality: ${data.realtime.dataQuality.toUpperCase()}\n\n`
  
  // Historical data
  if (data.historical.trips.length > 0 || data.historical.positions.length > 0) {
    prompt += `### HISTORICAL DATA (${data.historical.period.label})\n`
    prompt += `- Period: ${data.historical.period.start} to ${data.historical.period.end}\n`
    prompt += `- Trips: ${data.historical.trips.length} (${data.historical.validationSummary.validTrips} valid)\n`
    prompt += `- Positions: ${data.historical.positions.length} (${data.historical.validationSummary.validPositions} valid)\n`
    prompt += `- Data Quality: ${data.historical.dataQuality.toUpperCase()}\n`
    
    if (data.historical.validationSummary.warnings.length > 0) {
      prompt += `- Warnings: ${data.historical.validationSummary.warnings.slice(0, 2).join('; ')}\n`
    }
    prompt += '\n'
  }
  
  // Context
  if (data.context.conversationSummary) {
    prompt += `### CONVERSATION CONTEXT\n`
    prompt += `- Summary: ${data.context.conversationSummary}\n`
    prompt += `- Relevant Memories: ${data.context.relevantMemories.length}\n\n`
  }
  
  return prompt
}


