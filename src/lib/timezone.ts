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
