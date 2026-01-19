/**
 * Shared Timezone Configuration
 * 
 * Enforces Lagos timezone (Africa/Lagos) across all edge functions
 * for consistent date/time handling throughout the application.
 */

export const DEFAULT_TIMEZONE = 'Africa/Lagos';

/**
 * Get current date/time in Lagos timezone
 */
export function getLagosNow(): Date {
  return new Date();
}

/**
 * Convert a date to Lagos timezone for accurate day calculations
 * 
 * @param date - Date to convert
 * @returns Date adjusted to Lagos timezone
 */
export function toLagosTimezone(date: Date): Date {
  try {
    // Get date components in Lagos timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: DEFAULT_TIMEZONE,
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
    console.warn(`Error converting to Lagos timezone, using original date:`, error)
    return date
  }
}

/**
 * Format a date as ISO string with Lagos timezone context
 */
export function formatLagosISO(date: Date): string {
  return date.toISOString()
}

/**
 * Get start of day in Lagos timezone
 */
export function getLagosStartOfDay(date: Date = new Date()): Date {
  const lagosDate = toLagosTimezone(date)
  const d = new Date(lagosDate)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

/**
 * Get end of day in Lagos timezone
 */
export function getLagosEndOfDay(date: Date = new Date()): Date {
  const lagosDate = toLagosTimezone(date)
  const d = new Date(lagosDate)
  d.setUTCHours(23, 59, 59, 999)
  return d
}
