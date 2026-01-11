/**
 * Date Context Extraction for Vehicle Chat
 * 
 * Parses natural language date references from user queries to enable
 * accurate historical data fetching. Essential for questions like
 * "Did you move yesterday?" or "How far did you travel last week?"
 */

export interface DateContext {
  hasDateReference: boolean
  period: 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'custom' | 'none'
  startDate: string  // ISO string
  endDate: string    // ISO string
  humanReadable: string  // e.g., "yesterday", "last 3 days"
}

/**
 * Extracts date context from a user message
 * 
 * @param message - The user's query
 * @param clientTimestamp - Optional client timestamp for accurate "today" calculation
 * @returns DateContext with parsed date range
 */
export function extractDateContext(message: string, clientTimestamp?: string): DateContext {
  const now = clientTimestamp ? new Date(clientTimestamp) : new Date()
  const lowerMessage = message.toLowerCase()
  
  // Helper to get start/end of a day
  const startOfDay = (date: Date): Date => {
    const d = new Date(date)
    d.setHours(0, 0, 0, 0)
    return d
  }
  
  const endOfDay = (date: Date): Date => {
    const d = new Date(date)
    d.setHours(23, 59, 59, 999)
    return d
  }
  
  const subDays = (date: Date, days: number): Date => {
    const d = new Date(date)
    d.setDate(d.getDate() - days)
    return d
  }
  
  const subWeeks = (date: Date, weeks: number): Date => {
    return subDays(date, weeks * 7)
  }
  
  const subMonths = (date: Date, months: number): Date => {
    const d = new Date(date)
    d.setMonth(d.getMonth() - months)
    return d
  }
  
  // Pattern matching for various date expressions
  
  // Yesterday patterns
  if (/\b(yesterday|yesternight|last\s+night)\b/i.test(lowerMessage)) {
    const yesterday = subDays(now, 1)
    return {
      hasDateReference: true,
      period: 'yesterday',
      startDate: startOfDay(yesterday).toISOString(),
      endDate: endOfDay(yesterday).toISOString(),
      humanReadable: 'yesterday'
    }
  }
  
  // Today patterns
  if (/\b(today|this\s+morning|this\s+afternoon|this\s+evening|tonight)\b/i.test(lowerMessage)) {
    return {
      hasDateReference: true,
      period: 'today',
      startDate: startOfDay(now).toISOString(),
      endDate: endOfDay(now).toISOString(),
      humanReadable: 'today'
    }
  }
  
  // "X days ago" pattern
  const daysAgoMatch = lowerMessage.match(/\b(\d+)\s*days?\s*ago\b/i)
  if (daysAgoMatch) {
    const daysAgo = parseInt(daysAgoMatch[1], 10)
    const targetDate = subDays(now, daysAgo)
    return {
      hasDateReference: true,
      period: 'custom',
      startDate: startOfDay(targetDate).toISOString(),
      endDate: endOfDay(targetDate).toISOString(),
      humanReadable: `${daysAgo} day${daysAgo > 1 ? 's' : ''} ago`
    }
  }
  
  // "X hours ago" pattern - same day range
  const hoursAgoMatch = lowerMessage.match(/\b(\d+)\s*hours?\s*ago\b/i)
  if (hoursAgoMatch) {
    const hoursAgo = parseInt(hoursAgoMatch[1], 10)
    const targetTime = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000)
    return {
      hasDateReference: true,
      period: 'custom',
      startDate: targetTime.toISOString(),
      endDate: now.toISOString(),
      humanReadable: `last ${hoursAgo} hour${hoursAgo > 1 ? 's' : ''}`
    }
  }
  
  // "Last X days" pattern
  const lastDaysMatch = lowerMessage.match(/\b(last|past)\s+(\d+)\s*days?\b/i)
  if (lastDaysMatch) {
    const days = parseInt(lastDaysMatch[2], 10)
    return {
      hasDateReference: true,
      period: 'custom',
      startDate: startOfDay(subDays(now, days)).toISOString(),
      endDate: endOfDay(now).toISOString(),
      humanReadable: `last ${days} days`
    }
  }
  
  // This week
  if (/\b(this\s+week)\b/i.test(lowerMessage)) {
    const dayOfWeek = now.getDay()
    const startOfWeek = subDays(now, dayOfWeek)
    return {
      hasDateReference: true,
      period: 'this_week',
      startDate: startOfDay(startOfWeek).toISOString(),
      endDate: endOfDay(now).toISOString(),
      humanReadable: 'this week'
    }
  }
  
  // Last week
  if (/\b(last\s+week)\b/i.test(lowerMessage)) {
    const dayOfWeek = now.getDay()
    const startOfLastWeek = subDays(now, dayOfWeek + 7)
    const endOfLastWeek = subDays(now, dayOfWeek + 1)
    return {
      hasDateReference: true,
      period: 'last_week',
      startDate: startOfDay(startOfLastWeek).toISOString(),
      endDate: endOfDay(endOfLastWeek).toISOString(),
      humanReadable: 'last week'
    }
  }
  
  // This month
  if (/\b(this\s+month)\b/i.test(lowerMessage)) {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    return {
      hasDateReference: true,
      period: 'this_month',
      startDate: startOfDay(startOfMonth).toISOString(),
      endDate: endOfDay(now).toISOString(),
      humanReadable: 'this month'
    }
  }
  
  // Last month
  if (/\b(last\s+month)\b/i.test(lowerMessage)) {
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0)
    return {
      hasDateReference: true,
      period: 'last_month',
      startDate: startOfDay(startOfLastMonth).toISOString(),
      endDate: endOfDay(endOfLastMonth).toISOString(),
      humanReadable: 'last month'
    }
  }
  
  // Day name patterns (e.g., "on Monday", "last Tuesday")
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const dayNameMatch = lowerMessage.match(/\b(on|last|this)?\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i)
  if (dayNameMatch) {
    const targetDayName = dayNameMatch[2].toLowerCase()
    const targetDayIndex = dayNames.indexOf(targetDayName)
    const currentDayIndex = now.getDay()
    
    let daysBack = currentDayIndex - targetDayIndex
    if (daysBack <= 0) daysBack += 7
    if (dayNameMatch[1]?.toLowerCase() === 'last') daysBack += 7
    
    const targetDate = subDays(now, daysBack)
    return {
      hasDateReference: true,
      period: 'custom',
      startDate: startOfDay(targetDate).toISOString(),
      endDate: endOfDay(targetDate).toISOString(),
      humanReadable: `${dayNameMatch[1] || 'on'} ${dayNameMatch[2]}`
    }
  }
  
  // Movement/trip historical questions without explicit date (default to recent history)
  // "Did you move", "Have you traveled", "Where did you go"
  if (/\b(did|have|had)\s+(you|i|we|the\s+car|the\s+vehicle)\s+(move|travel|go|drive|leave)\b/i.test(lowerMessage)) {
    // Default to last 24 hours for movement questions without date
    return {
      hasDateReference: true,
      period: 'yesterday', // Treat as yesterday if no specific date
      startDate: subDays(now, 1).toISOString(),
      endDate: now.toISOString(),
      humanReadable: 'recently (last 24 hours)'
    }
  }
  
  // No date reference found
  return {
    hasDateReference: false,
    period: 'none',
    startDate: now.toISOString(),
    endDate: now.toISOString(),
    humanReadable: 'current'
  }
}

