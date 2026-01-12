import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Download, Share, PlusSquare, Smartphone, CheckCircle2, Car } from "lucide-react";
import WelcomePopup from "@/components/pwa/WelcomePopup";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const InstallApp = () => {
  const navigate = useNavigate();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [installStatus, setInstallStatus] = useState<"idle" | "installing" | "installed">("idle");

  useEffect(() => {
    // Check if already installed (standalone mode)
    if (window.matchMedia("(display-mode: standalone)").matches) {
      navigate("/owner", { replace: true });
      return;
    }

    // Detect device type
    const userAgent = navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent) && !(window as any).MSStream;
    const isAndroidDevice = /android/.test(userAgent);
    
    setIsIOS(isIOSDevice);
    setIsAndroid(isAndroidDevice);

    // Listen for beforeinstallprompt (Android/Chrome)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    // Listen for app installed event
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setInstallStatus("installed");
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, [navigate]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    setInstallStatus("installing");
    
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === "accepted") {
        setInstallStatus("installed");
        setIsInstalled(true);
      } else {
        setInstallStatus("idle");
      }
    } catch (error) {
      console.error("Install prompt error:", error);
      setInstallStatus("idle");
    }
    
    setDeferredPrompt(null);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <WelcomePopup isIOS={isIOS} isAndroid={isAndroid} />
      <div className="w-full max-w-md space-y-8">
        {/* App Logo & Branding */}
        <div className="text-center space-y-4">
          <div className="mx-auto w-24 h-24 rounded-3xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg shadow-primary/20">
            <Car className="w-12 h-12 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">MyMoto</h1>
            <p className="text-muted-foreground mt-1">Vehicle Companion</p>
          </div>
        </div>

        {/* Description */}
        <p className="text-center text-muted-foreground">
          Install the app to chat with your vehicle, track location, and manage your fleet — all from your home screen.
        </p>

        {/* App Preview */}
        <Card className="border-border/50 bg-card/50 backdrop-blur overflow-hidden">
          <CardContent className="p-0">
            <div className="aspect-[9/16] max-h-64 bg-gradient-to-b from-muted/50 to-muted flex items-center justify-center">
              <div className="text-center space-y-3 p-6">
                <Smartphone className="w-16 h-16 mx-auto text-muted-foreground/50" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Quick Access Features</p>
                  <ul className="text-xs text-muted-foreground/70 space-y-1">
                    <li>💬 Chat with your vehicle</li>
                    <li>📍 Real-time GPS tracking</li>
                    <li>🔋 Battery & status alerts</li>
                    <li>💳 Wallet management</li>
                  </ul>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Installation UI */}
        <div className="space-y-4">
          {isInstalled ? (
            /* Already Installed State */
            <div className="text-center space-y-4">
              <div className="inline-flex items-center gap-2 text-green-500">
                <CheckCircle2 className="w-6 h-6" />
                <span className="font-medium">App Installed!</span>
              </div>
              <Button 
                onClick={() => navigate("/owner")} 
                className="w-full"
                size="lg"
              >
                Open App
              </Button>
            </div>
          ) : isIOS ? (
            /* iOS Instructions */
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-6 space-y-4">
                <h3 className="font-semibold text-foreground text-center">
                  Install on iPhone/iPad
                </h3>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-primary">1</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-foreground">
                        Tap the <Share className="inline w-4 h-4 mx-1 text-primary" /> <strong>Share</strong> button in Safari's toolbar below
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-primary">2</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-foreground">
                        Scroll down and tap <PlusSquare className="inline w-4 h-4 mx-1 text-primary" /> <strong>"Add to Home Screen"</strong>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-primary">3</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-foreground">
                        Tap <strong>"Add"</strong> to install the app
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : deferredPrompt ? (
            /* Android/Chrome Install Button */
            <Button 
              onClick={handleInstallClick}
              disabled={installStatus === "installing"}
              className="w-full h-14 text-lg gap-3"
              size="lg"
            >
              <Download className="w-6 h-6" />
              {installStatus === "installing" ? "Installing..." : "Install App"}
            </Button>
          ) : (
            /* Fallback for unsupported browsers */
            <div className="text-center space-y-3">
              <p className="text-sm text-muted-foreground">
                {isAndroid 
                  ? "Open this page in Chrome to install the app."
                  : "Use Safari on iOS or Chrome on Android for the best experience."}
              </p>
              <Button 
                variant="outline" 
                onClick={() => navigate("/owner")}
                className="w-full"
              >
                Continue in Browser
              </Button>
            </div>
          )}
        </div>

        {/* Continue without installing */}
        {!isInstalled && (
          <button
            onClick={() => navigate("/owner")}
            className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
          >
            Continue without installing →
          </button>
        )}
      </div>
    </div>
  );
};

export default InstallApp;
