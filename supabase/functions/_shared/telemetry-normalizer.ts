/**
 * Vehicle Telemetry Normalizer
 * 
 * Centralized service for normalizing GPS51 telemetry data into consistent,
 * app-ready vehicle states. This module ensures all GPS51 fields are properly
 * converted and validated before storage or exposure to frontend.
 * 
 * Key Features:
 * - Smart speed unit detection and conversion (m/h → km/h)
 * - Multi-signal ignition detection with confidence scoring
 * - Configurable battery voltage mapping (12V/24V/48V)
 * - Signal strength normalization
 * - Coordinate validation
 * - Data quality scoring
 */

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Raw GPS51 data structure (varies by endpoint)
 */
export interface Gps51RawData {
  deviceid?: string;
  callat?: number | string; // latitude
  callon?: number | string; // longitude
  lat?: number | string;
  lon?: number | string;
  latitude?: number | string;
  longitude?: number | string;
  speed?: number;
  heading?: number;
  direction?: number;
  altitude?: number;
  status?: number | string; // JT808 bitmask or status code
  strstatus?: string | null; // Status string (e.g., "ACC ON")
  strstatusen?: string | null; // English status string
  moving?: number; // 0 or 1
  voltagev?: number; // Voltage in volts
  voltagepercent?: number; // Battery percentage (0-100)
  exvoltage?: number; // External voltage
  rxlevel?: number; // Signal strength (0-31 or 0-99)
  devicetime?: string | number;
  updatetime?: string | number;
  gpstime?: string | number;
  time?: string | number;
  currentoverspeedstate?: number; // 0 or 1
  totaldistance?: number; // Total mileage in meters
}

/**
 * Battery configuration for voltage-to-percentage mapping
 */
export interface BatteryConfig {
  nominalVoltage: 12 | 24 | 48;
  chemistry: 'lead_acid' | 'lithium' | 'agm';
  minVoltage: number;
  maxVoltage: number;
}

/**
 * Normalized vehicle state (output contract)
 */
export interface NormalizedVehicleState {
  vehicle_id: string;
  lat: number | null;
  lon: number | null;
  speed_kmh: number;
  ignition_on: boolean;
  ignition_confidence?: number; // 0.0 to 1.0
  ignition_detection_method?: IgnitionDetectionResult['detection_method'];
  is_moving: boolean;
  battery_level: number | null;
  signal_strength: number | null;
  heading: number | null;
  altitude: number | null;
  is_online: boolean;
  last_updated_at: string; // ISO8601
  timestamp_source: 'gps' | 'server';
  data_quality: 'high' | 'medium' | 'low';
}

// ============================================================================
// Default Configurations
// ============================================================================

const DEFAULT_12V_LEAD_ACID: BatteryConfig = {
  nominalVoltage: 12,
  chemistry: 'lead_acid',
  minVoltage: 11.0,
  maxVoltage: 12.8,
};

const DEFAULT_24V_LEAD_ACID: BatteryConfig = {
  nominalVoltage: 24,
  chemistry: 'lead_acid',
  minVoltage: 22.0,
  maxVoltage: 25.6,
};

const DEFAULT_48V_LITHIUM: BatteryConfig = {
  nominalVoltage: 48,
  chemistry: 'lithium',
  minVoltage: 40.0,
  maxVoltage: 54.4,
};

// ============================================================================
// Speed Normalization
// ============================================================================

/**
 * Normalize speed from GPS51 format to km/h
 * 
 * GPS51 typically returns speed in meters/hour (m/h), but some endpoints
 * may return km/h. This function detects the unit and normalizes to km/h.
 * 
 * Rules:
 * - If speed > 200, assume it's m/h and divide by 1000
 * - If speed <= 200, assume it's already km/h
 * - Apply threshold: < 3 km/h = 0 (stationary)
 * - Round to 1 decimal place
 */
