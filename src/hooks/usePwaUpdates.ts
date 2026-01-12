import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface AppUpdate {
  id: string;
  version: string;
  release_notes: string | null;
  is_mandatory: boolean;
  created_at: string;
}

export function usePwaUpdates() {
  const [pendingUpdate, setPendingUpdate] = useState<AppUpdate | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const checkForUpdates = useCallback(async () => {
    setIsChecking(true);
    try {
      // Get the latest active update from the database
      // Using type assertion since table may not exist in generated types yet
      const { data, error } = await (supabase
        .from('app_updates' as any)
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()) as { data: AppUpdate | null; error: any };

      if (error && error.code !== 'PGRST116') {
        console.error('[PWA Update] Error checking for updates:', error);
        return;
      }

      if (data) {
        const currentVersion = localStorage.getItem('mymoto-app-version') || '0.0.0';
        const dismissedVersion = localStorage.getItem('mymoto-dismissed-update');
        
        // Compare versions - if server version is newer
        if (data.version !== currentVersion) {
          // Check if user dismissed this specific version (for non-mandatory updates)
          if (!data.is_mandatory && dismissedVersion === data.version) {
            console.log('[PWA Update] User dismissed this version:', data.version);
            return;
          }
          
          console.log('[PWA Update] New version available:', data.version, 'Current:', currentVersion);
          setPendingUpdate(data);
        }
      }
    } catch (err) {
      console.error('[PWA Update] Check failed:', err);
    } finally {
      setIsChecking(false);
    }
  }, []);

  const applyUpdate = useCallback(async () => {
    if (!pendingUpdate) return;
    
    console.log('[PWA Update] Applying update to version:', pendingUpdate.version);
    
    // Clear all caches
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
    }
    
    // Update stored version
    localStorage.setItem('mymoto-app-version', pendingUpdate.version);
    localStorage.removeItem('mymoto-dismissed-update');
    
    // Reload to get fresh assets
    window.location.reload();
  }, [pendingUpdate]);

  const dismissUpdate = useCallback(() => {
    if (pendingUpdate && !pendingUpdate.is_mandatory) {
      localStorage.setItem('mymoto-dismissed-update', pendingUpdate.version);
      setDismissed(true);
      setPendingUpdate(null);
    }
  }, [pendingUpdate]);

  // Check for updates on mount and periodically
  useEffect(() => {
    checkForUpdates();
    
    // Check every 60 seconds
    const interval = setInterval(checkForUpdates, 60000);
    
    return () => clearInterval(interval);
  }, [checkForUpdates]);

  // Listen for realtime updates
  useEffect(() => {
    const channel = supabase
      .channel('pwa_updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'app_updates'
        },
        (payload) => {
          console.log('[PWA Update] Realtime update received:', payload);
          checkForUpdates();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [checkForUpdates]);

  return {
    pendingUpdate,
    isChecking,
    dismissed,
    applyUpdate,
    dismissUpdate,
    checkForUpdates,
  };
}
