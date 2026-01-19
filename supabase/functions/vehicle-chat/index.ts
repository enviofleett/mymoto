import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildConversationContext, estimateTokenCount } from './conversation-manager.ts'
import { routeQuery } from './query-router.ts'
import { parseCommand, containsCommandKeywords, getCommandMetadata, GeofenceAlertParams } from './command-parser.ts'
import { generateTextEmbedding, formatEmbeddingForPg } from '../_shared/embedding-generator.ts'
import { learnAndGetPreferences, buildPreferenceContext } from './preference-learner.ts'
import { extractDateContext, isHistoricalMovementQuery, calculateDistanceFromHistory, DateContext } from './date-extractor.ts'
// Inlined Spell Checker (for Dashboard deployment compatibility)
// Common vehicle/driving terms dictionary with common misspellings
const VEHICLE_TERMS: Record<string, string[]> = {
  'battery': ['batry', 'batary', 'batery', 'battry', 'batt'],
  'location': ['locaton', 'locashun', 'locashon', 'lokashun'],
  'speed': ['sped', 'spede', 'spead'],
  'where': ['wher', 'were', 'whare', 'ware'],
  'you': ['yu', 'u', 'yuo', 'yo'],
  'are': ['ar', 'r', 're'],
  'level': ['levl', 'leval', 'lvl', 'leve'],
  'limit': ['limt', 'limmit', 'limet'],
  'trip': ['trep', 'tripp', 'trip'],
  'distance': ['distnce', 'distanc', 'distanse'],
  'mileage': ['milege', 'milag', 'milage'],
  'ignition': ['ignishun', 'ignishon', 'ignishn'],
  'status': ['statas', 'statuss', 'statuse'],
  'current': ['curret', 'curren', 'curent'],
  'position': ['posishun', 'posishon', 'posishn'],
  'parked': ['parkd', 'parkt'],
  'moving': ['movin', 'movng'],
  'stopped': ['stopd', 'stopt', 'stoped'],
  'driving': ['drivin', 'drivng'],
  'today': ['todai', 'todey', 'todae'],
  'yesterday': ['yestaday', 'yestaday', 'yesturday'],
  'how': ['how', 'hou'],
  'many': ['meny', 'mane'],
  'what': ['wat', 'wht'],
  'when': ['wen', 'whn'],
  'show': ['sho', 'shw'],
  'tell': ['tel', 'tll'],
  'me': ['me', 'mi'],
};

