/**
 * Shared Timezone Configuration (Frontend)
 * 
 * Enforces Lagos timezone (Africa/Lagos) across all frontend components
 * for consistent date/time display throughout the application.
 */

export const DEFAULT_TIMEZONE = 'Africa/Lagos';

/**
 * Format a date in Lagos timezone
 * 
 * @param date - Date to format
 * @param options - Intl.DateTimeFormatOptions
 * @returns Formatted date string
 */
export function formatLagosDate(
  date: Date | string,
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: DEFAULT_TIMEZONE,
  }
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-US', {
    ...options,
    timeZone: DEFAULT_TIMEZONE,
  }).format(dateObj);
}

/**
 * Format a date as time string in Lagos timezone
 */
export function formatLagosTime(date: Date | string): string {
  return formatLagosDate(date, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: DEFAULT_TIMEZONE,
  });
}

/**
 * Format a date as date string in Lagos timezone
 */
export function formatLagosDateOnly(date: Date | string): string {
  return formatLagosDate(date, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: DEFAULT_TIMEZONE,
  });
}

/**
 * Get current date/time in Lagos timezone
 */
export function getLagosNow(): Date {
  return new Date();
}

/**
 * Convert a date to Lagos timezone for accurate day calculations
 */
export function toLagosTimezone(date: Date): Date {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: DEFAULT_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const year = parseInt(parts.find(p => p.type === 'year')?.value || '0');
    const month = parseInt(parts.find(p => p.type === 'month')?.value || '0') - 1;
    const day = parseInt(parts.find(p => p.type === 'day')?.value || '0');
    const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
    const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
    const second = parseInt(parts.find(p => p.type === 'second')?.value || '0');

    return new Date(Date.UTC(year, month, day, hour, minute, second));
  } catch (error) {
    console.warn('Error converting to Lagos timezone, using original date:', error);
    return date;
  }
}

/**
 * Format date using date-fns-like format string with Lagos timezone
 * This is a drop-in replacement for date-fns format() that enforces Lagos timezone
 * 
 * @param date - Date to format
 * @param formatStr - date-fns format string (e.g., "MMM d, HH:mm")
 * @returns Formatted date string in Lagos timezone
 */
export function formatLagos(date: Date | string, formatStr: string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
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
      hour12: false,
    });
    
    const parts = formatter.formatToParts(dateObj);
    const year = parseInt(parts.find(p => p.type === 'year')?.value || '0');
    const month = parseInt(parts.find(p => p.type === 'month')?.value || '0') - 1;
    const day = parseInt(parts.find(p => p.type === 'day')?.value || '0');
    const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
    const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
    const second = parseInt(parts.find(p => p.type === 'second')?.value || '0');
    
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthNamesFull = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayNamesFull = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    // Get day of week
    const lagosDate = new Date(Date.UTC(year, month, day, hour, minute, second));
    const dayOfWeek = lagosDate.getUTCDay();
    
    // Determine if AM/PM
    const hour12 = hour % 12 || 12;
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const ampmLower = hour >= 12 ? 'pm' : 'am';
    
    // Format string replacements
    let result = formatStr
      .replace('yyyy', year.toString())
      .replace('yy', String(year).slice(-2))
      .replace('MMMM', monthNamesFull[month])
      .replace('MMM', monthNames[month])
      .replace('MM', String(month + 1).padStart(2, '0'))
      .replace('M', String(month + 1))
      .replace('dddd', dayNamesFull[dayOfWeek])
      .replace('ddd', dayNames[dayOfWeek])
      .replace('dd', String(day).padStart(2, '0'))
      .replace('d', String(day))
      .replace('HH', String(hour).padStart(2, '0'))
      .replace('H', String(hour))
      .replace('hh', String(hour12).padStart(2, '0'))
      .replace('h', String(hour12))
      .replace('mm', String(minute).padStart(2, '0'))
      .replace('ss', String(second).padStart(2, '0'))
      .replace('A', ampm)
      .replace('a', ampmLower);
    
    return result;
  } catch (error) {
    console.warn('Error formatting date with Lagos timezone:', error);
    // Fallback to basic formatting
    return dateObj.toLocaleString('en-US', { timeZone: DEFAULT_TIMEZONE });
  }
}

/**
 * Format a date as relative time (e.g., "5 minutes ago")
 */
export function formatRelativeTime(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - dateObj.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  
  if (diffSecs < 60) return 'just now';
  if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
  if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}h ago`;
  if (diffSecs < 604800) return `${Math.floor(diffSecs / 86400)}d ago`;
  
  return formatLagos(dateObj, "MMM d");
}
