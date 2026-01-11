/**
 * Intent Classification System for Vehicle Chat
 *
 * Classifies user queries into specific intent categories to enable intelligent routing
 * and context-aware responses. Uses pattern matching with weighted scoring.
 */

export type IntentType =
  | 'location'        // Current position, address, maps
  | 'trip'            // Trip history, routes, journey info
  | 'stats'           // Analytics, mileage, performance metrics
  | 'maintenance'     // Health status, alerts, diagnostics
  | 'control'         // Commands, settings, configurations
  | 'history'         // Historical data, past events
  | 'driver'          // Driver information, assignments
  | 'general'         // General conversation, greetings

export interface Intent {
  type: IntentType
  confidence: number  // 0-1 score
  requires_fresh_data: boolean
  requires_history: boolean
  keywords_matched: string[]
}

interface PatternDefinition {
  patterns: RegExp[]
  weight: number
  requires_fresh_data?: boolean
  requires_history?: boolean
}

// Intent pattern definitions with weighted matching
const INTENT_PATTERNS: Record<IntentType, PatternDefinition> = {
  location: {
    patterns: [
      /\b(where|location|position|address|place|gps|coordinates?)\b/i,
      /\b(current|now|real-?time|live)\s+(location|position|status)/i,
      /\b(find|locate|show|tell).*\b(me|location|position|where)\b/i,
      /\b(parked|stopped|stationed)\b/i,
      /\b(lat(itude)?|lon(gitude)?)\b/i,
      /\b(map|navigate|directions?)\b/i,
    ],
    weight: 10,
    requires_fresh_data: true,
    requires_history: false
  },

  trip: {
    patterns: [
      /\b(trip|journey|route|drive|travel)\b/i,
      /\b(last|recent|previous|latest)\s+(trip|journey|drive)/i,
      /\b(distance|how far|miles?|km|mileage)\s+(traveled|driven|went)/i,
      /\b(when.*?(go|went|drive|left|arrive))\b/i,
      /\b(trip.*?(history|log|record))\b/i,
    ],
    weight: 9,
    requires_fresh_data: false,
    requires_history: true
  },

  stats: {
    patterns: [
      /\b(stats?|statistics|analytics|metrics|performance)\b/i,
      /\b(total|overall|average|avg)\s+(distance|mileage|speed|trips?)/i,
      /\b(daily|weekly|monthly)\s+(mileage|distance|trips?)/i,
      /\b(fuel|consumption|efficiency|usage)\b/i,
      /\b(chart|graph|report|summary)\b/i,
    ],
    weight: 8,
    requires_fresh_data: false,
    requires_history: true
  },

  maintenance: {
    patterns: [
      /\b(health|status|condition|diagnostic|check)\b/i,
      /\b(battery|engine|ignition|oil|tire|brake)\b/i,
      /\b(alert|alarm|warning|error|issue|problem)\b/i,
      /\b(maintenance|service|repair|fix)\b/i,
      /\b(fault|malfunction|broken|damaged)\b/i,
      /\b(predict|forecast).*?(maintenance|service)\b/i,
    ],
    weight: 9,
    requires_fresh_data: true,
    requires_history: true
  },

  control: {
    patterns: [
      /\b(set|enable|disable|turn on|turn off|configure)\b/i,
      /\b(command|control|execute|run)\b/i,
      /\b(speed limit|geofence|alert|notification)\b/i,
      /\b(lock|unlock|start|stop|shutdown)\b/i,
      /\b(setting|preference|configuration|option)\b/i,
    ],
    weight: 10,
    requires_fresh_data: false,
    requires_history: false
  },

  history: {
    patterns: [
      /\b(history|past|previous|earlier|before)\b/i,
      /\b(yesterday|yesternight|last\s+night)\b/i,  // Yesterday patterns
      /\b(last|past)\s+(week|month|year|few\s+days)\b/i,
      /\b(\d+)\s*(days?|hours?|weeks?|months?)\s*ago\b/i,  // "3 days ago", "2 weeks ago"
      /\b(on|this|last)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,  // Day names
      /\b(when.*?(was|did|happened))\b/i,
      /\b(event|record|log|archive)\b/i,
      /\b(did|have|had)\s+(you|i|we|the\s+car)\s+(move|go|drive|travel|leave)\b/i,  // Movement history
      /\bhow\s+(far|much)\s+(did|have)\s+(you|i|we)\s+(travel|drive|go|move)\b/i,  // Distance history
      /\b(any|were\s+there)\s+(trips?|journeys?|drives?)\b/i,  // Trip questions
      /\bwhere\s+(did|have)\s+(you|the\s+car)\s+(go|been|travel)\b/i,  // Location history
    ],
    weight: 9,  // Increased weight for better historical query detection
    requires_fresh_data: false,
    requires_history: true
  },

  driver: {
    patterns: [
      /\b(driver|operator|user|person|who)\b/i,
      /\b(assigned|driving|operating)\b/i,
      /\b(phone|contact|license|name)\b/i,
      /\b(who.*?(driving|assigned|using))\b/i,
    ],
    weight: 8,
    requires_fresh_data: false,
    requires_history: false
  },

  general: {
    patterns: [
      /\b(hello|hi|hey|greetings?|good (morning|afternoon|evening))\b/i,
      /\b(how are you|what'?s up|how'?s it going)\b/i,
      /\b(thank|thanks|appreciate)\b/i,
      /\b(help|assist|support|explain)\b/i,
      /\b(can you|are you able|do you know)\b/i,
    ],
    weight: 5,
    requires_fresh_data: false,
    requires_history: false
  }
}

