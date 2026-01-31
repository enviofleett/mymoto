import { createClient } from 'supabase-js'
import { buildConversationContext, estimateTokenCount } from './conversation-manager.ts'
import { routeQuery } from './query-router.ts'
import { parseCommand, containsCommandKeywords, getCommandMetadata, GeofenceAlertParams } from './command-parser.ts'
import { learnAndGetPreferences, buildPreferenceContext } from './preference-learner.ts'
import { extractDateContext, isHistoricalMovementQuery, calculateDistanceFromHistory, DateContext } from './date-extractor.ts'
import { handleTripSearch } from './trip-search.ts'
import { detectIgnition, normalizeSpeed, normalizeVehicleTelemetry, type Gps51RawData } from '../_shared/telemetry-normalizer.ts'

// Declare Deno for linter
declare const Deno: any;

// ============================================================================
// INLINED MODULES (for Dashboard deployment compatibility)
// ============================================================================

// ============================================================================
// Semantic Embedding Generator - INLINED
// ============================================================================

// Vehicle/driving domain vocabulary with semantic weights
const DOMAIN_VOCABULARY: Record<string, { weight: number; category: string }> = {
  // Driving behavior terms
  'driving': { weight: 1.0, category: 'behavior' },
  'braking': { weight: 1.2, category: 'behavior' },
  'acceleration': { weight: 1.2, category: 'behavior' },
  'cornering': { weight: 1.1, category: 'behavior' },
  'speeding': { weight: 1.3, category: 'behavior' },
  'overspeeding': { weight: 1.4, category: 'behavior' },
  'harsh': { weight: 1.3, category: 'behavior' },
  'smooth': { weight: 1.0, category: 'behavior' },
  'aggressive': { weight: 1.2, category: 'behavior' },
  'safe': { weight: 1.1, category: 'behavior' },
  'careful': { weight: 1.0, category: 'behavior' },
  'reckless': { weight: 1.3, category: 'behavior' },
  
  // Score/performance terms
  'score': { weight: 1.2, category: 'performance' },
  'rating': { weight: 1.1, category: 'performance' },
  'performance': { weight: 1.0, category: 'performance' },
  'excellent': { weight: 1.1, category: 'performance' },
  'good': { weight: 0.9, category: 'performance' },
  'poor': { weight: 1.0, category: 'performance' },
  'improved': { weight: 1.0, category: 'performance' },
  'declined': { weight: 1.0, category: 'performance' },
  
  // Time/history terms
  'yesterday': { weight: 1.2, category: 'time' },
  'today': { weight: 1.0, category: 'time' },
  'week': { weight: 1.1, category: 'time' },
  'month': { weight: 1.2, category: 'time' },
  'last': { weight: 0.8, category: 'time' },
  'history': { weight: 1.1, category: 'time' },
  'past': { weight: 0.9, category: 'time' },
  'recent': { weight: 1.0, category: 'time' },
  'ago': { weight: 0.8, category: 'time' },
  
  // Trip terms
  'trip': { weight: 1.2, category: 'trip' },
  'trips': { weight: 1.2, category: 'trip' },
  'journey': { weight: 1.1, category: 'trip' },
  'travel': { weight: 1.0, category: 'trip' },
  'distance': { weight: 1.0, category: 'trip' },
  'mileage': { weight: 1.1, category: 'trip' },
  'kilometer': { weight: 0.9, category: 'trip' },
  'km': { weight: 0.9, category: 'trip' },
  
  // Location terms
  'location': { weight: 1.1, category: 'location' },
  'where': { weight: 1.2, category: 'location' },
  'home': { weight: 1.0, category: 'location' },
  'work': { weight: 1.0, category: 'location' },
  'office': { weight: 1.0, category: 'location' },
  'arrived': { weight: 1.0, category: 'location' },
  'left': { weight: 1.0, category: 'location' },
  'parked': { weight: 1.0, category: 'location' },
  
  // Vehicle status terms
  'battery': { weight: 1.2, category: 'status' },
  'fuel': { weight: 1.1, category: 'status' },
  'engine': { weight: 1.1, category: 'status' },
  'ignition': { weight: 1.0, category: 'status' },
  'online': { weight: 1.0, category: 'status' },
  'offline': { weight: 1.0, category: 'status' },
  'speed': { weight: 1.1, category: 'status' },
  'moving': { weight: 1.0, category: 'status' },
  'stopped': { weight: 1.0, category: 'status' },
  
  // Command terms
  'lock': { weight: 1.3, category: 'command' },
  'unlock': { weight: 1.3, category: 'command' },
  'alert': { weight: 1.2, category: 'command' },
  'notify': { weight: 1.1, category: 'command' },
  'command': { weight: 1.0, category: 'command' },
  'control': { weight: 1.0, category: 'command' },
};

