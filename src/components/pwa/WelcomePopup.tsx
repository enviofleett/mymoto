import { useState, useEffect } from "react";
import { X, Download, Share, PlusSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

interface PopupConfig {
  id: string;
  title: string;
  message: string;
  button_text: string | null;
  is_enabled: boolean;
  show_for_ios: boolean;
  show_for_android: boolean;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function WelcomePopup() {
  const [config, setConfig] = useState<PopupConfig | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    // Detect device type
    const userAgent = navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent) && !(window as any).MSStream;
    const isAndroidDevice = /android/.test(userAgent);
    
    setIsIOS(isIOSDevice);
    setIsAndroid(isAndroidDevice);

    // Check if already in standalone mode
    if (window.matchMedia("(display-mode: standalone)").matches) {
      return;
    }

    // Check if popup was already dismissed
    const dismissed = localStorage.getItem("mymoto_popup_dismissed");
    if (dismissed) return;

    // Fetch popup config
    const fetchConfig = async () => {
      const { data, error } = await supabase
        .from("app_popup_config" as any)
        .select("*")
        .limit(1)
        .single();

      if (error || !data) return;

      const configData = data as unknown as PopupConfig;
      
      // Check if enabled and should show for this device
      if (!configData.is_enabled) return;
      if (isIOSDevice && !configData.show_for_ios) return;
      if (isAndroidDevice && !configData.show_for_android) return;

      setConfig(configData);
      setIsVisible(true);
    };

    fetchConfig();

    // Listen for install prompt (Android/Chrome)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleDismiss = () => {
    localStorage.setItem("mymoto_popup_dismissed", "true");
    setIsVisible(false);
  };

  const handleInstall = async () => {
    if (deferredPrompt) {
      setInstalling(true);
      try {
        await deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === "accepted") {
          handleDismiss();
        }
      } catch (error) {
        console.error("Install error:", error);
      }
      setInstalling(false);
      setDeferredPrompt(null);
    } else {
      // For iOS or fallback, just dismiss
      handleDismiss();
    }
  };

  if (!isVisible || !config) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="w-full max-w-sm bg-card rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
        {/* Header with close button */}
        <div className="relative p-4 pb-0">
          <button
            onClick={handleDismiss}
            className="absolute top-3 right-3 p-2 rounded-full hover:bg-muted transition-colors"
            aria-label="Close popup"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 pb-6 pt-2 text-center space-y-4">
          {/* App Icon */}
          <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-accent to-accent/60 flex items-center justify-center shadow-lg shadow-accent/30">
            <Download className="w-8 h-8 text-white" />
          </div>

          {/* Title & Message */}
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-foreground">{config.title}</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {config.message}
            </p>
          </div>

          {/* iOS Instructions */}
          {isIOS && (
            <div className="bg-muted/50 rounded-xl p-4 space-y-2 text-left">
              <p className="text-xs font-medium text-foreground">To install on iOS:</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Share className="w-4 h-4 text-accent" />
                <span>Tap <strong>Share</strong> in Safari</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <PlusSquare className="w-4 h-4 text-accent" />
                <span>Tap <strong>Add to Home Screen</strong></span>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-3 pt-2">
            {isAndroid && deferredPrompt ? (
              <Button
                onClick={handleInstall}
                disabled={installing}
                className="w-full h-12 text-base gap-2 bg-accent hover:bg-accent/90"
              >
                <Download className="w-5 h-5" />
                {installing ? "Installing..." : "Install App"}
              </Button>
            ) : (
              <Button
                onClick={handleInstall}
                className="w-full h-12 text-base bg-accent hover:bg-accent/90"
              >
                {config.button_text || "Got it!"}
              </Button>
            )}
            
            <button
              onClick={handleDismiss}
              className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
            >
              Maybe later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