/**
 * Checks if a query is asking about historical movement/trips
 */
export function isHistoricalMovementQuery(message: string): boolean {
  const patterns = [
    /\b(did|have|had)\s+(you|i|we|the\s+car|the\s+vehicle)\s+(move|travel|go|drive|left|gone)\b/i,
    /\bhow\s+(far|much|many\s+km|many\s+kilometers?|many\s+miles?)\s+(did|have)\b/i,
    /\bwhere\s+(did|have)\s+(you|the\s+car|the\s+vehicle)\s+(go|been|travel)\b/i,
    /\b(any|were\s+there)\s+(trips?|journeys?|drives?)\b/i,
    /\bwhat\s+distance\s+(did|have)\b/i,
    /\btravel(led|ed)?\b.*\b(yesterday|last|ago|week|month)\b/i,
    /\b(yesterday|last\s+week|last\s+month)\b.*\b(trip|journey|drive|move|travel)\b/i,
  ]
  
  return patterns.some(p => p.test(message))
}

/**
 * Calculates total distance from position history records
 */
export function calculateDistanceFromHistory(positions: Array<{ latitude: number; longitude: number }>): number {
  if (!positions || positions.length < 2) return 0
  
  let totalDistance = 0
  
  for (let i = 1; i < positions.length; i++) {
    const prev = positions[i - 1]
    const curr = positions[i]
    
    if (prev.latitude && prev.longitude && curr.latitude && curr.longitude) {
      totalDistance += haversineDistance(
        prev.latitude, prev.longitude,
        curr.latitude, curr.longitude
      )
    }
  }
  
  return totalDistance
}

/**
 * Calculate distance between two coordinates using Haversine formula
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
