/**
 * Preference Learning Engine for Vehicle Chat
 * 
 * Extracts user preferences from conversations and applies them contextually.
 * Uses pattern matching and confidence scoring to learn and adapt.
 */

import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2'

// Preference categories and extraction patterns
export type PreferenceCategory = 
  | 'communication_style'    // How they like to be talked to
  | 'notification_timing'    // When they want alerts
  | 'units'                  // Metric vs imperial
  | 'detail_level'           // Verbose vs concise
  | 'proactive_updates'      // Whether they want unsolicited info
  | 'topics_of_interest'     // What they ask about most
  | 'time_preference'        // Morning person, night owl
  | 'language_style'         // Formal vs casual
  | 'language_preference'    // Explicit language choice (English, Pidgin, etc.)
  | 'vehicle_nickname'       // What they call their car
  | 'alert_severity'         // What alerts they care about

interface ExtractedPreference {
  key: string
  value: any
  confidence: number
  source: 'explicit' | 'inferred'
  reasoning: string
}

interface PreferenceRecord {
  user_id: string
  preference_key: string
  preference_value: any
  confidence_score: number
  source: string
}

// Pattern definitions for preference extraction
const PREFERENCE_PATTERNS: Record<string, {
  patterns: RegExp[]
  extract: (match: RegExpMatchArray, message: string) => { value: any; confidence: number } | null
}> = {
  // Detail level preferences
  'detail_level': {
    patterns: [
      /\b(just|only|simply)\s+(tell|give|show)\s+(me)?\b/i,
      /\b(short|brief|quick)\s+(answer|version|summary)\b/i,
      /\b(more|extra|full)\s+(detail|info|information)\b/i,
      /\b(keep\s+it\s+simple|tldr|tl;dr)\b/i,
      /\b(elaborate|explain\s+more|go\s+into\s+detail)\b/i,
    ],
    extract: (match, message) => {
      const lower = message.toLowerCase()
      if (lower.match(/just|only|simply|short|brief|quick|keep\s+it\s+simple|tldr/)) {
        return { value: 'concise', confidence: 0.7 }
      }
      if (lower.match(/more\s+detail|extra|full|elaborate|explain\s+more/)) {
        return { value: 'detailed', confidence: 0.7 }
      }
      return null
    }
  },

  // Units preference
  'units': {
    patterns: [
      /\b(in\s+)?(miles?|mph|mi)\b/i,
      /\b(in\s+)?(kilometers?|km\/h|kmh|kph)\b/i,
      /\b(fahrenheit|celsius|°[FC])\b/i,
    ],
    extract: (match, message) => {
      const lower = message.toLowerCase()
      if (lower.match(/miles?|mph|fahrenheit|°f/)) {
        return { value: 'imperial', confidence: 0.8 }
      }
      if (lower.match(/kilometers?|km|celsius|°c/)) {
        return { value: 'metric', confidence: 0.8 }
      }
      return null
    }
  },

  // Notification timing preferences
  'notification_timing': {
    patterns: [
      /\b(don'?t|no)\s+(bother|disturb|notify|alert)\s+(me\s+)?(at\s+night|after\s+\d|before\s+\d)/i,
      /\b(only\s+)?(notify|alert|tell)\s+(me\s+)?(during|between|from)\s+(\d+)/i,
      /\b(quiet\s+hours?|do\s+not\s+disturb|dnd)\b/i,
      /\b(always|immediately|right\s+away|asap)\s+(notify|alert|tell)\b/i,
    ],
    extract: (match, message) => {
      const lower = message.toLowerCase()
      if (lower.match(/don'?t|no.*?(night|after\s+\d|before\s+\d)/)) {
        return { value: { quiet_hours: true, inferred: true }, confidence: 0.6 }
      }
      if (lower.match(/always|immediately|right\s+away|asap/)) {
        return { value: { immediate: true }, confidence: 0.7 }
      }
      return null
    }
  },

  // Proactive updates preference
  'proactive_updates': {
    patterns: [
      /\b(don'?t|stop)\s+(need|want).*?(updates?|notifications?|messages?)\b/i,
      /\b(keep\s+me\s+)(posted|updated|informed)\b/i,
      /\b(let\s+me\s+know)\b/i,
      /\b(i'?ll\s+ask\s+(when|if))\b/i,
    ],
    extract: (match, message) => {
      const lower = message.toLowerCase()
      if (lower.match(/don'?t|stop.*?(update|notif|message)|i'?ll\s+ask/)) {
        return { value: false, confidence: 0.75 }
      }
      if (lower.match(/keep\s+me|let\s+me\s+know|posted|updated|informed/)) {
        return { value: true, confidence: 0.7 }
      }
      return null
    }
  },

  // Alert severity preference
  'alert_severity': {
    patterns: [
      /\b(only|just)\s+(critical|important|urgent|emergency)\s+(alerts?|notifications?)\b/i,
      /\b(all|every|any)\s+(alerts?|notifications?)\b/i,
      /\b(minor|low\s+priority)\s+(alerts?|notifications?)\b/i,
    ],
    extract: (match, message) => {
      const lower = message.toLowerCase()
      if (lower.match(/only|just.*?(critical|important|urgent|emergency)/)) {
        return { value: 'critical_only', confidence: 0.8 }
      }
      if (lower.match(/all|every|any.*?(alert|notif)/)) {
        return { value: 'all', confidence: 0.7 }
      }
      return null
    }
  },

  // Explicit Language Preference
  'language_preference': {
    patterns: [
      /\b(speak|use|switch\s+to|talk\s+in)\s+(english|pidgin|yoruba|hausa|igbo|french|francais)\b/i,
      /\b(can\s+you\s+speak|do\s+you\s+speak)\s+(english|pidgin|yoruba|hausa|igbo|french|francais)\b/i,
      /\b(no\s+wahala|wetin\s+dey|how\s+far)\b/i, // Pidgin indicators
      /\b(ba\s+wo|kedu|sannu)\b/i, // Native greeting indicators
      /\b(parlez[\s\-]?vous|je\s+parle)\s+fran[cç]ais\b/i, // French indicators
    ],
    extract: (match, message) => {
      const lower = message.toLowerCase()
      
      // Explicit requests
      if (lower.match(/english/)) return { value: 'english', confidence: 0.95 }
      if (lower.match(/pidgin/)) return { value: 'pidgin', confidence: 0.95 }
      if (lower.match(/yoruba/)) return { value: 'yoruba', confidence: 0.95 }
      if (lower.match(/hausa/)) return { value: 'hausa', confidence: 0.95 }
      if (lower.match(/igbo/)) return { value: 'igbo', confidence: 0.95 }
      if (lower.match(/french|fran[cç]ais/)) return { value: 'french', confidence: 0.95 }
      
      // Implicit indicators (lower confidence)
      if (lower.match(/no\s+wahala|wetin\s+dey|how\s+far/)) return { value: 'pidgin', confidence: 0.6 }
      if (lower.match(/ba\s+wo/)) return { value: 'yoruba', confidence: 0.6 }
      if (lower.match(/kedu/)) return { value: 'igbo', confidence: 0.6 }
      if (lower.match(/sannu/)) return { value: 'hausa', confidence: 0.6 }
      if (lower.match(/parlez[\s\-]?vous|je\s+parle/)) return { value: 'french', confidence: 0.7 }
      
      return null
    }
  },

  // Language style (formal vs casual)
  'language_style': {
    patterns: [
      /\b(please|kindly|could\s+you)\b.*\b(sir|ma'?am|mr|mrs|ms)\b/i,
      /\b(yo|hey|sup|wassup|what'?s\s+good)\b/i,
      /\b(be\s+more|less)\s+(formal|casual|professional)\b/i,
    ],
    extract: (match, message) => {
      const lower = message.toLowerCase()
      if (lower.match(/sir|ma'?am|mr|mrs|ms|kindly|be\s+more\s+formal|professional/)) {
        return { value: 'formal', confidence: 0.6 }
      }
      if (lower.match(/yo|hey|sup|wassup|what'?s\s+good|be\s+more\s+casual|less\s+formal/)) {
        return { value: 'casual', confidence: 0.6 }
      }
      return null
    }
  },

  // Vehicle nickname preference
  'vehicle_nickname': {
    patterns: [
      /\b(call\s+(you|yourself)|your\s+name\s+is|rename\s+(you|yourself)\s+to)\s+["']?(\w+)["']?\b/i,
      /\b(hey|hi|hello)\s+(\w+)[,!]?\s+(how|where|what)/i,
    ],
    extract: (match, message) => {
      const callMatch = message.match(/call\s+(?:you|yourself)\s+["']?(\w+)["']?/i)
      if (callMatch && callMatch[1]) {
        return { value: callMatch[1], confidence: 0.9 }
      }
      const renameMatch = message.match(/rename\s+(?:you|yourself)\s+to\s+["']?(\w+)["']?/i)
      if (renameMatch && renameMatch[1]) {
        return { value: renameMatch[1], confidence: 0.9 }
      }
      return null
    }
  },

  // Time of day preference
  'time_preference': {
    patterns: [
      /\b(morning|evening|night)\s+(person|routine|check)\b/i,
      /\b(before\s+work|after\s+work|lunch\s+time)\b/i,
      /\b(daily\s+brief|morning\s+update|evening\s+summary)\b/i,
    ],
    extract: (match, message) => {
      const lower = message.toLowerCase()
      if (lower.match(/morning|before\s+work|daily\s+brief|morning\s+update/)) {
        return { value: 'morning', confidence: 0.6 }
      }
      if (lower.match(/evening|after\s+work|evening\s+summary/)) {
        return { value: 'evening', confidence: 0.6 }
      }
      return null
    }
  }
}

/**
 * Extract preferences from a single message
 */
export function extractPreferencesFromMessage(message: string): ExtractedPreference[] {
  const preferences: ExtractedPreference[] = []
  
  for (const [key, config] of Object.entries(PREFERENCE_PATTERNS)) {
    for (const pattern of config.patterns) {
      const match = message.match(pattern)
      if (match) {
        const extracted = config.extract(match, message)
        if (extracted) {
          preferences.push({
            key,
            value: extracted.value,
            confidence: extracted.confidence,
            source: extracted.confidence >= 0.8 ? 'explicit' : 'inferred',
            reasoning: `Matched pattern in: "${match[0]}"`
          })
          break // Only one extraction per category per message
        }
      }
    }
  }
  
  return preferences
}

/**
 * Analyze conversation history to infer preferences from patterns
 */
export function inferPreferencesFromHistory(messages: { role: string; content: string }[]): ExtractedPreference[] {
  const preferences: ExtractedPreference[] = []
  const topicCounts: Record<string, number> = {}
  const timeOfDayCounts: Record<string, number> = {}
  
  // Track question topics
  const topicPatterns: Record<string, RegExp[]> = {
    'location': [/where|location|position|parked/i],
    'battery': [/battery|charge|power/i],
    'speed': [/speed|fast|slow|mph|kmh/i],
    'trips': [/trip|journey|drove|traveled|mileage/i],
    'health': [/health|status|condition|working/i],
    'driver': [/driver|who'?s\s+driving/i],
  }
  
  for (const msg of messages) {
    if (msg.role === 'user') {
      // Count topic mentions
      for (const [topic, patterns] of Object.entries(topicPatterns)) {
        if (patterns.some(p => p.test(msg.content))) {
          topicCounts[topic] = (topicCounts[topic] || 0) + 1
        }
      }
    }
  }
  
  // Identify top topics of interest
  const sortedTopics = Object.entries(topicCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
  
  if (sortedTopics.length > 0 && sortedTopics[0][1] >= 3) {
    preferences.push({
      key: 'topics_of_interest',
      value: sortedTopics.map(([topic]) => topic),
      confidence: Math.min(0.9, 0.5 + (sortedTopics[0][1] * 0.1)),
      source: 'inferred',
      reasoning: `User asked about ${sortedTopics[0][0]} ${sortedTopics[0][1]} times`
    })
  }
  
  // Check message length preferences
  const userMessages = messages.filter(m => m.role === 'user')
  const avgLength = userMessages.reduce((sum, m) => sum + m.content.length, 0) / (userMessages.length || 1)
  
  if (avgLength < 50 && userMessages.length >= 5) {
    preferences.push({
      key: 'communication_style',
      value: 'terse',
      confidence: 0.5,
      source: 'inferred',
      reasoning: `User sends short messages (avg ${Math.round(avgLength)} chars)`
    })
  } else if (avgLength > 150 && userMessages.length >= 5) {
    preferences.push({
      key: 'communication_style',
      value: 'verbose',
      confidence: 0.5,
      source: 'inferred',
      reasoning: `User sends detailed messages (avg ${Math.round(avgLength)} chars)`
    })
  }
  
  return preferences
}

/**
 * Save learned preferences to database with confidence merging
 */
export async function savePreferences(
  supabase: SupabaseClient,
  userId: string,
  preferences: ExtractedPreference[]
): Promise<{ saved: number; updated: number }> {
  let saved = 0
  let updated = 0
  
  for (const pref of preferences) {
    // Get existing preference
    const { data: existing } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .eq('preference_key', pref.key)
      .maybeSingle()
    
    if (existing) {
      // Only update if new confidence is higher OR explicit > inferred
      const shouldUpdate = 
        pref.confidence > existing.confidence_score ||
        (pref.source === 'explicit' && existing.source === 'inferred')
      
      if (shouldUpdate) {
        const { error } = await supabase
          .from('user_preferences')
          .update({
            preference_value: pref.value,
            confidence_score: pref.confidence,
            source: pref.source,
            last_updated: new Date().toISOString()
          })
          .eq('id', existing.id)
        
        if (!error) updated++
      }
    } else {
      // Insert new preference
      const { error } = await supabase
        .from('user_preferences')
        .insert({
          user_id: userId,
          preference_key: pref.key,
          preference_value: pref.value,
          confidence_score: pref.confidence,
          source: pref.source
        })
      
      if (!error) saved++
    }
  }
  
  return { saved, updated }
}

/**
 * Get user preferences with confidence threshold
 */
export async function getUserPreferences(
  supabase: SupabaseClient,
  userId: string,
  minConfidence: number = 0.5
): Promise<Record<string, any>> {
  const { data: preferences, error } = await supabase
    .from('user_preferences')
    .select('preference_key, preference_value, confidence_score, source')
    .eq('user_id', userId)
    .gte('confidence_score', minConfidence)
    .order('confidence_score', { ascending: false })
  
  if (error || !preferences) {
    console.error('Error fetching preferences:', error)
    return {}
  }
  
  // Convert to key-value map
  const prefMap: Record<string, any> = {}
  for (const pref of preferences) {
    prefMap[pref.preference_key] = {
      value: pref.preference_value,
      confidence: pref.confidence_score,
      source: pref.source
    }
  }
  
  return prefMap
}

/**
 * Build context injection string from preferences
 */
export function buildPreferenceContext(preferences: Record<string, any>): string {
  if (Object.keys(preferences).length === 0) {
    return ''
  }
  
  const lines: string[] = ['USER PREFERENCES (learned from conversation):']
  
  if (preferences.detail_level) {
    lines.push(`- Response style: ${preferences.detail_level.value === 'concise' ? 'Keep responses SHORT and to the point' : 'Provide detailed, comprehensive answers'}`)
  }
  
  if (preferences.units) {
    lines.push(`- Preferred units: ${preferences.units.value === 'imperial' ? 'Use miles, mph, Fahrenheit' : 'Use kilometers, km/h, Celsius'}`)
  }
  
  if (preferences.proactive_updates) {
    lines.push(`- Proactive updates: ${preferences.proactive_updates.value ? 'User wants to be kept informed proactively' : 'Only respond when asked - no unsolicited information'}`)
  }
  
  if (preferences.alert_severity) {
    lines.push(`- Alert preference: ${preferences.alert_severity.value === 'critical_only' ? 'Only mention CRITICAL alerts' : 'Mention all alerts including minor ones'}`)
  }
  
  if (preferences.language_style) {
    lines.push(`- Communication style: ${preferences.language_style.value === 'formal' ? 'Be more formal and professional' : 'Keep it casual and friendly'}`)
  }
  
  if (preferences.topics_of_interest?.value) {
    const topics = Array.isArray(preferences.topics_of_interest.value) 
      ? preferences.topics_of_interest.value.join(', ')
      : preferences.topics_of_interest.value
    lines.push(`- Topics they care about most: ${topics}`)
  }
  
  if (preferences.time_preference) {
    lines.push(`- Preferred check-in time: ${preferences.time_preference.value}`)
  }
  
  if (preferences.notification_timing?.value?.quiet_hours) {
    lines.push(`- Quiet hours: User prefers not to be disturbed at night`)
  }
  
  if (preferences.vehicle_nickname) {
    lines.push(`- They call you: "${preferences.vehicle_nickname.value}"`)
  }
  
  lines.push('⚠️ ADAPT your responses based on these preferences!')
  
  return lines.join('\n')
}

/**
 * Main function: Learn from message and return preferences for context
 */
export async function learnAndGetPreferences(
  supabase: SupabaseClient,
  userId: string,
  message: string,
  conversationHistory?: { role: string; content: string }[]
): Promise<{
  preferences: Record<string, any>
  contextString: string
  newPreferencesFound: number
}> {
  // Extract preferences from current message
  const messagePrefs = extractPreferencesFromMessage(message)
  
  // Optionally infer from conversation history
  let historyPrefs: ExtractedPreference[] = []
  if (conversationHistory && conversationHistory.length >= 5) {
    historyPrefs = inferPreferencesFromHistory(conversationHistory)
  }
  
  // Combine and save (explicit overrides inferred)
  const allPrefs = [...messagePrefs, ...historyPrefs]
  const saveResult = await savePreferences(supabase, userId, allPrefs)
  
  console.log(`Preference learning: extracted ${messagePrefs.length} from message, ${historyPrefs.length} from history, saved ${saveResult.saved}, updated ${saveResult.updated}`)
  
  // Get all preferences for context
  const preferences = await getUserPreferences(supabase, userId, 0.4)
  const contextString = buildPreferenceContext(preferences)
  
  return {
    preferences,
    contextString,
    newPreferencesFound: messagePrefs.length + historyPrefs.length
  }
}
