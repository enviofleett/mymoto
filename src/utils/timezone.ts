/**
 * Timezone Utilities for Frontend Display
 *
 * Handles timezone conversions for display purposes:
 * - Database: UTC (Universal Time)
 * - User Display: WAT - West Africa Time (GMT+1, Lagos)
 *
 * All timestamps in the database are stored in UTC.
 * This utility converts UTC to Lagos time for display.
 */

// Timezone constants
export const TIMEZONES = {
  UTC: 0,
  LAGOS: 1,      // West Africa Time (WAT) - GMT+1
  GPS51: 8,      // China Standard Time (CST) - GMT+8
} as const;

/**
 * Convert UTC timestamp to Lagos time
 */
export function convertUTCToLagos(utcTimestamp: string | Date): Date {
  const date = utcTimestamp instanceof Date ? utcTimestamp : new Date(utcTimestamp);
  return new Date(date.getTime() + (TIMEZONES.LAGOS * 60 * 60 * 1000));
}

/**
 * Format UTC timestamp for display in Lagos timezone
 */
export function formatLagosTime(
  utcTimestamp: string | Date,
  format: 'full' | 'date' | 'time' | 'datetime' | 'short' = 'datetime'
): string {
  const lagosDate = convertUTCToLagos(utcTimestamp);

  const year = lagosDate.getUTCFullYear();
  const month = String(lagosDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(lagosDate.getUTCDate()).padStart(2, '0');
  const hours = String(lagosDate.getUTCHours()).padStart(2, '0');
  const minutes = String(lagosDate.getUTCMinutes()).padStart(2, '0');
  const seconds = String(lagosDate.getUTCSeconds()).padStart(2, '0');

  switch (format) {
    case 'full':
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} WAT`;
    case 'date':
      return `${year}-${month}-${day}`;
    case 'time':
      return `${hours}:${minutes}:${seconds}`;
    case 'short':
      return `${year}-${month}-${day} ${hours}:${minutes}`;
    case 'datetime':
    default:
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }
}

/**
 * Format UTC timestamp for display in Lagos timezone with Intl.DateTimeFormatOptions
 * This is the function that components use with options like { month: 'short', day: 'numeric', ... }
 */
export function formatToLagosTime(
  utcTimestamp: string | Date,
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }
): string {
  const dateObj = utcTimestamp instanceof Date ? utcTimestamp : new Date(utcTimestamp);
  
  // Use Intl.DateTimeFormat with Africa/Lagos timezone
  return new Intl.DateTimeFormat('en-US', {
    ...options,
    timeZone: 'Africa/Lagos',
  }).format(dateObj);
}

/**
 * Format UTC timestamp with relative time in Lagos timezone
 */
export function formatLagosTimeRelative(utcTimestamp: string | Date): string {
  const lagosDate = convertUTCToLagos(utcTimestamp);
  const now = convertUTCToLagos(new Date());

  const diffMs = now.getTime() - lagosDate.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;

  return formatLagosTime(utcTimestamp, 'short');
}

/**
 * Get current time in Lagos timezone
 */
export function getNowInLagos(): Date {
  return convertUTCToLagos(new Date());
}

/**
 * Format duration in human-readable format
 */
export function formatDuration(durationSeconds: number): string {
  const hours = Math.floor(durationSeconds / 3600);
  const minutes = Math.floor((durationSeconds % 3600) / 60);
  const seconds = durationSeconds % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

  return parts.join(' ');
}

/**
 * Get timezone display name
 */
export function getTimezoneDisplay(): string {
  return 'WAT (GMT+1)';
}
