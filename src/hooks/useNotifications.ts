import { useState, useEffect, useCallback } from "react";

interface PushNotificationOptions {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  requireInteraction?: boolean;
  silent?: boolean;
  vibrate?: number[];
  renotify?: boolean;
  timestamp?: number;
  image?: string;
  actions?: NotificationAction[];
  data?: Record<string, unknown>;
}

interface UseNotificationsReturn {
  permission: NotificationPermission | 'unsupported';
  isSupported: boolean;
  requestPermission: () => Promise<boolean>;
  showNotification: (options: PushNotificationOptions) => void;
  playAlertSound: (severity: 'info' | 'warning' | 'error' | 'critical', volumeMultiplier?: number) => void;
  updateBadge: (count: number) => void;
  incrementBadge: () => void;
  clearBadge: () => void;
}

// Audio context for generating notification sounds
let audioContext: AudioContext | null = null;

const getAudioContext = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  
  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    } catch (e) {
      console.warn('Web Audio API not supported:', e);
      return null;
    }
  }
  
  return audioContext;
};

// Generate a notification beep sound using Web Audio API
const playBeep = (frequency: number, duration: number, volume: number = 0.3, pattern: number[] = [1]) => {
  const ctx = getAudioContext();
  if (!ctx) return;

  // Resume audio context if suspended (required after user interaction)
  if (ctx.state === 'suspended') {
    ctx.resume();
  }

  pattern.forEach((multiplier, index) => {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.frequency.value = frequency * multiplier;
    oscillator.type = 'sine';

    const startTime = ctx.currentTime + (index * (duration + 0.1));
    
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(volume, startTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

    oscillator.start(startTime);
    oscillator.stop(startTime + duration);
  });
};

// Sound patterns for different severity levels
const SOUND_PATTERNS: Record<string, { frequency: number; duration: number; volume: number; pattern: number[] }> = {
  info: { frequency: 440, duration: 0.15, volume: 0.2, pattern: [1] },
  warning: { frequency: 523, duration: 0.2, volume: 0.3, pattern: [1, 1] },
  error: { frequency: 659, duration: 0.25, volume: 0.4, pattern: [1, 1, 1] },
  critical: { frequency: 880, duration: 0.3, volume: 0.5, pattern: [1, 0.8, 1, 0.8] }
};

export function useNotifications(): UseNotificationsReturn {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
  
  const isSupported = typeof window !== 'undefined' && 'Notification' in window;

  useEffect(() => {
    if (isSupported) {
      setPermission(Notification.permission);
    } else {
      setPermission('unsupported');
    }
  }, [isSupported]);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      console.warn('Notifications not supported in this browser');
      return false;
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result === 'granted';
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return false;
    }
  }, [isSupported]);

  const showNotification = useCallback((options: PushNotificationOptions) => {
    if (!isSupported || permission !== 'granted') {
      console.log('Notifications not available or not permitted');
      return;
    }

    try {
      // ✅ FIX: Check if we have a service worker for PWA (CRITICAL for locked screens)
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        // Use service worker to show notification (works in background and locked screens)
        navigator.serviceWorker.ready.then((registration) => {
          registration.showNotification(options.title, {
            body: options.body,
            icon: options.icon || '/pwa-192x192.png',
            badge: options.badge || '/pwa-192x192.png',
            tag: options.tag,
            // ✅ FIX: Locked screen support - CRITICAL flags
            silent: options.silent ?? false, // false = system sound plays on locked screens
            vibrate: options.vibrate, // Vibration pattern for Android
            renotify: options.renotify ?? true, // Re-alert even if same tag exists
            timestamp: options.timestamp || Date.now(), // Proper notification sorting
            image: options.image, // Rich notification image
            actions: options.actions, // Interactive buttons
            requireInteraction: options.requireInteraction ?? true,
            data: options.data || {}
          });
          
          // Increment badge when notification is shown
          if (options.tag) {
            incrementBadge();
          }
        });
      } else {
        // Fallback to regular notification (limited locked screen support)
        const notification = new Notification(options.title, {
          body: options.body,
          icon: options.icon || '/pwa-192x192.png',
          badge: options.badge || '/pwa-192x192.png',
          tag: options.tag,
          requireInteraction: options.requireInteraction ?? true,
          data: options.data
        });
        
        // Note: Regular Notification API has limited locked screen support
        // Service worker notifications are preferred for PWA
      }
    } catch (error) {
      console.error('Error showing notification:', error);
    }
  }, [isSupported, permission]);

  const playAlertSound = useCallback((severity: 'info' | 'warning' | 'error' | 'critical', volumeMultiplier: number = 1) => {
    const pattern = SOUND_PATTERNS[severity] || SOUND_PATTERNS.info;
    const adjustedVolume = pattern.volume * Math.max(0, Math.min(1, volumeMultiplier));
    playBeep(pattern.frequency, pattern.duration, adjustedVolume, pattern.pattern);
  }, []);

  // ✅ FIX: Badge management functions
  const updateBadge = useCallback((count: number) => {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        // Send message to service worker to update badge
        if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({
            type: 'UPDATE_BADGE',
            count: Math.max(0, count)
          });
        }
        
        // Also update badge directly if Badge API is supported
        if ('setAppBadge' in registration) {
          if (count > 0) {
            registration.setAppBadge(count).catch((err) => {
              console.error('Error setting badge:', err);
            });
          } else {
            registration.clearAppBadge().catch((err) => {
              console.error('Error clearing badge:', err);
            });
          }
        }
      });
    }
  }, []);

  const incrementBadge = useCallback(() => {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        // Send message to service worker to increment badge
        if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({
            type: 'INCREMENT_BADGE'
          });
        }
      });
    }
  }, []);

  const clearBadge = useCallback(() => {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        // Send message to service worker to clear badge
        if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({
            type: 'CLEAR_BADGE'
          });
        }
        
        // Also clear badge directly if Badge API is supported
        if ('clearAppBadge' in registration) {
          registration.clearAppBadge().catch((err) => {
            console.error('Error clearing badge:', err);
          });
        }
      });
    }
  }, []);

  return {
    permission,
    isSupported,
    requestPermission,
    showNotification,
    playAlertSound,
    updateBadge,
    incrementBadge,
    clearBadge
  };
}

// Helper to check if app is in foreground
export function isAppInForeground(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'visible';
}