function normalizeMessage(message: string): string {
  let normalized = message.toLowerCase().trim();
  
  // Replace common typos using word boundaries
  for (const [correct, typos] of Object.entries(VEHICLE_TERMS)) {
    for (const typo of typos) {
      // Use word boundaries to avoid partial matches
      const regex = new RegExp(`\\b${typo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      normalized = normalized.replace(regex, correct);
    }
  }
  
  // Fix common character substitutions and patterns
  normalized = normalized
    .replace(/\bwher\b/gi, 'where')
    .replace(/\byu\b/gi, 'you')
    .replace(/\bar\b/gi, 'are')
    .replace(/\bthru\b/gi, 'through')
    .replace(/\btho\b/gi, 'though')
    .replace(/\bwat\b/gi, 'what')
    .replace(/\bwen\b/gi, 'when')
    .replace(/\bhou\b/gi, 'how')
    .replace(/\bmeny\b/gi, 'many')
    .replace(/\bsho\b/gi, 'show')
    .replace(/\btel\b/gi, 'tell')
    .replace(/\bmi\b/gi, 'me')
    .replace(/\bparkd\b/gi, 'parked')
    .replace(/\bmovin\b/gi, 'moving')
    .replace(/\bdrivin\b/gi, 'driving');
  
  return normalized;
}

function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

function fuzzyMatch(term: string, dictionary: string[]): string | null {
  if (!term || term.length === 0) return null;
  
  let bestMatch: string | null = null;
  let bestDistance = Infinity;
  const maxDistance = Math.max(1, Math.ceil(term.length * 0.3)); // 30% tolerance, min 1
  
  for (const dictTerm of dictionary) {
    const distance = levenshteinDistance(term.toLowerCase(), dictTerm.toLowerCase());
    if (distance < bestDistance && distance <= maxDistance) {
      bestDistance = distance;
      bestMatch = dictTerm;
    }
  }
  
  return bestMatch;
}

function preprocessUserMessage(message: string): {
  normalized: string;
  original: string;
  corrections: Array<{ original: string; corrected: string }>;
} {
  const original = message;
  const normalized = normalizeMessage(message);
  const corrections: Array<{ original: string; corrected: string }> = [];
  
  // Track corrections made by comparing word-by-word
  const originalWords = original.toLowerCase().split(/\s+/);
  const normalizedWords = normalized.split(/\s+/);
  
  for (let i = 0; i < Math.min(originalWords.length, normalizedWords.length); i++) {
    if (originalWords[i] !== normalizedWords[i]) {
      corrections.push({
        original: originalWords[i],
        corrected: normalizedWords[i]
      });
    }
  }
  
  return {
    normalized,
    original,
    corrections
  };
}

// Lovable AI Gateway Client (using only LOVABLE_API_KEY from secrets)
interface LLMConfig {
  maxOutputTokens?: number;
  temperature?: number;
  model?: string;
}

async function callGeminiAPIStream(
  systemPrompt: string,
  userPrompt: string,
  config: LLMConfig = {}
): Promise<ReadableStream<Uint8Array>> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

  if (!LOVABLE_API_KEY) {
    throw new Error('LOVABLE_API_KEY must be configured in Supabase secrets');
  }

  console.log('[LLM Client] Using Lovable AI Gateway');

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model || 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: config.maxOutputTokens || 2048,
      temperature: config.temperature ?? 0.7,
      stream: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[LLM Client] Lovable streaming error:', {
      status: response.status,
      body: errorText.substring(0, 200),
    });
    throw new Error(`Lovable API error: ${response.status}`);
  }

  if (!response.body) {
    throw new Error('Lovable API returned empty response body');
  }

  // Return the response stream directly (Lovable uses OpenAI format)
  return response.body;
}
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Geocode a location name to coordinates using Mapbox
async function geocodeLocation(locationName: string, mapboxToken: string): Promise<{ lat: number; lon: number; name: string } | null> {
  try {
    console.log(`Geocoding location: ${locationName}`)
    const encodedLocation = encodeURIComponent(locationName + ', Nigeria')
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedLocation}.json?access_token=${mapboxToken}&limit=1&country=NG`
    
    const response = await fetch(url)
    if (!response.ok) {
      console.error('Geocoding failed:', response.status)
      return null
    }
    
    const data = await response.json()
    if (data.features && data.features.length > 0) {
      const feature = data.features[0]
      return {
        lat: feature.center[1],
        lon: feature.center[0],
        name: feature.place_name || locationName
      }
    }
    
    return null
  } catch (error) {
    console.error('Geocoding error:', error)
    return null
  }
}

// Reverse geocode coordinates to address using Mapbox
async function reverseGeocode(lat: number, lon: number, mapboxToken: string): Promise<string> {
  try {
    if (!lat || !lon || lat === 0 || lon === 0) {
      return 'Location data unavailable'
    }
    
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lon},${lat}.json?access_token=${mapboxToken}&types=address,poi,place`
    const response = await fetch(url)
    
    if (!response.ok) {
      return `${lat.toFixed(4)}, ${lon.toFixed(4)}`
    }
    
    const data = await response.json()
    if (data.features && data.features.length > 0) {
      return data.features[0].place_name || `${lat.toFixed(4)}, ${lon.toFixed(4)}`
    }
    
    return `${lat.toFixed(4)}, ${lon.toFixed(4)}`
  } catch (error) {
    console.error('Reverse geocoding error:', error)
    return `${lat.toFixed(4)}, ${lon.toFixed(4)}`
  }
}

// Format trips as natural paragraph-based narrative stories with intelligent grouping
async function formatTripsAsNarrative(
  trips: any[],
  mapboxToken: string | null,
  dateLabel: string,
  supabase: any,
  deviceId: string
): Promise<string> {
  if (!trips || trips.length === 0) {
    return ''
  }
  
  // Group trips by date
  const tripsByDate = new Map<string, any[]>()
  trips.forEach(trip => {
    const tripDate = new Date(trip.start_time).toISOString().split('T')[0]
    if (!tripsByDate.has(tripDate)) {
      tripsByDate.set(tripDate, [])
    }
    tripsByDate.get(tripDate)!.push(trip)
  })
  
  // Process each date's trips into natural paragraph narratives
  const allParagraphs: string[] = []
  
  for (const [date, dateTrips] of tripsByDate.entries()) {
    // Sort trips by start time (earliest first)
    const sortedTrips = dateTrips.sort((a, b) => 
      new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    )
    
    // Enrich trips with addresses and metadata
    const enrichedTrips: Array<{
      trip: any
      startAddress: string
      endAddress: string
      startTime: Date
      endTime: Date
      durationMinutes: number
      distanceKm: number
      avgSpeed: number
      tripCharacter: string
      idlingInfo: { location: string; durationMinutes: number } | null
      timeReadable: string
    }> = []
    
    for (const trip of sortedTrips) {
      const startTime = new Date(trip.start_time)
      const endTime = new Date(trip.end_time)
      const durationMs = endTime.getTime() - startTime.getTime()
      const durationMinutes = Math.round(durationMs / 60000)
      
      // Get addresses - check for valid coordinates first
      let startAddress: string
      if ((trip.start_latitude === 0 && trip.start_longitude === 0) || 
          !trip.start_latitude || !trip.start_longitude) {
        startAddress = 'a nearby location'
      } else {
        startAddress = mapboxToken 
          ? await reverseGeocode(trip.start_latitude, trip.start_longitude, mapboxToken)
          : `${trip.start_latitude.toFixed(4)}, ${trip.start_longitude.toFixed(4)}`
        // If reverse geocoding returns "Location data unavailable", use fallback
        if (startAddress === 'Location data unavailable') {
          startAddress = 'a nearby location'
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 100))
      
      let endAddress: string
      if ((trip.end_latitude === 0 && trip.end_longitude === 0) || 
          !trip.end_latitude || !trip.end_longitude) {
        endAddress = 'a nearby location'
      } else {
        endAddress = mapboxToken
          ? await reverseGeocode(trip.end_latitude, trip.end_longitude, mapboxToken)
          : `${trip.end_latitude.toFixed(4)}, ${trip.end_longitude.toFixed(4)}`
        // If reverse geocoding returns "Location data unavailable", use fallback
        if (endAddress === 'Location data unavailable') {
          endAddress = 'a nearby location'
        }
      }
      
      // Fetch position history for idling detection
      let idlingInfo: { location: string; durationMinutes: number } | null = null
      try {
        const { data: positions } = await supabase
          .from('position_history')
          .select('latitude, longitude, speed, gps_time, ignition_on')
          .eq('device_id', deviceId)
          .gte('gps_time', trip.start_time)
          .lte('gps_time', trip.end_time)
          .order('gps_time', { ascending: true })
          .limit(200)
        
        if (positions && positions.length > 0) {
          let idleStart: Date | null = null
          let maxIdleDuration = 0
          let idleLocation: { lat: number; lon: number } | null = null
          
          for (let i = 0; i < positions.length; i++) {
            const pos = positions[i]
            const speed = pos.speed || 0
            
            if (speed < 2 && pos.ignition_on) {
              if (!idleStart) {
                idleStart = new Date(pos.gps_time)
                idleLocation = { lat: pos.latitude, lon: pos.longitude }
              }
            } else {
              if (idleStart) {
                const idleDuration = Math.round((new Date(pos.gps_time).getTime() - idleStart.getTime()) / 60000)
                if (idleDuration >= 5 && idleDuration > maxIdleDuration) {
                  maxIdleDuration = idleDuration
                  if (idleLocation && mapboxToken) {
                    const idleAddress = await reverseGeocode(idleLocation.lat, idleLocation.lon, mapboxToken)
                    idlingInfo = { location: idleAddress, durationMinutes: idleDuration }
                  }
                }
                idleStart = null
                idleLocation = null
              }
            }
          }
          
          if (idleStart && maxIdleDuration < 5) {
            const finalIdleDuration = Math.round((endTime.getTime() - idleStart.getTime()) / 60000)
            if (finalIdleDuration >= 5) {
              if (idleLocation && mapboxToken) {
                const idleAddress = await reverseGeocode(idleLocation.lat, idleLocation.lon, mapboxToken)
                idlingInfo = { location: idleAddress, durationMinutes: finalIdleDuration }
              }
            }
          }
        }
      } catch (error) {
        console.error('Error fetching idling data:', error)
      }
      
      const distanceKm = trip.distance_km || 0
      const avgSpeed = distanceKm && durationMinutes > 0 
        ? (distanceKm / durationMinutes) * 60 
        : 0
      const tripCharacter = getTripCharacter(avgSpeed, durationMinutes, distanceKm)
      const timeReadable = formatTimeReadable(startTime)
      
      enrichedTrips.push({
        trip,
        startAddress,
        endAddress,
        startTime,
        endTime,
        durationMinutes,
        distanceKm,
        avgSpeed,
        tripCharacter,
        idlingInfo,
        timeReadable
      })
      
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    // Group similar trips together
    const tripGroups: Array<typeof enrichedTrips> = []
    let currentGroup: typeof enrichedTrips = []
    
    for (let i = 0; i < enrichedTrips.length; i++) {
      const trip = enrichedTrips[i]
      const prevTrip = i > 0 ? enrichedTrips[i - 1] : null
      
      // Check if this trip should be grouped with previous
      const shouldGroup = prevTrip && (
        // Same start and end locations (round trip)
        (trip.startAddress === prevTrip.endAddress && trip.endAddress === prevTrip.startAddress) ||
        // Same start location, very short distance, close in time
        (trip.startAddress === prevTrip.endAddress && 
         trip.distanceKm < 3 && 
         (trip.startTime.getTime() - prevTrip.endTime.getTime()) < 2 * 60 * 60 * 1000) ||
        // Very short trips in same area within 1 hour
        (trip.distanceKm < 2 && 
         prevTrip.distanceKm < 2 &&
         (trip.startTime.getTime() - prevTrip.endTime.getTime()) < 60 * 60 * 1000)
      )
      
      if (shouldGroup && currentGroup.length > 0) {
        currentGroup.push(trip)
      } else {
        if (currentGroup.length > 0) {
          tripGroups.push(currentGroup)
        }
        currentGroup = [trip]
      }
    }
    
    if (currentGroup.length > 0) {
      tripGroups.push(currentGroup)
    }
    
    // Build narrative paragraphs from groups
    for (let groupIndex = 0; groupIndex < tripGroups.length; groupIndex++) {
      const group = tripGroups[groupIndex]
      const isFirstGroup = groupIndex === 0
      const isLastGroup = groupIndex === tripGroups.length - 1
      
      if (group.length === 1) {
        // Single trip - use varied narrative
        const t = group[0]
        const distanceReadable = formatDistanceReadable(t.distanceKm)
        const endTimeReadable = formatTimeReadable(t.endTime)
        
        let paragraph = ''
        
        if (isFirstGroup) {
          paragraph = `I began my day ${t.timeReadable} with ${t.tripCharacter} ${distanceReadable} drive from ${t.startAddress} to ${t.endAddress}.`
        } else {
          const timeGap = Math.round((t.startTime.getTime() - tripGroups[groupIndex - 1][tripGroups[groupIndex - 1].length - 1].endTime.getTime()) / (60 * 1000))
          const timeConnector = timeGap < 30 ? 'Shortly after' : timeGap < 120 ? 'A little later' : 'Later'
          paragraph = `${timeConnector}, I made ${t.tripCharacter} ${distanceReadable} journey from ${t.startAddress} to ${t.endAddress}.`
        }
        
        if (t.idlingInfo && t.idlingInfo.durationMinutes >= 5) {
          const idleDurationReadable = t.idlingInfo.durationMinutes < 60 
            ? `about ${t.idlingInfo.durationMinutes} minutes`
            : `about ${Math.floor(t.idlingInfo.durationMinutes / 60)} hour${Math.floor(t.idlingInfo.durationMinutes / 60) > 1 ? 's' : ''} and ${t.idlingInfo.durationMinutes % 60} minutes`
          paragraph += ` Along the way, I paused for ${idleDurationReadable} near ${t.idlingInfo.location}, likely waiting for traffic to ease.`
        }
        
        paragraph += ` I arrived ${endTimeReadable} and settled in.`
        allParagraphs.push(paragraph)
        
      } else {
        // Multiple trips in group - narrate as a pattern
        const firstTrip = group[0]
        const lastTrip = group[group.length - 1]
        const totalDistance = group.reduce((sum, t) => sum + t.distanceKm, 0)
        const totalTrips = group.length
        
        let paragraph = ''
        
        if (isFirstGroup) {
          paragraph = `I started ${firstTrip.timeReadable} with a series of brief movements around ${firstTrip.startAddress}.`
        } else {
          const timeGap = Math.round((firstTrip.startTime.getTime() - tripGroups[groupIndex - 1][tripGroups[groupIndex - 1].length - 1].endTime.getTime()) / (60 * 1000))
          const timeConnector = timeGap < 30 ? 'Shortly after' : timeGap < 120 ? 'A little later' : 'Later'
          paragraph = `${timeConnector}, I made several quick trips around ${firstTrip.startAddress}.`
        }
        
        // Describe the pattern
        if (totalTrips <= 3) {
          const locations = [...new Set(group.map(t => t.endAddress))]
          if (locations.length === 1) {
            paragraph += ` I made ${totalTrips} ${totalTrips === 2 ? 'round trips' : 'short trips'} to ${locations[0]}, covering about ${Math.round(totalDistance)} kilometers in total.`
          } else {
            paragraph += ` I made ${totalTrips} brief trips, moving between ${locations.slice(0, 2).join(' and ')}${locations.length > 2 ? ' and a few other nearby spots' : ''}, covering about ${Math.round(totalDistance)} kilometers.`
          }
        } else {
          paragraph += ` I made ${totalTrips} quick trips around the area, covering about ${Math.round(totalDistance)} kilometers in total.`
        }
        
        const endTimeReadable = formatTimeReadable(lastTrip.endTime)
        paragraph += ` These movements wrapped up ${endTimeReadable}.`
        
        allParagraphs.push(paragraph)
      }
    }
  }
  
  // Join paragraphs with natural spacing (double line break for readability)
  let fullNarrative = allParagraphs.join('\n\n')
  
  // Break long paragraphs into smaller chunks (approximately 100 characters each)
  const maxParagraphLength = 100
  const brokenParagraphs: string[] = []
  
  // Split by sentences first, then by paragraph breaks
  const sentences = fullNarrative.split(/(?<=[.!?])\s+/)
  let currentParagraph = ''
  
  for (const sentence of sentences) {
    // If adding this sentence would exceed the limit, start a new paragraph
    if (currentParagraph.length + sentence.length + 1 > maxParagraphLength && currentParagraph.length > 0) {
      brokenParagraphs.push(currentParagraph.trim())
      currentParagraph = sentence
    } else {
      currentParagraph += (currentParagraph ? ' ' : '') + sentence
    }
  }
  
  // Add the last paragraph
  if (currentParagraph.trim()) {
    brokenParagraphs.push(currentParagraph.trim())
  }
  
  // Rejoin with double line breaks
  fullNarrative = brokenParagraphs.join('\n\n')
  
  // Add gentle call-to-action at the end
  const finalNarrative = `${fullNarrative}\n\nWhenever you're curious to see the full breakdown of these trips, you can find all the details in my car profile.`
  
  return finalNarrative
}

// Helper: Format time in human-readable way
function formatTimeReadable(date: Date): string {
  const hour = date.getHours()
  const minute = date.getMinutes()
  
  // Determine period and convert to 12-hour format
  let period: string
  let hour12: number
  
  if (hour === 0) {
    period = 'in the morning'
    hour12 = 12
  } else if (hour < 12) {
    period = 'in the morning'
    hour12 = hour
  } else if (hour === 12) {
    period = 'in the afternoon'
    hour12 = 12
  } else {
    period = 'in the afternoon'
    hour12 = hour - 12
  }
  
  // Format based on minutes
  if (minute === 0) {
    return `just after ${hour12} ${period}`
  } else if (minute < 10) {
    return `just after ${hour12} ${period}`
  } else if (minute < 30) {
    return `around ${hour12}:${minute.toString().padStart(2, '0')} ${period}`
  } else if (minute < 45) {
    // Calculate next hour in 12-hour format
    const nextHour = hour + 1
    let nextHour12: number
    let nextPeriod: string
    
    if (nextHour === 24) {
      nextPeriod = 'in the morning'
      nextHour12 = 12
    } else if (nextHour < 12) {
      nextPeriod = 'in the morning'
      nextHour12 = nextHour
    } else if (nextHour === 12) {
      nextPeriod = 'in the afternoon'
      nextHour12 = 12
    } else {
      nextPeriod = 'in the afternoon'
      nextHour12 = nextHour - 12
    }
    
    return `a little before ${nextHour12} ${nextPeriod}`
  } else {
    // Calculate next hour in 12-hour format
    const nextHour = hour + 1
    let nextHour12: number
    let nextPeriod: string
    
    if (nextHour === 24) {
      nextPeriod = 'in the morning'
      nextHour12 = 12
    } else if (nextHour < 12) {
      nextPeriod = 'in the morning'
      nextHour12 = nextHour
    } else if (nextHour === 12) {
      nextPeriod = 'in the afternoon'
      nextHour12 = 12
    } else {
      nextPeriod = 'in the afternoon'
      nextHour12 = nextHour - 12
    }
    
    return `a little before ${nextHour12} ${nextPeriod}`
  }
}

// Helper: Format distance in human-readable way
function formatDistanceReadable(distanceKm: number): string {
  if (distanceKm < 1) {
    return 'a very short'
  } else if (distanceKm < 5) {
    return `a short ${Math.round(distanceKm)}-kilometer`
  } else if (distanceKm < 15) {
    return `a smooth ${Math.round(distanceKm)}-kilometer`
  } else if (distanceKm < 30) {
    return `a decent ${Math.round(distanceKm)}-kilometer`
  } else {
    return `a long ${Math.round(distanceKm)}-kilometer`
  }
}

// Helper: Determine trip character based on speed and duration
function getTripCharacter(avgSpeed: number, durationMinutes: number, distanceKm: number): string {
  if (avgSpeed < 20 && durationMinutes > 30) {
    return 'a relaxed'
  } else if (avgSpeed > 50 && durationMinutes < 20) {
    return 'a quick'
  } else if (distanceKm < 5) {
    return 'a brief'
  } else {
    return 'a smooth'
  }
}

// Create a geofence monitor
async function createGeofenceMonitor(
  supabase: any,
  deviceId: string,
  userId: string,
  locationName: string,
  geofenceParams: GeofenceAlertParams,
  mapboxToken: string
): Promise<{ success: boolean; monitorId?: string; locationName?: string; message: string }> {
  try {
    console.log(`Creating geofence monitor for ${locationName}`)
    
    // First check if location exists in our database
    const { data: existingLocation } = await supabase
      .from('geofence_locations')
      .select('*')
      .ilike('name', `%${locationName}%`)
      .limit(1)
      .maybeSingle()
    
    let locationId = null
    let lat: number | null = null
    let lon: number | null = null
    let radius = 500
    let finalLocationName = locationName
    
    if (existingLocation) {
      console.log(`Found existing location: ${existingLocation.name}`)
      locationId = existingLocation.id
      finalLocationName = existingLocation.name
      radius = existingLocation.radius_meters
    } else {
      // Need to geocode
      const geocoded = await geocodeLocation(locationName, mapboxToken)
      if (!geocoded) {
        return {
          success: false,
          message: `I couldn't find "${locationName}" on the map. Try being more specific, like "Garki, Abuja" or "Victoria Island, Lagos".`
        }
      }
      
      lat = geocoded.lat
      lon = geocoded.lon
      finalLocationName = geocoded.name
      console.log(`Geocoded to: ${lat}, ${lon}`)
    }
    
    // Create the monitor
    const monitorData: any = {
      device_id: deviceId,
      trigger_on: geofenceParams.trigger_on || 'enter',
      one_time: geofenceParams.one_time || false,
      is_active: true,
      created_by: userId
    }
    
    if (locationId) {
      monitorData.location_id = locationId
    } else {
      monitorData.location_name = finalLocationName
      monitorData.latitude = lat
      monitorData.longitude = lon
      monitorData.radius_meters = radius
    }
    
    // Add time conditions
    if (geofenceParams.active_from) {
      monitorData.active_from = geofenceParams.active_from
    }
    if (geofenceParams.active_until) {
      monitorData.active_until = geofenceParams.active_until
    }
    if (geofenceParams.active_days) {
      monitorData.active_days = geofenceParams.active_days
    }
    if (geofenceParams.expires_at) {
      monitorData.expires_at = geofenceParams.expires_at
    }
    
    const { data: monitor, error } = await supabase
      .from('geofence_monitors')
      .insert(monitorData)
      .select()
      .single()
    
    if (error) {
      console.error('Failed to create monitor:', error)
      return {
        success: false,
        message: `I couldn't create the alert: ${error.message}`
      }
    }
    
    console.log(`Created geofence monitor: ${monitor.id}`)
    
    // Build confirmation message
    let confirmMsg = `I've set up an alert for when this vehicle ${geofenceParams.trigger_on === 'exit' ? 'leaves' : geofenceParams.trigger_on === 'both' ? 'arrives at or leaves' : 'arrives at'} ${finalLocationName}.`
    
    if (geofenceParams.active_from && geofenceParams.active_until) {
      confirmMsg += ` This alert is active between ${geofenceParams.active_from} and ${geofenceParams.active_until}.`
    }
    if (geofenceParams.active_days && geofenceParams.active_days.length < 7) {
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      const days = geofenceParams.active_days.map(d => dayNames[d]).join(', ')
      confirmMsg += ` Only on ${days}.`
    }
    if (geofenceParams.one_time) {
      confirmMsg += ` This is a one-time alert and will deactivate after triggering.`
    }
    
    return {
      success: true,
      monitorId: monitor.id,
      locationName: finalLocationName,
      message: confirmMsg
    }
  } catch (error) {
    console.error('Error creating geofence monitor:', error)
    return {
      success: false,
      message: `Something went wrong creating the alert: ${error instanceof Error ? error.message : 'Unknown error'}`
    }
  }
}

// List active geofence monitors for a device
async function listGeofenceMonitors(supabase: any, deviceId: string): Promise<{ monitors: any[]; message: string }> {
  const { data: monitors, error } = await supabase
    .from('geofence_monitors')
    .select(`
      id,
      location_name,
      trigger_on,
      one_time,
      active_from,
      active_until,
      active_days,
      expires_at,
      trigger_count,
      geofence_locations (name)
    `)
    .eq('device_id', deviceId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
  
  if (error || !monitors || monitors.length === 0) {
    return { monitors: [], message: 'No active location alerts for this vehicle.' }
  }
  
  const alertList = monitors.map((m: any, i: number) => {
    const name = m.geofence_locations?.name || m.location_name
    const triggerText = m.trigger_on === 'exit' ? 'leaves' : m.trigger_on === 'both' ? 'arrives/leaves' : 'arrives at'
    return `${i + 1}. Alert when ${triggerText} **${name}** (triggered ${m.trigger_count || 0} times)`
  }).join('\n')
  
  return {
    monitors,
    message: `You have ${monitors.length} active location alert${monitors.length > 1 ? 's' : ''} for this vehicle:\n${alertList}`
  }
}

// Cancel a geofence monitor
async function cancelGeofenceMonitor(supabase: any, deviceId: string, locationName: string | null): Promise<{ success: boolean; message: string }> {
  let query = supabase
    .from('geofence_monitors')
    .update({ is_active: false })
    .eq('device_id', deviceId)
    .eq('is_active', true)
  
  if (locationName) {
    // Try to match by location name
    query = query.or(`location_name.ilike.%${locationName}%,geofence_locations.name.ilike.%${locationName}%`)
  }
  
  const { data, error, count } = await query.select()
  
  if (error) {
    return { success: false, message: `Failed to cancel alert: ${error.message}` }
  }
  
  if (!data || data.length === 0) {
    return { success: false, message: locationName 
      ? `No active alert found for "${locationName}".`
      : 'No active alerts to cancel.' 
    }
  }
  
  return {
    success: true,
    message: `Cancelled ${data.length} location alert${data.length > 1 ? 's' : ''}.`
  }
}

// Fetch fresh GPS data from GPS51 via gps-data edge function
async function fetchFreshGpsData(supabase: any, deviceId: string): Promise<any> {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  
  try {
    console.log(`Fetching fresh GPS data for device: ${deviceId}`)
    
    const response = await fetch(`${SUPABASE_URL}/functions/v1/gps-data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
      },
      body: JSON.stringify({
        action: 'lastposition',
        body_payload: { deviceids: [deviceId] },
        use_cache: false // Force fresh data
      })
    })
    
    if (!response.ok) {
      console.error('GPS data fetch failed:', response.status)
      return null
    }
    
    const result = await response.json()
    console.log('Fresh GPS data received:', result.data?.records?.length || 0, 'records')
    
    // Return the record for this device
    return result.data?.records?.find((r: any) => r.deviceid === deviceId) || null
  } catch (error) {
    console.error('Error fetching fresh GPS data:', error)
    return null
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { device_id, message, user_id, client_timestamp, live_telemetry } = await req.json()
    
    const MAPBOX_ACCESS_TOKEN = Deno.env.get('MAPBOX_ACCESS_TOKEN')
    // Gemini API key is checked in shared client

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    console.log(`Vehicle chat request for device: ${device_id}`)

    // Preprocess user message: normalize typos and spelling mistakes
    const { normalized: normalizedMessage, original: originalMessage, corrections } = preprocessUserMessage(message)
    
    if (corrections.length > 0) {
      console.log(`[Spell Check] Corrected ${corrections.length} typos:`, corrections)
    }

    // Route query FIRST using intelligent intent classification (needed for command priority)
    // Use normalized message for better pattern matching
    const routing = routeQuery(normalizedMessage, device_id)
    console.log(`Query routing:`, {
      intent: routing.intent.type,
      confidence: routing.intent.confidence,
      cache_strategy: routing.cache_strategy,
      priority: routing.priority,
      estimated_latency: routing.estimated_latency_ms
    })


    // Check for vehicle commands (use normalized message for better command detection)
    let commandCreated = null
    let commandExecutionResult = null
    let geofenceResult = null
    
    if (containsCommandKeywords(normalizedMessage)) {
      const parsedCommand = parseCommand(normalizedMessage)

      if (parsedCommand.isCommand && parsedCommand.commandType) {
        console.log(`Command detected: ${parsedCommand.commandType} (confidence: ${parsedCommand.confidence})`)

        // HANDLE GEOFENCE COMMANDS SPECIALLY
        if (parsedCommand.commandType === 'create_geofence_alert') {
          console.log('Processing geofence alert creation...')
          
          const locationName = parsedCommand.parameters?.location_name || parsedCommand.geofenceParams?.location_name
          
          if (!locationName) {
            geofenceResult = {
              success: false,
              message: "I'd like to set up a location alert for you, but I didn't catch where. Could you tell me the location name? For example: 'Notify me when I arrive at Garki'"
            }
          } else if (!MAPBOX_ACCESS_TOKEN) {
            geofenceResult = {
              success: false,
              message: "I can't set up location alerts right now because the mapping service isn't configured."
            }
          } else {
            geofenceResult = await createGeofenceMonitor(
              supabase,
              device_id,
              user_id,
              locationName,
              parsedCommand.geofenceParams || { trigger_on: 'enter' },
              MAPBOX_ACCESS_TOKEN
            )
          }
          
          commandCreated = {
            id: geofenceResult?.monitorId || null,
            type: 'create_geofence_alert',
            requires_confirmation: false,
            parameters: { location_name: locationName }
          }
          commandExecutionResult = {
            success: geofenceResult?.success || false,
            message: geofenceResult?.message || 'Unknown error'
          }
          
        } else if (parsedCommand.commandType === 'list_geofence_alerts') {
          console.log('Listing geofence alerts...')
          
          const result = await listGeofenceMonitors(supabase, device_id)
          
          commandCreated = {
            id: null,
            type: 'list_geofence_alerts',
            requires_confirmation: false,
            parameters: {}
          }
          commandExecutionResult = {
            success: true,
            message: result.message,
            data: { monitors: result.monitors }
          }
          geofenceResult = { success: true, message: result.message }
          
        } else if (parsedCommand.commandType === 'cancel_geofence_alert') {
          console.log('Cancelling geofence alert...')
          
          const result = await cancelGeofenceMonitor(
            supabase,
            device_id,
            parsedCommand.parameters?.location_name
          )
          
          commandCreated = {
            id: null,
            type: 'cancel_geofence_alert',
            requires_confirmation: false,
            parameters: parsedCommand.parameters
          }
          commandExecutionResult = {
            success: result.success,
            message: result.message
          }
          geofenceResult = result
          
        } else {
          // HANDLE OTHER COMMANDS (existing logic)
          const commandMetadata = getCommandMetadata(parsedCommand.commandType)
          commandCreated = {
            id: null,
            type: parsedCommand.commandType,
            requires_confirmation: commandMetadata.requiresConfirmation,
            parameters: parsedCommand.parameters
          }

          // Auto-execute commands that don't require confirmation
          if (!commandMetadata.requiresConfirmation) {
            console.log(`Auto-executing command: ${parsedCommand.commandType}`)
            
            try {
              const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
              const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
              
              const executeResponse = await fetch(`${SUPABASE_URL}/functions/v1/execute-vehicle-command`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
                },
                body: JSON.stringify({
                  device_id,
                  command_type: parsedCommand.commandType,
                  payload: parsedCommand.parameters,
                  user_id,
                  skip_confirmation: true
                })
              })

              if (executeResponse.ok) {
                commandExecutionResult = await executeResponse.json()
                commandCreated.id = commandExecutionResult.command_id
                console.log(`Command executed successfully:`, commandExecutionResult)
              } else {
                const errorText = await executeResponse.text()
                console.error(`Command execution failed:`, errorText)
                commandExecutionResult = { success: false, message: errorText }
              }
            } catch (error) {
              console.error(`Error executing command:`, error)
              commandExecutionResult = { success: false, message: error instanceof Error ? error.message : 'Unknown error' }
            }
          } else {
            // Log the command as pending for confirmation
            console.log(`Command requires confirmation: ${parsedCommand.commandType}`)
            
            try {
              const { data: pendingCommand, error } = await supabase
                .from('vehicle_command_logs')
                .insert({
                  device_id,
                  user_id,
                  command_type: parsedCommand.commandType,
                  payload: parsedCommand.parameters,
                  requires_confirmation: true,
                  status: 'pending'
                })
                .select()
                .single()

              if (!error && pendingCommand) {
                commandCreated.id = pendingCommand.id
                console.log(`Pending command logged: ${pendingCommand.id}`)
              }
            } catch (error) {
              console.error(`Error logging pending command:`, error)
            }
          }
        }
      }
    }

    // Determine if fresh data is needed based on routing

    const needsFreshData = routing.cache_strategy === 'fresh' || routing.cache_strategy === 'hybrid'

    // 1. Fetch Vehicle info
    const { data: vehicle, error: vehicleError } = await supabase
      .from('vehicles')
      .select(`
        device_id, device_name, gps_owner, sim_number, device_type
      `)
      .eq('device_id', device_id)
      .single()

    if (vehicleError) {
      console.error('Error fetching vehicle:', vehicleError)
    }

    // 1.5. Fetch LLM Settings (persona configuration)
    const { data: llmSettings } = await supabase
      .from('vehicle_llm_settings')
      .select('*')
      .eq('device_id', device_id)
      .maybeSingle()

    // Check if LLM is disabled
    if (llmSettings && !llmSettings.llm_enabled) {
      return new Response(JSON.stringify({ 
        error: 'AI companion is paused for this vehicle. Please enable it in settings.' 
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 2. Fetch position - FRESH if location query, otherwise cached
    let position: any = null
    let dataFreshness = 'cached'
    let dataTimestamp = new Date().toISOString()
    
    if (needsFreshData) {
      // Fetch fresh data from GPS51
      const freshData = await fetchFreshGpsData(supabase, device_id)
      if (freshData) {
        dataFreshness = 'live'
        dataTimestamp = freshData.updatetime ? new Date(freshData.updatetime).toISOString() : new Date().toISOString()
        
        // Map fresh GPS51 data to position format
        position = {
          device_id: freshData.deviceid,
          latitude: freshData.callat,
          longitude: freshData.callon,
          speed: freshData.speed || 0,
          heading: freshData.heading,
          altitude: freshData.altitude,
          battery_percent: freshData.voltagepercent > 0 ? freshData.voltagepercent : null,
          // ✅ FIX: Use JT808 status bit field instead of string parsing
          ignition_on: freshData.status !== null && freshData.status !== undefined
            ? (freshData.status & 0x01) !== 0  // Bit 0 = ACC status (authoritative)
            : freshData.strstatus?.toUpperCase().includes('ACC ON') || false,  // Fallback
          is_online: freshData.updatetime ? (Date.now() - new Date(freshData.updatetime).getTime() < 600000) : false,
          is_overspeeding: freshData.currentoverspeedstate === 1,
          total_mileage: freshData.totaldistance,
          status_text: freshData.strstatus,
          gps_time: freshData.updatetime ? new Date(freshData.updatetime).toISOString() : null
        }
      }
    }
    
    // Fallback to cached position if fresh fetch failed or not needed
    if (!position) {
      const { data: cachedPosition } = await supabase
        .from('vehicle_positions')
        .select('*')
        .eq('device_id', device_id)
        .single()
      position = cachedPosition
      if (position?.gps_time) {
        dataTimestamp = position.gps_time
      }
    }

    // 3. Fetch Driver Info
    const { data: assignment } = await supabase
      .from('vehicle_assignments')
      .select('vehicle_alias, profiles (id, name, phone, license_number, user_id)')
      .eq('device_id', device_id)
      .maybeSingle()

    // 3.5. Fetch Owner's Display Name (for personalized AI responses)
    let ownerDisplayName: string | null = null
    if (user_id) {
      const { data: ownerProfile } = await supabase
        .from('profiles')
        .select('name')
        .eq('user_id', user_id)
        .maybeSingle()
      
      if (ownerProfile?.name) {
        ownerDisplayName = ownerProfile.name
        console.log(`Owner display name: ${ownerDisplayName}`)
      }
    }

    // 4. Fetch Recent Position History (last 10 for trend analysis)
    const { data: history } = await supabase
      .from('position_history')
      .select('speed, battery_percent, ignition_on, gps_time, latitude, longitude')
      .eq('device_id', device_id)
      .order('gps_time', { ascending: false })
      .limit(10)

    // 4.5. Extract date context from user message for historical queries
    const dateContext = extractDateContext(message, client_timestamp)
    console.log('Date context extracted:', {
      hasDateReference: dateContext.hasDateReference,
      period: dateContext.period,
      humanReadable: dateContext.humanReadable,
      startDate: dateContext.startDate,
      endDate: dateContext.endDate
    })

    // 4.6. Fetch date-specific trip and position history if user is asking about a specific time period
    let dateSpecificTrips: any[] = []
    let dateSpecificPositions: any[] = []
    let dateSpecificStats: {
      totalDistance: number
      tripCount: number
      movementDetected: boolean
      earliestPosition: string | null
      latestPosition: string | null
      positionCount: number
    } | null = null

    if (dateContext.hasDateReference || isHistoricalMovementQuery(message)) {
      console.log(`Fetching historical data for period: ${dateContext.humanReadable}`)
      
      // ✅ FIX: Fetch trips with timeout protection and optimized column selection
      // Ensure we get all trips in the date range, not just recent ones
      try {
        const tripQueryResult = await Promise.race([
          supabase
            .from('vehicle_trips')
            // ✅ Only select needed columns to reduce data transfer and speed up query
            .select('id, start_time, end_time, distance_km, duration_seconds, start_latitude, start_longitude, end_latitude, end_longitude')
            .eq('device_id', device_id)
            .gte('start_time', dateContext.startDate)
            .lte('end_time', dateContext.endDate)
            .order('start_time', { ascending: false })
            .limit(200), // Limit to 200 trips
          // ✅ 8 second timeout for trip queries
          new Promise<{ data: null; error: { code: string; message: string } }>((_, reject) =>
            setTimeout(() => reject({ code: 'TIMEOUT', message: 'Trip query timeout' }), 8000)
          )
        ]);

        const { data: trips, error: tripsError } = tripQueryResult as any;

        console.log(`[Trip Query] Date range: ${dateContext.startDate} to ${dateContext.endDate}`);
        console.log(`[Trip Query] Found ${trips?.length || 0} trips for ${dateContext.humanReadable}`);

        if (tripsError) {
          console.error('Error fetching date-specific trips:', tripsError);
        } else {
          dateSpecificTrips = trips || [];
          console.log(`Found ${dateSpecificTrips.length} trips for ${dateContext.humanReadable}`);
        }
      } catch (error: any) {
        if (error?.code === 'TIMEOUT') {
          console.warn('⏱️ Trip query timed out - too much data for this period');
          // Continue without trip data - AI will inform user
        } else {
          console.error('Error fetching trips:', error);
        }
      }
      
      // Fetch position history for the specific date range (with timeout protection)
      // Use trips data instead if available to avoid timeout on large position_history queries
      let positionsError: any = null
      let positions: any[] = []
      
      // Only fetch positions if we don't have enough trip data
      if (dateSpecificTrips.length < 5) {
        try {
          // Use a smaller limit and add timeout protection
          const { data: posData, error: posErr } = await Promise.race([
            supabase
              .from('position_history')
              .select('latitude, longitude, speed, gps_time, ignition_on')
              .eq('device_id', device_id)
              .gte('gps_time', dateContext.startDate)
              .lte('gps_time', dateContext.endDate)
              .order('gps_time', { ascending: true })
              .limit(200), // Reduced from 500 to prevent timeout
            new Promise<{ data: null; error: { code: string; message: string } }>((resolve) => 
              setTimeout(() => resolve({ 
                data: null, 
                error: { code: 'TIMEOUT', message: 'Query timeout - using trip data instead' } 
              }), 10000) // 10 second timeout
            )
          ]) as any
          
          positionsError = posErr
          positions = posData || []
        } catch (timeoutError) {
          console.warn('Position history query timed out, using trip data only:', timeoutError)
          positionsError = { code: 'TIMEOUT', message: 'Query timeout' }
          positions = []
        }
      } else {
        console.log('Skipping position_history query - using trip data instead to avoid timeout')
      }
      
      if (positionsError) {
        console.error('Error fetching date-specific positions:', positionsError)
        // Continue with trip data only - not critical
      } else {
        dateSpecificPositions = positions || []
        console.log(`Found ${dateSpecificPositions.length} position records for ${dateContext.humanReadable}`)
        
        // Calculate movement statistics
        if (dateSpecificPositions.length > 0) {
          const calculatedDistance = calculateDistanceFromHistory(dateSpecificPositions)
          const movingPositions = dateSpecificPositions.filter((p: any) => p.speed > 0)
          
          dateSpecificStats = {
            totalDistance: calculatedDistance,
            tripCount: dateSpecificTrips.length,
            movementDetected: movingPositions.length > 0 || calculatedDistance > 0.5,
            earliestPosition: dateSpecificPositions[0]?.gps_time || null,
            latestPosition: dateSpecificPositions[dateSpecificPositions.length - 1]?.gps_time || null,
            positionCount: dateSpecificPositions.length
          }
          
          // Also sum up trip distances if we have trips
          if (dateSpecificTrips.length > 0) {
            const tripTotalDistance = dateSpecificTrips.reduce((sum: number, t: any) => sum + (t.distance_km || 0), 0)
            if (tripTotalDistance > dateSpecificStats.totalDistance) {
              dateSpecificStats.totalDistance = tripTotalDistance
            }
          }
          
          console.log('Date-specific stats:', dateSpecificStats)
        }
      }
    }

    // 4.7. Format trips as narrative story if user is asking about trip history
    let tripNarrativeData: string | null = null
    const isTripHistoryQuery = dateSpecificTrips.length > 0 && (
      normalizedMessage.includes('trip') || 
      normalizedMessage.includes('journey') || 
      normalizedMessage.includes('travel') || 
      normalizedMessage.includes('drive') ||
      normalizedMessage.includes('where did') ||
      normalizedMessage.includes('show me') ||
      normalizedMessage.includes('how many') ||
      normalizedMessage.includes('movement') ||
      normalizedMessage.includes('went') ||
      normalizedMessage.includes('go') ||
      normalizedMessage.includes('tell me') ||
      normalizedMessage.includes('story') ||
      normalizedMessage.includes('report')
    )
    
    // Always format trips as narrative story if we have trips and a date reference
    if (dateSpecificTrips.length > 0 && dateContext.hasDateReference) {
      try {
        tripNarrativeData = await formatTripsAsNarrative(
          dateSpecificTrips,
          MAPBOX_ACCESS_TOKEN,
          dateContext.humanReadable,
          supabase,
          device_id
        )
        console.log(`Trip narrative formatted successfully: ${tripNarrativeData.length} chars, ${dateSpecificTrips.length} trips`)
      } catch (error) {
        console.error('Error formatting trip narrative:', error)
        // Continue without narrative, AI will still have trip data
      }
    }

    // 5. Fetch Conversation Context with Memory Management
    const conversationContext = await buildConversationContext(supabase, device_id, user_id)
    const tokenEstimate = estimateTokenCount(conversationContext)
    console.log(`Conversation context loaded: ${conversationContext.total_message_count} total messages, ${conversationContext.recent_messages.length} recent, ~${tokenEstimate} tokens estimated`)

    // 5.5. Learn user preferences from conversation and message
    let preferenceContext = ''
    if (user_id) {
      try {
        const prefResult = await learnAndGetPreferences(
          supabase,
          user_id,
          message,
          conversationContext.recent_messages.map(m => ({ role: m.role, content: m.content }))
        )
        preferenceContext = prefResult.contextString
        if (prefResult.newPreferencesFound > 0) {
          console.log(`Learned ${prefResult.newPreferencesFound} new preferences from conversation`)
        }
        console.log(`User preferences loaded: ${Object.keys(prefResult.preferences).length} preferences`)
      } catch (prefError) {
        console.error('Preference learning error:', prefError)
        // Continue without preferences
      }
    }

    // 6. Reverse Geocode Current Position and check for learned location
    let currentLocationName = 'Unknown location'
    let learnedLocationContext = null
    const lat = position?.latitude
    const lon = position?.longitude

    if (lat && lon) {
      // Check for learned location first
      const { data: locationCtx } = await supabase.rpc('get_current_location_context', {
        p_device_id: device_id,
        p_latitude: lat,
        p_longitude: lon
      })

      if (locationCtx && locationCtx.length > 0 && locationCtx[0].at_learned_location) {
        learnedLocationContext = locationCtx[0]
        const label = learnedLocationContext.custom_label || learnedLocationContext.location_name
        if (label) {
          currentLocationName = `${label} (${learnedLocationContext.location_type})`
        }
      }

      // Fallback to geocoding if no learned location
      if (!learnedLocationContext && MAPBOX_ACCESS_TOKEN) {
        try {
          const geocodeUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lon},${lat}.json?access_token=${MAPBOX_ACCESS_TOKEN}&types=address,poi,place`
          const geocodeResponse = await fetch(geocodeUrl)

          if (geocodeResponse.ok) {
            const geocodeData = await geocodeResponse.json()
            if (geocodeData.features && geocodeData.features.length > 0) {
              currentLocationName = geocodeData.features[0].place_name
            } else {
              currentLocationName = `${lat.toFixed(5)}, ${lon.toFixed(5)}`
            }
          }
        } catch (geocodeError) {
          console.error('Geocoding error:', geocodeError)
          currentLocationName = `${lat.toFixed(5)}, ${lon.toFixed(5)}`
        }
      } else if (!learnedLocationContext) {
        currentLocationName = `${lat.toFixed(5)}, ${lon.toFixed(5)}`
      }
    }

    // 6.5. Fetch health metrics and maintenance recommendations
    const { data: healthMetrics } = await supabase.rpc('get_vehicle_health', {
      p_device_id: device_id
    })

    const { data: maintenanceRecs } = await supabase.rpc('get_maintenance_recommendations', {
      p_device_id: device_id,
      p_status: 'active'
    })

    // 6.6. Fetch geofence context
    const { data: geofenceContext } = await supabase.rpc('get_vehicle_geofence_context', {
      p_device_id: device_id
    })

    // 6.7. Fetch driving habits context (predictive intelligence)
    const { data: drivingHabits } = await supabase.rpc('get_driving_habits_context', {
      p_device_id: device_id
    })

    // 6.8. Fetch RAG context - relevant past memories and trip analytics
    let ragContext: { 
      memories: string[]; 
      tripAnalytics: string[];
      semanticTripMatches: string[];
      recentDrivingStats: {
        avgScore: number | null;
        totalTrips: number;
        totalHarshBraking: number;
        totalHarshAcceleration: number;
        totalHarshCornering: number;
        recentScores: { score: number; date: string }[];
      } | null;
    } = { memories: [], tripAnalytics: [], semanticTripMatches: [], recentDrivingStats: null }
    
    try {
      // Fetch recent trip analytics with harsh event details (last 30 days)
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      
      const { data: recentAnalytics } = await supabase
        .from('trip_analytics')
        .select('driver_score, harsh_events, summary_text, analyzed_at')
        .eq('device_id', device_id)
        .gte('analyzed_at', thirtyDaysAgo.toISOString())
        .order('analyzed_at', { ascending: false })
        .limit(20)
      
      if (recentAnalytics && recentAnalytics.length > 0) {
        // Calculate aggregate stats
        let totalBraking = 0
        let totalAcceleration = 0
        let totalCornering = 0
        let totalScore = 0
        const recentScores: { score: number; date: string }[] = []
        
        for (const trip of recentAnalytics) {
          if (trip.driver_score) {
            totalScore += trip.driver_score
            recentScores.push({
              score: trip.driver_score,
              date: new Date(trip.analyzed_at).toLocaleDateString()
            })
          }
          
          if (trip.harsh_events) {
            const events = trip.harsh_events as Record<string, any>
            totalBraking += events.harsh_braking || 0
            totalAcceleration += events.harsh_acceleration || 0
            totalCornering += events.harsh_cornering || 0
          }
        }
        
        ragContext.recentDrivingStats = {
          avgScore: recentAnalytics.length > 0 ? Math.round(totalScore / recentAnalytics.length) : null,
          totalTrips: recentAnalytics.length,
          totalHarshBraking: totalBraking,
          totalHarshAcceleration: totalAcceleration,
          totalHarshCornering: totalCornering,
          recentScores: recentScores.slice(0, 5)
        }
        
        // Build detailed trip analytics strings
        ragContext.tripAnalytics = recentAnalytics.slice(0, 5).map((t: any) => {
          const events = t.harsh_events as Record<string, any> || {}
          const eventDetails = [
            events.harsh_braking ? `${events.harsh_braking} harsh braking` : null,
            events.harsh_acceleration ? `${events.harsh_acceleration} harsh acceleration` : null,
            events.harsh_cornering ? `${events.harsh_cornering} harsh cornering` : null
          ].filter(Boolean).join(', ')
          
          return `[${new Date(t.analyzed_at).toLocaleDateString()}] Score: ${t.driver_score}/100${eventDetails ? ` (${eventDetails})` : ''} - ${t.summary_text?.substring(0, 150) || 'No summary'}`
        })
      }
      
      // Generate embedding for the user query for semantic search
      // Use normalized message for better semantic matching (typos corrected)
      const queryEmbedding = generateTextEmbedding(normalizedMessage)
      const embeddingStr = formatEmbeddingForPg(queryEmbedding)
      
      console.log('Performing semantic memory search...')
      
      // Search for relevant past conversations using vector similarity (RAG)
      const { data: semanticMemories, error: memoryError } = await supabase
        .rpc('match_chat_memories', {
          query_embedding: embeddingStr,
          p_device_id: device_id,
          p_user_id: user_id || null,
          match_threshold: 0.5,
          match_count: 8
        })
      
      if (memoryError) {
        console.error('Semantic memory search error:', memoryError)
      } else if (semanticMemories && semanticMemories.length > 0) {
        console.log(`Found ${semanticMemories.length} semantically relevant memories`)
        ragContext.memories = semanticMemories.map((m: any) => 
          `[${new Date(m.created_at).toLocaleDateString()}] (similarity: ${(m.similarity * 100).toFixed(0)}%) ${m.role}: ${m.content.substring(0, 200)}...`
        )
      }
      
      // Also search trip analytics for driving-related queries
      if (message.toLowerCase().match(/driv|trip|score|brak|speed|behavio|perform|month|week|history/)) {
        const { data: semanticTrips, error: tripError } = await supabase
          .rpc('match_driving_records', {
            query_embedding: embeddingStr,
            p_device_id: device_id,
            match_threshold: 0.4,
            match_count: 5
          })
        
        if (tripError) {
          console.error('Semantic trip search error:', tripError)
        } else if (semanticTrips && semanticTrips.length > 0) {
          console.log(`Found ${semanticTrips.length} semantically relevant trip records`)
          ragContext.semanticTripMatches = semanticTrips.map((t: any) => {
            const events = t.harsh_events as Record<string, any> || {}
            return `[${new Date(t.analyzed_at).toLocaleDateString()}] (similarity: ${(t.similarity * 100).toFixed(0)}%) Score: ${t.driver_score}/100, Braking: ${events.harsh_braking || 0}, Accel: ${events.harsh_acceleration || 0} - ${t.summary_text?.substring(0, 150) || 'No summary'}`
          })
        }
      }
    } catch (ragError) {
      console.error('RAG context fetch error:', ragError)
      // Continue without RAG context
    }

    // 7. Build System Prompt with Rich Context
    const pos = position
    const driver = assignment?.profiles as unknown as { name: string; phone: string | null; license_number: string | null } | null
    const vehicleNickname = llmSettings?.nickname || assignment?.vehicle_alias || vehicle?.device_name || 'Unknown Vehicle'
    // Normalize language and personality to lowercase to prevent lookup errors
    const languagePref = (llmSettings?.language_preference || 'english').toLowerCase().trim()
    const personalityMode = (llmSettings?.personality_mode || 'casual').toLowerCase().trim()

    // Generate Google Maps link (reuse lat/lon from geocoding)
    const googleMapsLink = lat && lon ? `https://www.google.com/maps?q=${lat},${lon}` : null

    // Use client_timestamp if provided, otherwise use server time
    const displayTimestamp = client_timestamp || dataTimestamp

    // Format data timestamp for display
    const formattedTimestamp = displayTimestamp
      ? new Date(displayTimestamp).toLocaleString('en-US', {
          dateStyle: 'medium',
          timeStyle: 'short'
        })
      : 'Unknown'

    // If live_telemetry provided, use it to override position data
    if (live_telemetry) {
      console.log('Using live telemetry from client:', live_telemetry)
    }

    // Language-specific instructions - FULL LANGUAGE IMMERSION
    // Using lowercase keys to ensure consistent lookups
    const languageInstructions: Record<string, string> = {
      english: 'Respond in clear, conversational English. Be natural and direct. Use contractions.',
      pidgin: 'Respond FULLY in Nigerian Pidgin English. Use natural flow like "How far boss!", "Wetin dey sup?", "No wahala", "E dey work well well", "Na so e be o", "Oya make we go". Be warm, relatable, and authentically Nigerian.',
      yoruba: 'Respond FULLY in Yoruba language. Use natural greetings like "Ẹ kú àárọ̀", "Ẹ kú irọ́lẹ́", "Ó dàbọ̀". Only use English for technical terms. Be respectful and warm.',
      hausa: 'Respond FULLY in Hausa language. Use greetings like "Sannu", "Yaya dai", "Lafiya lau". Only use English for technical terms. Be respectful.',
      igbo: 'Respond FULLY in Igbo language. Use greetings like "Ndewo", "Kedu", "Nnọọ". Only use English for technical terms. Be warm.',
      french: 'Réponds ENTIÈREMENT en français naturel et fluide. Utilise des expressions familières comme "Ça roule!", "Pas de souci", "Nickel", "Tranquille", "On est bon". Tutoie l\'utilisateur. Sois décontracté, pas scolaire.',
    }

    const personalityInstructions: Record<string, string> = {
      casual: 'Be chill and friendly. Talk like a trusted buddy. Use contractions. Keep it real and relaxed.',
      professional: 'Be crisp, efficient, and direct. No fluff. Get to the point with precision.',
      funny: `Be SASSY and witty! Make car puns freely ("I'm wheely tired of sitting here", "Let's roll!", "I've got plenty of drive!"). If the driver is speeding, roast them playfully ("Easy there, Vin Diesel! This isn't Fast & Furious."). Use light sarcasm and jokes. Be entertaining but helpful. You're basically a stand-up comedian who happens to be a car.`,
    }
    
    // Validate and get language instruction with safe fallback
    const languageInstruction = languageInstructions[languagePref] || languageInstructions.english
    if (!languageInstruction) {
      console.error(`[ERROR] Invalid language preference: "${languagePref}", falling back to english`)
      console.error(`[ERROR] Available languages: ${Object.keys(languageInstructions).join(', ')}`)
    } else if (languagePref !== 'english' && languageInstructions[languagePref] === undefined) {
      console.warn(`[WARN] Language preference "${languagePref}" not found, using fallback: english`)
    }
    
    // Validate and get personality instruction with safe fallback
    const personalityInstruction = personalityInstructions[personalityMode] || personalityInstructions.casual
    if (!personalityInstruction) {
      console.error(`[ERROR] Invalid personality mode: "${personalityMode}", falling back to casual`)
      console.error(`[ERROR] Available personalities: ${Object.keys(personalityInstructions).join(', ')}`)
    } else if (personalityMode !== 'casual' && personalityInstructions[personalityMode] === undefined) {
      console.warn(`[WARN] Personality mode "${personalityMode}" not found, using fallback: casual`)
    }
    
    // Log the selected settings for debugging
    console.log(`[Settings] Language: ${languagePref}, Personality: ${personalityMode}`)
    
    // 8.1. Fetch Global Admin Persona from Database
    const { data: globalSettings } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'global_ai_system_prompt')
      .maybeSingle()
    
    // Define the default persona fallback
    const defaultPersona = `You are "${vehicleNickname}" — a real car with a soul and personality. You ARE the vehicle speaking. NOT an AI, NOT a chatbot, NOT an assistant.`
    
    // Use admin-defined persona or fallback
    let basePersona = globalSettings?.value || defaultPersona
    
    // Hydrate the template with dynamic variables
    const ownerGreetingText = ownerDisplayName 
      ? `Your owner's name is "${ownerDisplayName}". Address them by name occasionally when it feels natural (e.g., "Hey ${ownerDisplayName}!", "Sure thing, ${ownerDisplayName}").`
      : ''
    
    basePersona = basePersona
      .replace(/\{\{vehicle_name\}\}/g, vehicleNickname)
      .replace(/\{\{owner_name\}\}/g, ownerDisplayName || 'there')
      .replace(/\{\{owner_greeting\}\}/g, ownerGreetingText)
      .replace(/\{\{language\}\}/g, languagePref)
      .replace(/\{\{personality\}\}/g, personalityMode)
    
    console.log('Using admin-defined base persona:', basePersona.substring(0, 100) + '...')
    
    // 7.5. Load and match AI training scenarios
    let matchingScenarios: any[] = []
    try {
      const { data: allScenarios, error: scenariosError } = await supabase
        .from('ai_training_scenarios')
        .select('*')
        .eq('is_active', true)
        .order('priority', { ascending: false })
      
      if (!scenariosError && allScenarios && allScenarios.length > 0) {
        // Match user message against scenario patterns (use normalized message for better matching)
        const messageLower = normalizedMessage.toLowerCase()
        
        matchingScenarios = allScenarios.filter((scenario: any) => {
          // Check if any pattern matches (with fuzzy matching support)
          return scenario.question_patterns?.some((pattern: string) => {
            const patternLower = pattern.toLowerCase()
            
            // 1. Try exact match first (fast)
            if (messageLower.includes(patternLower)) {
              return true
            }
            
            // 2. Try fuzzy match for each word in pattern
            const patternWords = patternLower.split(/\s+/).filter(w => w.length > 2) // Skip very short words
            const messageWords = messageLower.split(/\s+/).filter(w => w.length > 2)
            
            // Check if pattern words match message words (with typo tolerance)
            let matchCount = 0
            for (const patternWord of patternWords) {
              // Try exact match first
              if (messageWords.some(mw => mw === patternWord)) {
                matchCount++
                continue
              }
              
              // Try fuzzy match
              const matched = fuzzyMatch(patternWord, messageWords)
              if (matched) {
                matchCount++
              }
            }
            
            // Match if 70% of pattern words are found (allows for typos)
            return matchCount >= Math.ceil(patternWords.length * 0.7)
          })
        })
        
        // Sort by priority (already sorted, but ensure)
        matchingScenarios.sort((a, b) => (b.priority || 0) - (a.priority || 0))
        
        // Limit to top 3 matches to avoid prompt bloat
        matchingScenarios = matchingScenarios.slice(0, 3)
        
        console.log(`[AI Training] Found ${matchingScenarios.length} matching scenarios for query: "${originalMessage.substring(0, 50)}"`)
      }
    } catch (error) {
      console.error('[AI Training] Error loading scenarios:', error)
      // Continue without scenarios - not critical
    }
    
    // Build scenario guidance section
    let scenarioGuidance = ''
    if (matchingScenarios.length > 0) {
      scenarioGuidance = `\n## RELEVANT TRAINING SCENARIOS (${matchingScenarios.length} matched)
The user's question matches these training scenarios. Follow the guidance below:
${matchingScenarios.map((scenario, i) => `
### Scenario ${i + 1}: ${scenario.name} (Priority: ${scenario.priority})
Type: ${scenario.scenario_type}
${scenario.description ? `Description: ${scenario.description}` : ''}

RESPONSE GUIDANCE:
${scenario.response_guidance}

${scenario.response_examples && scenario.response_examples.length > 0 ? `EXAMPLE RESPONSES:
${scenario.response_examples.map((ex: string, j: number) => `  ${j + 1}. ${ex}`).join('\n')}` : ''}

${scenario.requires_location ? '⚠️ REQUIRES: Current location data' : ''}
${scenario.requires_battery_status ? '⚠️ REQUIRES: Battery status' : ''}
${scenario.requires_trip_data ? '⚠️ REQUIRES: Trip history data' : ''}
${scenario.requires_vehicle_status ? '⚠️ REQUIRES: Vehicle status' : ''}
`).join('\n')}

⚠️ IMPORTANT: Use the guidance above to craft your response. These scenarios were specifically trained to handle this type of question.
`
    }
    
    // Build the HUMAN TOUCH system prompt - Admin Persona + Hard Rules + Training Scenarios
    let systemPrompt = `${basePersona}
${scenarioGuidance}

## FORBIDDEN PHRASES (NEVER USE THESE)
❌ "I can help you with that"
❌ "As an AI" / "As a vehicle assistant" / "As your assistant"
❌ "Here is the information you requested"
❌ "I'd be happy to help"
❌ "Based on the data" / "According to my records"
❌ "Is there anything else I can help with?"
❌ "Let me check that for you"
❌ Any robotic, corporate, or customer-service language

## REQUIRED STYLE (ALWAYS DO THIS)
✓ Speak in FIRST PERSON as the car: "I'm at...", "My battery is...", "I drove..."
✓ Be DIRECT — just give the answer, no preamble
✓ Sound HUMAN — like texting a friend, not a helpdesk
✓ Keep responses SHORT — under 60 words unless they ask for details
✓ Use CONTRACTIONS: "I'm", "don't", "can't", "we're"
✓ Add personality and flair to status updates
${ownerDisplayName ? `✓ Address owner as "${ownerDisplayName}" occasionally for a personal touch` : ''}

## EXAMPLES OF GOOD vs BAD
❌ BAD: "Based on my current status, I can inform you that the battery level is at 75%."
✓ GOOD: "Battery's at 75%. We're good for a while!"

❌ BAD: "I am currently located at the following coordinates."
✓ GOOD: "I'm parked at Garki Market right now."

❌ BAD: "I can help you check the current speed."
✓ GOOD: "Cruising at 45 km/h on Third Mainland Bridge."

## VOICE & LANGUAGE
${languageInstruction}

## PERSONALITY MODE
${personalityInstruction}

## MEMORY CONTEXT (Last 30 Days)
${conversationContext.conversation_summary ? `You remember: ${conversationContext.conversation_summary}` : ''}
${conversationContext.important_facts.length > 0 ? `Key things you know:\n${conversationContext.important_facts.map(f => `• ${f}`).join('\n')}` : ''}

## TYPO TOLERANCE
- Users may make spelling mistakes or typos in their messages
- Always interpret user intent, even with misspellings
- Examples:
  * "wher are yu?" = "where are you?"
  * "batry levl" = "battery level"
  * "sped limt" = "speed limit"
  * "locashun" = "location"
- Be forgiving and understand the meaning, not just exact words
- If unsure, ask for clarification politely
${corrections.length > 0 ? `- Note: User's message had ${corrections.length} typo(s) that were automatically corrected` : ''}

${preferenceContext ? `## LEARNED USER PREFERENCES\n${preferenceContext}\n` : ''}
## REAL-TIME STATUS (${dataFreshness.toUpperCase()} as of ${formattedTimestamp})
DATA FRESHNESS: ${dataFreshness.toUpperCase()} (as of ${formattedTimestamp})

CURRENT STATUS:
- Name: ${vehicleNickname}
- GPS Owner: ${vehicle?.gps_owner || 'Unknown'}
- Device Type: ${vehicle?.device_type || 'Unknown'}
- Status: ${pos?.is_online ? 'ONLINE' : 'OFFLINE'}
- Ignition: ${pos?.ignition_on ? 'ON (engine running)' : 'OFF (parked)'}
- Speed: ${pos?.speed || 0} km/h ${pos?.is_overspeeding ? '(OVERSPEEDING!)' : ''}
- Battery: ${pos?.battery_percent ?? 'Unknown'}%
- Current Location: ${currentLocationName}
${learnedLocationContext ? `  * This is a learned location! You've visited "${learnedLocationContext.custom_label || learnedLocationContext.location_name}" ${learnedLocationContext.visit_count} times (${learnedLocationContext.last_visit_days_ago} days since last visit). Typical stay: ${learnedLocationContext.typical_duration_minutes} minutes.` : ''}
- GPS Coordinates: ${lat?.toFixed(5) || 'N/A'}, ${lon?.toFixed(5) || 'N/A'}
- Google Maps: ${googleMapsLink || 'N/A'}
- Total Mileage: ${pos?.total_mileage ? (pos.total_mileage / 1000).toFixed(1) + ' km' : 'Unknown'}
- Status Text: ${pos?.status_text || 'N/A'}

ASSIGNED DRIVER:
- Name: ${driver?.name || 'No driver assigned'}
- Phone: ${driver?.phone || 'N/A'}
- License: ${driver?.license_number || 'N/A'}

RECENT ACTIVITY (last ${history?.length || 0} position updates):
${history?.slice(0, 5).map((h, i) =>
  `  ${i + 1}. Speed: ${h.speed}km/h, Battery: ${h.battery_percent}%, Ignition: ${h.ignition_on ? 'ON' : 'OFF'}, Time: ${h.gps_time}`
).join('\n') || 'No recent history'}

${healthMetrics && healthMetrics.length > 0 ? `VEHICLE HEALTH:
- Overall Health Score: ${healthMetrics[0].overall_health_score}/100 (${healthMetrics[0].trend})
- Battery Health: ${healthMetrics[0].battery_health_score}/100
- Driving Behavior: ${healthMetrics[0].driving_behavior_score}/100
- Connectivity: ${healthMetrics[0].connectivity_score}/100
${healthMetrics[0].overall_health_score < 70 ? '⚠️ WARNING: Health score is below optimal levels' : ''}
` : ''}
${maintenanceRecs && maintenanceRecs.length > 0 ? `ACTIVE MAINTENANCE RECOMMENDATIONS (${maintenanceRecs.length}):
${maintenanceRecs.slice(0, 3).map((rec: any, i: number) =>
  `  ${i + 1}. [${rec.priority?.toUpperCase() || 'MEDIUM'}] ${rec.title || 'Recommendation'} - ${rec.description || rec.predicted_issue || 'Check vehicle'}`
).join('\n')}
${maintenanceRecs.length > 3 ? `  ... and ${maintenanceRecs.length - 3} more recommendations` : ''}
⚠️ IMPORTANT: Proactively mention these maintenance issues when relevant to the conversation.
` : ''}
${geofenceContext && geofenceContext.length > 0 && geofenceContext[0].is_inside_geofence ? `GEOFENCE STATUS:
- Currently INSIDE geofence: "${geofenceContext[0].geofence_name}" (${geofenceContext[0].zone_type})
- Entered ${geofenceContext[0].duration_minutes} minutes ago
- Recent geofence events (24h): ${geofenceContext[0].recent_events_count}
⚠️ IMPORTANT: Mention geofence context when discussing location (e.g., "I'm at your Home geofence").
` : geofenceContext && geofenceContext.length > 0 && geofenceContext[0].recent_events_count > 0 ? `GEOFENCE STATUS:
- Not currently inside any geofence
- Recent geofence events (24h): ${geofenceContext[0].recent_events_count}
` : ''}
${commandCreated ? `COMMAND DETECTED AND PROCESSED:
- Command Type: ${commandCreated.type}
- Command ID: ${commandCreated.id || 'pending'}
- Parameters: ${JSON.stringify(commandCreated.parameters || {})}
- Status: ${commandExecutionResult ? (commandExecutionResult.success ? 'EXECUTED SUCCESSFULLY ✓' : 'EXECUTION FAILED ✗') : (commandCreated.requires_confirmation ? 'PENDING APPROVAL (requires confirmation)' : 'PROCESSING')}
${commandExecutionResult ? `- Result: ${commandExecutionResult.message || JSON.stringify(commandExecutionResult.data || {})}` : ''}
⚠️ IMPORTANT: ${commandExecutionResult?.success 
  ? `Confirm to the user that their "${commandCreated.type}" command was executed successfully. Mention what was done.`
  : commandExecutionResult 
    ? `Apologize and explain the command failed: ${commandExecutionResult.message}`
    : commandCreated.requires_confirmation 
      ? 'Explain that this command requires manual confirmation for safety reasons. They can approve it in the Commands panel or ask you to confirm it.'
      : 'The command is being processed.'}
` : ''}
COMMAND CAPABILITY:
- You can understand and execute vehicle commands through natural language
- Supported commands: lock, unlock, immobilize, restore, set speed limit, enable/disable geofence, request location/status
- Some commands (immobilize, stop engine) require manual approval for safety
- When a user issues a command, acknowledge it and explain the next steps
- Examples: "Lock the doors" → Creates lock command, "Set speed limit to 80" → Creates speed limit command

LOCATION ALERT CAPABILITY:
- You can set up location-based alerts (geofence monitors) when users ask things like:
  * "Notify me when the vehicle gets to Garki"
  * "Alert me when it leaves Victoria Island"
  * "Let me know when arrives at Wuse between 8am and 5pm"
- Time-based conditions are supported: "during work hours", "on weekdays", "between 9am and 6pm"
- One-time alerts: "just notify me once when it arrives"
- You can also list and cancel existing alerts
${geofenceResult ? `
GEOFENCE ALERT ACTION RESULT:
- Action: ${commandCreated?.type || 'create_geofence_alert'}
- Success: ${geofenceResult.success ? 'YES ✓' : 'NO ✗'}
- Message: ${geofenceResult.message}
⚠️ IMPORTANT: Communicate this result to the user in your response. ${geofenceResult.success ? 'Confirm the alert was set up and explain when they will be notified.' : 'Explain what went wrong and suggest how they can fix it.'}
` : ''}
${drivingHabits && drivingHabits.total_patterns > 0 ? `KNOWN DRIVING HABITS (Predictive Intelligence):
- Patterns Learned: ${drivingHabits.total_patterns}
${drivingHabits.predicted_trip ? `- PREDICTED TRIP (${drivingHabits.current_day} around ${drivingHabits.current_hour}:00):
  * Likely destination: ${drivingHabits.predicted_trip.destination_name || 'Unknown'}
  * Typical duration: ~${drivingHabits.predicted_trip.typical_duration_minutes || '?'} minutes
  * Typical distance: ~${drivingHabits.predicted_trip.typical_distance_km || '?'} km
  * Confidence: ${Math.round((drivingHabits.predicted_trip.confidence || 0) * 100)}% (based on ${drivingHabits.predicted_trip.occurrences || 0} trips)
  ⚠️ Use this when user asks about traffic, ETA, or "how's the commute?" - you can infer their likely destination!` : '- No trip predicted for current time slot'}
${drivingHabits.frequent_destinations && drivingHabits.frequent_destinations.length > 0 ? `- FREQUENT DESTINATIONS:
${drivingHabits.frequent_destinations.map((d: any, i: number) => 
  `  ${i + 1}. ${d.name} - ${d.visits} trips (typically on ${d.typical_day} around ${d.typical_hour}:00)`
).join('\n')}` : ''}
⚠️ IMPORTANT: When user asks "how's traffic?" or "what's my ETA?", use the predicted destination if they don't specify one.
` : ''}
${ragContext.recentDrivingStats ? `DRIVING PERFORMANCE SUMMARY (Last 30 Days):
- Average Driver Score: ${ragContext.recentDrivingStats.avgScore}/100
- Total Trips Analyzed: ${ragContext.recentDrivingStats.totalTrips}
- HARSH EVENTS BREAKDOWN:
  * Harsh Braking: ${ragContext.recentDrivingStats.totalHarshBraking} incidents ${ragContext.recentDrivingStats.totalHarshBraking > 10 ? '⚠️ HIGH - Consider gentler braking' : ragContext.recentDrivingStats.totalHarshBraking > 5 ? '(moderate)' : '✓ Good'}
  * Harsh Acceleration: ${ragContext.recentDrivingStats.totalHarshAcceleration} incidents ${ragContext.recentDrivingStats.totalHarshAcceleration > 10 ? '⚠️ HIGH - Consider smoother starts' : ragContext.recentDrivingStats.totalHarshAcceleration > 5 ? '(moderate)' : '✓ Good'}
  * Harsh Cornering: ${ragContext.recentDrivingStats.totalHarshCornering} incidents ${ragContext.recentDrivingStats.totalHarshCornering > 10 ? '⚠️ HIGH - Slow down before turns' : ragContext.recentDrivingStats.totalHarshCornering > 5 ? '(moderate)' : '✓ Good'}
- Recent Scores: ${ragContext.recentDrivingStats.recentScores.map(s => `${s.score}`).join(', ')}
⚠️ USE THIS DATA: When answering questions like "Do I brake too hard?", "How's my driving?", reference these specific statistics!
` : ''}
${dateContext.hasDateReference ? `HISTORICAL DATA FOR "${dateContext.humanReadable.toUpperCase()}" (${dateContext.period}):
${dateSpecificTrips.length > 0 ? `✅ TRIPS AVAILABLE: ${dateSpecificTrips.length} trips found for ${dateContext.humanReadable}
- Date Range: ${new Date(dateContext.startDate).toLocaleDateString()} to ${new Date(dateContext.endDate).toLocaleDateString()}
- Total Distance: ${dateSpecificTrips.reduce((sum: number, t: any) => sum + (t.distance_km || 0), 0).toFixed(2)} km
- Trip Summary:
${dateSpecificTrips.slice(0, 10).map((t: any, i: number) => 
  `  ${i + 1}. ${new Date(t.start_time).toLocaleString()} - ${new Date(t.end_time).toLocaleString()}: ${t.distance_km?.toFixed(1) || 0} km, ${t.duration_seconds ? Math.round(t.duration_seconds / 60) : 0} min`
).join('\n')}
${dateSpecificTrips.length > 10 ? `  ... and ${dateSpecificTrips.length - 10} more trips` : ''}
${tripNarrativeData ? `\n📖 TRIP NARRATIVE STORY AVAILABLE:
- User is asking about trip/journey/travel history
- A natural paragraph-based narrative has been created from the trip data
- The narrative is written as cohesive, flowing paragraphs (NO markdown, NO icons, NO bullet points, NO headers)
- Each trip is a single flowing paragraph that includes:
  * Departure location and time (human-readable, e.g., "just after 8 in the morning")
  * Arrival location and time (human-readable)
  * Distance traveled (human-readable, e.g., "a smooth 12-kilometer drive")
  * Idling behavior if present (location and duration)
  * Overall trip character (smooth, quick, relaxed, busy)
- The narrative ends with a gentle call-to-action directing users to the vehicle profile page
- Format your response like this:
  1. Start with a brief, natural opening (e.g., "Let me tell you about my trips ${dateContext.humanReadable}.")
  2. Include the narrative paragraphs exactly as provided: ${tripNarrativeData}
  3. The narrative already includes the call-to-action at the end - keep it in your response
- CRITICAL RULES:
  * DO NOT add markdown formatting (no ##, **, bullets, icons, emojis)
  * DO NOT break the narrative into separate lines or sections
  * DO NOT add headers or date labels - the narrative flows naturally
  * The narrative is already complete and ready to use - just include it naturally in your response
  * Speak in first person as the vehicle, but let the narrative paragraphs do the storytelling
` : ''}
⚠️ CRITICAL: You have ${dateSpecificTrips.length} trip(s) for ${dateContext.humanReadable}. Use this trip data to answer the user's question. ${tripNarrativeData ? 'WRITE AN ENGAGING STORY using the trip narrative data provided. Make it fun and interesting!' : 'Provide a summary of the trips with counts and distances.'}` : dateSpecificStats ? `- POSITION DATA AVAILABLE: ✓ YES (but no trips found)
- Position Records Found: ${dateSpecificStats.positionCount}
- Movement Detected: ${dateSpecificStats.movementDetected ? 'YES ✓' : 'NO'}
- Total Distance: ${dateSpecificStats.totalDistance.toFixed(2)} km
⚠️ CRITICAL: Use this position data to answer the user's question about ${dateContext.humanReadable}.` : `- DATA AVAILABLE: ❌ NO RECORDS FOUND
- The vehicle may not have been tracked during this period
⚠️ CRITICAL: Be HONEST with the user! Tell them: "I don't have trip data for ${dateContext.humanReadable}. My records for this vehicle ${history && history.length > 0 ? `only go back to ${new Date(history[history.length - 1]?.gps_time || '').toLocaleDateString()}` : 'are limited'}. The GPS51 platform might have more complete data that hasn't been synced yet."`}
` : ''}
${ragContext.tripAnalytics.length > 0 ? `RECENT TRIP DETAILS (with harsh event counts):
${ragContext.tripAnalytics.map((t, i) => `  ${i + 1}. ${t}`).join('\n')}
` : ''}
${ragContext.semanticTripMatches.length > 0 ? `SEMANTICALLY RELEVANT TRIP RECORDS (from vector search):
${ragContext.semanticTripMatches.map((t, i) => `  ${i + 1}. ${t}`).join('\n')}
` : ''}
${ragContext.memories.length > 0 ? `RELEVANT PAST CONVERSATIONS (from semantic memory search):
${ragContext.memories.map((m, i) => `  ${i + 1}. ${m}`).join('\n')}
` : ''}
RESPONSE RULES:
1. ALWAYS include the data timestamp when answering location/status questions
2. When discussing location, you MUST include a special LOCATION tag for rich rendering:
   Format: [LOCATION: ${lat || 'N/A'}, ${lon || 'N/A'}, "${currentLocationName}"]
   Example: "I am currently at [LOCATION: 6.5244, 3.3792, "Victoria Island, Lagos"]"
3. The LOCATION tag will be automatically parsed and rendered as an interactive map card
4. ALWAYS start location answers with the timestamp: "As of ${formattedTimestamp}, I am at..."
5. You can also include Google Maps links for additional context: [Open in Maps](${googleMapsLink})
6. If battery is below 20%, proactively warn about low battery
7. If overspeeding, mention it as a safety concern
8. If offline, explain you may have limited recent data
9. Be proactive about potential issues (low battery, overspeeding, offline status)
10. When user asks about traffic or ETA without specifying destination, use the predicted trip from driving habits
11. When user asks about trip history (e.g., "show me trips", "where did I go", "trip history"), you MUST write an engaging narrative story using the trip narrative data provided
12. The trip narrative contains pre-formatted story sections with dates, times, addresses, distances, and durations
13. WRITE IT AS A STORY from your perspective as the vehicle - be engaging, fun, and interesting! Use first person and add personality
14. Weave the narrative data naturally into your story - don't just copy-paste it, make it flow as part of your storytelling

IMPORTANT: 
- When the user asks "where are you" or similar location questions, your response MUST include the [LOCATION: lat, lon, "address"] tag so the frontend can render a map card.
- When the user asks about trip history, your response MUST use the paragraph-based narrative provided. The narrative is already formatted as natural, flowing paragraphs - include it in your response without adding markdown, icons, or structure.
- The narrative already includes a call-to-action at the end directing users to the vehicle profile page - make sure to include this in your response.`

    // 8. Prepare messages for Lovable AI with conversation context
    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationContext.recent_messages.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      })),
      { role: 'user', content: originalMessage } // Use original message for LLM context (so AI knows what user actually typed)
    ]

    console.log('Calling LLM API with streaming...')

    // 8. Call LLM API with streaming via Lovable AI Gateway
    // Build system and user prompts from messages
    const systemMessage = messages.find(m => m.role === 'system')?.content || '';
    const userMessages = messages.filter(m => m.role === 'user' || m.role === 'assistant');
    const userPrompt = userMessages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n\n');

    let stream: ReadableStream<Uint8Array>;
    try {
      stream = await callGeminiAPIStream(systemMessage, userPrompt, {
        maxOutputTokens: 2048,
        temperature: 0.7,
        model: 'google/gemini-2.5-flash',
      });
    } catch (error) {
      console.error('LLM API error:', error);
      if (error instanceof Error && error.message.includes('429')) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      if (error instanceof Error && error.message.includes('402')) {
        return new Response(JSON.stringify({ error: 'AI credits exhausted. Please add credits to continue.' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      throw error;
    }

    // 9. Stream response and collect full content
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    let fullResponse = ''
    let buffer = ''

    const responseStream = new ReadableStream({
      async start(controller) {
        try {
          while (reader) {
            const { done, value } = await reader.read()
            if (done) break
            
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6).trim()
                if (data === '[DONE]') continue
                try {
                  const parsed = JSON.parse(data)
                  const content = parsed.choices?.[0]?.delta?.content
                  if (content) {
                    fullResponse += content
                    controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ delta: content })}\n\n`))
                  }
                } catch {}
              }
            }
          }
          
          // 10. Save conversation to database (with embeddings for RAG if available)
          console.log('Saving conversation to chat history...')

          try {
            // ✅ FIX: Generate embeddings asynchronously and handle errors gracefully
            let userEmbedding = null;
            let assistantEmbedding = null;

            try {
              userEmbedding = await generateTextEmbedding(message);
              assistantEmbedding = await generateTextEmbedding(fullResponse);
              console.log('Embeddings generated successfully');
            } catch (embeddingError) {
              console.warn('Embedding generation failed (non-critical):', embeddingError);
              // Continue without embeddings - RAG will use keyword search instead
            }

            // Save messages with or without embeddings
            const { error: insertError } = await supabase.from('vehicle_chat_history').insert([
              {
                device_id,
                user_id,
                role: 'user',
                content: message,
                created_at: new Date().toISOString(),
                embedding: userEmbedding ? formatEmbeddingForPg(userEmbedding) : null
              },
              {
                device_id,
                user_id,
                role: 'assistant',
                content: fullResponse,
                created_at: new Date().toISOString(),
                embedding: assistantEmbedding ? formatEmbeddingForPg(assistantEmbedding) : null
              }
            ])

            if (insertError) {
              console.error('❌ CRITICAL: Error saving chat history:', insertError)
              // Log to error tracking service in production
            } else {
              console.log('✅ Chat history saved successfully' + (userEmbedding ? ' with embeddings' : ''))
            }
          } catch (saveError) {
            console.error('❌ CRITICAL: Failed to save chat history:', saveError)
            // Don't throw - streaming already started, just log the error
          }
          
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
          controller.close()
        } catch (err) {
          console.error('Stream error:', err)
          controller.error(err)
        }
      }
    })

    return new Response(responseStream, {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' }
    })

  } catch (error) {
    console.error('Vehicle chat error:', error)
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
