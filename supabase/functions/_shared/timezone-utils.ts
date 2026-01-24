/**
 * Timezone Utilities for GPS51 Data Sync
 *
 * Handles timezone conversions between:
 * - GPS51 Platform: GMT+8 (China Standard Time)
 * - Database: UTC (Universal Time - best practice)
 * - User Display: GMT+1 (West Africa Time - Lagos)
 *
 * Flow:
 * GPS51 (GMT+8) → Edge Function → Database (UTC) → Frontend → Display (GMT+1)
 */

// Timezone offsets in hours
export const TIMEZONES = {
  GPS51: 8,      // China Standard Time (GMT+8)
  LAGOS: 1,      // West Africa Time (GMT+1)
  UTC: 0,        // Universal Time Coordinated
} as const;

/**
 * Parse GPS51 timestamp and convert to UTC
 *
 * GPS51 returns timestamps in different formats:
 * 1. Milliseconds since epoch (most common)
 * 2. Seconds since epoch (for very old data)
 * 3. String format "yyyy-MM-dd HH:mm:ss" in GMT+8
 *
 * @param ts - GPS51 timestamp (number or string)
 * @param sourceTimezone - Source timezone offset (default: GPS51 = GMT+8)
 * @returns ISO8601 UTC timestamp string or null if invalid
 */
export function parseGps51TimestampToUTC(
  ts: any,
  sourceTimezone: number = TIMEZONES.GPS51
): string | null {
  if (!ts) return null;

  try {
    let dateUTC: Date;

    // Handle string format: "yyyy-MM-dd HH:mm:ss"
    if (typeof ts === 'string' && ts.includes('-')) {
      // GPS51 string timestamps are in GMT+8, but without timezone indicator
      // We need to parse as GMT+8 and convert to UTC
      const [datePart, timePart] = ts.split(' ');
      const [year, month, day] = datePart.split('-').map(Number);
      const [hour, minute, second] = (timePart || '00:00:00').split(':').map(Number);

      // Create date in GPS51 timezone (GMT+8)
      const gps51Date = new Date(Date.UTC(
        year,
        month - 1, // Months are 0-indexed
        day,
        hour,
        minute,
        second || 0
      ));

      // Subtract GPS51 offset to get UTC
      // If GPS51 time is 14:00 GMT+8, UTC is 06:00 (14:00 - 8 hours)
      dateUTC = new Date(gps51Date.getTime() - (sourceTimezone * 60 * 60 * 1000));
    }
    // Handle number format
    else {
      const num = typeof ts === 'number' ? ts : parseInt(ts);
      if (isNaN(num)) return null;

      // If less than year 2000 in milliseconds, it's probably seconds
      const threshold = Date.parse('2000-01-01T00:00:00Z');
      const timestampMs = num < threshold ? num * 1000 : num;

      // GPS51 numeric timestamps are already in UTC (milliseconds since epoch)
      // But validate they're sane
      const now = Date.now();
      const fiveMinutesFromNow = now + (5 * 60 * 1000);
      const year2000 = threshold;

      if (timestampMs < year2000 || timestampMs > fiveMinutesFromNow) {
        console.warn(`[timezone-utils] Timestamp out of valid range: ${timestampMs}`);
        return null;
      }

      dateUTC = new Date(timestampMs);
    }

    return dateUTC.toISOString();
  } catch (e) {
    console.warn(`[timezone-utils] Failed to parse timestamp: ${ts}`, e);
    return null;
  }
}

/**
 * Convert UTC timestamp to Lagos time (GMT+1)
 * Returns ISO8601 string with timezone offset
 *
 * @param utcTimestamp - ISO8601 UTC timestamp
 * @returns ISO8601 timestamp in Lagos timezone (GMT+1)
 */
export function convertUTCToLagos(utcTimestamp: string): string {
  const date = new Date(utcTimestamp);

  // Add 1 hour for Lagos (GMT+1)
  const lagosTime = new Date(date.getTime() + (TIMEZONES.LAGOS * 60 * 60 * 1000));

  // Return ISO8601 with timezone offset
  return lagosTime.toISOString().replace('Z', '+01:00');
}

/**
 * Convert Lagos time (GMT+1) to UTC
 *
 * @param lagosTimestamp - Timestamp in Lagos time
 * @returns ISO8601 UTC timestamp
 */
export function convertLagosToUTC(lagosTimestamp: string | Date): string {
  const date = lagosTimestamp instanceof Date ? lagosTimestamp : new Date(lagosTimestamp);

  // Subtract 1 hour for UTC
  const utcTime = new Date(date.getTime() - (TIMEZONES.LAGOS * 60 * 60 * 1000));

  return utcTime.toISOString();
}

