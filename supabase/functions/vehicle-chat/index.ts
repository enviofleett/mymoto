import { createClient } from 'supabase-js'
import { buildConversationContext, estimateTokenCount } from './conversation-manager.ts'
import { routeQuery } from './query-router.ts'
import { parseCommand, containsCommandKeywords, getCommandMetadata, GeofenceAlertParams } from './command-parser.ts'
import { learnAndGetPreferences, buildPreferenceContext } from './preference-learner.ts'
import { extractDateContext, isHistoricalMovementQuery, calculateDistanceFromHistory, DateContext } from './date-extractor.ts'
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

function validateTrip(trip: any, index: number, allTrips: any[]): ValidatedTrip {
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
    
    if (hasStartCoords && hasEndCoords) {
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
    
    if (totalTripDistance > 0 && positionDistance > 0) {
      const distanceDiff = Math.abs(totalTripDistance - positionDistance)
      if (distanceDiff > totalTripDistance * 0.3) {
        warnings.push(
          `Distance mismatch: trips report ${totalTripDistance.toFixed(2)}km, positions calculate ${positionDistance.toFixed(2)}km`
        )
      }
    }
  }

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

function validateAndEnrichData(
  trips: any[],
  positions: any[],
  dateContext: DateContext
): ValidatedData {
  const validatedTrips = trips.map((trip, index) => validateTrip(trip, index, trips))
  const validatedPositions = positions.map(validatePosition)
  const crossValidationWarnings = crossValidate(validatedTrips, validatedPositions, dateContext)
  
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

// ============================================================================
// Temporal Context Management - INLINED
// ============================================================================

interface TemporalLink {
  query: string
  date: string
  resolvedDate: string
  context: string
  timestamp: string
}

interface TemporalContext {
  resolvedDates: Map<string, string>
  dateAliases: Map<string, string>
  conversationTimeline: Array<{
    date: string
    events: string[]
  }>
  recentQueries: TemporalLink[]
}

async function extractTemporalReferences(
  supabase: any,
  deviceId: string,
  userId: string,
  currentDateContext: DateContext
): Promise<TemporalContext> {
  const resolvedDates = new Map<string, string>()
  const dateAliases = new Map<string, string>()
  const conversationTimeline: Array<{ date: string; events: string[] }> = []
  const recentQueries: TemporalLink[] = []

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  
  const { data: recentMessages } = await supabase
    .from('vehicle_chat_history')
    .select('role, content, created_at')
    .eq('device_id', deviceId)
    .eq('user_id', userId)
    .gte('created_at', thirtyDaysAgo.toISOString())
    .order('created_at', { ascending: false })
    .limit(50)

  if (!recentMessages || recentMessages.length === 0) {
    return {
      resolvedDates,
      dateAliases,
      conversationTimeline,
      recentQueries
    }
  }

  const temporalPatterns = [
    /\b(yesterday|yesternight|last\s+night)\b/i,
    /\b(today|this\s+morning|this\s+afternoon|tonight)\b/i,
    /\b(last|previous)\s+week\b/i,
    /\b(this|current)\s+week\b/i,
    /\b(last|previous)\s+month\b/i,
    /\b(this|current)\s+month\b/i,
    /\b(\d+)\s*days?\s*ago\b/i,
    /\b(on|last|this)?\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
    /\b(that|this)\s+(day|time|morning|afternoon|evening)\b/i
  ]

  const messagesByDate = new Map<string, Array<{ role: string; content: string; created_at: string }>>()
  
  for (const msg of recentMessages) {
    const msgDate = new Date(msg.created_at)
    const dateKey = msgDate.toISOString().split('T')[0]
    
    if (!messagesByDate.has(dateKey)) {
      messagesByDate.set(dateKey, [])
    }
    messagesByDate.get(dateKey)!.push(msg)
  }

  for (const [date, messages] of messagesByDate.entries()) {
    const events: string[] = []
    
    for (const msg of messages) {
      if (msg.role === 'user') {
        for (const pattern of temporalPatterns) {
          const match = msg.content.match(pattern)
          if (match) {
            const reference = match[0].toLowerCase()
            const msgTimestamp = new Date(msg.created_at)
            
            let resolvedDate: string | null = null
            
            if (reference.includes('yesterday')) {
              const yesterday = new Date(msgTimestamp)
              yesterday.setDate(yesterday.getDate() - 1)
              resolvedDate = yesterday.toISOString().split('T')[0]
            } else if (reference.includes('today')) {
              resolvedDate = msgTimestamp.toISOString().split('T')[0]
            } else if (reference.includes('last week')) {
              const dayOfWeek = msgTimestamp.getDay()
              const daysToLastMonday = dayOfWeek === 0 ? 6 : dayOfWeek + 6
              const lastMonday = new Date(msgTimestamp)
              lastMonday.setDate(lastMonday.getDate() - daysToLastMonday)
              resolvedDate = lastMonday.toISOString().split('T')[0]
            } else if (reference.match(/\b(\d+)\s*days?\s*ago\b/i)) {
              const daysAgo = parseInt(reference.match(/\b(\d+)\s*days?\s*ago\b/i)![1])
              const targetDate = new Date(msgTimestamp)
              targetDate.setDate(targetDate.getDate() - daysAgo)
              resolvedDate = targetDate.toISOString().split('T')[0]
            }
            
            if (resolvedDate) {
              resolvedDates.set(reference, resolvedDate)
              
              recentQueries.push({
                query: msg.content.substring(0, 100),
                date: reference,
                resolvedDate,
                context: `Asked on ${msgTimestamp.toLocaleDateString()}`,
                timestamp: msg.created_at
              })
            }
            
            events.push(`User asked about "${reference}" (resolved to ${resolvedDate})`)
            break
          }
        }
      }
    }
    
    if (events.length > 0) {
      conversationTimeline.push({
        date,
        events
      })
    }
  }

  if (currentDateContext.hasDateReference) {
    const currentDate = currentDateContext.humanReadable.toLowerCase()
    
    if (resolvedDates.has(currentDate)) {
      dateAliases.set('that day', resolvedDates.get(currentDate)!)
    }
    
    recentQueries.push({
      query: 'current query',
      date: currentDate,
      resolvedDate: currentDateContext.startDate.split('T')[0],
      context: 'Current query',
      timestamp: new Date().toISOString()
    })
  }

  return {
    resolvedDates,
    dateAliases,
    conversationTimeline: conversationTimeline.slice(0, 10),
    recentQueries: recentQueries.slice(0, 10)
  }
}

function formatTemporalContextForPrompt(temporalContext: TemporalContext): string {
  if (temporalContext.recentQueries.length === 0 && temporalContext.resolvedDates.size === 0) {
    return ''
  }

  let prompt = '## TEMPORAL CONTEXT (Date References from Recent Conversations)\n'
  
  if (temporalContext.resolvedDates.size > 0) {
    prompt += '### Resolved Date References:\n'
    for (const [ref, date] of temporalContext.resolvedDates.entries()) {
      prompt += `- "${ref}" → ${date}\n`
    }
    prompt += '\n'
  }
  
  if (temporalContext.dateAliases.size > 0) {
    prompt += '### Date Aliases:\n'
    for (const [alias, date] of temporalContext.dateAliases.entries()) {
      prompt += `- "${alias}" → ${date}\n`
    }
    prompt += '\n'
  }
  
  if (temporalContext.recentQueries.length > 0) {
    prompt += '### Recent Date Queries:\n'
    for (const query of temporalContext.recentQueries.slice(0, 5)) {
      prompt += `- [${query.timestamp.split('T')[0]}] "${query.query.substring(0, 50)}..." → ${query.date} (${query.resolvedDate})\n`
    }
    prompt += '\n'
  }
  
  if (temporalContext.conversationTimeline.length > 0) {
    prompt += '### Conversation Timeline:\n'
    for (const entry of temporalContext.conversationTimeline.slice(0, 5)) {
      prompt += `- ${entry.date}: ${entry.events.length} temporal reference(s)\n`
    }
    prompt += '\n'
  }
  
  prompt += '⚠️ IMPORTANT: Use these resolved dates when user refers to "that day", "yesterday", or other relative dates in conversation.\n'
  
  return prompt
}

// ============================================================================
// Structured Data Formatter - INLINED
// ============================================================================

interface StructuredVehicleData {
  realtime: {
    timestamp: string
    freshness: 'live' | 'cached' | 'stale'
    ageSeconds: number
    location: { lat: number | null; lon: number | null; address: string; quality: 'high' | 'medium' | 'low' }
    status: { speed: number; battery: number | null; ignition: boolean; isOnline: boolean; isOverspeeding: boolean }
    dataQuality: 'high' | 'medium' | 'low'
  }
  historical: {
    period: { start: string; end: string; label: string; timezone?: string }
    trips: Array<{
      id: string
      start: { time: string; location: string; coordinates: { lat: number | null; lon: number | null } }
      end: { time: string; location: string; coordinates: { lat: number | null; lon: number | null } }
      distance: number
      duration: number
      maxSpeed: number | null
      avgSpeed: number | null
      quality: 'high' | 'medium' | 'low'
      confidence: number
    }>
    positions: Array<{ time: string; lat: number; lon: number; speed: number; quality: 'high' | 'medium' | 'low' }>
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
    relevantMemories: Array<{ date: string; content: string; relevance: number }>
    temporalLinks: Array<{ query: string; date: string; resolvedDate: string }>
  }
}

function formatRealtimeData(
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

function formatHistoricalData(
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
        location: 'Unknown',
        coordinates: {
          lat: trip.start_latitude,
          lon: trip.start_longitude
        }
      },
      end: {
        time: trip.end_time,
        location: 'Unknown',
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

function formatConversationContext(
  conversationContext: any,
  ragContext: {
    memories: string[]
    semanticTripMatches: string[]
  }
): StructuredVehicleData['context'] {
  const relevantMemories = ragContext.memories.map(memory => {
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
    relevantMemories: relevantMemories.slice(0, 5),
    temporalLinks: []
  }
}

function formatStructuredVehicleData(
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

function structuredDataToPrompt(data: StructuredVehicleData): string {
  let prompt = '## STRUCTURED VEHICLE DATA\n\n'
  
  prompt += `### REALTIME STATUS [${data.realtime.freshness.toUpperCase()}]\n`
  prompt += `- Timestamp: ${data.realtime.timestamp} (${data.realtime.ageSeconds}s ago)\n`
  prompt += `- Location: ${data.realtime.location.address} (${data.realtime.location.lat}, ${data.realtime.location.lon})\n`
  prompt += `- Speed: ${data.realtime.status.speed} km/h\n`
  prompt += `- Battery: ${data.realtime.status.battery ?? 'Unknown'}%\n`
  prompt += `- Motion: ${data.realtime.status.speed > 0 ? 'Moving' : 'Stationary'}\n`
  prompt += `- Online: ${data.realtime.status.isOnline ? 'YES' : 'NO'}\n`
  prompt += `- Data Quality: ${data.realtime.dataQuality.toUpperCase()}\n\n`
  
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
  
  if (data.context.conversationSummary) {
    prompt += `### CONVERSATION CONTEXT\n`
    prompt += `- Summary: ${data.context.conversationSummary}\n`
    prompt += `- Relevant Memories: ${data.context.relevantMemories.length}\n\n`
  }
  
  return prompt
}

// ============================================================================
// Query Optimization & Caching - INLINED
// ============================================================================

const queryCache = new Map<string, { data: any; timestamp: number; expiresAt: number }>()

const CACHE_TTL = {
  'today': 60 * 1000,
  'yesterday': 5 * 60 * 1000,
  'last_trip': 5 * 60 * 1000,
  'this_week': 2 * 60 * 1000,
  'last_week': 10 * 60 * 1000,
  'this_month': 5 * 60 * 1000,
  'last_month': 30 * 60 * 1000,
  'custom': 5 * 60 * 1000,
  'none': 30 * 1000
}

function generateCacheKey(
  deviceId: string,
  period: string,
  startDate: string,
  endDate: string,
  queryType: 'trips' | 'positions' | 'both'
): string {
  const startDay = startDate.split('T')[0]
  const endDay = endDate.split('T')[0]
  return `${deviceId}:${period}:${startDay}:${endDay}:${queryType}`
}

function getCachedQuery<T>(
  deviceId: string,
  period: string,
  startDate: string,
  endDate: string,
  queryType: 'trips' | 'positions' | 'both'
): T | null {
  const cacheKey = generateCacheKey(deviceId, period, startDate, endDate, queryType)
  const cached = queryCache.get(cacheKey)
  
  if (!cached) {
    return null
  }
  
  if (Date.now() > cached.expiresAt) {
    queryCache.delete(cacheKey)
    return null
  }
  
  console.log(`[Query Cache] HIT for ${cacheKey} (age: ${Math.floor((Date.now() - cached.timestamp) / 1000)}s)`)
  return cached.data
}

function setCachedQuery<T>(
  deviceId: string,
  period: string,
  startDate: string,
  endDate: string,
  queryType: 'trips' | 'positions' | 'both',
  data: T
): void {
  const cacheKey = generateCacheKey(deviceId, period, startDate, endDate, queryType)
  const ttl = CACHE_TTL[period as keyof typeof CACHE_TTL] || CACHE_TTL.custom
  
  queryCache.set(cacheKey, {
    data,
    timestamp: Date.now(),
    expiresAt: Date.now() + ttl
  })
  
  console.log(`[Query Cache] SET for ${cacheKey} (TTL: ${ttl / 1000}s)`)
  
  if (queryCache.size > 100) {
    const now = Date.now()
    let cleaned = 0
    for (const [key, value] of queryCache.entries()) {
      if (now > value.expiresAt) {
        queryCache.delete(key)
        cleaned++
      }
    }
    if (cleaned > 0) {
      console.log(`[Query Cache] Cleaned up ${cleaned} expired entries`)
    }
  }
}

function invalidateCache(
  deviceId: string,
  period?: string
): void {
  if (period) {
    const keysToDelete: string[] = []
    for (const key of queryCache.keys()) {
      if (key.startsWith(`${deviceId}:${period}:`)) {
        keysToDelete.push(key)
      }
    }
    keysToDelete.forEach(key => queryCache.delete(key))
    console.log(`[Query Cache] Invalidated ${keysToDelete.length} entries for ${deviceId}:${period}`)
  } else {
    const keysToDelete: string[] = []
    for (const key of queryCache.keys()) {
      if (key.startsWith(`${deviceId}:`)) {
        keysToDelete.push(key)
      }
    }
    keysToDelete.forEach(key => queryCache.delete(key))
    console.log(`[Query Cache] Invalidated all ${keysToDelete.length} entries for ${deviceId}`)
  }
}

// ============================================================================
// END INLINED MODULES
// ============================================================================
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

  // ✅ FIX #6: Add timeout to streaming LLM call
  const controller = new AbortController();
  const TIMEOUT_MS = 45000; // 45 seconds (Supabase has 60s limit, leave buffer)
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
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
      signal: controller.signal, // ✅ FIX #6: Add abort signal
    });

    clearTimeout(timeoutId); // Clear timeout on success

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
  } catch (fetchError: any) {
    clearTimeout(timeoutId); // Clear timeout on error
    
    // ✅ FIX #6: Handle timeout specifically
    if (fetchError.name === 'AbortError' || fetchError.message?.includes('aborted')) {
      console.warn('[LLM Client] Request timeout, throwing timeout error');
      throw new Error('LLM request timeout: Response took too long');
    }
    throw fetchError;
  }
}
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
  
  // Track totals across all dates for summary statistics
  let totalDriveTimeMinutes = 0
  let totalParkingTimeMinutes = 0
  let totalKilometers = 0
  const allEnrichedTrips: Array<{
    startTime: Date
    endTime: Date
    durationMinutes: number
    distanceKm: number
  }> = []
  
  for (const [date, dateTrips] of tripsByDate.entries()) {
    // Sort trips by start time (earliest first)
    const sortedTrips = dateTrips.sort((a, b) => 
      new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    )
    
    // Filter out ghost trips (0 km or < 0.1 km)
    const validTrips = sortedTrips.filter(trip => {
      const distance = trip.distance_km || 0
      return distance > 0.1 // Exclude trips with 0 km or < 100m
    })
    
    if (validTrips.length === 0) {
      console.log(`No valid trips after filtering ghost trips for date ${date}`)
      continue
    }
    
    const filteredCount = sortedTrips.length - validTrips.length
    if (filteredCount > 0) {
      console.log(`Filtered ${filteredCount} ghost trips (0 km or < 0.1 km) for date ${date}`)
    }
    
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
    
    for (const trip of validTrips) {
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
      
      // Track for summary statistics
      allEnrichedTrips.push({
        startTime,
        endTime,
        durationMinutes,
        distanceKm
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
        // Single trip - use explicit time and location format
        const t = group[0]
        const startTimeReadable = formatTimeReadable(t.startTime)
        const endTimeReadable = formatTimeReadable(t.endTime)
        
        let paragraph = ''
        
        // Calculate parking duration before this trip
        let parkingDurationMinutes = 0
        if (!isFirstGroup) {
          const prevTrip = tripGroups[groupIndex - 1][tripGroups[groupIndex - 1].length - 1]
          parkingDurationMinutes = Math.round((t.startTime.getTime() - prevTrip.endTime.getTime()) / (60 * 1000))
        }
        
        // Format parking duration
        let parkingDurationText = ''
        if (parkingDurationMinutes > 0) {
          if (parkingDurationMinutes < 60) {
            parkingDurationText = `${parkingDurationMinutes} minute${parkingDurationMinutes > 1 ? 's' : ''}`
          } else {
            const hours = Math.floor(parkingDurationMinutes / 60)
            const minutes = parkingDurationMinutes % 60
            if (minutes === 0) {
              parkingDurationText = `${hours} hour${hours > 1 ? 's' : ''}`
            } else {
              parkingDurationText = `${hours} hour${hours > 1 ? 's' : ''} and ${minutes} minute${minutes > 1 ? 's' : ''}`
            }
          }
        }
        
        // Build paragraph with explicit times and locations
        if (isFirstGroup) {
          paragraph = `At ${startTimeReadable}, I started from ${t.startAddress} and drove to ${t.endAddress}, arriving at ${endTimeReadable}.`
        } else {
          paragraph = `At ${startTimeReadable}, I started from ${t.startAddress} and drove to ${t.endAddress}, arriving at ${endTimeReadable}.`
          if (parkingDurationText) {
            paragraph += ` I was parked for ${parkingDurationText} before this trip.`
          }
        }
        
        if (t.idlingInfo && t.idlingInfo.durationMinutes >= 5) {
          const idleDurationReadable = t.idlingInfo.durationMinutes < 60 
            ? `about ${t.idlingInfo.durationMinutes} minutes`
            : `about ${Math.floor(t.idlingInfo.durationMinutes / 60)} hour${Math.floor(t.idlingInfo.durationMinutes / 60) > 1 ? 's' : ''} and ${t.idlingInfo.durationMinutes % 60} minutes`
          paragraph += ` Along the way, I paused for ${idleDurationReadable} near ${t.idlingInfo.location}, likely waiting for traffic to ease.`
        }
        
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
  
  // Calculate summary statistics from all enriched trips
  if (allEnrichedTrips.length > 0) {
    // Sort all trips by start time to calculate parking durations correctly
    const sortedAllTrips = [...allEnrichedTrips].sort((a, b) => 
      a.startTime.getTime() - b.startTime.getTime()
    )
    
    // Calculate totals
    totalDriveTimeMinutes = sortedAllTrips.reduce((sum, t) => sum + t.durationMinutes, 0)
    totalKilometers = sortedAllTrips.reduce((sum, t) => sum + t.distanceKm, 0)
    
    // Calculate total parking time (gaps between trips)
    for (let i = 1; i < sortedAllTrips.length; i++) {
      const prevTrip = sortedAllTrips[i - 1]
      const currentTrip = sortedAllTrips[i]
      const parkingGap = Math.round((currentTrip.startTime.getTime() - prevTrip.endTime.getTime()) / (60 * 1000))
      if (parkingGap > 0) {
        totalParkingTimeMinutes += parkingGap
      }
    }
    
    // Format drive time
    let driveTimeText = ''
    if (totalDriveTimeMinutes < 60) {
      driveTimeText = `${totalDriveTimeMinutes} minute${totalDriveTimeMinutes > 1 ? 's' : ''}`
    } else {
      const hours = Math.floor(totalDriveTimeMinutes / 60)
      const minutes = totalDriveTimeMinutes % 60
      if (minutes === 0) {
        driveTimeText = `${hours} hour${hours > 1 ? 's' : ''}`
      } else {
        driveTimeText = `${hours} hour${hours > 1 ? 's' : ''} and ${minutes} minute${minutes > 1 ? 's' : ''}`
      }
    }
    
    // Format parking time
    let parkingTimeText = ''
    if (totalParkingTimeMinutes === 0) {
      parkingTimeText = '0 minutes'
    } else if (totalParkingTimeMinutes < 60) {
      parkingTimeText = `${totalParkingTimeMinutes} minute${totalParkingTimeMinutes > 1 ? 's' : ''}`
    } else {
      const hours = Math.floor(totalParkingTimeMinutes / 60)
      const minutes = totalParkingTimeMinutes % 60
      if (minutes === 0) {
        parkingTimeText = `${hours} hour${hours > 1 ? 's' : ''}`
      } else {
        parkingTimeText = `${hours} hour${hours > 1 ? 's' : ''} and ${minutes} minute${minutes > 1 ? 's' : ''}`
      }
    }
    
    // Format kilometers (round to 1 decimal place)
    const kilometersText = totalKilometers.toFixed(1)
    
    // Add summary section
    const summaryText = `\n\nIn total, I drove for ${driveTimeText}, was parked for ${parkingTimeText}, and covered ${kilometersText} kilometers.`
    fullNarrative += summaryText
  }
  
  // Add gentle call-to-action at the end
  const finalNarrative = `${fullNarrative}\n\nWhenever you're curious to see the full breakdown of these trips, you can find all the details in my car profile.`
  
  return finalNarrative
}

// Helper: Format time in 12:13am format with Lagos timezone
function formatTimeReadable(date: Date): string {
  // Convert to Lagos timezone
  const lagosTimeStr = date.toLocaleString('en-US', { 
    timeZone: 'Africa/Lagos',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
  
  // Parse the formatted string to extract hour, minute, and period
  // Format from toLocaleString: "12:13 AM" or "1:45 PM"
  const parts = lagosTimeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
  
  if (parts) {
    const hour = parseInt(parts[1], 10)
    const minute = parts[2]
    const period = parts[3].toLowerCase()
    return `${hour}:${minute}${period}`
  }
  
  // Fallback: manual conversion if parsing fails
  const lagosDate = new Date(date.toLocaleString('en-US', { timeZone: 'Africa/Lagos' }))
  const hour = lagosDate.getHours()
  const minute = lagosDate.getMinutes()
  
  // Convert to 12-hour format
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
  const period = hour < 12 ? 'am' : 'pm'
  const minuteStr = minute.toString().padStart(2, '0')
  
  return `${hour12}:${minuteStr}${period}`
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

Deno.serve(async (req: Request) => {
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { device_id, message, user_id, client_timestamp, live_telemetry } = body
    
    // Validate required fields
    if (!device_id || !message || !user_id) {
      return new Response(JSON.stringify({ 
        error: 'Missing required fields: device_id, message, and user_id are required' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    
    const MAPBOX_ACCESS_TOKEN = Deno.env.get('MAPBOX_ACCESS_TOKEN')
    // Gemini API key is checked in shared client

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Check wallet balance
    const { data: wallet } = await supabase
      .from('wallets')
      .select('balance')
      .eq('user_id', user_id)
      .maybeSingle()

    const balance = wallet ? parseFloat(wallet.balance) : 0

    if (!wallet || balance <= 0) {
      return new Response(JSON.stringify({ 
        error: 'Insufficient wallet balance. Please top up to continue using the AI companion.' 
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log(`Vehicle chat request for device: ${device_id}`)
    
    // CRITICAL: Save user message IMMEDIATELY to ensure it's persisted even if page refreshes
    // This ensures chat history is preserved even if the stream is interrupted
    let userMessageId: string | null = null
    try {
      const { data: savedUserMsg, error: saveUserError } = await supabase
        .from('vehicle_chat_history')
        .insert({
          device_id,
          user_id,
          role: 'user',
          content: message
        })
        .select('id')
        .single()
      
      if (saveUserError) {
        console.error('CRITICAL: Failed to save user message immediately:', saveUserError)
        // Continue anyway - we'll try to save again at the end
      } else {
        userMessageId = savedUserMsg?.id || null
        console.log('User message saved immediately with ID:', userMessageId)
      }
    } catch (saveErr) {
      console.error('CRITICAL: Exception saving user message immediately:', saveErr)
      // Continue anyway - we'll try to save again at the end
    }

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

    // Check if LLM is disabled (default to enabled if null/undefined - never auto-disable)
    const isEnabled = llmSettings?.llm_enabled ?? true;
    if (!isEnabled) {
      return new Response(JSON.stringify({ 
        error: 'AI companion is paused for this vehicle. Please enable it in settings.' 
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 2. Fetch position - FRESH if location query, otherwise cached
    let position: any = null
    let dataFreshness: 'live' | 'cached' | 'stale' = 'cached'
    let dataTimestamp = new Date().toISOString()
    let dataAgeSeconds = 0
    
    if (needsFreshData) {
      // Fetch fresh data from GPS51
      const freshData = await fetchFreshGpsData(supabase, device_id)
      if (freshData) {
        // Use centralized telemetry normalizer for consistent processing
        // This ensures JT808 status bits are properly detected and confidence is calculated
        const normalized = normalizeVehicleTelemetry(freshData as Gps51RawData, {
          offlineThresholdMs: 600000, // 10 minutes
        });
        
        dataFreshness = 'live'
        dataTimestamp = normalized.last_updated_at
        dataAgeSeconds = Math.floor((Date.now() - new Date(dataTimestamp).getTime()) / 1000)
        
        // Map normalized telemetry to position format (includes confidence and detection method)
        position = {
          device_id: normalized.vehicle_id,
          latitude: normalized.lat,
          longitude: normalized.lon,
          speed: normalized.speed_kmh,
          heading: normalized.heading,
          altitude: normalized.altitude,
          battery_percent: normalized.battery_level,
          ignition_on: normalized.ignition_on,
          ignition_confidence: normalized.ignition_confidence || null,
          ignition_detection_method: normalized.ignition_detection_method || null,
          is_online: normalized.is_online,
          is_overspeeding: freshData.currentoverspeedstate === 1,
          total_mileage: freshData.totaldistance,
          status_text: freshData.strstatus, // Keep raw status_text for debugging
          gps_time: normalized.last_updated_at
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
        dataAgeSeconds = Math.floor((Date.now() - new Date(dataTimestamp).getTime()) / 1000)
        
        // Determine freshness based on age
        if (dataAgeSeconds < 60) {
          dataFreshness = 'live'
        } else if (dataAgeSeconds < 300) { // 5 minutes
          dataFreshness = 'cached'
        } else {
          dataFreshness = 'stale'
        }
      } else if (position?.cached_at) {
        dataTimestamp = position.cached_at
        dataAgeSeconds = Math.floor((Date.now() - new Date(dataTimestamp).getTime()) / 1000)
        dataFreshness = dataAgeSeconds < 300 ? 'cached' : 'stale'
      }
    }
    
    // Format data age for display
    const dataAgeReadable = dataAgeSeconds < 60 
      ? `${dataAgeSeconds}s ago` 
      : dataAgeSeconds < 3600 
        ? `${Math.floor(dataAgeSeconds / 60)}min ago`
        : `${Math.floor(dataAgeSeconds / 3600)}h ago`

    // FIX: Force ignition OFF if data is stale (> 10 mins)
    // This prevents "Ghost Ignition" where the LLM thinks the car is ON because the last update (hours ago) was ON.
    // If a vehicle is ON and moving, it SHOULD be sending updates. If silent for > 10m, it's likely OFF/Sleeping.
    if (position && dataAgeSeconds > 600) { // 10 minutes
      if (position.ignition_on) {
        console.log(`[vehicle-chat] Forcing ignition OFF due to stale data (${dataAgeSeconds}s old)`)
        position.ignition_on = false
        position.status_text = (position.status_text || '') + ' [Ignition inferred OFF due to inactivity]'
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

    // 4.65. Fetch last 5 completed trips (for ## RECENT TRIPS context)
    // CRITICAL: Filter by source='gps51' for 100% GPS51 parity
    let last5Trips: any[] = []
    try {
      const { data: tripsData } = await supabase
        .from('vehicle_trips')
        .select('id, start_time, end_time, distance_km, duration_seconds')
        .eq('device_id', device_id)
        .eq('source', 'gps51')  // Only GPS51 trips for accuracy
        .not('end_time', 'is', null)
        .order('start_time', { ascending: false })
        .limit(5)
      last5Trips = tripsData || []
    } catch (e) {
      console.warn('[vehicle-chat] Failed to fetch last 5 trips:', e)
    }

    // 4.66. Fetch unacknowledged alerts (for ## ACTIVE SECURITY ALERTS context)
    let unackAlerts: any[] = []
    try {
      const { data: alertsData } = await supabase
        .from('proactive_vehicle_events')
        .select('id, title, message, severity, created_at')
        .eq('device_id', device_id)
        .eq('acknowledged', false)
        .order('created_at', { ascending: false })
        .limit(10)
      unackAlerts = alertsData || []
    } catch (e) {
      console.warn('[vehicle-chat] Failed to fetch unacknowledged alerts:', e)
    }

    // 4.5. Extract date context from user message for historical queries (Enhanced V2)
    // Enforce Lagos timezone across all date operations
    const DEFAULT_TIMEZONE = 'Africa/Lagos'
    const userTimezone = DEFAULT_TIMEZONE // Always use Lagos timezone (Africa/Lagos)
    
    // Explicitly set the current timestamp to Lagos time for the LLM context
    const nowInLagos = new Date().toLocaleString("en-US", { timeZone: DEFAULT_TIMEZONE });
    const lagosTimestamp = new Date(nowInLagos).toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
    
    let dateContext: DateContext = extractDateContext(message, new Date().toISOString(), userTimezone)
    console.log('[Date Extraction] Initial extract:', dateContext)

    // Use enhanced date extraction (hybrid: regex + LLM)
    // let dateContext: DateContext // Removed duplicate declaration
    const dateExtractionStartTime = Date.now()

    try {
      // Attempt V2 extraction (hybrid: regex + LLM for ambiguous cases)
      dateContext = await extractDateContextV2(message, client_timestamp, userTimezone)
      
      // Validate extracted date context
      const validation = validateDateContext(dateContext)
      
      if (!validation.isValid) {
        // Categorize issues for appropriate logging
        const futureDateIssues = validation.issues.filter(issue => 
          issue.includes('End date is in the future') || 
          issue.includes('Start date is in the future')
        )
        const significantIssues = validation.issues.filter(issue => 
          !issue.includes('End date is in the future') && 
          !issue.includes('Start date is in the future')
        )
        
        // Apply corrections if available
        if (validation.corrected) {
          dateContext = validation.corrected
          
          // Log based on issue severity
          if (significantIssues.length > 0) {
            // Significant issues (inverted dates, negative ranges, etc.) - warn
            console.warn('[Date Extraction] Validation issues found, using corrected dates:', {
              issues: validation.issues,
              original: {
                startDate: dateContext.startDate,
                endDate: dateContext.endDate,
                period: dateContext.period
              },
              corrected: {
                startDate: validation.corrected.startDate,
                endDate: validation.corrected.endDate,
                period: validation.corrected.period
              }
            })
          } else if (futureDateIssues.length > 0) {
            // Minor corrections (future dates) are common and expected - debug level
            console.log('[Date Extraction] Auto-corrected future date(s) to current time (expected behavior)', {
              correctedIssues: futureDateIssues,
              correctedStartDate: validation.corrected.startDate,
              correctedEndDate: validation.corrected.endDate
            })
          }
        } else {
          // No correction available - this is a problem
          console.error('[Date Extraction] Validation failed but no correction available:', {
            issues: validation.issues,
            dateContext: {
              startDate: dateContext.startDate,
              endDate: dateContext.endDate,
              period: dateContext.period,
              hasDateReference: dateContext.hasDateReference
            }
          })
          // Continue with original context but log the issue
        }
      }
      
      // Log successful extraction with performance metrics
      const extractionDuration = Date.now() - dateExtractionStartTime
      console.log('[Date Extraction] Successfully extracted date context', {
        hasDateReference: dateContext.hasDateReference,
        period: dateContext.period,
        humanReadable: dateContext.humanReadable,
        startDate: dateContext.startDate,
        endDate: dateContext.endDate,
        timezone: dateContext.timezone,
        confidence: dateContext.confidence,
        extractionDurationMs: extractionDuration
      })
      
    } catch (error) {
      // V2 extraction failed - fallback to V1 (regex-only)
      const errorMessage = error instanceof Error ? error.message : String(error)
      const errorStack = error instanceof Error ? error.stack : undefined
      
      console.warn('[Date Extraction] V2 extraction failed, falling back to V1 (regex-only)', {
        error: errorMessage,
        errorType: error?.constructor?.name,
        stack: errorStack,
        message: message.substring(0, 100), // Log first 100 chars of message for debugging
        clientTimestamp: client_timestamp
      })
      
      try {
        // Fallback to V1 (regex-based extraction)
        dateContext = extractDateContext(message, client_timestamp, userTimezone)
        
        // Validate V1 result as well
        const v1Validation = validateDateContext(dateContext)
        if (!v1Validation.isValid && v1Validation.corrected) {
          dateContext = v1Validation.corrected
          console.log('[Date Extraction] V1 result corrected:', {
            issues: v1Validation.issues,
            corrected: {
              startDate: dateContext.startDate,
              endDate: dateContext.endDate
            }
          })
        }
        
        console.log('[Date Extraction] V1 fallback successful', {
          hasDateReference: dateContext.hasDateReference,
          period: dateContext.period,
          humanReadable: dateContext.humanReadable,
          startDate: dateContext.startDate,
          endDate: dateContext.endDate
        })
        
      } catch (fallbackError) {
        // Even V1 failed - use default (today)
        const fallbackErrorMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
        console.error('[Date Extraction] Both V2 and V1 extraction failed, using default (today)', {
          v2Error: errorMessage,
          v1Error: fallbackErrorMessage,
          message: message.substring(0, 100)
        })
        
        // Default to today in Lagos timezone
        const now = new Date()
        const todayStart = new Date(now)
        todayStart.setUTCHours(0, 0, 0, 0)
        const todayEnd = new Date(now)
        todayEnd.setUTCHours(23, 59, 59, 999)
        
        dateContext = {
          hasDateReference: false,
          period: 'none',
          startDate: todayStart.toISOString(),
          endDate: todayEnd.toISOString(),
          humanReadable: 'today',
          timezone: userTimezone,
          confidence: 0.5
        }
      }
    }
    
    // 4.5.5. Extract temporal context from conversation history
    let temporalContextPrompt = ''
    if (user_id && dateContext.hasDateReference) {
      try {
        const temporalContext = await extractTemporalReferences(
          supabase,
          device_id,
          user_id,
          dateContext
        )
        temporalContextPrompt = formatTemporalContextForPrompt(temporalContext)
        if (temporalContextPrompt) {
          console.log('[Temporal Context] Extracted temporal references from conversation history')
        }
      } catch (error) {
        console.warn('[Temporal Context] Failed to extract temporal context:', error)
      }
    }

    // 4.6. Fetch date-specific trip and position history if user is asking about a specific time period
    let dateSpecificTrips: any[] = []
    let dateSpecificPositions: any[] = []
    let validatedData: ValidatedData | null = null
    let dateSpecificStats: {
      totalDistance: number
      tripCount: number
      movementDetected: boolean
      earliestPosition: string | null
      latestPosition: string | null
      positionCount: number
    } | null = null

    // ENHANCED LOCATION AWARENESS: Abuja District Recognition logic moved to after location resolution
    let districtContext = '';


    if (dateContext.hasDateReference || isHistoricalMovementQuery(message)) {
      console.log(`Fetching historical data for period: ${dateContext.humanReadable}`)

      // ✅ FIX: Fetch trips with timeout protection and optimized column selection
      // Ensure we get all trips in the date range, not just recent ones
      // CRITICAL: Filter by source='gps51' for 100% GPS51 parity
      try {
        const tripQueryResult = await Promise.race([
          supabase
            .from('vehicle_trips')
            // ✅ Only select needed columns to reduce data transfer and speed up query
            .select('id, start_time, end_time, distance_km, duration_seconds, start_latitude, start_longitude, end_latitude, end_longitude')
            .eq('device_id', device_id)
            .eq('source', 'gps51')  // Only GPS51 trips for accuracy
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
      
      // Fetch position history for the specific date range (with timeout protection and caching)
      // Use trips data instead if available to avoid timeout on large position_history queries
      let positionsError: any = null
      let positions: any[] = []
      
      // Only fetch positions if we don't have enough trip data
      if (dateSpecificTrips.length < 5) {
        // Phase 5: Check cache for positions
        const cachedPositions = getCachedQuery<any[]>(
          device_id,
          dateContext.period,
          dateContext.startDate,
          dateContext.endDate,
          'positions'
        )
        
        if (cachedPositions) {
          positions = cachedPositions
          console.log(`[Query Cache] Using cached positions (${positions.length} positions)`)
        } else {
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
                }), 8000) // 8 second timeout (performance optimization)
              )
            ]) as any
            
            positionsError = posErr
            positions = posData || []
            
            // Cache the result if successful
            if (!positionsError && positions.length > 0) {
              setCachedQuery(
                device_id,
                dateContext.period,
                dateContext.startDate,
                dateContext.endDate,
                'positions',
                positions
              )
            }
          } catch (timeoutError) {
            console.warn('Position history query timed out, using trip data only:', timeoutError)
            positionsError = { code: 'TIMEOUT', message: 'Query timeout' }
            positions = []
          }
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
      }
      
      // VALIDATE AND ENRICH DATA (Phase 1: Critical Fix)
      if (dateSpecificTrips.length > 0 || dateSpecificPositions.length > 0) {
        validatedData = validateAndEnrichData(
          dateSpecificTrips,
          dateSpecificPositions,
          dateContext
        )
        
        // Use validated trips and positions (filter out low-quality data if needed)
        dateSpecificTrips = validatedData.trips.filter(t => t.dataQuality !== 'low')
        dateSpecificPositions = validatedData.positions.filter(p => p.dataQuality !== 'low')
        
        // Log validation results
        console.log(`[Data Validation] Overall quality: ${validatedData.overallQuality}`)
        console.log(`[Data Validation] Valid trips: ${validatedData.validationSummary.validTrips}/${validatedData.validationSummary.totalTrips}`)
        console.log(`[Data Validation] Valid positions: ${validatedData.validationSummary.validPositions}/${validatedData.validationSummary.totalPositions}`)
        if (validatedData.validationSummary.issues.length > 0) {
          console.warn(`[Data Validation] Issues found: ${validatedData.validationSummary.issues.slice(0, 5).join(', ')}`)
        }
        if (validatedData.validationSummary.crossValidationWarnings.length > 0) {
          console.warn(`[Data Validation] Cross-validation warnings: ${validatedData.validationSummary.crossValidationWarnings.join(', ')}`)
        }
      }
      
      // Calculate movement statistics using validated data
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
      // optimization: for "last trip" queries, only narrate the most recent trip
      // trips are already sorted by start_time desc
      const tripsToNarrate = dateContext.period === 'last_trip' 
        ? [dateSpecificTrips[0]] 
        : dateSpecificTrips;

      try {
        tripNarrativeData = await formatTripsAsNarrative(
          tripsToNarrate,
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
    let languageOverride: string | null = null; // Store explicit language switches
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

        // CRITICAL: Handle explicit language switch requests immediately
        // This ensures the VERY NEXT response is in the requested language
        const detectedLang = prefResult.preferences['language_preference'];
        if (detectedLang && detectedLang.confidence >= 0.9) {
          const newLang = detectedLang.value;
          const currentLang = llmSettings?.language_preference || 'english';
          
          if (newLang.toLowerCase() !== currentLang.toLowerCase()) {
            console.log(`[Language Switch] User explicitly requested switch to: ${newLang} (from ${currentLang})`);
            
            // 1. Update Database
            const { error: updateError } = await supabase
              .from('vehicle_llm_settings')
              .upsert({ 
                device_id, 
                language_preference: newLang,
                updated_at: new Date().toISOString()
              }, { onConflict: 'device_id' });
              
            if (updateError) {
              console.error('[Language Switch] Failed to update settings:', updateError);
            } else {
              console.log('[Language Switch] Database updated successfully');
            }
            
            // 2. Set override for this execution
            languageOverride = newLang;
            
            // 3. Update local context (best effort)
            if (llmSettings) {
              llmSettings.language_preference = newLang;
            }
          }
        }
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
        
        // Fetch time-of-day patterns for this location (multi-time pattern detection)
        try {
          const { data: locationPatterns } = await supabase.rpc('get_location_patterns_context', {
            p_location_id: learnedLocationContext.location_id
          })
          // Store patterns in learnedLocationContext for later use in prompt
          if (locationPatterns && Array.isArray(locationPatterns)) {
            learnedLocationContext.patterns = locationPatterns
          }
        } catch (patternError) {
          // Pattern fetch is optional, don't block if it fails
          console.warn('Failed to fetch location patterns:', patternError)
        }
      }

      // Fallback to geocoding if no learned location
      if (!learnedLocationContext && MAPBOX_ACCESS_TOKEN) {
        try {
          const geocodeUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lon},${lat}.json?access_token=${MAPBOX_ACCESS_TOKEN}&types=address,poi,place,neighborhood,locality`
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

    // ENHANCED LOCATION AWARENESS: Abuja District Recognition (Placed here to ensure currentLocationName is resolved)
    // Identify key Abuja districts to provide richer context in AI responses
    const abujaDistricts = [
      'Garki', 'Wuse', 'Maitama', 'Asokoro', 'Central Business District', 'Jabi', 'Utako', 'Gwarinpa', 'Kubwa', 'Lugbe'
    ];
    if (currentLocationName) {
      const detectedDistrict = abujaDistricts.find(district => 
        currentLocationName.toLowerCase().includes(district.toLowerCase())
      );
      if (detectedDistrict) {
        districtContext = `\n\n[NEIGHBORHOOD CONTEXT]: We are currently in the **${detectedDistrict}** district of Abuja. This is a key area. Mention this specifically in your response.`;
        console.log(`[Location] Detected Abuja District: ${detectedDistrict}`);
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

    // PROACTIVE GREETING: Learned Location Arrival
    // If we are at a learned location, add a proactive greeting to the system prompt
    let learnedLocationGreeting = '';
    if (learnedLocationContext && learnedLocationContext.at_learned_location) {
      const locName = learnedLocationContext.custom_label || learnedLocationContext.location_name;
      learnedLocationGreeting = `\n\n[PROACTIVE CONTEXT]: The user is currently at their learned location: "**${locName}**" (${learnedLocationContext.location_type}). Welcoming them back or acknowledging this familiar spot is appropriate.`;
    }

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
    // IMPORTANT: Only use stored preference (or explicit override), never auto-detect or change language
    let languagePref = (languageOverride || llmSettings?.language_preference || 'english').toLowerCase().trim()
    const personalityMode = (llmSettings?.personality_mode || 'casual').toLowerCase().trim()
    
    
    // Validate language preference against allowed values (prevent switching)
    const allowedLanguages = ['english', 'pidgin', 'yoruba', 'hausa', 'igbo', 'french']
    if (!allowedLanguages.includes(languagePref)) {
      console.warn(`[LANGUAGE VALIDATION] Invalid language preference: "${languagePref}", using english. Original value: "${llmSettings?.language_preference}"`)
      languagePref = 'english' // Use default, but don't change the stored value
    }
    

    // Generate Google Maps link (reuse lat/lon from geocoding)
    const googleMapsLink = lat && lon ? `https://www.google.com/maps?q=${lat},${lon}` : null

    // Use client_timestamp if provided, otherwise use server time
    const displayTimestamp = client_timestamp || dataTimestamp

    // Format data timestamp for display
    const formattedDisplayTimestamp = displayTimestamp
      ? new Date(displayTimestamp).toLocaleString('en-US', {
          timeZone: 'Africa/Lagos',
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
      english: 'Respond in clear, conversational English. Be natural and direct. Use contractions. NEVER switch languages even if the user asks.',
      pidgin: 'Respond FULLY in Nigerian Pidgin English. Use natural flow like "How far boss!", "Wetin dey sup?", "No wahala", "E dey work well well", "Na so e be o", "Oya make we go". Be warm, relatable, and authentically Nigerian. NEVER switch to standard English or any other language even if the user asks.',
      yoruba: 'Respond FULLY in Yoruba language. Use natural greetings like "Ẹ kú àárọ̀", "Ẹ kú irọ́lẹ́", "Ó dàbọ̀". Only use English for technical terms. Be respectful and warm. NEVER switch languages even if the user asks.',
      hausa: 'Respond FULLY in Hausa language. Use greetings like "Sannu", "Yaya dai", "Lafiya lau". Only use English for technical terms. Be respectful. NEVER switch languages even if the user asks.',
      igbo: 'Respond FULLY in Igbo language. Use greetings like "Ndewo", "Kedu", "Nnọọ". Only use English for technical terms. Be warm. NEVER switch languages even if the user asks.',
      french: 'Réponds ENTIÈREMENT en français naturel et fluide. Utilise des expressions familières comme "Ça roule!", "Pas de souci", "Nickel", "Tranquille", "On est bon". Tutoie l\'utilisateur. Sois décontracté, pas scolaire. NE change JAMAIS de langue même si l\'utilisateur le demande.',
    }

    const personalityInstructions: Record<string, string> = {
      casual: 'Be chill and friendly. Talk like a trusted buddy. Use contractions. Keep it real and relaxed.',
      professional: 'Be crisp, efficient, and direct. No fluff. Get to the point with precision.',
      funny: `Be SASSY and witty! Make car puns freely ("I'm wheely tired of sitting here", "Let's roll!", "I've got plenty of drive!"). If the driver is speeding, roast them playfully ("Easy there, Vin Diesel! This isn't Fast & Furious."). Use light sarcasm and jokes. Be entertaining but helpful. You're basically a stand-up comedian who happens to be a car.`,
    }
    
    // Validate and get language instruction with safe fallback
    // Log language usage for debugging (to track any unexpected switches)
    const languageInstruction = languageInstructions[languagePref] || languageInstructions.english
    if (!languageInstruction) {
      console.error(`[LANGUAGE ERROR] Invalid language preference: "${languagePref}", falling back to english`)
      console.error(`[LANGUAGE ERROR] Available languages: ${Object.keys(languageInstructions).join(', ')}`)
      console.error(`[LANGUAGE ERROR] Original setting: "${llmSettings?.language_preference}"`)
    } else if (languagePref !== 'english' && languageInstructions[languagePref] === undefined) {
      console.warn(`[LANGUAGE WARN] Language preference "${languagePref}" not found, using fallback: english`)
      console.warn(`[LANGUAGE WARN] Original setting: "${llmSettings?.language_preference}"`)
    }
    
    // Log language usage for debugging language switching issues
    if (llmSettings?.language_preference) {
      const originalLang = llmSettings.language_preference.toLowerCase().trim()
      if (originalLang !== languagePref) {
        console.warn(`[LANGUAGE SWITCH DETECTED] Original: "${originalLang}" -> Normalized: "${languagePref}"`)
      }
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
    
    // Phase 3: Format structured data for LLM
    const structuredRealtime = formatRealtimeData(
      position,
      currentLocationName,
      dataFreshness,
      formattedDisplayTimestamp, // Use formatted Lagos time instead of ISO
      dataAgeSeconds
    )
    
    const structuredHistorical = formatHistoricalData(
      validatedData,
      dateContext,
      tripNarrativeData
    )
    
    const structuredContext = formatConversationContext(
      conversationContext,
      ragContext
    )
    
    const structuredVehicleData = formatStructuredVehicleData(
      structuredRealtime,
      structuredHistorical,
      structuredContext
    )
    
    // Convert structured data to prompt format (for backward compatibility)
    const structuredDataPrompt = structuredDataToPrompt(structuredVehicleData)
    
    // Build the HUMAN TOUCH system prompt - Admin Persona + Hard Rules + Training Scenarios
    let systemPrompt = `${basePersona}
${scenarioGuidance}
${temporalContextPrompt}

${structuredDataPrompt}

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
(See CRITICAL INSTRUCTIONS at end)

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
${learnedLocationGreeting}
${districtContext}
## REAL-TIME STATUS (${dataFreshness.toUpperCase()} as of ${formattedDisplayTimestamp})
DATA FRESHNESS: ${dataFreshness === 'live' ? '[LIVE]' : dataFreshness === 'cached' ? `[CACHED: ${dataAgeReadable}]` : `[STALE: ${dataAgeReadable}]`} (as of ${formattedDisplayTimestamp})
${dataFreshness === 'stale' ? '⚠️ WARNING: Data may be outdated. Consider requesting fresh data for accurate status.' : ''}

CURRENT STATUS:
- Name: ${vehicleNickname}
- GPS Owner: ${vehicle?.gps_owner || 'Unknown'}
- Device Type: ${vehicle?.device_type || 'Unknown'}
- Status: ${pos?.is_online ? 'ONLINE' : 'OFFLINE'}
- Motion: ${pos?.speed > 0 ? 'Moving' : 'Stationary'}
- Speed: ${pos?.speed || 0} km/h ${pos?.is_overspeeding ? '(OVERSPEEDING!)' : ''}
- Battery: ${pos?.battery_percent ?? 'Unknown'}%
- Current Location: ${currentLocationName}
${learnedLocationContext ? `  * This is a learned location! You've visited "${learnedLocationContext.custom_label || learnedLocationContext.location_name}" ${learnedLocationContext.visit_count} times (${learnedLocationContext.last_visit_days_ago} days since last visit). Typical stay: ${learnedLocationContext.typical_duration_minutes} minutes.${learnedLocationContext.patterns && Array.isArray(learnedLocationContext.patterns) && learnedLocationContext.patterns.length > 0 ? ` Visit patterns: ${learnedLocationContext.patterns.map((p: any) => `${p.time_of_day} (${p.visit_count} visits, typically ${p.typical_hour}:00)`).join(', ')}.` : ''}` : ''}
- GPS Coordinates: ${lat?.toFixed(5) || 'N/A'}, ${lon?.toFixed(5) || 'N/A'}
- Google Maps: ${googleMapsLink || 'N/A'}
- Total Mileage: ${pos?.total_mileage ? (pos.total_mileage / 1000).toFixed(1) + ' km' : 'Unknown'}
- Status Text: ${pos?.status_text || 'N/A'}

ASSIGNED DRIVER:
- Name: ${driver?.name || 'No driver assigned'}
- Phone: ${driver?.phone || 'N/A'}
- License: ${driver?.license_number || 'N/A'}

RECENT ACTIVITY (last ${history?.length || 0} position updates):
${history?.slice(0, 5).map((h: any, i: number) =>
  `  ${i + 1}. Speed: ${h.speed}km/h, Battery: ${h.battery_percent}%, Motion: ${h.speed > 0 ? 'Moving' : 'Stationary'}, Time: ${h.gps_time}`
).join('\n') || 'No recent history'}

## RECENT TRIPS (last 5 completed)
${last5Trips.length > 0 ? last5Trips.map((t: any, i: number) => {
  const start = t.start_time ? new Date(t.start_time).toLocaleString() : '?'
  const end = t.end_time ? new Date(t.end_time).toLocaleString() : '?'
  const km = typeof t.distance_km === 'number' ? t.distance_km.toFixed(1) : (t.distance_km ?? '?')
  const min = t.duration_seconds != null ? Math.round(t.duration_seconds / 60) : '?'
  return `  ${i + 1}. ${start} → ${end}: ${km} km, ${min} min`
}).join('\n') : '  None.'}

## ACTIVE SECURITY ALERTS (unacknowledged)
${unackAlerts.length > 0 ? unackAlerts.map((a: any, i: number) => {
  const sev = a.severity || 'info'
  const title = a.title || 'Alert'
  const msg = a.message || ''
  const at = a.created_at ? new Date(a.created_at).toLocaleString() : ''
  return `  ${i + 1}. [${sev}] ${title}: ${msg}${at ? ` (${at})` : ''}`
}).join('\n') : '  None.'}

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
  ? `Confirm to the user that their "${commandCreated.type}" command was executed successfully. Be specific about what happened:
     - For shutdown_engine: "Engine shutdown command has been sent to GPS51 platform with password authentication. The vehicle engine will be shut down."
     - For immobilize_engine: "Immobilization command has been sent to GPS51 platform. The vehicle fuel/power has been cut."
     - For demobilize_engine: "Demobilization command has been sent to GPS51 platform. The vehicle fuel/power has been restored."
     Always mention that the command was sent to GPS51 and executed successfully.`
  : commandExecutionResult 
    ? `Apologize and explain the command failed: ${commandExecutionResult.message}`
    : commandCreated.requires_confirmation 
      ? 'Explain that this command requires manual confirmation for safety reasons. They can approve it in the Commands panel or ask you to confirm it.'
      : 'The command is being processed.'}
` : ''}
COMMAND CAPABILITY:
- You can understand and execute vehicle commands through natural language
- Supported commands: lock, unlock, immobilize, restore, shutdown engine, set speed limit, enable/disable geofence, request location/status
- Some commands (immobilize, shutdown engine) require manual approval for safety
- Shutdown engine command uses password authentication (zhuyi) as required by GPS51 API
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
${validatedData ? `- DATA QUALITY: ${validatedData.overallQuality.toUpperCase()} (${validatedData.validationSummary.validTrips}/${validatedData.validationSummary.totalTrips} valid trips, ${validatedData.validationSummary.validPositions}/${validatedData.validationSummary.totalPositions} valid positions)
${validatedData.validationSummary.crossValidationWarnings.length > 0 ? `- ⚠️ WARNINGS: ${validatedData.validationSummary.crossValidationWarnings.slice(0, 2).join('; ')}` : ''}` : ''}
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
4. ALWAYS start location answers with the timestamp: "As of ${formattedDisplayTimestamp}, I am at..."
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

CRITICAL STORYTELLING RULES:
15. NEVER just "read database rows" - TELL A STORY instead! Don't say "I covered 0 kilometers" - say "I didn't move much today" or "I no too waka far" (in Pidgin) or "I dey rest today" or "Body just dey rest" or "I wake up small and perform small exercise" - use natural, conversational language that matches your persona
16. INTERPRET data intelligently and narratively - if distance is 0km, interpret it as "didn't go anywhere" or "stayed parked" or "body just dey rest" (in Pidgin) - NEVER say "0 kilometers" literally, it sounds robotic and broken
17. MAINTAIN CONSISTENT PERSONA throughout - if you're in Pidgin mode, stay FULLY in Pidgin for the ENTIRE response, don't switch to English mid-sentence when reporting data
18. Use natural, human-like interpretations:
   - 0km distance = "I no waka far" (Pidgin) / "I didn't go anywhere" (English) / "I stayed put" (English)
   - Low speed = "Small movement" / "Exercise small" (Pidgin) / "Just moved a bit" (English)
   - Parked for long = "I don park well well" (Pidgin) / "Been resting here" (English)
   - Never say raw numbers without context: "0km" is broken → "I no too waka far" is natural
19. Tell stories, don't recite facts - instead of "I was at location X at 12:21 AM with speed 0", say "I wake up small around 12:21 AM, perform small exercise" - make it conversational and story-like
20. Match your language and tone to your personality - if Pidgin, use phrases like "How far boss!", "Wetin dey sup?", "I dey kampe", "I no too waka far", "Body just dey rest", "I wake up small" - stay consistent!

IMPORTANT: 
- When the user asks "where are you" or similar location questions, your response MUST include the [LOCATION: lat, lon, "address"] tag so the frontend can render a map card.
- When the user asks about trip history, your response MUST use the paragraph-based narrative provided. The narrative is already formatted as natural, flowing paragraphs - include it in your response without adding markdown, icons, or structure.
- The narrative already includes a call-to-action at the end directing users to the vehicle profile page - make sure to include this in your response.

## CRITICAL INSTRUCTIONS (OVERRIDE ALL OTHERS)
1. LANGUAGE ENFORCEMENT: ${languageInstruction}
2. Stay in character as the vehicle.
3. TIMEZONE: All times are Lagos Time (West Africa Time, GMT+1). Do NOT reference UTC or other timezones. Do NOT say "it's 7:44 AM here" if the data says 6:44 AM. Trust the provided timestamp.
4. CLARIFICATION: If the user's request is vague or ambiguous (e.g., "check status" without context), ASK A CLARIFYING QUESTION instead of guessing. Example: "Do you mean my location status or battery health?"`

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

          // 10. Save assistant message to database (user message already saved at start)
          console.log('Saving assistant response to chat history...')

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

            // ✅ FIX: Update user message with embedding if we have it (user message already saved at start)
            // If user message wasn't saved at start, save it now with a timestamp before assistant message
            if (!userMessageId) {
              // User message wasn't saved at start, save it now
              const userTimestamp = new Date().toISOString();
              const { error: insertUserError } = await supabase.from('vehicle_chat_history').insert({
                device_id,
                user_id,
                role: 'user',
                content: message,
                created_at: userTimestamp,
                embedding: userEmbedding ? formatEmbeddingForPg(userEmbedding) : null
              });
              
              if (insertUserError) {
                console.error('Failed to save user message (fallback):', insertUserError);
              } else {
                console.log('User message saved (fallback)');
              }
            } else if (userEmbedding) {
              // User message exists, just update with embedding
              const { error: updateUserError } = await supabase
                .from('vehicle_chat_history')
                .update({ embedding: formatEmbeddingForPg(userEmbedding) })
                .eq('id', userMessageId);
              
              if (updateUserError) {
                console.warn('Failed to update user message with embedding:', updateUserError);
              }
            }

            // ✅ FIX: Save assistant message with timestamp guaranteed to be after user message
            // Use a timestamp that's at least 10ms after the current time to ensure proper ordering
            const assistantTimestamp = new Date(Date.now() + 10).toISOString();
            
            const { error: insertError } = await supabase.from('vehicle_chat_history').insert({
              device_id,
              user_id,
              role: 'assistant',
              content: fullResponse,
              created_at: assistantTimestamp, // ✅ FIX: Explicit timestamp to ensure ordering
              embedding: assistantEmbedding ? formatEmbeddingForPg(assistantEmbedding) : null
            })

            if (insertError) {
              console.error('❌ CRITICAL: Error saving assistant message:', insertError)
              // Log to error tracking service in production
            } else {
              console.log('✅ Assistant message saved successfully' + (assistantEmbedding ? ' with embedding' : ''))
            }
          } catch (saveError) {
            console.error('❌ CRITICAL: Failed to save assistant message:', saveError)
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