// Category dimension ranges (total: 1536)
const CATEGORY_RANGES: Record<string, [number, number]> = {
  'behavior': [0, 200],
  'performance': [200, 350],
  'time': [350, 500],
  'trip': [500, 650],
  'location': [650, 800],
  'status': [800, 950],
  'command': [950, 1100],
  'general': [1100, 1536],
};

/**
 * Simple hash function for string to number
 */
function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
  }
  return Math.abs(hash);
}

/**
 * Generate a semantic embedding for text content
 * Creates a 1536-dimension vector optimized for cosine similarity search
 */
function generateTextEmbedding(text: string): number[] {
  const embedding = new Array(1536).fill(0);
  
  // Tokenize and normalize
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1);
  
  const wordCounts = new Map<string, number>();
  for (const word of words) {
    wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
  }
  
  // Process domain vocabulary matches
  for (const [word, count] of wordCounts) {
    const vocabEntry = DOMAIN_VOCABULARY[word];
    
    if (vocabEntry) {
      const [start, end] = CATEGORY_RANGES[vocabEntry.category];
      const range = end - start;
      
      // Distribute influence across the category range
      const hash = hashString(word);
      const positions = 15; // Number of dimensions to activate per word
      
      for (let i = 0; i < positions; i++) {
        const pos = start + ((hash + i * 97) % range);
        const weight = vocabEntry.weight * Math.log2(count + 1);
        embedding[pos] += weight * Math.cos(i * 0.4);
      }
    } else {
      // General vocabulary - use hash-based distribution
      const [start, end] = CATEGORY_RANGES['general'];
      const range = end - start;
      const hash = hashString(word);
      
      for (let i = 0; i < 5; i++) {
        const pos = start + ((hash + i * 31) % range);
        embedding[pos] += 0.3 * Math.log2(count + 1) * Math.sin(i * 0.5);
      }
    }
  }
  
  // Add n-gram features for context
  for (let i = 0; i < words.length - 1; i++) {
    const bigram = words[i] + '_' + words[i + 1];
    const hash = hashString(bigram);
    const [start, end] = CATEGORY_RANGES['general'];
    const pos = start + (hash % (end - start));
    embedding[pos] += 0.5;
  }
  
  // Add sentence-level features
  const sentenceFeatures = {
    questionMark: text.includes('?') ? 1 : 0,
    exclamation: text.includes('!') ? 1 : 0,
    wordCount: Math.min(words.length / 50, 1),
    avgWordLength: words.reduce((sum, w) => sum + w.length, 0) / Math.max(words.length, 1) / 10,
  };
  
  // Encode sentence features in last dimensions
  embedding[1530] = sentenceFeatures.questionMark * 0.5;
  embedding[1531] = sentenceFeatures.exclamation * 0.3;
  embedding[1532] = sentenceFeatures.wordCount;
  embedding[1533] = sentenceFeatures.avgWordLength;
  
  // Normalize to unit vector for cosine similarity
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] = embedding[i] / magnitude;
    }
  }
  
  return embedding;
}

