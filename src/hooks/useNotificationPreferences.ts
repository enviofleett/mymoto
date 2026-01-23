import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AlertType = 
  | 'low_battery'
  | 'critical_battery'
  | 'overspeeding'
  | 'harsh_braking'
  | 'rapid_acceleration'
  | 'ignition_on'
  | 'ignition_off'
  | 'vehicle_moving'
  | 'geofence_enter'
  | 'geofence_exit'
  | 'idle_too_long'
  | 'offline'
  | 'online'
  | 'predictive_briefing';

export type SeverityLevel = 'info' | 'warning' | 'error' | 'critical';

export interface AIChatPreferences {
  ignition_start: boolean;
  geofence_event: boolean;
  overspeeding: boolean;
  low_battery: boolean;
  power_off: boolean;
}

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
  
  // AI Chat preferences (opt-in, default false)
  aiChatPreferences: AIChatPreferences;
  
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
  alertTypeSettings: {
    // Override defaults for important vehicle events
    ignition_on: { sound: false, push: true },  // Show push notification, no sound
    ignition_off: { sound: false, push: true },  // Show push notification, no sound
    vehicle_moving: { sound: false, push: true }, // Show push notification, no sound
    overspeeding: { sound: true, push: true },   // Show push with sound (important)
  },
  aiChatPreferences: {
    ignition_start: false,
    geofence_event: false,
    overspeeding: false,
    low_battery: false,
    power_off: false
  },
  soundVolume: 0.5,
  quietHoursEnabled: false,
  quietHoursStart: "22:00",
  quietHoursEnd: "07:00"
};

const STORAGE_KEY = 'notification-preferences';

export function useNotificationPreferences() {
  const [preferences, setPreferencesState] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load preferences from localStorage and database on mount
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        // Load from localStorage first
        const stored = localStorage.getItem(STORAGE_KEY);
        let loadedPrefs = DEFAULT_PREFERENCES;
        
        if (stored) {
          const parsed = JSON.parse(stored);
          loadedPrefs = {
            ...DEFAULT_PREFERENCES,
            ...parsed,
            severitySettings: {
              ...DEFAULT_PREFERENCES.severitySettings,
              ...parsed.severitySettings
            },
            aiChatPreferences: {
              ...DEFAULT_PREFERENCES.aiChatPreferences,
              ...(parsed.aiChatPreferences || {})
            }
          };
        }
        
        // Try to load AI chat preferences from database
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data: dbPrefs } = await supabase
              .from('user_ai_chat_preferences')
              .select('*')
              .eq('user_id', user.id)
              .maybeSingle();
            
            if (dbPrefs) {
              loadedPrefs.aiChatPreferences = {
                ignition_start: dbPrefs.ignition_start || false,
                geofence_event: dbPrefs.geofence_event || false,
                overspeeding: dbPrefs.overspeeding || false,
                low_battery: dbPrefs.low_battery || false,
                power_off: dbPrefs.power_off || false,
              };
              
              // Update localStorage with database values
              localStorage.setItem(STORAGE_KEY, JSON.stringify(loadedPrefs));
            }
          }
        } catch (dbError) {
          console.error('Error loading AI chat preferences from database:', dbError);
          // Continue with localStorage values
        }
        
        setPreferencesState(loadedPrefs);
      } catch (e) {
        console.error('Error loading notification preferences:', e);
      }
      setIsLoaded(true);
    };
    
    loadPreferences();
  }, []);

  // Sync AI chat preferences to database
  const syncAIChatPreferencesToDB = useCallback(async (prefs: AIChatPreferences) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { error } = await supabase
        .from('user_ai_chat_preferences')
        .upsert({
          user_id: user.id,
          ...prefs,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });
      
      if (error) {
        console.error('Error syncing AI chat preferences:', error);
      }
    } catch (e) {
      console.error('Error in syncAIChatPreferencesToDB:', e);
    }
  }, []);
  
  // Save preferences to localStorage and sync AI chat preferences to database
  const setPreferences = useCallback((newPrefs: Partial<NotificationPreferences>) => {
    setPreferencesState(prev => {
      const updated = { ...prev, ...newPrefs };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        console.error('Error saving notification preferences:', e);
      }
      
      // Sync AI chat preferences to database (fire and forget)
      if (newPrefs.aiChatPreferences) {
        syncAIChatPreferencesToDB(updated.aiChatPreferences).catch(err => {
          console.error('Error syncing AI chat preferences to database:', err);
        });
      }
      
      return updated;
    });
  }, [syncAIChatPreferencesToDB]);

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

  // Update AI chat preferences
  const updateAIChatPreferences = useCallback((
    key: keyof AIChatPreferences,
    value: boolean
  ) => {
    const updatedPrefs = {
      ...preferences.aiChatPreferences,
      [key]: value
    };
    
    setPreferences({
      aiChatPreferences: updatedPrefs
    });
  }, [preferences.aiChatPreferences, setPreferences]);

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
    updateAIChatPreferences,
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
  vehicle_moving: 'Vehicle Moving',
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
  ignition_off: 'Vehicle ignition turned off (Power Off)',
  vehicle_moving: 'Vehicle starts moving',
  geofence_enter: 'Vehicle enters a geofence zone',
  geofence_exit: 'Vehicle leaves a geofence zone',
  idle_too_long: 'Vehicle idle for extended period',
  offline: 'Vehicle loses GPS connection',
  online: 'Vehicle reconnects after being offline',
  predictive_briefing: 'AI predicts an upcoming trip based on habits'
};