/**
 * Classifies a user query into an intent category
 *
 * @param query - The user's message
 * @returns Intent classification with confidence score
 */
export function classifyIntent(query: string): Intent {
  const scores: Map<IntentType, {
    score: number,
    keywords: string[],
    requires_fresh_data: boolean,
    requires_history: boolean
  }> = new Map()

  // Initialize all intents with zero score
  for (const intentType of Object.keys(INTENT_PATTERNS) as IntentType[]) {
    scores.set(intentType, {
      score: 0,
      keywords: [],
      requires_fresh_data: INTENT_PATTERNS[intentType].requires_fresh_data || false,
      requires_history: INTENT_PATTERNS[intentType].requires_history || false
    })
  }

  const lowerQuery = query.toLowerCase()

  // Score each intent based on pattern matches
  for (const [intentType, definition] of Object.entries(INTENT_PATTERNS)) {
    const intentData = scores.get(intentType as IntentType)!

    for (const pattern of definition.patterns) {
      const matches = lowerQuery.match(pattern)
      if (matches) {
        intentData.score += definition.weight
        // Filter out undefined matches and short strings
        intentData.keywords.push(...matches.filter(m => m && m.length > 2))
      }
    }
  }

  // Find the intent with the highest score
  let topIntent: IntentType = 'general'
  let topScore = 0
  let topData = scores.get('general')!

  for (const [intentType, data] of scores.entries()) {
    if (data.score > topScore) {
      topScore = data.score
      topIntent = intentType
      topData = data
    }
  }

  // Calculate confidence (normalize score to 0-1 range)
  // Maximum possible score is roughly 50-70 for strong matches
  const confidence = Math.min(topScore / 50, 1.0)

  // If confidence is too low, default to 'general'
  if (confidence < 0.15) {
    topIntent = 'general'
    topData = scores.get('general')!
  }

  return {
    type: topIntent,
    confidence: parseFloat(confidence.toFixed(2)),
    requires_fresh_data: topData.requires_fresh_data,
    requires_history: topData.requires_history,
    keywords_matched: [...new Set(topData.keywords)].slice(0, 5) // Unique, top 5
  }
}

/**
 * Classifies multiple queries and returns aggregate intent
 * Useful for conversation context
 *
 * @param queries - Array of recent user messages
 * @returns Aggregate intent classification
 */
export function classifyConversationIntent(queries: string[]): Intent {
  if (queries.length === 0) {
    return classifyIntent('')
  }

  // Weight recent queries more heavily
  const weights = queries.map((_, i) => 1 + (i * 0.2)) // More recent = higher weight
  const intents = queries.map(q => classifyIntent(q))

  // Aggregate scores by intent type
  const aggregateScores: Map<IntentType, number> = new Map()
  const aggregateData: Map<IntentType, {
    keywords: Set<string>,
    requires_fresh_data: boolean,
    requires_history: boolean
  }> = new Map()

  intents.forEach((intent, index) => {
    const weight = weights[index]
    const currentScore = aggregateScores.get(intent.type) || 0
    aggregateScores.set(intent.type, currentScore + (intent.confidence * weight))

    if (!aggregateData.has(intent.type)) {
      aggregateData.set(intent.type, {
        keywords: new Set(),
        requires_fresh_data: intent.requires_fresh_data,
        requires_history: intent.requires_history
      })
    }
    const data = aggregateData.get(intent.type)!
    intent.keywords_matched.forEach(k => data.keywords.add(k))
  })

  // Find top aggregate intent
  let topIntent: IntentType = 'general'
  let topScore = 0

  for (const [intentType, score] of aggregateScores.entries()) {
    if (score > topScore) {
      topScore = score
      topIntent = intentType
    }
  }

  const topData = aggregateData.get(topIntent)!
  const maxPossibleScore = queries.length * weights.reduce((a, b) => a + b, 0)
  const confidence = Math.min(topScore / maxPossibleScore, 1.0)

  return {
    type: topIntent,
    confidence: parseFloat(confidence.toFixed(2)),
    requires_fresh_data: topData.requires_fresh_data,
    requires_history: topData.requires_history,
    keywords_matched: Array.from(topData.keywords).slice(0, 5)
  }
}

/**
 * Determines if a query requires real-time GPS data
 * More strict check than just checking intent
 *
 * @param query - The user's message
 * @returns True if fresh GPS data should be fetched
 */
export function requiresFreshGpsData(query: string): boolean {
  const intent = classifyIntent(query)

  // High confidence location/maintenance queries need fresh data
  if ((intent.type === 'location' || intent.type === 'maintenance') && intent.confidence > 0.5) {
    return true
  }

  // Explicit real-time keywords override intent
  const realtimeKeywords = [
    /\b(current|now|right now|at this moment)\b/i,
    /\b(real-?time|live|fresh|latest)\b/i,
    /\b(exactly|precise|accurate)\b/i,
  ]

  return realtimeKeywords.some(pattern => pattern.test(query))
}