/**
 * Format date for GPS51 API queries (yyyy-MM-dd HH:mm:ss)
 * Converts from UTC/Lagos time to GPS51 timezone (GMT+8)
 *
 * @param date - Date to format (UTC or Lagos time)
 * @param sourceTimezone - Source timezone (default: UTC)
 * @returns Formatted string in GPS51 timezone (GMT+8)
 */
export function formatDateForGps51(
  date: Date,
  sourceTimezone: number = TIMEZONES.UTC
): string {
  // Calculate GPS51 time
  // If source is UTC (0), add 8 hours for GPS51 (GMT+8)
  // If source is Lagos (1), add 7 hours for GPS51 (GMT+8 - GMT+1 = +7)
  const offsetHours = TIMEZONES.GPS51 - sourceTimezone;
  const gps51Date = new Date(date.getTime() + (offsetHours * 60 * 60 * 1000));

  const year = gps51Date.getUTCFullYear();
  const month = String(gps51Date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(gps51Date.getUTCDate()).padStart(2, '0');
  const hours = String(gps51Date.getUTCHours()).padStart(2, '0');
  const minutes = String(gps51Date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(gps51Date.getUTCSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Get current time in Lagos timezone
 *
 * @returns Current date/time in Lagos (GMT+1)
 */
export function getNowInLagos(): Date {
  const now = new Date();
  return new Date(now.getTime() + (TIMEZONES.LAGOS * 60 * 60 * 1000));
}

/**
 * Get date range for GPS51 API query
 * Converts Lagos/UTC dates to GPS51 timezone
 *
 * @param daysBack - Number of days to go back from now
 * @param timezone - Source timezone (default: Lagos GMT+1)
 * @returns Object with begintime and endtime formatted for GPS51 API
 */
export function getGps51DateRange(
  daysBack: number = 7,
  timezone: number = TIMEZONES.LAGOS
): { begintime: string; endtime: string } {
  const now = new Date();
  const begin = new Date(now);
  begin.setDate(begin.getDate() - daysBack);

  return {
    begintime: formatDateForGps51(begin, timezone),
    endtime: formatDateForGps51(now, timezone),
  };
}

/**
 * Validate timestamp is within reasonable bounds
 *
 * @param timestamp - Timestamp to validate (ISO8601 string or Date)
 * @returns true if valid, false otherwise
 */
export function isValidTimestamp(timestamp: string | Date): boolean {
  try {
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    const time = date.getTime();

    // Must be after year 2000
    const minTime = Date.parse('2000-01-01T00:00:00Z');
    // Must be before 5 minutes from now (allows small clock skew)
    const maxTime = Date.now() + (5 * 60 * 1000);

    return time >= minTime && time <= maxTime;
  } catch (e) {
    return false;
  }
}

/**
 * Format timestamp for display in Lagos timezone
 *
 * @param utcTimestamp - UTC timestamp (ISO8601)
 * @param format - Display format ('full' | 'date' | 'time' | 'datetime')
 * @returns Formatted string in Lagos time
 */
export function formatLagosTime(
  utcTimestamp: string,
  format: 'full' | 'date' | 'time' | 'datetime' = 'datetime'
): string {
  const date = new Date(utcTimestamp);

  // Add Lagos offset
  const lagosDate = new Date(date.getTime() + (TIMEZONES.LAGOS * 60 * 60 * 1000));

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
    case 'datetime':
    default:
      return `${year}-${month}-${day} ${hours}:${minutes}`;
  }
}

/**
 * Log timezone conversion for debugging
 */
export function logTimezoneConversion(
  label: string,
  gps51Time: any,
  utcTime: string | null
): void {
  console.log(`[timezone-utils] ${label}:`);
  console.log(`  GPS51 (GMT+8): ${gps51Time}`);
  console.log(`  UTC (GMT+0): ${utcTime}`);
  if (utcTime) {
    console.log(`  Lagos (GMT+1): ${formatLagosTime(utcTime, 'full')}`);
  }
}

/**
 * Example usage and tests (for documentation)
 *
 * // Parse GPS51 string timestamp
 * const utc1 = parseGps51TimestampToUTC("2024-01-24 14:30:00"); // GPS51 time
 * // Result: "2024-01-24T06:30:00.000Z" (UTC, 8 hours earlier)
 *
 * // Parse GPS51 numeric timestamp
 * const utc2 = parseGps51TimestampToUTC(1706096400000); // milliseconds
 *
 * // Format for display in Lagos
 * const lagosTime = formatLagosTime(utc1, 'full');
 * // Result: "2024-01-24 07:30:00 WAT" (UTC + 1 hour)
 *
 * // Get date range for GPS51 API
 * const range = getGps51DateRange(7, TIMEZONES.LAGOS);
 * // Result: { begintime: "2024-01-17 01:00:00", endtime: "2024-01-24 01:00:00" }
 * //         (Lagos time 00:00 = GPS51 time 07:00, adjusted to 01:00 in example)
 */