export function normalizeSpeed(rawSpeed: number | null | undefined): number {
  if (rawSpeed === null || rawSpeed === undefined || isNaN(rawSpeed)) {
    return 0;
  }

  // Convert to number if it's a string (defensive)
  const numSpeed = typeof rawSpeed === 'string' ? parseFloat(rawSpeed) : rawSpeed;
  if (isNaN(numSpeed)) {
    console.warn(`[normalizeSpeed] Invalid speed value: ${rawSpeed}, returning 0`);
    return 0;
  }

  // Clamp negative values to 0
  const speed = Math.max(0, numSpeed);

  // Detect unit: if speed > 200, assume it's m/h (200 km/h is reasonable max)
  // GPS51 typically returns m/h, so values > 200 are likely m/h
  const speedKmh = speed > 200 ? speed / 1000 : speed;

  // Apply threshold: < 3 km/h = stationary (GPS drift/noise)
  if (speedKmh < 3) {
    return 0;
  }

  // Clamp unrealistic speeds (e.g., GPS jumps)
  const clampedSpeed = Math.min(speedKmh, 300); // Max 300 km/h

  // Round to 1 decimal place
  const result = Math.round(clampedSpeed * 10) / 10;
  
  // Debug: Log if we get a speed > 200 after normalization (shouldn't happen unless raw was > 200000)
  if (result > 200) {
    console.warn(`[normalizeSpeed] High normalized speed: raw=${rawSpeed}, normalized=${result} km/h`);
  }
  
  // Safety check: If result is between 200-1000, this is definitely wrong (should be m/h)
  // This shouldn't happen, but if it does, the original raw speed was likely in m/h
  // and we need to normalize it again
  if (result > 200 && result < 1000) {
    console.error(`[normalizeSpeed] ERROR: Speed ${result} is in m/h range but wasn't normalized! raw=${rawSpeed}`);
    // Force normalize: divide by 1000, apply threshold, clamp
    const forcedNormalized = result / 1000;
    if (forcedNormalized < 3) {
      return 0;
    }
    return Math.round(Math.min(forcedNormalized, 300) * 10) / 10;
  }
  
  return result;
}

// ============================================================================
// Ignition Detection
// ============================================================================

/**
 * Ignition detection result with confidence scoring
 */
export interface IgnitionDetectionResult {
  ignition_on: boolean;
  confidence: number; // 0.0 to 1.0
  detection_method: 'status_bit' | 'string_parse' | 'speed_inference' | 'multi_signal' | 'unknown';
  signals: {
    status_bit?: boolean;
    strstatus_match?: boolean;
    speed_based?: boolean;
    moving_status?: boolean;
  };
}

/**
 * GPS51 ACC detection result with confidence scoring
 * 
 * GPS51 extends JT/T 808 with a 32-bit status field:
 * - Lower 16 bits: Standard JT808 status (bit 0 = ACC)
 * - Upper 16 bits: Extended GPS51 status (bit 0 = extended ACC)
 */
interface AccDetectionResult {
  acc_detected: boolean;
  confidence: number; // 0.0 to 1.0
  base_acc: boolean; // JT808 base ACC bit (bit 0 of lower 16 bits)
  extended_acc: boolean; // GPS51 extended ACC bit (bit 0 of upper 16 bits)
  base_status: number; // Lower 16 bits (JT808 status)
  extended_status: number; // Upper 16 bits (GPS51 extended)
}

/**
 * Check GPS51/JT808 status for ACC (ignition) detection
 * 
 * GPS51 Protocol:
 * - Status is a 32-bit integer (not just 16-bit)
 * - Base JT808 status = status & 0xFFFF (lower 16 bits, bit 0 = ACC)
 * - Extended GPS51 status = status >>> 16 (upper 16 bits, bit 0 = extended ACC)
 * 
 * Confidence Scoring:
 * - Base JT808 ACC bit (bit 0): +0.6 confidence
 * - Extended GPS51 ACC bit (bit 16): +0.2 confidence
 * - Speed > 3 km/h: +0.2 confidence (added by caller)
 * - Total confidence >= 0.5 → ignition ON
 * 
 * Example values:
 * - 262150 (0x40006) = base=6 (0x0006), extended=4 (0x0004)
 *   - Base bit 0: OFF (0x0006 & 0x01 = 0)
 *   - Extended bit 0: OFF (0x0004 & 0x01 = 0)
 * - 262151 (0x40007) = base=7 (0x0007), extended=4 (0x0004)
 *   - Base bit 0: ON (0x0007 & 0x01 = 1) → confidence 0.6
 * - 65537 (0x10001) = base=1 (0x0001), extended=1 (0x0001)
 *   - Base bit 0: ON → confidence 0.6
 *   - Extended bit 0: ON → confidence 0.8 total
 */