/**
 * Format embedding array for PostgreSQL vector type
 */
function formatEmbeddingForPg(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

// ============================================================================
// END Semantic Embedding Generator
// ============================================================================

// ============================================================================
// Enhanced Date Extraction System (V2) - INLINED
// ============================================================================

/**
 * Call Lovable AI Gateway for date extraction
 */
async function callLovableAPIForDateExtraction(
  message: string,
  clientTimestamp?: string,
  userTimezone?: string
): Promise<DateContext> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')

  if (!LOVABLE_API_KEY) {
    throw new Error('LOVABLE_API_KEY must be configured in Supabase secrets')
  }

  const now = clientTimestamp ? new Date(clientTimestamp) : new Date()
  const nowISO = now.toISOString()
  const timezoneInfo = userTimezone ? `User's timezone: ${userTimezone}. ` : ''

  const systemPrompt = `You are a date extraction assistant. Extract date/time references from user messages and return structured date ranges.

Current date/time: ${nowISO}
${timezoneInfo}
Return a JSON object with:
- hasDateReference: boolean
- period: 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'custom' | 'none'
- startDate: ISO string (start of day in UTC)
- endDate: ISO string (end of day in UTC)
- humanReadable: string (e.g., "yesterday", "last 3 days")
- confidence: number (0-1)

Examples:
- "yesterday" → { hasDateReference: true, period: 'yesterday', startDate: '2026-01-14T00:00:00Z', endDate: '2026-01-14T23:59:59Z', humanReadable: 'yesterday', confidence: 0.95 }
- "last week" → { hasDateReference: true, period: 'last_week', startDate: '2026-01-08T00:00:00Z', endDate: '2026-01-14T23:59:59Z', humanReadable: 'last week', confidence: 0.9 }
- "on Monday" → { hasDateReference: true, period: 'custom', startDate: '2026-01-15T00:00:00Z', endDate: '2026-01-15T23:59:59Z', humanReadable: 'Monday', confidence: 0.85 }

Be smart about ambiguous dates:
- "Monday" without context → most recent Monday (could be today if today is Monday, or last Monday)
- "last Monday" → previous Monday
- "this Monday" → upcoming Monday or today if today is Monday
- Relative dates like "3 days ago" → calculate from current date

Return ONLY valid JSON, no other text.`

  const userPrompt = `Extract date context from this message: "${message}"

Return JSON:`

  try {
    // ✅ FIX #6: Add timeout to LLM API call
    const controller = new AbortController();
    const TIMEOUT_MS = 20000; // 20 seconds timeout
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: 200,
          temperature: 0.1,
          stream: false,
        }),
        signal: controller.signal, // ✅ FIX #6: Add abort signal
      })
      
      clearTimeout(timeoutId); // Clear timeout on success

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[Date Extraction LLM] API error:', {
          status: response.status,
          body: errorText.substring(0, 200),
        })
        throw new Error(`Lovable API error: ${response.status}`)
      }
      const data = await response.json()
      const text = data.choices?.[0]?.message?.content?.trim() || ''

      if (!text) {
        throw new Error('Empty response from Lovable API')
      }

      let jsonText = text
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/)
      if (jsonMatch) {
        jsonText = jsonMatch[1]
      }

      const parsed = JSON.parse(jsonText)
      
      const result: DateContext = {
        hasDateReference: parsed.hasDateReference || false,
        period: parsed.period || 'none',
        startDate: parsed.startDate || new Date().toISOString(),
        endDate: parsed.endDate || new Date().toISOString(),
        humanReadable: parsed.humanReadable || 'current',
        timezone: userTimezone,
        confidence: parsed.confidence || 0.7
      }

      const startDate = new Date(result.startDate)
      const endDate = new Date(result.endDate)
      const nowDate = new Date(nowISO)

      if (startDate > nowDate) {
        console.warn('[Date Extraction LLM] Start date is in future, adjusting')
        result.startDate = nowDate.toISOString()
        result.confidence = (result.confidence || 0.7) * 0.8
      }

      if (endDate > nowDate) {
        console.warn('[Date Extraction LLM] End date is in future, adjusting')
        result.endDate = nowDate.toISOString()
        result.confidence = (result.confidence || 0.7) * 0.8
      }

      if (startDate > endDate) {
        console.warn('[Date Extraction LLM] Start date is after end date, swapping')
        const temp = result.startDate
        result.startDate = result.endDate
        result.endDate = temp
        result.confidence = (result.confidence || 0.7) * 0.7
      }

      return result
    } catch (fetchError: any) {
      clearTimeout(timeoutId); // Clear timeout on error
      
      // ✅ FIX #6: Handle timeout specifically
      if (fetchError.name === 'AbortError' || fetchError.message?.includes('aborted')) {
        console.warn('[Date Extraction LLM] Request timeout, falling back to regex');
        return extractDateContext(message, clientTimestamp, userTimezone);
      }
      // Re-throw other errors to be caught by outer catch
      throw fetchError;
    }
  } catch (error) {
    console.error('[Date Extraction LLM] Error:', error)
    return extractDateContext(message, clientTimestamp, userTimezone)
  }
}

