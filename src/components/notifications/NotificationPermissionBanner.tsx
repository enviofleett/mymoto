import { useState, useEffect } from "react";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNotifications } from "@/hooks/useNotifications";
import { trackEvent } from "@/lib/analytics";

const DISMISS_KEY = "notification-banner-dismissed-at";
const DISMISS_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export function NotificationPermissionBanner() {
  const { permission, isSupported, requestPermission, playAlertSound } = useNotifications();
  const [dismissed, setDismissed] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);

  // Check if banner was previously dismissed
  useEffect(() => {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return;
    if (Date.now() - ts < DISMISS_COOLDOWN_MS) {
      setDismissed(true);
    }
  }, []);

  useEffect(() => {
    if (!isSupported || permission !== "default" || dismissed) return;
    void trackEvent("push_banner_view", { path: window.location.pathname });
  }, [dismissed, isSupported, permission]);

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem(DISMISS_KEY, `${Date.now()}`);
  };

  const handleEnable = async () => {
    void trackEvent("push_permission_prompt", { source: "permission_banner" });
    setIsRequesting(true);
    const granted = await requestPermission();
    setIsRequesting(false);
    
    if (granted) {
      void trackEvent("push_permission_granted", { source: "permission_banner" });
      // Play a test sound to confirm it's working
      playAlertSound('info');
      handleDismiss();
    } else {
      void trackEvent("push_permission_denied", { source: "permission_banner" });
    }
  };

  // Don't show if not supported, already granted, or dismissed
  if (!isSupported || permission === 'granted' || permission === 'denied' || dismissed) {
    return null;
  }

  return (
    <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 mb-4">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-full bg-primary/20">
          <Bell className="h-5 w-5 text-primary" />
        </div>
        
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-sm mb-1">Enable Alert Notifications</h4>
          <p className="text-sm text-muted-foreground mb-3">
            Get instant notifications for critical vehicle alerts like low battery, overspeeding, and offline status - even when the app is in the background.
          </p>
          
          <div className="flex items-center gap-2">
            <Button 
              size="sm" 
              onClick={handleEnable}
              disabled={isRequesting}
            >
              {isRequesting ? 'Requesting...' : 'Enable Notifications'}
            </Button>
            <Button 
              size="sm" 
              variant="ghost"
              onClick={handleDismiss}
            >
              Maybe Later
            </Button>
          </div>
        </div>
        
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={handleDismiss}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
