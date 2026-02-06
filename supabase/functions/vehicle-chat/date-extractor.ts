/**
 * Date Context Extraction for Vehicle Chat
 * 
 * Parses natural language date references from user queries to enable
 * accurate historical data fetching. Essential for questions like
 * "Did you move yesterday?" or "How far did you travel last week?"
 */

export interface DateContext {
  hasDateReference: boolean
  period: 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'custom' | 'last_trip' | 'none'
  startDate: string  // ISO string (UTC)
  endDate: string    // ISO string (UTC)
  humanReadable: string  // e.g., "yesterday", "last 3 days"
  timezone?: string  // IANA timezone (e.g., "Africa/Lagos", "America/New_York")
  confidence?: number // 0-1, confidence in date extraction
}

/**
 * Converts a date to user's timezone for accurate day calculations
 * 
 * @param date - Date to convert
 * @param timezone - IANA timezone string (e.g., "Africa/Lagos")
 * @returns Date adjusted to timezone
 */
function toTimezone(date: Date, timezone?: string): Date {
  if (!timezone) return date
  
  try {
    // Get date components in user's timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })
    
    const parts = formatter.formatToParts(date)
    const year = parseInt(parts.find(p => p.type === 'year')?.value || '0')
    const month = parseInt(parts.find(p => p.type === 'month')?.value || '0') - 1
    const day = parseInt(parts.find(p => p.type === 'day')?.value || '0')
    const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0')
    const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0')
    const second = parseInt(parts.find(p => p.type === 'second')?.value || '0')
    
    return new Date(Date.UTC(year, month, day, hour, minute, second))
  } catch (error) {
    console.warn(`Invalid timezone ${timezone}, using UTC:`, error)
    return date
  }
}

/**
 * Extracts date context from a user message
 * 
 * @param message - The user's query
 * @param clientTimestamp - Optional client timestamp for accurate "today" calculation
 * @param userTimezone - Optional IANA timezone (e.g., "Africa/Lagos") for accurate day boundaries
 *                       Defaults to Lagos timezone if not provided
 * @returns DateContext with parsed date range
 */
export function extractDateContext(message: string, clientTimestamp?: string, userTimezone?: string): DateContext {
  // Default to Lagos timezone if not provided
  const DEFAULT_TIMEZONE = 'Africa/Lagos'
  const tz = userTimezone || DEFAULT_TIMEZONE
  
  // Use client timestamp if provided, otherwise server time
  const baseNow = clientTimestamp ? new Date(clientTimestamp) : new Date()
  
  // Convert to user's timezone (defaults to Lagos) for accurate day calculations
  const now = toTimezone(baseNow, tz)
  
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
  
  // Last trip/journey
  if (/\b(last|latest|most\s+recent)\s+(trip|journey|drive|travel|ride)\b/i.test(lowerMessage)) {
    // For last trip, we return a wide search window (30 days) but specific period type
    const searchStart = subDays(now, 30)
    return {
      hasDateReference: true,
      period: 'last_trip',
      startDate: startOfDay(searchStart).toISOString(),
      endDate: endOfDay(now).toISOString(),
      humanReadable: 'last trip'
    }
  }

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
  
  // Last week - FIXED calculation
  // Last week = Monday to Sunday of the previous calendar week
  // If today is Monday, last week is 7-13 days ago
  // If today is Sunday, last week is 1-7 days ago
  if (/\b(last\s+week|previous\s+week|week\s+before)\b/i.test(lowerMessage)) {
    const dayOfWeek = now.getDay() // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    // Calculate days to last Monday: if today is Monday (1), go back 7 days; if Sunday (0), go back 6 days
    const daysToLastMonday = dayOfWeek === 0 ? 6 : dayOfWeek + 6
    const daysToLastSunday = dayOfWeek === 0 ? 0 : dayOfWeek - 1
    
    const startOfLastWeek = subDays(now, daysToLastMonday)
    const endOfLastWeek = subDays(now, daysToLastSunday)
    
    return {
      hasDateReference: true,
      period: 'last_week',
      startDate: startOfDay(startOfLastWeek).toISOString(),
      endDate: endOfDay(endOfLastWeek).toISOString(),
      humanReadable: 'last week'
    }
  }
  
  // "How many trips last week" or "trips last week" - catch variations
  if (/\b(trips?|journeys?|drives?|travels?)\s+(last|previous|past)\s+week\b/i.test(lowerMessage) ||
      /\b(last|previous|past)\s+week.*\b(trips?|journeys?|drives?|travels?)\b/i.test(lowerMessage)) {
    const dayOfWeek = now.getDay()
    const daysToLastMonday = dayOfWeek === 0 ? 6 : dayOfWeek + 6
    const daysToLastSunday = dayOfWeek === 0 ? 0 : dayOfWeek - 1
    
    const startOfLastWeek = subDays(now, daysToLastMonday)
    const endOfLastWeek = subDays(now, daysToLastSunday)
    
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
  
  // Specific Date: "Jan 5", "January 5th", "5th of January"
  // Basic implementation for common month names
  const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december', 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const monthMap: Record<string, number> = {
    'january': 0, 'jan': 0, 'february': 1, 'feb': 1, 'march': 2, 'mar': 2, 'april': 3, 'apr': 3, 'may': 4, 'june': 5, 'jun': 5, 'july': 6, 'jul': 6, 'august': 7, 'aug': 7, 'september': 8, 'sep': 8, 'october': 9, 'oct': 9, 'november': 10, 'nov': 10, 'december': 11, 'dec': 11
  };
  
  // Regex to capture "Month Day" or "Day of Month"
  const datePattern = new RegExp(`\\b(${monthNames.join('|')})\\s+(\\d{1,2})(st|nd|rd|th)?\\b|\\b(\\d{1,2})(st|nd|rd|th)?\\s+of\\s+(${monthNames.join('|')})\\b`, 'i');
  const dateMatch = lowerMessage.match(datePattern);
  
  if (dateMatch) {
    let monthIndex = -1;
    let day = -1;
    
    if (dateMatch[1]) { // Month Day format
      monthIndex = monthMap[dateMatch[1].toLowerCase()];
      day = parseInt(dateMatch[2], 10);
    } else if (dateMatch[6]) { // Day of Month format
      monthIndex = monthMap[dateMatch[6].toLowerCase()];
      day = parseInt(dateMatch[4], 10);
    }
    
    if (monthIndex >= 0 && day > 0 && day <= 31) {
      let year = now.getFullYear();
      let targetDate = new Date(Date.UTC(year, monthIndex, day));
      
      // If date is in future, assume previous year
      if (targetDate > now) {
        year--;
        targetDate = new Date(Date.UTC(year, monthIndex, day));
      }
      
      return {
        hasDateReference: true,
        period: 'custom',
        startDate: startOfDay(targetDate).toISOString(),
        endDate: endOfDay(targetDate).toISOString(),
        humanReadable: `on ${dateMatch[0]}`
      };
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

  // Generic trip history requests without explicit dates
  if (/\btrip\s+(history|log|records?)\b/i.test(lowerMessage)) {
    const searchStart = subDays(now, 30)
    return {
      hasDateReference: true,
      period: 'custom',
      startDate: startOfDay(searchStart).toISOString(),
      endDate: endOfDay(now).toISOString(),
      humanReadable: 'last 30 days'
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
    /\b(last|latest)\s+(trip|journey)\b/i, // Added last trip check
    /\btrip\s+(history|log|records?)\b/i,
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
