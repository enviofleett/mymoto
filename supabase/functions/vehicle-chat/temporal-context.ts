/**
 * Temporal Context Management
 * 
 * Links temporal references across conversations to improve context understanding
 * Resolves ambiguous date references like "that day", "yesterday", "last week"
 */

import { DateContext } from './date-extractor.ts'

export interface TemporalLink {
  query: string
  date: string // Original date reference (e.g., "yesterday", "last week")
  resolvedDate: string // ISO date string
  context: string // Additional context
  timestamp: string // When this was resolved
}

export interface TemporalContext {
  resolvedDates: Map<string, string> // "yesterday" -> "2026-01-15"
  dateAliases: Map<string, string> // "that day" -> "2026-01-15"
  conversationTimeline: Array<{
    date: string
    events: string[]
  }>
  recentQueries: TemporalLink[]
}

/**
 * Extract temporal references from conversation history
 */
export async function extractTemporalReferences(
  supabase: any,
  deviceId: string,
  userId: string,
  currentDateContext: DateContext
): Promise<TemporalContext> {
  const resolvedDates = new Map<string, string>()
  const dateAliases = new Map<string, string>()
  const conversationTimeline: Array<{ date: string; events: string[] }> = []
  const recentQueries: TemporalLink[] = []

  // Fetch recent conversation history (last 30 days)
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

  // Process messages to extract temporal references
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

  // Group messages by date
  const messagesByDate = new Map<string, Array<{ role: string; content: string; created_at: string }>>()
  
  for (const msg of recentMessages) {
    const msgDate = new Date(msg.created_at)
    const dateKey = msgDate.toISOString().split('T')[0]
    
    if (!messagesByDate.has(dateKey)) {
      messagesByDate.set(dateKey, [])
    }
    messagesByDate.get(dateKey)!.push(msg)
  }

  // Build conversation timeline
  for (const [date, messages] of messagesByDate.entries()) {
    const events: string[] = []
    
    for (const msg of messages) {
      if (msg.role === 'user') {
        // Check for temporal references
        for (const pattern of temporalPatterns) {
          const match = msg.content.match(pattern)
          if (match) {
            const reference = match[0].toLowerCase()
            const msgTimestamp = new Date(msg.created_at)
            
            // Resolve the date based on when the message was sent
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
              
              // Store as temporal link
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

  // Link current query to previous queries
  if (currentDateContext.hasDateReference) {
    const currentDate = currentDateContext.humanReadable.toLowerCase()
    
    // Check if we've seen this reference before
    if (resolvedDates.has(currentDate)) {
      dateAliases.set('that day', resolvedDates.get(currentDate)!)
    }
    
    // Store current query
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
    conversationTimeline: conversationTimeline.slice(0, 10), // Last 10 days
    recentQueries: recentQueries.slice(0, 10) // Last 10 queries
  }
}

/**
 * Resolve ambiguous date reference using temporal context
 */
export function resolveDateReference(
  reference: string,
  temporalContext: TemporalContext,
  fallbackDate?: string
): string | null {
  const lowerRef = reference.toLowerCase()
  
  // Check resolved dates
  if (temporalContext.resolvedDates.has(lowerRef)) {
    return temporalContext.resolvedDates.get(lowerRef)!
  }
  
  // Check date aliases
  if (temporalContext.dateAliases.has(lowerRef)) {
    return temporalContext.dateAliases.get(lowerRef)!
  }
  
  // Check recent queries for similar references
  for (const query of temporalContext.recentQueries) {
    if (query.date.toLowerCase() === lowerRef) {
      return query.resolvedDate
    }
  }
  
  // Use fallback if provided
  return fallbackDate || null
}

/**
 * Format temporal context for LLM prompt
 */
export function formatTemporalContextForPrompt(temporalContext: TemporalContext): string {
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