function extractDateContextRegex(
  message: string,
  clientTimestamp?: string,
  userTimezone?: string
): DateContext & { confidence: number } {
  const result = extractDateContext(message, clientTimestamp, userTimezone)
  
  let confidence = 0.9
  const lowerMessage = message.toLowerCase()
  
  if (/\b(today|yesterday|tomorrow)\b/i.test(lowerMessage)) {
    confidence = 0.95
  } else if (/\b(\d+)\s*days?\s*ago\b/i.test(lowerMessage)) {
    confidence = 0.9
  } else if (/\b(last|previous)\s+week\b/i.test(lowerMessage)) {
    confidence = 0.85
  } else if (/\b(this|current)\s+week\b/i.test(lowerMessage)) {
    confidence = 0.85
  } else if (/\b(on|last|this)?\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(lowerMessage)) {
    confidence = 0.7
  } else if (result.hasDateReference) {
    confidence = 0.8
  } else {
    confidence = 0.5
  }

  return {
    ...result,
    confidence
  }
}

async function extractDateContextV2(
  message: string,
  clientTimestamp?: string,
  userTimezone?: string
): Promise<DateContext> {
  const regexResult = extractDateContextRegex(message, clientTimestamp, userTimezone)
  
  if (regexResult.confidence < 0.9 || regexResult.period === 'none') {
    console.log(`[Date Extraction V2] Low confidence (${regexResult.confidence}) or no match, using LLM extraction`)
    
    const ambiguousPatterns = [
      /\b(on|last|this)?\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
      /\b(that|this)\s+(day|time|morning|afternoon|evening)\b/i,
      /\b(recently|lately|earlier|before)\b/i,
      /\b(when|what\s+time)\s+(did|was|were)\b/i
    ]
    
    const hasAmbiguousPattern = ambiguousPatterns.some(p => p.test(message.toLowerCase()))
    
    if (hasAmbiguousPattern || regexResult.confidence < 0.7) {
      try {
        const llmResult = await callLovableAPIForDateExtraction(message, clientTimestamp, userTimezone)
        
        if (llmResult.confidence && llmResult.confidence > regexResult.confidence) {
          console.log(`[Date Extraction V2] Using LLM result (confidence: ${llmResult.confidence})`)
          return llmResult
        } else if (llmResult.hasDateReference && !regexResult.hasDateReference) {
          console.log(`[Date Extraction V2] Using LLM result (found date reference)`)
          return llmResult
        }
      } catch (error) {
        console.warn('[Date Extraction V2] LLM extraction failed, using regex result:', error)
      }
    }
  }
  
  return regexResult
}

