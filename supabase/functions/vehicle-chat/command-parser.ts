/**
 * Natural Language Command Parser
 *
 * Parses user messages to detect and extract vehicle commands
 * including geofence alerts with location and time conditions
 */

export type CommandType =
  | 'lock'
  | 'unlock'
  | 'immobilize'
  | 'restore'
  | 'set_speed_limit'
  | 'clear_speed_limit'
  | 'enable_geofence'
  | 'disable_geofence'
  | 'request_location'
  | 'request_status'
  | 'start_engine'
  | 'stop_engine'
  | 'sound_alarm'
  | 'silence_alarm'
  | 'create_geofence_alert'
  | 'list_geofence_alerts'
  | 'cancel_geofence_alert'
  | 'custom';

export interface GeofenceAlertParams {
  location_name?: string;
  trigger_on: 'enter' | 'exit' | 'both';
  one_time?: boolean;
  active_from?: string; // HH:MM format
  active_until?: string;
  active_days?: number[]; // 0=Sunday
  expires_at?: string; // ISO date
}

export interface ParsedCommand {
  isCommand: boolean;
  commandType: CommandType | null;
  confidence: number; // 0-1
  parameters: Record<string, any>;
  originalText: string;
  normalizedText: string;
  geofenceParams?: GeofenceAlertParams;
}

interface CommandPattern {
  type: CommandType;
  patterns: RegExp[];
  parameterExtractors?: Record<string, RegExp>;
  requiresConfirmation: boolean;
  priority: 'low' | 'normal' | 'high' | 'urgent';
}

// Common Nigerian location patterns
const NIGERIAN_LOCATIONS = [
  'garki', 'wuse', 'maitama', 'asokoro', 'gwarinpa', 'jabi', 'utako',
  'lagos', 'ikeja', 'victoria island', 'lekki', 'ikoyi', 'ajah',
  'abuja', 'kano', 'ibadan', 'port harcourt', 'benin', 'calabar',
  'kaduna', 'enugu', 'jos', 'owerri', 'warri', 'onitsha'
]

// Geofence alert patterns - these detect natural language requests for location alerts
const GEOFENCE_ALERT_PATTERNS = [
  // "notify me when vehicle gets to Garki"
  /\b(notify|alert|tell|inform|let me know|message)\s+(me\s+)?when\s+(the\s+)?(vehicle|car|it)?\s*(gets?|arrives?|reaches?|is)\s+(to\s+|at\s+|in\s+)?(.+?)(\s+and\s+when|\s+or\s+when|$)/i,
  // "when vehicle arrives at Garki, notify me"
  /\bwhen\s+(the\s+)?(vehicle|car|it)\s+(gets?|arrives?|reaches?)\s+(to\s+|at\s+|in\s+)?(.+?),?\s*(notify|alert|tell|inform)\s+me/i,
  // "alert when leaves Garki"
  /\b(notify|alert|tell|inform|let me know)\s+(me\s+)?when\s+(the\s+)?(vehicle|car|it)?\s*(leaves?|exits?|departs?)\s+(from\s+)?(.+)/i,
  // "when it leaves X, notify me"
  /\bwhen\s+(the\s+)?(vehicle|car|it)\s+(leaves?|exits?|departs?)\s+(from\s+)?(.+?),?\s*(notify|alert|tell|inform)\s+me/i,
  // "set up geofence for Garki"
  /\b(set\s+up|create|add|configure)\s+(a\s+)?(geofence|geo-fence|location\s+alert)\s+(for|at|around)\s+(.+)/i,
  // "track when enters/leaves X"
  /\btrack\s+when\s+(the\s+)?(vehicle|car|it)?\s*(enters?|leaves?|arrives?|exits?)\s+(at\s+|from\s+)?(.+)/i,
  // "monitor arrival at X" / "monitor departure from X"
  /\bmonitor\s+(my\s+)?(arrival|departure|entry|exit)\s+(at|from|to)\s+(.+)/i,
  // "ping me when at X"
  /\b(ping|buzz|beep)\s+me\s+when\s+(at|in|near)\s+(.+)/i
]

