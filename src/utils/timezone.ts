/**
 * Timezone utility functions for consistent Lagos timezone display
 */

const LAGOS_TIMEZONE = 'Africa/Lagos';

/**
 * Parses a date string from Supabase (TIMESTAMP WITH TIME ZONE) to a Date object
 * Supabase returns timestamps in format: "2026-01-22 12:34:03.437+00" or ISO string
 * This ensures proper UTC parsing regardless of browser timezone
 */
export function parseSupabaseTimestamp(date: Date | string | null | undefined): Date | null {
  if (!date) return null;

  if (date instanceof Date) {
    // If it's already a Date object, return as-is
    // The Date object internally stores UTC time, so this is correct
    return date;
  }

  if (typeof date === 'string') {
    // Supabase JavaScript client returns TIMESTAMP WITH TIME ZONE as ISO string
    // Format: "2026-01-22T12:34:03.437Z" or "2026-01-22T12:34:03.437+00:00"
    // But sometimes it might come as PostgreSQL format "2026-01-22 12:34:03.437+00"
    
    let normalized = date.trim();
    
    // Check if it's PostgreSQL format: "YYYY-MM-DD HH:mm:ss.sss+00"
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(normalized)) {
      // Convert PostgreSQL format to ISO
      // "2026-01-22 12:34:03.437+00" -> "2026-01-22T12:34:03.437+00:00"
      normalized = normalized.replace(' ', 'T');
      // Ensure timezone offset format is correct (+00 -> +00:00)
      if (normalized.match(/[+-]\d{2}$/)) {
        normalized = normalized + ':00';
      }
    } else if (!normalized.includes('T') && !normalized.includes('Z') && !normalized.match(/[+-]\d{2}/)) {
      // If it's just "YYYY-MM-DD HH:mm:ss" without timezone, assume UTC
      normalized = normalized.replace(' ', 'T') + 'Z';
    }
    
    // Parse the normalized string
    // JavaScript's Date constructor will correctly parse ISO strings with timezone
    const parsed = new Date(normalized);
    
    if (isNaN(parsed.getTime())) {
      console.error('[parseSupabaseTimestamp] Failed to parse date:', date, 'normalized:', normalized);
      return null;
    }
    
    // Verify the date was parsed correctly as UTC
    // If the input was "2026-01-22T12:34:03.437Z" (12:34 UTC),
    // the Date object should represent 12:34 UTC, not local time
    const expectedUTC = normalized.includes('Z') || normalized.match(/[+-]00:?00$/);
    
    // Debug in development (only log errors or first few calls to avoid spam)
    if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
      // Only log first few calls to avoid console spam
      const logCount = (window as any).__timezoneParseCount = ((window as any).__timezoneParseCount || 0) + 1;
      if (logCount <= 3) {
        console.log('[parseSupabaseTimestamp] Sample parse:', {
          original: date,
          normalized,
          parsedISO: parsed.toISOString(),
          lagosFormatted: new Intl.DateTimeFormat('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Africa/Lagos',
            hour12: true
          }).format(parsed)
        });
      }
    }
    
    return parsed;
  }

  return new Date(date);
}

/**
 * Formats a date to Lagos timezone with consistent format
 * @param date - Date object or ISO string from Supabase
 * @param options - Intl.DateTimeFormatOptions
 * @returns Formatted date string in Lagos timezone
 */
export function formatToLagosTime(
  date: Date | string | null | undefined,
  options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: LAGOS_TIMEZONE
  }
): string {
  const dateObj = parseSupabaseTimestamp(date);
  if (!dateObj) return '';

  // Format with Lagos timezone
  return new Intl.DateTimeFormat('en-US', {
    ...options,
    timeZone: LAGOS_TIMEZONE
  }).format(dateObj);
}

/**
 * Formats a date to Lagos timezone for "Updated" timestamp (short format)
 * Format: "MMM d, HH:mm" (e.g., "Jan 22, 01:34 PM")
 */
export function formatUpdatedTime(date: Date | string | null | undefined): string {
  return formatToLagosTime(date, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: LAGOS_TIMEZONE
  });
}

/**
 * Formats a date to Lagos timezone for trip times
 * Format: "HH:mm" (e.g., "01:34 PM")
 */
export function formatTripTime(date: Date | string | null | undefined): string {
  return formatToLagosTime(date, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: LAGOS_TIMEZONE
  });
}

/**
 * Formats a date to Lagos timezone for full date-time display
 * Format: "MMM d, yyyy, HH:mm" (e.g., "Jan 22, 2026, 01:34 PM")
 */
export function formatFullDateTime(date: Date | string | null | undefined): string {
  return formatToLagosTime(date, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: LAGOS_TIMEZONE
  });
}

/**
 * Gets current time in Lagos timezone
 */
export function getLagosNow(): Date {
  const now = new Date();
  const lagosTime = new Intl.DateTimeFormat('en-US', {
    timeZone: LAGOS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(now);

  // Reconstruct as UTC date (since we have the Lagos time components)
  return new Date(
    Date.UTC(
      parseInt(lagosTime.find(p => p.type === 'year')?.value || '0'),
      parseInt(lagosTime.find(p => p.type === 'month')?.value || '0') - 1,
      parseInt(lagosTime.find(p => p.type === 'day')?.value || '0'),
      parseInt(lagosTime.find(p => p.type === 'hour')?.value || '0'),
      parseInt(lagosTime.find(p => p.type === 'minute')?.value || '0'),
      parseInt(lagosTime.find(p => p.type === 'second')?.value || '0')
    )
  );
}

/**
 * Gets offline duration string from last update time
 * @param lastUpdate - Date object or null
 * @returns Formatted duration string (e.g., "2 hours", "5 minutes", "3 days") or null
 */
export function getOfflineDuration(lastUpdate: Date | string | null | undefined): string | null {
  if (!lastUpdate) return null;
  
  const dateObj = parseSupabaseTimestamp(lastUpdate);
  if (!dateObj) return null;
  
  const now = new Date();
  const diffMs = now.getTime() - dateObj.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffDays > 0) {
    return `${diffDays} day${diffDays > 1 ? 's' : ''}`;
  }
  if (diffHours > 0) {
    return `${diffHours} hour${diffHours > 1 ? 's' : ''}`;
  }
  if (diffMinutes > 0) {
    return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''}`;
  }
  
  return 'just now';
}
