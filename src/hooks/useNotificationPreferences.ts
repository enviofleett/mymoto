import { useState, useEffect, useCallback } from "react";

export type AlertType = 
  | 'low_battery'
  | 'critical_battery'
  | 'overspeeding'
  | 'harsh_braking'
  | 'rapid_acceleration'
  | 'ignition_on'
  | 'ignition_off'
  | 'geofence_enter'
  | 'geofence_exit'
  | 'idle_too_long'
  | 'offline'
  | 'online'
  | 'predictive_briefing';

export type SeverityLevel = 'info' | 'warning' | 'error' | 'critical';

export interface NotificationPreferences {
  // Master toggles
  soundEnabled: boolean;
  pushEnabled: boolean;
  
  // Per-severity settings
  severitySettings: {
    [key in SeverityLevel]: {
      sound: boolean;
      push: boolean;
    };
  };
  
  // Per-alert type settings (overrides severity if explicitly set)
  alertTypeSettings: {
    [key in AlertType]?: {
      sound: boolean;
      push: boolean;
    };
  };
  
  // Sound volume (0-1)
  soundVolume: number;
  
  // Quiet hours
  quietHoursEnabled: boolean;
  quietHoursStart: string; // HH:mm format
  quietHoursEnd: string;   // HH:mm format
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  soundEnabled: true,
  pushEnabled: true,
  severitySettings: {
    critical: { sound: true, push: true },
    error: { sound: true, push: true },
    warning: { sound: true, push: false },
    info: { sound: false, push: false }
  },
  alertTypeSettings: {},
  soundVolume: 0.5,
  quietHoursEnabled: false,
  quietHoursStart: "22:00",
  quietHoursEnd: "07:00"
};

const STORAGE_KEY = 'notification-preferences';

export function useNotificationPreferences() {
  const [preferences, setPreferencesState] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load preferences from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Merge with defaults to handle new properties
        setPreferencesState({
          ...DEFAULT_PREFERENCES,
          ...parsed,
          severitySettings: {
            ...DEFAULT_PREFERENCES.severitySettings,
            ...parsed.severitySettings
          }
        });
      }
    } catch (e) {
      console.error('Error loading notification preferences:', e);
    }
    setIsLoaded(true);
  }, []);

  // Save preferences to localStorage
  const setPreferences = useCallback((newPrefs: Partial<NotificationPreferences>) => {
    setPreferencesState(prev => {
      const updated = { ...prev, ...newPrefs };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        console.error('Error saving notification preferences:', e);
      }
      return updated;
    });
  }, []);

  // Check if currently in quiet hours
  const isInQuietHours = useCallback((): boolean => {
    if (!preferences.quietHoursEnabled) return false;
    
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    
    const [startH, startM] = preferences.quietHoursStart.split(':').map(Number);
    const [endH, endM] = preferences.quietHoursEnd.split(':').map(Number);
    
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    
    // Handle overnight quiet hours (e.g., 22:00 to 07:00)
    if (startMinutes > endMinutes) {
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
    
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }, [preferences.quietHoursEnabled, preferences.quietHoursStart, preferences.quietHoursEnd]);

  // Check if sound should play for a given alert
  const shouldPlaySound = useCallback((alertType: AlertType, severity: SeverityLevel): boolean => {
    if (!preferences.soundEnabled) return false;
    if (isInQuietHours()) return false;
    
    // Check alert-specific override first
    const alertOverride = preferences.alertTypeSettings[alertType];
    if (alertOverride !== undefined) {
      return alertOverride.sound;
    }
    
    // Fall back to severity setting
    return preferences.severitySettings[severity]?.sound ?? false;
  }, [preferences, isInQuietHours]);

  // Check if push notification should show for a given alert
  const shouldShowPush = useCallback((alertType: AlertType, severity: SeverityLevel): boolean => {
    if (!preferences.pushEnabled) return false;
    // Note: Push notifications still work during quiet hours (they're silent on device)
    
    // Check alert-specific override first
    const alertOverride = preferences.alertTypeSettings[alertType];
    if (alertOverride !== undefined) {
      return alertOverride.push;
    }
    
    // Fall back to severity setting
    return preferences.severitySettings[severity]?.push ?? false;
  }, [preferences]);

  // Update severity settings
  const updateSeveritySettings = useCallback((
    severity: SeverityLevel, 
    settings: Partial<{ sound: boolean; push: boolean }>
  ) => {
    setPreferences({
      severitySettings: {
        ...preferences.severitySettings,
        [severity]: {
          ...preferences.severitySettings[severity],
          ...settings
        }
      }
    });
  }, [preferences.severitySettings, setPreferences]);

  // Update alert type settings
  const updateAlertTypeSettings = useCallback((
    alertType: AlertType,
    settings: { sound: boolean; push: boolean } | undefined
  ) => {
    const newAlertSettings = { ...preferences.alertTypeSettings };
    if (settings === undefined) {
      delete newAlertSettings[alertType];
    } else {
      newAlertSettings[alertType] = settings;
    }
    setPreferences({ alertTypeSettings: newAlertSettings });
  }, [preferences.alertTypeSettings, setPreferences]);

  // Reset to defaults
  const resetToDefaults = useCallback(() => {
    setPreferencesState(DEFAULT_PREFERENCES);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_PREFERENCES));
    } catch (e) {
      console.error('Error resetting notification preferences:', e);
    }
  }, []);

  return {
    preferences,
    isLoaded,
    setPreferences,
    shouldPlaySound,
    shouldShowPush,
    updateSeveritySettings,
    updateAlertTypeSettings,
    resetToDefaults,
    isInQuietHours
  };
}

// Alert type display names
export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  low_battery: 'Low Battery',
  critical_battery: 'Critical Battery',
  overspeeding: 'Overspeeding',
  harsh_braking: 'Harsh Braking',
  rapid_acceleration: 'Rapid Acceleration',
  ignition_on: 'Ignition On',
  ignition_off: 'Ignition Off',
  geofence_enter: 'Geofence Entry',
  geofence_exit: 'Geofence Exit',
  idle_too_long: 'Extended Idle',
  offline: 'Vehicle Offline',
  online: 'Vehicle Online',
  predictive_briefing: 'Trip Briefing'
};

// Alert type descriptions
export const ALERT_TYPE_DESCRIPTIONS: Record<AlertType, string> = {
  low_battery: 'Battery level drops below 20%',
  critical_battery: 'Battery level drops below 10%',
  overspeeding: 'Vehicle exceeds speed limit',
  harsh_braking: 'Sudden hard braking detected',
  rapid_acceleration: 'Aggressive acceleration detected',
  ignition_on: 'Vehicle ignition turned on',
  ignition_off: 'Vehicle ignition turned off',
  geofence_enter: 'Vehicle enters a geofence zone',
  geofence_exit: 'Vehicle leaves a geofence zone',
  idle_too_long: 'Vehicle idle for extended period',
  offline: 'Vehicle loses GPS connection',
  online: 'Vehicle reconnects after being offline',
  predictive_briefing: 'AI predicts an upcoming trip based on habits'
};