function validateDateContext(context: DateContext): {
  isValid: boolean
  issues: string[]
  corrected?: DateContext
} {
  const issues: string[] = []
  const now = new Date()
  
  const startDate = new Date(context.startDate)
  const endDate = new Date(context.endDate)
  
  if (startDate > now) {
    issues.push('Start date is in the future')
  }
  
  if (endDate > now) {
    issues.push('End date is in the future')
  }
  
  if (startDate > endDate) {
    issues.push('Start date is after end date')
  }
  
  const rangeDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
  if (rangeDays > 365) {
    issues.push(`Date range is very large: ${rangeDays.toFixed(0)} days`)
  }
  
  if (rangeDays < 0) {
    issues.push('Date range is negative')
  }
  
  let corrected: DateContext | undefined = undefined
  if (issues.length > 0) {
    corrected = { ...context }
    
    if (startDate > now) {
      corrected.startDate = now.toISOString()
    }
    if (endDate > now) {
      corrected.endDate = now.toISOString()
    }
    
    if (startDate > endDate) {
      const temp = corrected.startDate
      corrected.startDate = corrected.endDate
      corrected.endDate = temp
    }
    
    const endDateObj = new Date(corrected.endDate)
    endDateObj.setHours(23, 59, 59, 999)
    corrected.endDate = endDateObj.toISOString()
    
    const startDateObj = new Date(corrected.startDate)
    startDateObj.setHours(0, 0, 0, 0)
    corrected.startDate = startDateObj.toISOString()
  }
  
  return {
    isValid: issues.length === 0,
    issues,
    corrected
  }
}

// ============================================================================
// Data Validation & Cross-Validation Layer - INLINED
// ============================================================================

interface ValidatedTrip {
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
  confidence: number
}

interface ValidatedPosition {
  latitude: number
  longitude: number
  speed: number
  gps_time: string
  ignition_on: boolean | null
  dataQuality: 'high' | 'medium' | 'low'
  validationIssues: string[]
}