// Time condition patterns
const TIME_PATTERNS = {
  // "between 8am and 5pm"
  between: /between\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s+and\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
  // "from 9am to 6pm"
  from_to: /from\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s+to\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
  // "after 5pm"
  after: /after\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
  // "before 8am"  
  before: /before\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
  // "during work hours" / "during business hours"
  work_hours: /during\s+(work|business|office)\s+hours/i,
  // "on weekdays" / "on weekends"
  weekdays: /on\s+weekdays?/i,
  weekends: /on\s+weekends?/i,
  // "only today" / "just for today"
  today: /(only|just)\s+(for\s+)?today/i,
  // "for the next X hours"
  next_hours: /for\s+the\s+next\s+(\d+)\s+hours?/i
}

// Parse time string to HH:MM format
function parseTimeString(timeStr: string): string {
  const cleaned = timeStr.toLowerCase().replace(/\s+/g, '')
  const match = cleaned.match(/(\d{1,2})(?::(\d{2}))?(am|pm)?/)
  
  if (!match) return '00:00'
  
  let hours = parseInt(match[1], 10)
  const minutes = match[2] ? parseInt(match[2], 10) : 0
  const period = match[3]
  
  if (period === 'pm' && hours < 12) hours += 12
  if (period === 'am' && hours === 12) hours = 0
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
}

// Extract time conditions from message
function extractTimeConditions(message: string): Partial<GeofenceAlertParams> {
  const params: Partial<GeofenceAlertParams> = {}
  
  // Check between/from-to patterns
  const betweenMatch = message.match(TIME_PATTERNS.between)
  const fromToMatch = message.match(TIME_PATTERNS.from_to)
  
  if (betweenMatch) {
    params.active_from = parseTimeString(betweenMatch[1])
    params.active_until = parseTimeString(betweenMatch[2])
  } else if (fromToMatch) {
    params.active_from = parseTimeString(fromToMatch[1])
    params.active_until = parseTimeString(fromToMatch[2])
  }
  
  // Work hours shorthand
  if (TIME_PATTERNS.work_hours.test(message)) {
    params.active_from = '08:00'
    params.active_until = '18:00'
    params.active_days = [1, 2, 3, 4, 5] // Mon-Fri
  }
  
  // Weekdays/weekends
  if (TIME_PATTERNS.weekdays.test(message)) {
    params.active_days = [1, 2, 3, 4, 5]
  } else if (TIME_PATTERNS.weekends.test(message)) {
    params.active_days = [0, 6]
  }
  
  // Just for today
  if (TIME_PATTERNS.today.test(message)) {
    params.one_time = true
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(0, 0, 0, 0)
    params.expires_at = tomorrow.toISOString()
  }
  
  // Next X hours
  const nextHoursMatch = message.match(TIME_PATTERNS.next_hours)
  if (nextHoursMatch) {
    const hours = parseInt(nextHoursMatch[1], 10)
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + hours)
    params.expires_at = expiresAt.toISOString()
    params.one_time = true
  }
  
  return params
}