function checkJt808AccBit(
  status: number | string | null | undefined,
  speedKmh: number = 0
): AccDetectionResult {
  // Default result: no ACC detected, zero confidence
  const defaultResult: AccDetectionResult = {
    acc_detected: false,
    confidence: 0.0,
    base_acc: false,
    extended_acc: false,
    base_status: 0,
    extended_status: 0,
  };

  if (status === null || status === undefined) return defaultResult;
  
  // Parse string status to number
  if (typeof status === 'string') {
    const numStatus = parseInt(status, 10);
    if (isNaN(numStatus)) return defaultResult;
    status = numStatus;
  }

  // Validate status is a valid number
  if (typeof status !== 'number' || isNaN(status)) return defaultResult;

  // Reject negative values (invalid)
  if (status < 0) {
    return defaultResult;
  }
  
  // Treat status as 32-bit unsigned integer
  // GPS51 extends JT808 with upper 16 bits for extended status
  const status32 = status >>> 0; // Ensure unsigned 32-bit integer
  
  // Extract base JT808 status (lower 16 bits) and extended GPS51 status (upper 16 bits)
  const baseStatus = status32 & 0xFFFF; // Lower 16 bits (standard JT808)
  const extendedStatus = status32 >>> 16; // Upper 16 bits (GPS51 extended)
  
  // Check ACC bit in base JT808 status (bit 0)
  // JT808 standard: bit 0 = ACC (ignition) status
  const baseAcc = (baseStatus & 0x01) === 0x01;
  
  // Check ACC bit in extended GPS51 status (bit 0 of upper 16 bits)
  // GPS51 extension: bit 16 (bit 0 of extended) = extended ACC indicator
  const extendedAcc = (extendedStatus & 0x01) === 0x01;
  
  // Calculate confidence score
  let confidence = 0.0;
  
  // Base JT808 ACC bit: +0.6 confidence (most reliable)
  if (baseAcc) {
    confidence += 0.6;
  }
  
  // Extended GPS51 ACC bit: +0.2 confidence (supplementary signal)
  if (extendedAcc) {
    confidence += 0.2;
  }
  
  // Speed > 3 km/h: +0.2 confidence (vehicle is moving, likely ignition on)
  if (speedKmh > 3) {
    confidence += 0.2;
  }
  
  // Cap confidence at 1.0
  confidence = Math.min(confidence, 1.0);
  
  // Determine ACC status: require confidence >= 0.5
  const accDetected = confidence >= 0.5;
  
  // Log conflicts: when confidence < 0.5 BUT signals disagree
  // This indicates potential issue with status field interpretation
  if (confidence < 0.5 && (baseAcc || extendedAcc || speedKmh > 3)) {
    // Signals conflict: some signals say ON, but confidence too low
    const signals = [];
    if (baseAcc) signals.push('base_acc=ON');
    if (extendedAcc) signals.push('ext_acc=ON');
    if (speedKmh > 3) signals.push(`speed=${speedKmh}km/h`);
    
    console.warn(
      `[checkJt808AccBit] Low confidence ACC detection (${confidence.toFixed(2)}): ` +
      `status=${status32} (base=0x${baseStatus.toString(16)}, ext=0x${extendedStatus.toString(16)}), ` +
      `signals=[${signals.join(', ')}]`
    );
  }
  
  // Debug logging when ACC detected (only if logging enabled)
  if (accDetected && Deno.env.get('LOG_IGNITION_DETECTION') === 'true') {
    console.log(
      `[checkJt808AccBit] ACC ON detected: confidence=${confidence.toFixed(2)}, ` +
      `status=${status32} (base=0x${baseStatus.toString(16)}, ext=0x${extendedStatus.toString(16)}), ` +
      `base_acc=${baseAcc}, ext_acc=${extendedAcc}, speed=${speedKmh}km/h`
    );
  }
  
  return {
    acc_detected: accDetected,
    confidence,
    base_acc: baseAcc,
    extended_acc: extendedAcc,
    base_status: baseStatus,
    extended_status: extendedStatus,
  };
}

/**
 * Enhanced string parsing for ACC status with multiple patterns
 * Supports both English and Chinese patterns
 */
