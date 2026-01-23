/**
 * Vehicle status utility functions
 * Provides consistent offline/online status indication across the PWA
 */

export type VehicleStatus = 'online' | 'offline' | 'moving' | 'stopped' | 'charging';

export interface VehicleStatusInfo {
  status: VehicleStatus;
  label: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  className: string;
  icon: string; // Icon name from lucide-react
  description: string;
}

/**
 * Determines vehicle status from data
 */
export function getVehicleStatus(
  isOnline: boolean,
  speed: number | null | undefined,
  hasValidCoords: boolean,
  batteryPercent: number | null | undefined,
  ignitionOn: boolean | null | undefined
): VehicleStatus {
  if (!isOnline) {
    return 'offline';
  }
  
  if (!hasValidCoords) {
    return 'offline'; // No GPS = offline
  }
  
  // Charging status (if battery is increasing or ignition is on but speed is 0)
  if (ignitionOn && (speed === 0 || !speed)) {
    return 'charging';
  }
  
  // Moving vs stopped
  if (speed && speed > 0) {
    return 'moving';
  }
  
  return 'stopped';
}

/**
 * Gets status information for display
 */
export function getVehicleStatusInfo(
  status: VehicleStatus,
  offlineDuration?: string | null
): VehicleStatusInfo {
  switch (status) {
    case 'offline':
      return {
        status: 'offline',
        label: 'Offline',
        variant: 'outline',
        className: 'bg-muted/50 text-muted-foreground border-muted',
        icon: 'WifiOff',
        description: offlineDuration 
          ? `Offline for ${offlineDuration}`
          : 'Vehicle is offline - no GPS connection'
      };
    
    case 'moving':
      return {
        status: 'moving',
        label: 'Moving',
        variant: 'default',
        className: 'bg-green-500/20 text-green-400 border-green-500/30',
        icon: 'Navigation',
        description: 'Vehicle is moving'
      };
    
    case 'stopped':
      return {
        status: 'stopped',
        label: 'Stopped',
        variant: 'secondary',
        className: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
        icon: 'Wifi',
        description: 'Vehicle is stopped'
      };
    
    case 'charging':
      return {
        status: 'charging',
        label: 'Charging',
        variant: 'secondary',
        className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
        icon: 'Battery',
        description: 'Vehicle is charging'
      };
    
    default:
      return {
        status: 'offline',
        label: 'Unknown',
        variant: 'outline',
        className: 'bg-muted/50 text-muted-foreground',
        icon: 'AlertCircle',
        description: 'Status unknown'
      };
  }
}

/**
 * Gets offline duration string from last update time
 */
export function getOfflineDuration(lastUpdate: Date | null | undefined): string | null {
  if (!lastUpdate) return null;
  
  const now = new Date();
  const diffMs = now.getTime() - lastUpdate.getTime();
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

/**
 * Checks if vehicle should be considered offline
 */
export function isVehicleOffline(
  isOnline: boolean | null | undefined,
  lastUpdate: Date | null | undefined,
  offlineThresholdMinutes: number = 10
): boolean {
  if (!isOnline) return true;
  
  if (!lastUpdate) return true;
  
  const now = new Date();
  const diffMs = now.getTime() - lastUpdate.getTime();
  const diffMinutes = diffMs / 60000;
  
  return diffMinutes > offlineThresholdMinutes;
}
