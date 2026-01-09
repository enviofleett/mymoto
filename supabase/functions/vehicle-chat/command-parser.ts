/**
 * Natural Language Command Parser
 *
 * Parses user messages to detect and extract vehicle commands
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
  | 'custom';

export interface ParsedCommand {
  isCommand: boolean;
  commandType: CommandType | null;
  confidence: number; // 0-1
  parameters: Record<string, any>;
  originalText: string;
  normalizedText: string;
}

interface CommandPattern {
  type: CommandType;
  patterns: RegExp[];
  parameterExtractors?: Record<string, RegExp>;
  requiresConfirmation: boolean;
  priority: 'low' | 'normal' | 'high' | 'urgent';
}

// Command pattern definitions
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
    'geofence', 'speed limit', 'engine', 'restore'
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
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
