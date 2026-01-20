/**
 * Alert Severity Adjustment Utility
 * Adjusts alert severity based on time of day for better prioritization
 */

export type TimeOfDay = 'night' | 'morning' | 'work' | 'evening';

export interface SeverityAdjustment {
  multiplier: number;
  reason: string;
}

/**
 * Get current time of day period
 */
export function getTimeOfDay(timezone: string = 'Africa/Lagos'): TimeOfDay {
  const now = new Date();
  const hour = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
  }).formatToParts(now).find(part => part.type === 'hour')?.value;
  
  const hourNum = parseInt(hour || '0', 10);
  
  if (hourNum >= 0 && hourNum < 6) return 'night';
  if (hourNum >= 6 && hourNum < 9) return 'morning';
  if (hourNum >= 9 && hourNum < 17) return 'work';
  return 'evening';
}

/**
 * Adjust alert severity based on time of day
 * @param baseSeverity - Original severity level
 * @param eventType - Type of event
 * @param timezone - Timezone for time calculation
 * @returns Adjusted severity and reason
 */
export function adjustSeverityByTimeOfDay(
  baseSeverity: 'info' | 'warning' | 'error' | 'critical',
  eventType: string,
  timezone: string = 'Africa/Lagos'
): { severity: 'info' | 'warning' | 'error' | 'critical'; reason: string } {
  const timeOfDay = getTimeOfDay(timezone);
  
  // Night (0-6 AM): Higher severity for unusual events
  if (timeOfDay === 'night') {
    // Unusual events at night are more concerning
    const unusualEvents = ['overspeeding', 'movement', 'ignition_on', 'geofence_exit'];
    if (unusualEvents.includes(eventType)) {
      if (baseSeverity === 'info') {
        return { severity: 'warning', reason: 'Unusual activity detected during night hours' };
      }
      if (baseSeverity === 'warning') {
        return { severity: 'error', reason: 'Unusual activity detected during night hours' };
      }
    }
  }
  
  // Morning (6-9 AM): Normal severity for rush hour
  // Work (9-5 PM): Normal severity
  // Evening (5 PM+): Normal severity
  // These periods use base severity as-is
  
  return { severity: baseSeverity, reason: `Normal severity for ${timeOfDay} period` };
}
