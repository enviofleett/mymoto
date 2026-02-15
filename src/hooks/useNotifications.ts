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

// Generate a unique chime sound (Major Triad: Root, 3rd, 5th)
const playChime = (baseFreq: number, type: 'info' | 'warning' | 'error' | 'critical', volume: number = 0.5) => {
  const ctx = getAudioContext();
  if (!ctx) return;

  // Resume audio context if suspended
  if (ctx.state === 'suspended') {
    ctx.resume();
  }

  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.connect(ctx.destination);
  masterGain.gain.setValueAtTime(volume, now);

  // Define notes for the chord based on type
  let frequencies: number[] = [];
  let duration = 0.5;

  switch (type) {
    case 'info':
      // C Major (C5, E5, G5) - Pleasant, informative
      frequencies = [523.25, 659.25, 783.99]; 
      duration = 0.6;
      break;
    case 'warning':
      // Diminished (C5, Eb5, Gb5) - Tension, warning
      frequencies = [523.25, 622.25, 739.99];
      duration = 0.8;
      break;
    case 'error':
      // Dissonant Cluster - Harsh
      frequencies = [440, 466.16, 523.25]; // A4, Bb4, C5
      duration = 0.8;
      break;
    case 'critical': {
      // Siren-like Sweep
      const osc = ctx.createOscillator();
      osc.connect(masterGain);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.linearRampToValueAtTime(1760, now + 0.5);
      osc.frequency.linearRampToValueAtTime(880, now + 1.0);
      
      masterGain.gain.setValueAtTime(volume, now);
      masterGain.gain.linearRampToValueAtTime(0, now + 1.2);
      
      osc.start(now);
      osc.stop(now + 1.2);
      return; // Special handling for critical
    }
  }

  // Play chord
  frequencies.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    
    osc.type = i === 0 ? 'sine' : 'triangle'; // Mix waveforms
    osc.frequency.value = freq;
    
    osc.connect(oscGain);
    oscGain.connect(masterGain);
    
    // Stagger starts slightly for "strum" effect
    const startTime = now + (i * 0.05);
    
    oscGain.gain.setValueAtTime(0, startTime);
    oscGain.gain.linearRampToValueAtTime(1.0 / frequencies.length, startTime + 0.05);
    oscGain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
    
    osc.start(startTime);
    osc.stop(startTime + duration + 0.1);
  });
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

  // ✅ Badge management functions
  const updateBadge = useCallback((count: number) => {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        // Send message to service worker to update badge (requires a controller)
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
      navigator.serviceWorker.ready.then(() => {
        // Send message to service worker to increment badge (requires a controller)
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
        // Send message to service worker to clear badge (requires a controller)
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

  const showNotification = useCallback((options: PushNotificationOptions) => {
    if (!isSupported || permission !== 'granted') {
      console.log('Notifications not available or not permitted');
      return;
    }

    try {
      // Prefer service worker path whenever available (controller can be null on first load).
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then((registration) => {
          registration.showNotification(options.title, {
            body: options.body,
            icon: options.icon || '/pwa-192x192.png',
            badge: options.badge || '/pwa-192x192.png',
            tag: options.tag,
            silent: options.silent ?? false,
            vibrate: options.vibrate,
            renotify: options.renotify ?? true,
            timestamp: options.timestamp || Date.now(),
            image: options.image,
            actions: options.actions,
            requireInteraction: options.requireInteraction ?? true,
            data: options.data || {}
          });

          if (options.tag) {
            incrementBadge();
          }
        });
        return;
      }

      // Fallback to regular notification (no SW support).
      new Notification(options.title, {
        body: options.body,
        icon: options.icon || '/pwa-192x192.png',
        badge: options.badge || '/pwa-192x192.png',
        tag: options.tag,
        requireInteraction: options.requireInteraction ?? true,
        data: options.data
      });
    } catch (error) {
      console.error('Error showing notification:', error);
    }
  }, [isSupported, permission, incrementBadge]);

  const playAlertSound = useCallback((severity: 'info' | 'warning' | 'error' | 'critical', volumeMultiplier: number = 1) => {
    playChime(440, severity, 0.5 * volumeMultiplier);
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