interface ValidatedData {
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

function haversineDistanceValidator(lat1: number, lon1: number, lat2: number, lon2: number): number {
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

interface Trip {
  id: string;
  start_time: string;
  end_time: string;
  start_latitude: number | null;
  start_longitude: number | null;
  end_latitude: number | null;
  end_longitude: number | null;
  distance_km: number;
  duration_seconds: number | null;
  max_speed: number | null;
  avg_speed: number | null;
}

function validateTrip(trip: Trip, index: number, allTrips: Trip[]): ValidatedTrip {
  const issues: string[] = []
  let confidence = 1.0
  let dataQuality: 'high' | 'medium' | 'low' = 'high'

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

  if (trip.duration_seconds !== null && trip.duration_seconds !== undefined) {
    if (trip.duration_seconds < 0) {
      issues.push('Negative duration')
      confidence -= 0.2
    }
    
    if (trip.start_time && trip.end_time) {
      const startTime = new Date(trip.start_time)
      const endTime = new Date(trip.end_time)
      const calculatedDuration = (endTime.getTime() - startTime.getTime()) / 1000
      const reportedDuration = trip.duration_seconds
      const durationDiff = Math.abs(calculatedDuration - reportedDuration)
      
      if (durationDiff > 5) {
        issues.push(`Duration mismatch: reported ${reportedDuration}s, calculated ${calculatedDuration.toFixed(0)}s`)
        confidence -= 0.1
      }
    }
  }

  if (trip.max_speed !== null && trip.max_speed !== undefined) {
    if (trip.max_speed < 0 || trip.max_speed > 300) {
      issues.push(`Unrealistic max_speed: ${trip.max_speed} km/h`)
      confidence -= 0.1
    }
  }

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

function validatePosition(position: any): ValidatedPosition {
  const issues: string[] = []
  let dataQuality: 'high' | 'medium' | 'low' = 'high'

  if (!position.latitude || !position.longitude) {
    issues.push('Missing coordinates')
    dataQuality = 'low'
  } else {
    if (Math.abs(position.latitude) > 90 || Math.abs(position.longitude) > 180) {
      issues.push('Invalid coordinates')
      dataQuality = 'low'
    }
    
    if (position.latitude === 0 && position.longitude === 0) {
      issues.push('Null island coordinates (0,0) - likely invalid GPS')
      dataQuality = 'low'
    }
  }

  if (position.speed !== null && position.speed !== undefined) {
    if (position.speed < 0 || position.speed > 300) {
      issues.push(`Unrealistic speed: ${position.speed} km/h`)
      if (dataQuality === 'high') dataQuality = 'medium'
    }
  }

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

function crossValidate(
  trips: ValidatedTrip[],
  positions: ValidatedPosition[],
  dateContext: DateContext
): string[] {
  const warnings: string[] = []

  if (trips.length > 0 && positions.length > 0) {
    const totalTripDistance = trips.reduce((sum, t) => sum + (t.distance_km || 0), 0)
    
    let positionDistance = 0
    for (let i = 1; i < positions.length; i++) {
      const prev = positions[i - 1]
      const curr = positions[i]
      if (prev.latitude && prev.longitude && curr.latitude && curr.longitude) {
        positionDistance += haversineDistanceValidator(
          prev.latitude,
          prev.longitude,
          curr.latitude,
          curr.longitude
        )
      }
    }
    
    const distanceMismatch = Math.abs(totalTripDistance - positionDistance)
    if (distanceMismatch > totalTripDistance * 0.15 && totalTripDistance > 1) {
      warnings.push(`Total trip distance (${totalTripDistance.toFixed(2)}km) differs significantly from position-based distance (${positionDistance.toFixed(2)}km)`)
    }
  }

  if (trips.length > 0) {
    const totalTripDuration = trips.reduce((sum, t) => sum + (t.duration_seconds || 0), 0)
    const timeRangeSeconds = (new Date(dateContext.endDate).getTime() - new Date(dateContext.startDate).getTime()) / 1000
    
    if (totalTripDuration > timeRangeSeconds * 1.1) {
      warnings.push(`Total duration of trips (${(totalTripDuration / 3600).toFixed(1)}h) exceeds the selected time range (${(timeRangeSeconds / 3600).toFixed(1)}h)`)
    }
  }

  return warnings
}

// ============================================================================
// Main Handler
// ============================================================================

async function handler(req: Request) {
  const {
    message,
    vehicle_id,
    conversation_id,
    client_timestamp,
    user_timezone,
  } = await req.json()

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const [
      conversationContext,
      preferenceContext,
      dateContext,
    ] = await Promise.all([
      buildConversationContext(supabase, vehicle_id, conversation_id),
      buildPreferenceContext(supabase, vehicle_id),
      extractDateContextV2(message, client_timestamp, user_timezone),
    ])

    const validatedDate = validateDateContext(dateContext)
    if (!validatedDate.isValid) {
      console.warn('[Handler] Invalid date context:', validatedDate.issues)
    }
    const finalDateContext = validatedDate.corrected || dateContext

    const { query_type, confidence } = await routeQuery(
      message,
      conversationContext,
      preferenceContext
    )

    let response: any = {
      text: "I'm not sure how to handle that. Can you rephrase?",
      conversation_id,
      query_type,
      confidence,
      metadata: {},
    }

    const commandKeywords = containsCommandKeywords(message)
    if (commandKeywords.length > 0 && confidence > 0.6) {
      const command = parseCommand(message)
      if (command) {
        const commandMetadata = await getCommandMetadata(supabase, vehicle_id, command)
        
        response = {
          text: `Command identified: ${command.type}.`,
          conversation_id,
          query_type: 'command',
          confidence: 0.9,
          metadata: {
            command,
            ...commandMetadata,
          },
        }
        
        if (command.type === 'set_geofence_alert') {
          const params = command.params as GeofenceAlertParams
          response.text = `Setting a geofence alert for ${params.radius}km around ${params.location}. You will be notified when the vehicle enters or exits this area.`
        }
      }
    } else if (isHistoricalMovementQuery(query_type, confidence)) {
      const { data: trips, error: tripsError } = await handleTripSearch(
        supabase,
        vehicle_id,
        finalDateContext
      )

      if (tripsError) {
        throw new Error(`Trip search failed: ${tripsError.message}`)
      }

      const { data: positions, error: positionsError } = await supabase
        .from('vehicle_telemetry')
        .select('latitude, longitude, speed, gps_time, ignition_on')
        .eq('vehicle_id', vehicle_id)
        .gte('gps_time', finalDateContext.startDate)
        .lte('gps_time', finalDateContext.endDate)
        .order('gps_time', { ascending: true })

      if (positionsError) {
        throw new Error(`Position search failed: ${positionsError.message}`)
      }

      const validatedTrips = trips.map(validateTrip)
      const validatedPositions = positions.map(validatePosition)
      
      const crossValidationWarnings = crossValidate(
        validatedTrips,
        validatedPositions,
        finalDateContext
      )

      const totalDistance = validatedTrips.reduce((sum, t) => sum + t.distance_km, 0)
      const totalDuration = validatedTrips.reduce((sum, t) => sum + (t.duration_seconds || 0), 0)
      const avgSpeed = totalDistance / (totalDuration / 3600) || 0

      const summary = `Between ${finalDateContext.humanReadable}, the vehicle completed ${validatedTrips.length} trips, covering a total distance of ${totalDistance.toFixed(2)} km. The average speed was ${avgSpeed.toFixed(2)} km/h.`

      response = {
        text: summary,
        conversation_id,
        query_type: 'historical_movement',
        confidence,
        metadata: {
          trips: validatedTrips,
          positions: validatedPositions,
          date_context: finalDateContext,
          cross_validation_warnings: crossValidationWarnings,
          summary: {
            total_distance: totalDistance,
            total_duration_seconds: totalDuration,
            trip_count: validatedTrips.length,
            average_speed: avgSpeed,
          },
        },
      }
    } else {
      const embedding = generateTextEmbedding(message)
      const { data: similar_docs, error: similar_docs_error } = await supabase.rpc(
        'match_vehicle_documents',
        {
          vehicle_id,
          query_embedding: formatEmbeddingForPg(embedding),
          match_threshold: 0.7,
          match_count: 5,
        }
      )

      if (similar_docs_error) {
        throw new Error(`Similarity search failed: ${similar_docs_error.message}`)
      }

      const context = similar_docs.map((doc: any) => doc.content).join('\n\n')
      const fullPrompt = `Context: ${context}\n\nUser query: "${message}"\n\nAnswer:`
      
      const tokenCount = estimateTokenCount(fullPrompt)
      if (tokenCount > 3500) {
        console.warn(`Token count is high: ${tokenCount}`)
      }

      const { data: llm_response, error: llm_error } = await supabase.functions.invoke(
        'lovable-completion',
        {
          body: {
            prompt: fullPrompt,
            max_tokens: 150,
          },
        }
      )

      if (llm_error) {
        throw new Error(`LLM completion failed: ${llm_error.message}`)
      }

      response = {
        text: llm_response.completion || "I'm sorry, I couldn't find an answer.",
        conversation_id,
        query_type,
        confidence,
        metadata: {
          retrieved_context: similar_docs,
          token_count: tokenCount,
        },
      }
    }

    const { error: logError } = await supabase.from('vehicle_chat_conversations').insert({
      id: conversation_id,
      vehicle_id,
      user_message: message,
      assistant_response: response.text,
      query_type: response.query_type,
      metadata: response.metadata,
    })

    if (logError) {
      console.error('Failed to log conversation:', logError)
    }

    // Learn preferences from interaction
    await learnAndGetPreferences(supabase, vehicle_id, message, response.text)

    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error in handler:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