// Extract location name from message
function extractLocationName(message: string): string | null {
  const normalized = message.toLowerCase()
  
  // Check for known Nigerian locations first
  for (const loc of NIGERIAN_LOCATIONS) {
    if (normalized.includes(loc)) {
      return loc.charAt(0).toUpperCase() + loc.slice(1)
    }
  }
  
  // Try to extract quoted location
  const quotedMatch = message.match(/["']([^"']+)["']/)
  if (quotedMatch) {
    return quotedMatch[1]
  }
  
  // Try common patterns
  const patterns = [
    /(?:to|at|in|from|near)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g,
    /arrives?\s+(?:at|in)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
    /leaves?\s+(?:from\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
    /for\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i
  ]
  
  for (const pattern of patterns) {
    const match = message.match(pattern)
    if (match && match[1]) {
      // Filter out common words
      const location = match[1].trim()
      if (!['the', 'my', 'a', 'an', 'this', 'that'].includes(location.toLowerCase())) {
        return location
      }
    }
  }
  
  return null
}

// Detect if message is a geofence alert request
function detectGeofenceAlert(message: string): ParsedCommand | null {
  const normalized = message.toLowerCase()
  
  // Check each geofence pattern
  for (const pattern of GEOFENCE_ALERT_PATTERNS) {
    if (pattern.test(message)) {
      const locationName = extractLocationName(message)
      
      // Determine trigger type
      let triggerOn: 'enter' | 'exit' | 'both' = 'enter'
      if (/\bleaves?|\bexits?|\bdeparts?/i.test(normalized)) {
        triggerOn = 'exit'
      }
      if (/\b(enters?\s+and\s+leaves?|arrives?\s+and\s+leaves?|entry\s+and\s+exit)/i.test(normalized)) {
        triggerOn = 'both'
      }
      
      // Check for "once" / "one time" / "just this once"
      const oneTime = /\b(once|one\s+time|just\s+this\s+once|single|only\s+once)\b/i.test(normalized)
      
      // Extract time conditions
      const timeParams = extractTimeConditions(message)
      
      const geofenceParams: GeofenceAlertParams = {
        location_name: locationName || undefined,
        trigger_on: triggerOn,
        one_time: oneTime || timeParams.one_time,
        ...timeParams
      }
      
      return {
        isCommand: true,
        commandType: 'create_geofence_alert',
        confidence: locationName ? 0.9 : 0.7,
        parameters: { location_name: locationName },
        originalText: message,
        normalizedText: normalized,
        geofenceParams
      }
    }
  }
  
  // Check for list/show geofence alerts
  if (/\b(list|show|what|which)\s+(my\s+)?(geofence|location)\s*(alerts?|monitors?|notifications?)?\b/i.test(normalized)) {
    return {
      isCommand: true,
      commandType: 'list_geofence_alerts',
      confidence: 0.85,
      parameters: {},
      originalText: message,
      normalizedText: normalized
    }
  }
  
  // Check for cancel/remove geofence alert
  if (/\b(cancel|remove|delete|stop)\s+(the\s+)?(geofence|location)\s*(alert|monitor|notification)?\s*(for|at)?\s*/i.test(normalized)) {
    const locationName = extractLocationName(message)
    return {
      isCommand: true,
      commandType: 'cancel_geofence_alert',
      confidence: locationName ? 0.85 : 0.7,
      parameters: { location_name: locationName },
      originalText: message,
      normalizedText: normalized
    }
  }
  
  return null
}

// Command pattern definitions (existing)
const COMMAND_PATTERNS: CommandPattern[] = [
  {
    type: 'lock',
    patterns: [
      /\b(lock|secure|close)\s+(the\s+)?(doors?|vehicle|car)\b/i,
      /\block\s+(it|yourself|up)\b/i,
      /\bplease\s+lock\b/i
    ],
    requiresConfirmation: false,
    priority: 'normal'
  },
  {
    type: 'unlock',
    patterns: [
      /\b(unlock|open|unsecure)\s+(the\s+)?(doors?|vehicle|car)\b/i,
      /\bunlock\s+(it|yourself)\b/i,
      /\bplease\s+unlock\b/i
    ],
    requiresConfirmation: false,
    priority: 'normal'
  },
  {
    type: 'immobilize',
    patterns: [
      /\b(immobilize|disable|stop|shut\s+down)\s+(the\s+)?(engine|vehicle|car)\b/i,
      /\bcut\s+(the\s+)?engine\b/i,
      /\bdisable\s+(the\s+)?vehicle\b/i,
      /\bimmobilize\b/i
    ],
    requiresConfirmation: true,
    priority: 'urgent'
  },
  {
    type: 'restore',
    patterns: [
      /\b(restore|enable|reactivate|turn\s+on)\s+(the\s+)?(engine|vehicle|car)\b/i,
      /\bunimmobilize\b/i,
      /\bre-?enable\s+(the\s+)?vehicle\b/i
    ],
    requiresConfirmation: true,
    priority: 'high'
  },
  {
    type: 'set_speed_limit',
    patterns: [
      /\bset\s+(the\s+)?speed\s+limit\s+to\s+(\d+)/i,
      /\blimit\s+(the\s+)?speed\s+to\s+(\d+)/i,
      /\b(max|maximum)\s+speed\s+(\d+)/i,
      /\bspeed\s+limit[:\s]+(\d+)/i
    ],
    parameterExtractors: {
      speed_limit: /(\d+)\s*(km\/h|kmh|kph)?/i
    },
    requiresConfirmation: true,
    priority: 'high'
  },
  {
    type: 'clear_speed_limit',
    patterns: [
      /\bclear\s+(the\s+)?speed\s+limit\b/i,
      /\bremove\s+(the\s+)?speed\s+limit\b/i,
      /\bdisable\s+(the\s+)?speed\s+limit\b/i,
      /\bunlimited\s+speed\b/i
    ],
    requiresConfirmation: true,
    priority: 'high'
  },
  {
    type: 'enable_geofence',
    patterns: [
      /\benable\s+(the\s+)?geofence?\b/i,
      /\bactivate\s+(the\s+)?geofence?\b/i,
      /\bturn\s+on\s+(the\s+)?geofence?\b/i,
      /\bstart\s+(monitoring\s+)?geofence?\b/i
    ],
    parameterExtractors: {
      geofence_name: /geofence?\s+["`']?([a-zA-Z0-9\s]+)["`']?/i
    },
    requiresConfirmation: false,
    priority: 'normal'
  },
  {
    type: 'disable_geofence',
    patterns: [
      /\bdisable\s+(the\s+)?geofence?\b/i,
      /\bdeactivate\s+(the\s+)?geofence?\b/i,
      /\bturn\s+off\s+(the\s+)?geofence?\b/i,
      /\bstop\s+(monitoring\s+)?geofence?\b/i
    ],
    requiresConfirmation: false,
    priority: 'normal'
  },
  {
    type: 'request_location',
    patterns: [
      /\b(get|send|show|tell)\s+(me\s+)?(your|the)\s+(current\s+)?(location|position)\b/i,
      /\bwhere\s+are\s+you\s+(now|currently|right\s+now)\b/i,
      /\bupdate\s+(your\s+)?location\b/i
    ],
    requiresConfirmation: false,
    priority: 'low'
  },
  {
    type: 'request_status',
    patterns: [
      /\b(get|send|show|tell)\s+(me\s+)?(your|the)\s+status\b/i,
      /\bhow\s+are\s+you\s+(doing|right\s+now)\b/i,
      /\bstatus\s+(update|report)\b/i
    ],
    requiresConfirmation: false,
    priority: 'low'
  },
  {
    type: 'start_engine',
    patterns: [
      /\bstart\s+(the\s+)?(engine|car|vehicle)\b/i,
      /\bturn\s+on\s+(the\s+)?(engine|ignition)\b/i,
      /\bremote\s+start\b/i
    ],
    requiresConfirmation: true,
    priority: 'high'
  },
  {
    type: 'stop_engine',
    patterns: [
      /\bstop\s+(the\s+)?(engine|car|vehicle)\b/i,
      /\bturn\s+off\s+(the\s+)?(engine|ignition)\b/i,
      /\bshut\s+down\s+(the\s+)?engine\b/i
    ],
    requiresConfirmation: true,
    priority: 'urgent'
  },
  {
    type: 'sound_alarm',
    patterns: [
      /\bsound\s+(the\s+)?alarm\b/i,
      /\btrigger\s+(the\s+)?alarm\b/i,
      /\bhonk\s+(the\s+)?horn\b/i,
      /\bmake\s+(a\s+)?noise\b/i,
      /\bfind\s+(my\s+)?(car|vehicle)\b/i
    ],
    requiresConfirmation: false,
    priority: 'normal'
  },
  {
    type: 'silence_alarm',
    patterns: [
      /\b(silence|stop|turn\s+off)\s+(the\s+)?alarm\b/i,
      /\bstop\s+(the\s+)?horn\b/i,
      /\bquiet\b/i
    ],
    requiresConfirmation: false,
    priority: 'normal'
  }
];

/**
 * Parse a user message to detect vehicle commands
 */
export function parseCommand(message: string): ParsedCommand {
  const normalizedText = message.trim().toLowerCase();

  // FIRST: Check for geofence alert commands (higher priority for location-based alerts)
  const geofenceCommand = detectGeofenceAlert(message)
  if (geofenceCommand) {
    return geofenceCommand
  }

  // Check each command pattern
  for (const commandDef of COMMAND_PATTERNS) {
    for (const pattern of commandDef.patterns) {
      const match = normalizedText.match(pattern);

      if (match) {
        // Extract parameters if defined
        const parameters: Record<string, any> = {};

        if (commandDef.parameterExtractors) {
          for (const [paramName, extractor] of Object.entries(commandDef.parameterExtractors)) {
            const paramMatch = message.match(extractor);
            if (paramMatch && paramMatch[1]) {
              // Parse numeric values
              if (paramName.includes('limit') || paramName.includes('speed')) {
                parameters[paramName] = parseInt(paramMatch[1], 10);
              } else {
                parameters[paramName] = paramMatch[1].trim();
              }
            }
          }
        }

        // Calculate confidence based on pattern specificity
        const confidence = calculateConfidence(match, commandDef.patterns.length);

        return {
          isCommand: true,
          commandType: commandDef.type,
          confidence,
          parameters,
          originalText: message,
          normalizedText,
        };
      }
    }
  }

  // No command detected
  return {
    isCommand: false,
    commandType: null,
    confidence: 0,
    parameters: {},
    originalText: message,
    normalizedText,
  };
}

/**
 * Calculate confidence score based on match quality
 */
function calculateConfidence(match: RegExpMatchArray, patternCount: number): number {
  let confidence = 0.7; // Base confidence

  // Increase confidence for exact matches
  if (match[0] === match.input) {
    confidence += 0.2;
  }

  // Increase confidence for longer matches
  if (match[0].length > 15) {
    confidence += 0.1;
  }

  // Decrease slightly if there are many pattern variations
  // (suggests less specific command)
  if (patternCount > 3) {
    confidence -= 0.05;
  }

  return Math.min(Math.max(confidence, 0), 1);
}

/**
 * Check if a message contains command-like keywords
 */
export function containsCommandKeywords(message: string): boolean {
  const commandKeywords = [
    'lock', 'unlock', 'immobilize', 'disable', 'enable',
    'set', 'limit', 'start', 'stop', 'sound', 'alarm',
    'geofence', 'speed limit', 'engine', 'restore',
    // Geofence alert keywords
    'notify', 'alert', 'tell me when', 'let me know', 'inform',
    'arrives', 'leaves', 'gets to', 'reaches', 'enters', 'exits',
    'monitor', 'track when', 'ping me'
  ];

  const lowerMessage = message.toLowerCase();
  return commandKeywords.some(keyword => lowerMessage.includes(keyword));
}

/**
 * Get command metadata
 */
export function getCommandMetadata(commandType: CommandType): {
  requiresConfirmation: boolean;
  priority: string;
  description: string;
} {
  const commandDef = COMMAND_PATTERNS.find(cmd => cmd.type === commandType);

  // Special handling for geofence alert commands
  if (commandType === 'create_geofence_alert') {
    return {
      requiresConfirmation: false,
      priority: 'normal',
      description: 'Create location-based notification alert'
    }
  }
  
  if (commandType === 'list_geofence_alerts') {
    return {
      requiresConfirmation: false,
      priority: 'low',
      description: 'List active geofence alerts'
    }
  }
  
  if (commandType === 'cancel_geofence_alert') {
    return {
      requiresConfirmation: false,
      priority: 'normal',
      description: 'Cancel a geofence alert'
    }
  }

  if (!commandDef) {
    return {
      requiresConfirmation: true,
      priority: 'normal',
      description: 'Unknown command'
    };
  }

  const descriptions: Record<CommandType, string> = {
    lock: 'Lock vehicle doors',
    unlock: 'Unlock vehicle doors',
    immobilize: 'Disable vehicle engine (emergency use only)',
    restore: 'Restore vehicle engine functionality',
    set_speed_limit: 'Set maximum speed limit',
    clear_speed_limit: 'Remove speed limit restriction',
    enable_geofence: 'Enable geofence monitoring',
    disable_geofence: 'Disable geofence monitoring',
    request_location: 'Request current GPS location',
    request_status: 'Request vehicle status report',
    start_engine: 'Remote engine start',
    stop_engine: 'Remote engine stop (emergency use only)',
    sound_alarm: 'Sound alarm/horn to locate vehicle',
    silence_alarm: 'Silence active alarm',
    create_geofence_alert: 'Create location-based notification alert',
    list_geofence_alerts: 'List active geofence alerts',
    cancel_geofence_alert: 'Cancel a geofence alert',
    custom: 'Custom command'
  };

  return {
    requiresConfirmation: commandDef.requiresConfirmation,
    priority: commandDef.priority,
    description: descriptions[commandType] || 'Unknown command'
  };
}

/**
 * Validate command parameters
 */
export function validateCommandParameters(
  commandType: CommandType,
  parameters: Record<string, any>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  switch (commandType) {
    case 'set_speed_limit':
      if (!parameters.speed_limit) {
        errors.push('Speed limit value is required');
      } else if (parameters.speed_limit < 0 || parameters.speed_limit > 200) {
        errors.push('Speed limit must be between 0 and 200 km/h');
      }
      break;

    case 'enable_geofence':
      if (!parameters.geofence_name && !parameters.geofence_id) {
        errors.push('Geofence name or ID is required');
      }
      break;
      
    case 'create_geofence_alert':
      if (!parameters.location_name) {
        errors.push('Location name is required for geofence alert');
      }
      break;
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