function parseAccFromString(strstatus: string | null | undefined): boolean {
  if (!strstatus) return false;
  
  const statusUpper = strstatus.toUpperCase();
  
  // Chinese patterns: ACC开 = ON, ACC关 = OFF
  const chineseOnPattern = /ACC[开]/i;
  const chineseOffPattern = /ACC[关]/i;
  
  // Check Chinese patterns first
  if (chineseOffPattern.test(strstatus)) {
    return false; // ACC关 = OFF
  }
  if (chineseOnPattern.test(strstatus)) {
    return true; // ACC开 = ON
  }
  
  // Explicit ACC ON patterns (English)
  const onPatterns = [
    /ACC\s*ON\b/i,
    /ACC:ON/i,
    /ACC_ON/i,
    /\bACC\s*=\s*ON\b/i,
  ];
  
  // Explicit ACC OFF patterns (English)
  const offPatterns = [
    /ACC\s*OFF\b/i,
    /ACC:OFF/i,
    /ACC_OFF/i,
    /\bACC\s*=\s*OFF\b/i,
  ];
  
  // Check for explicit OFF first (takes precedence)
  for (const pattern of offPatterns) {
    if (pattern.test(statusUpper)) {
      return false;
    }
  }
  
  // Check for explicit ON
  for (const pattern of onPatterns) {
    if (pattern.test(statusUpper)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Detect ignition status using multi-signal confidence scoring
 * 
 * Enhanced GPS51/JT808 implementation with 32-bit status support.
 * 
 * Detection priority:
 * 1. GPS51/JT808 status bits (base + extended, confidence-based)
 * 2. String parsing (high confidence - 0.8-0.9)
 * 3. Speed inference (fallback, low confidence)
 * 
 * Confidence scoring:
 * - Base JT808 ACC (bit 0): +0.6
 * - Extended GPS51 ACC (bit 16): +0.2
 * - Speed > 3 km/h: +0.2
 * - Threshold: ignition_on = confidence >= 0.5
 * 
 * Returns detailed result with confidence and detection method for monitoring.
 */
export function detectIgnition(
  raw: Gps51RawData,
  speedKmh: number
): IgnitionDetectionResult {
  const signals: IgnitionDetectionResult['signals'] = {};
  
  // Priority 1: GPS51/JT808 status bit detection (with confidence scoring)
  // This now handles 32-bit status values with base + extended ACC bits
  if (raw.status !== null && raw.status !== undefined) {
    const accResult = checkJt808AccBit(raw.status, speedKmh);
    
    // Record the status bit signal
    signals.status_bit = accResult.acc_detected;
    
    // If confidence >= 0.5, trust the status bit result
    // This handles cases where base ACC, extended ACC, and/or speed combine
    if (accResult.confidence >= 0.5) {
      return {
        ignition_on: accResult.acc_detected,
        confidence: accResult.confidence,
        detection_method: 'status_bit',
        signals
      };
    }
    
    // If confidence < 0.5, continue to other detection methods
    // But keep the partial confidence from status bits for potential combination
  }
  
  // Priority 2: String parsing (fallback if status bit insufficient)
  const strstatus = raw.strstatus || raw.strstatusen || '';
  
  if (strstatus) {
    // Check for Chinese ACC patterns (ACC关 = ACC OFF, ACC开 = ACC ON)
    // Also check for English patterns
    const hasChineseAccPattern = /ACC[关开]/i.test(strstatus);
    const hasEnglishAccPattern = /ACC\s*(ON|OFF|:ON|:OFF|_ON|_OFF|=ON|=OFF)/i.test(strstatus);
    
    if (hasChineseAccPattern || hasEnglishAccPattern) {
      // Parse Chinese patterns: ACC关 = OFF, ACC开 = ON
      let stringParseResult = false;
      if (hasChineseAccPattern) {
        stringParseResult = /ACC开/i.test(strstatus); // ACC开 = ON
      } else {
        stringParseResult = parseAccFromString(strstatus);
      }
      
      signals.strstatus_match = stringParseResult;
      
      // High confidence for explicit string matches (both ON and OFF)
      return {
        ignition_on: stringParseResult, // true for ACC ON, false for ACC OFF
        confidence: 0.9,
        detection_method: 'string_parse',
        signals
      };
    }
    // If strstatus exists but no ACC pattern found, continue to multi-signal detection
  }
  
  // Priority 3: Speed-based inference (low confidence, only if no other signals)
  // Only use if speed is significant (> 5 km/h) to avoid GPS drift false positives
  const speedBased = speedKmh > 5;
  signals.speed_based = speedBased;
  
  const movingBased = raw.moving === 1 && speedKmh > 3;
  signals.moving_status = movingBased;
  
  // Multi-signal detection: combine speed and moving status
  // Requires at least speed OR moving status for confidence
  let confidence = 0;
  let signalCount = 0;
  
  if (speedBased) {
    confidence += 0.4;
    signalCount++;
  }
  
  if (movingBased) {
    confidence += 0.3;
    signalCount++;
  }
  
  // Multi-signal detection requires at least 2 signals for confidence >= 0.6
  if (signalCount >= 2) {
    return {
      ignition_on: true,
      confidence: Math.min(confidence, 0.7), // Cap at 0.7 for speed-based
      detection_method: 'multi_signal',
      signals
    };
  }
  
  // If we have some signals but not enough, use low confidence
  if (signalCount === 1) {
    return {
      ignition_on: speedBased || movingBased,
      confidence: 0.3,
      detection_method: 'speed_inference',
      signals
    };
  }
  
  // No reliable signals available
  return {
    ignition_on: false,
    confidence: 0.0,
    detection_method: 'unknown',
    signals
  };
}

/**
 * Backward compatibility wrapper - returns boolean for existing code
 * @deprecated Use detectIgnition() which returns IgnitionDetectionResult
 */
export function detectIgnitionSimple(
  raw: Gps51RawData,
  speedKmh: number
): boolean {
  const result = detectIgnition(raw, speedKmh);
  // Require at least 0.5 confidence for ignition ON
  return result.ignition_on && result.confidence >= 0.5;
}

// ============================================================================
// Battery Voltage Mapping
// ============================================================================

/**
 * Map voltage to percentage for lead-acid batteries (non-linear curve)
 */
function mapLeadAcidVoltage(voltageV: number, config: BatteryConfig): number {
  const { minVoltage, maxVoltage } = config;
  const range = maxVoltage - minVoltage;

  // Lead-acid has non-linear discharge curve
  // Below 12.0V (for 12V) is critical, above 12.6V is full
  if (voltageV >= maxVoltage) return 100;
  if (voltageV <= minVoltage) return 0;

  // Non-linear mapping for lead-acid
  // Critical zone: 11.8-12.0V (0-25%)
  // Low zone: 12.0-12.2V (25-50%)
  // Medium zone: 12.2-12.4V (50-75%)
  // High zone: 12.4-12.6V (75-100%)
  const normalizedVoltage = (voltageV - minVoltage) / range;

  // Apply non-linear curve (exponential)
  const percentage = Math.pow(normalizedVoltage, 1.5) * 100;

  return Math.max(0, Math.min(100, Math.round(percentage)));
}

/**
 * Map voltage to percentage for lithium batteries (more linear)
 */
function mapLithiumVoltage(voltageV: number, config: BatteryConfig): number {
  const { minVoltage, maxVoltage } = config;
  const range = maxVoltage - minVoltage;

  if (voltageV >= maxVoltage) return 100;
  if (voltageV <= minVoltage) return 0;

  // Lithium has more linear discharge curve
  const normalizedVoltage = (voltageV - minVoltage) / range;
  const percentage = normalizedVoltage * 100;

  return Math.max(0, Math.min(100, Math.round(percentage)));
}

/**
 * Map voltage to percentage for AGM batteries (similar to lead-acid but slightly different)
 */
function mapAgmVoltage(voltageV: number, config: BatteryConfig): number {
  // AGM is similar to lead-acid but with slightly different curve
  return mapLeadAcidVoltage(voltageV, config);
}

/**
 * Map voltage (volts) to battery percentage (0-100)
 * 
 * Supports different battery types and voltages:
 * - 12V, 24V, 48V systems
 * - Lead-acid (non-linear), Lithium (linear), AGM
 */
export function mapVoltageToPercentage(
  voltageV: number | null | undefined,
  config: BatteryConfig = DEFAULT_12V_LEAD_ACID
): number | null {
  if (voltageV === null || voltageV === undefined || isNaN(voltageV) || voltageV <= 0) {
    return null;
  }

  // Clamp voltage to reasonable range
  const clampedVoltage = Math.max(0, Math.min(voltageV, 100));

  let percentage: number;

  switch (config.chemistry) {
    case 'lead_acid':
      percentage = mapLeadAcidVoltage(clampedVoltage, config);
      break;
    case 'lithium':
      percentage = mapLithiumVoltage(clampedVoltage, config);
      break;
    case 'agm':
      percentage = mapAgmVoltage(clampedVoltage, config);
      break;
    default:
      // Default to lead-acid mapping
      percentage = mapLeadAcidVoltage(clampedVoltage, config);
  }

  return percentage;
}

/**
 * Normalize battery level from GPS51 data
 * 
 * Priority order:
 * 1. voltagepercent (if > 0)
 * 2. voltagev (mapped to percentage)
 * 3. null (no data)
 */
export function normalizeBatteryLevel(
  raw: Gps51RawData,
  batteryConfig?: BatteryConfig
): number | null {
  // Priority 1: voltagepercent (preferred)
  if (raw.voltagepercent !== null && raw.voltagepercent !== undefined && raw.voltagepercent > 0) {
    // Clamp to 0-100 range
    return Math.max(0, Math.min(100, Math.round(raw.voltagepercent)));
  }

  // Priority 2: voltagev (derive from voltage)
  if (raw.voltagev !== null && raw.voltagev !== undefined && raw.voltagev > 0) {
    const config = batteryConfig || DEFAULT_12V_LEAD_ACID;
    return mapVoltageToPercentage(raw.voltagev, config);
  }

  // Priority 3: exvoltage (external voltage, less reliable)
  if (raw.exvoltage !== null && raw.exvoltage !== undefined && raw.exvoltage > 0) {
    const config = batteryConfig || DEFAULT_12V_LEAD_ACID;
    return mapVoltageToPercentage(raw.exvoltage, config);
  }

  return null;
}

// ============================================================================
// Signal Strength Normalization
// ============================================================================

/**
 * Normalize signal strength (rxlevel) to 0-100 percentage
 * 
 * GPS51 rxlevel can be:
 * - 0-31 scale (common)
 * - 0-99 scale (some devices)
 * - Already 0-100 percentage
 */
export function normalizeSignalStrength(
  rxlevel: number | null | undefined
): number | null {
  if (rxlevel === null || rxlevel === undefined || isNaN(rxlevel)) {
    return null;
  }

  // Clamp negative values
  const level = Math.max(0, rxlevel);

  // 0-31 scale (most common)
  if (level <= 31) {
    return Math.round((level / 31) * 100);
  }

  // 0-99 scale
  if (level <= 99) {
    return Math.round((level / 99) * 100);
  }

  // Already percentage (0-100), clamp to max 100
  return Math.min(100, Math.round(level));
}

// ============================================================================
// Coordinate Validation
// ============================================================================

/**
 * Validate GPS coordinates
 * 
 * Rejects:
 * - Out-of-range lat/lon
 * - Null island (0,0) - common GPS error
 */
export function validateCoordinates(
  lat: number | null | undefined,
  lon: number | null | undefined
): boolean {
  if (lat === null || lat === undefined || lon === null || lon === undefined) {
    return false;
  }

  if (isNaN(lat) || isNaN(lon)) {
    return false;
  }

  // Check valid ranges
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return false;
  }

  // Reject null island (0,0) - common GPS error
  if (lat === 0 && lon === 0) {
    return false;
  }

  return true;
}

/**
 * Extract and normalize coordinates from GPS51 data
 */
export function normalizeCoordinates(raw: Gps51RawData): {
  lat: number | null;
  lon: number | null;
} {
  // Try multiple field names (GPS51 uses different names in different endpoints)
  const lat = parseFloat(
    String(raw.callat || raw.lat || raw.latitude || '')
  );
  const lon = parseFloat(
    String(raw.callon || raw.lon || raw.lng || raw.longitude || '')
  );

  if (!validateCoordinates(lat, lon)) {
    return { lat: null, lon: null };
  }

  return { lat, lon };
}

// ============================================================================
// Timestamp Normalization
// ============================================================================

/**
 * Extract and normalize timestamp from GPS51 data
 * 
 * Returns ISO8601 string and indicates source (GPS time vs server time)
 */
export function normalizeTimestamp(raw: Gps51RawData): {
  timestamp: string;
  source: 'gps' | 'server';
} {
  // Priority: GPS time > device time > update time > server time
  const gpsTime = raw.gpstime || raw.devicetime;
  const serverTime = raw.updatetime || raw.time;

  if (gpsTime) {
    try {
      const date = new Date(gpsTime);
      if (!isNaN(date.getTime())) {
        return {
          timestamp: date.toISOString(),
          source: 'gps',
        };
      }
    } catch (e) {
      // Invalid GPS time, fall through
    }
  }

  if (serverTime) {
    try {
      const date = new Date(serverTime);
      if (!isNaN(date.getTime())) {
        return {
          timestamp: date.toISOString(),
          source: 'server',
        };
      }
    } catch (e) {
      // Invalid server time, fall through
    }
  }

  // Fallback to current time
  return {
    timestamp: new Date().toISOString(),
    source: 'server',
  };
}

// ============================================================================
// Data Quality Scoring
// ============================================================================

/**
 * Calculate data quality score for normalized state
 * 
 * Returns 'high', 'medium', or 'low' based on available data fields
 */
export function calculateDataQuality(
  normalized: NormalizedVehicleState
): 'high' | 'medium' | 'low' {
  let score = 0;

  // Coordinates (2 points - most important)
  if (normalized.lat !== null && normalized.lon !== null) {
    score += 2;
  }

  // Speed (1 point)
  if (normalized.speed_kmh !== null && normalized.speed_kmh > 0) {
    score += 1;
  }

  // Battery level (1 point)
  if (normalized.battery_level !== null) {
    score += 1;
  }

  // Ignition status (1 point)
  if (normalized.ignition_on !== null) {
    score += 1;
  }

  // Signal strength (1 point)
  if (normalized.signal_strength !== null) {
    score += 1;
  }

  // Determine quality level
  if (score >= 5) return 'high';
  if (score >= 3) return 'medium';
  return 'low';
}

// ============================================================================
// Main Normalization Function
// ============================================================================

/**
 * Normalize GPS51 raw data to standardized vehicle state
 * 
 * This is the main entry point for telemetry normalization.
 * All GPS51 data should pass through this function before storage or exposure.
 */
export function normalizeVehicleTelemetry(
  raw: Gps51RawData,
  options: {
    batteryConfig?: BatteryConfig;
    offlineThresholdMs?: number; // Default: 10 minutes
  } = {}
): NormalizedVehicleState {
  const { batteryConfig, offlineThresholdMs = 600000 } = options;

  // Extract vehicle ID
  const vehicleId = raw.deviceid || '';

  // Normalize coordinates
  const { lat, lon } = normalizeCoordinates(raw);

  // Normalize speed
  const speedKmh = normalizeSpeed(raw.speed);

  // Detect ignition (returns detailed result with confidence)
  const ignitionResult = detectIgnition(raw, speedKmh);
  const ignitionOn = ignitionResult.ignition_on;

  // Determine if moving (speed > 3 km/h or moving flag set)
  const isMoving = speedKmh > 3 || raw.moving === 1;

  // Normalize battery level
  const batteryLevel = normalizeBatteryLevel(raw, batteryConfig);

  // Normalize signal strength
  const signalStrength = normalizeSignalStrength(raw.rxlevel);

  // Extract heading
  const heading = raw.heading !== null && raw.heading !== undefined
    ? (raw.direction || raw.heading)
    : null;
  const normalizedHeading = heading !== null && !isNaN(Number(heading))
    ? Number(heading)
    : null;

  // Extract altitude
  const altitude = raw.altitude !== null && raw.altitude !== undefined && !isNaN(raw.altitude)
    ? Number(raw.altitude)
    : null;

  // Determine online status (based on timestamp freshness)
  const { timestamp, source } = normalizeTimestamp(raw);
  const timestampDate = new Date(timestamp);
  const isOnline = Date.now() - timestampDate.getTime() < offlineThresholdMs;

  // Build normalized state
  const normalized: NormalizedVehicleState = {
    vehicle_id: vehicleId,
    lat,
    lon,
    speed_kmh: speedKmh,
    ignition_on: ignitionOn,
    ignition_confidence: ignitionResult.confidence,
    ignition_detection_method: ignitionResult.detection_method,
    is_moving: isMoving,
    battery_level: batteryLevel,
    signal_strength: signalStrength,
    heading: normalizedHeading,
    altitude,
    is_online: isOnline,
    last_updated_at: timestamp,
    timestamp_source: source,
    data_quality: 'medium', // Will be calculated below
  };

  // Calculate data quality
  normalized.data_quality = calculateDataQuality(normalized);

  return normalized;
}

// ============================================================================
// Export Default Configurations
// ============================================================================

export const DEFAULT_BATTERY_CONFIGS = {
  '12v_lead_acid': DEFAULT_12V_LEAD_ACID,
  '24v_lead_acid': DEFAULT_24V_LEAD_ACID,
  '48v_lithium': DEFAULT_48V_LITHIUM,
};


