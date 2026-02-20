import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Share, Star, Download, ChevronRight, Smartphone, CheckCircle2, PlusSquare } from "lucide-react";
import myMotoLogo from "@/assets/mymoto-logo-new.png";
import { trackEvent } from "@/lib/analytics";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const InstallApp = () => {
  const navigate = useNavigate();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isIOSSafari, setIsIOSSafari] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [installStatus, setInstallStatus] = useState<"idle" | "installing" | "installed">("idle");
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [highlightInstallInstructions, setHighlightInstallInstructions] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const installLink = useMemo(() => {
    if (typeof window === "undefined") return "/install";
    return `${window.location.origin}/install?src=iphone`;
  }, []);
  const previewImages = [
    "/install/01-banner-text.jpg",
    "/install/02-trips-screen.jpg",
    "/install/03-chat-angle.jpg",
    "/install/04-chat-close.jpg",
  ];

  const scrollToInstallInstructions = () => {
    const instructions = document.getElementById("install-instructions");
    if (!instructions) return;
    void trackEvent("install_instruction_view", {
      platform: isIOS ? "ios" : isAndroid ? "android" : "desktop",
      safari: isIOSSafari,
    });
    setHighlightInstallInstructions(true);
    instructions.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => setHighlightInstallInstructions(false), 1600);
  };

  useEffect(() => {
    // Check if already installed (standalone mode)
    if (
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true
    ) {
      setIsInstalled(true);
      setInstallStatus("installed");
    }

    // Detect device type
    const userAgent = navigator.userAgent;
    const userAgentLower = userAgent.toLowerCase();
    const isIOSDevice =
      (/iphone|ipad|ipod/.test(userAgentLower) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
    const isAndroidDevice = /android/.test(userAgentLower);
    const isSafariBrowser =
      /safari/i.test(userAgent) &&
      !/crios|fxios|edgios|opios|duckduckgo|instagram|fban|fbav|line/i.test(userAgentLower);

    setIsIOS(isIOSDevice);
    setIsIOSSafari(isIOSDevice && isSafariBrowser);
    setIsAndroid(isAndroidDevice);
    const platform = isIOSDevice ? "ios" : isAndroidDevice ? "android" : "desktop";
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    void trackEvent("install_view", {
      ios: isIOSDevice,
      ios_safari: isIOSDevice && isSafariBrowser,
      android: isAndroidDevice,
      platform,
      standalone,
    });

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      void trackEvent("install_beforeinstallprompt", {
        platform,
        ios: isIOSDevice,
        android: isAndroidDevice,
      });
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setInstallStatus("installed");
      setDeferredPrompt(null);
      void trackEvent("install_appinstalled", {
        platform,
        ios: isIOSDevice,
        android: isAndroidDevice,
      });
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    void trackEvent("install_cta_click", {
      installed: isInstalled,
      has_deferred_prompt: !!deferredPrompt,
      platform: isIOS ? "ios" : isAndroid ? "android" : "desktop",
      safari: isIOSSafari,
    });

    if (isInstalled) {
      navigate("/owner/vehicles");
      return;
    }

    if (isIOS) {
      scrollToInstallInstructions();
      return;
    }

    if (deferredPrompt) {
      setInstallStatus("installing");
      try {
        await deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === "accepted") {
          setInstallStatus("installed");
          setIsInstalled(true);
          void trackEvent("install_prompt_accepted", {
            platform: isIOS ? "ios" : isAndroid ? "android" : "desktop",
          });
        } else {
          setInstallStatus("idle");
          void trackEvent("install_prompt_dismissed", {
            platform: isIOS ? "ios" : isAndroid ? "android" : "desktop",
          });
        }
      } catch (error) {
        console.error("Install prompt error:", error);
        setInstallStatus("idle");
        void trackEvent("install_error", {
          stage: "prompt",
          platform: isIOS ? "ios" : isAndroid ? "android" : "desktop",
          message: error instanceof Error ? error.message : String(error),
        });
      }
      setDeferredPrompt(null);
    } else {
      scrollToInstallInstructions();
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'MyMoto - Vehicle Companion',
          text: 'Check out MyMoto, the AI companion for your vehicle!',
          url: window.location.href,
        });
      } catch (err) {
        console.log('Error sharing:', err);
        void trackEvent("install_share", {
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        });
        return;
      }
      void trackEvent("install_share", {
        status: "success",
      });
    } else {
      void trackEvent("install_share", {
        status: "unsupported",
      });
    }
  };

  const handleCopyInstallLink = async () => {
    try {
      await navigator.clipboard.writeText(installLink);
      setCopyStatus("copied");
      void trackEvent("install_copy_link", {
        status: "success",
      });
    } catch {
      setCopyStatus("error");
      void trackEvent("install_copy_link", {
        status: "error",
      });
    } finally {
      window.setTimeout(() => setCopyStatus("idle"), 2200);
    }
  };

  return (
    <div className="min-h-screen w-full bg-background flex justify-center font-sans">
      <div className="w-full max-w-[480px] min-h-screen pb-20 flex flex-col">
      {/* App Store Header Style */}
      <div className="px-5 pt-8 pb-4 flex gap-5 items-start">
        <div className="w-[118px] h-[118px] rounded-[22px] shadow-sm border border-border/10 bg-background overflow-hidden shrink-0 relative">
             <img 
                src={myMotoLogo} 
                alt="MyMoto Icon" 
                className="w-full h-full object-contain p-2"
             />
        </div>
        <div className="flex-1 min-w-0 flex flex-col pt-1 h-[118px] justify-between">
          <div>
            <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-foreground">
              MyMoto
            </h1>
            <p className="text-[15px] text-muted-foreground font-normal mt-0.5">
              Vehicle Companion
            </p>
          </div>
          
          <div className="flex items-center gap-3 mt-auto pb-1">
             <Button
                className={`rounded-full px-6 font-bold h-[30px] text-[13px] tracking-wide uppercase transition-all ${
                  isInstalled 
                    ? "bg-secondary text-secondary-foreground hover:bg-secondary/90" 
                    : "bg-[#007AFF] hover:bg-[#007AFF]/90 text-white shadow-sm"
                }`}
                onClick={handleInstallClick}
             >
                {installStatus === "installing"
                  ? "INSTALLING..."
                  : isInstalled
                  ? "OPEN"
                  : isIOS
                  ? isIOSSafari
                    ? "HOW TO INSTALL"
                    : "USE SAFARI"
                  : isAndroid && deferredPrompt
                  ? "INSTALL"
                  : "GET"}
             </Button>
             
             <Button 
                size="icon" 
                variant="ghost" 
                className="h-[30px] w-[30px] text-[#007AFF] hover:bg-blue-50 rounded-full"
                onClick={handleShare}
             >
                <Share className="w-5 h-5" />
             </Button>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="flex justify-between px-5 py-4 border-b border-border/40 mb-2">
          <div className="flex-1 flex flex-col items-center justify-center space-y-1">
              <div className="flex items-center gap-1 text-[#8E8E93] font-semibold text-[22px] h-6">
                  4.8 <Star className="w-4 h-4 fill-[#8E8E93] text-[#8E8E93]" />
              </div>
              <p className="text-[12px] text-[#8E8E93]">Not Enough Ratings</p>
          </div>
          <div className="w-px bg-border/40 h-8 self-center" />
          <div className="flex-1 flex flex-col items-center justify-center space-y-1">
               <div className="text-[#8E8E93] font-semibold text-[22px] h-6">4+</div>
               <p className="text-[12px] text-[#8E8E93]">Years Old</p>
          </div>
          <div className="w-px bg-border/40 h-8 self-center" />
           <div className="flex-1 flex flex-col items-center justify-center space-y-1">
               <div className="text-[#8E8E93] font-semibold text-[22px] h-6 truncate max-w-full px-1">MyMoto</div>
               <p className="text-[12px] text-[#8E8E93]">Developer</p>
          </div>
      </div>

      {/* What's New */}
      <div className="px-5 py-4 border-b border-border/40">
          <div className="flex justify-between items-baseline mb-3">
              <h2 className="text-[20px] font-bold tracking-tight">What's New</h2>
              <span className="text-[#007AFF] text-[15px]">Version 1.3.0</span>
          </div>
          <p className="text-[15px] leading-relaxed text-foreground">
             Unlock intelligence for your vehicle. Improved AI chat, real-time tracking updates, and battery optimization.
          </p>
      </div>

      {/* Preview Section */}
      <div className="py-6 border-b border-border/40">
          <h2 className="text-[20px] font-bold px-5 mb-4 tracking-tight">Preview</h2>
          <div className="flex overflow-x-auto px-5 gap-4 pb-4 scrollbar-hide snap-x">
              {previewImages.map((src, index) => (
                <div
                  key={src}
                  className="w-[260px] h-[520px] rounded-[24px] border border-border/50 shadow-xl shrink-0 snap-center overflow-hidden bg-muted/20"
                >
                  <img
                    src={src}
                    alt={`MyMoto preview ${index + 1}`}
                    className="w-full h-full object-cover"
                    loading={index === 0 ? "eager" : "lazy"}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = myMotoLogo;
                      (e.currentTarget as HTMLImageElement).className = "w-full h-full object-contain p-8 bg-background";
                    }}
                  />
                </div>
              ))}
          </div>
      </div>

      {/* Description Body */}
      <div className="px-5 py-4 border-b border-border/40">
          <p className="text-[15px] leading-relaxed text-foreground">
            Unlock intelligence for your vehicle.
            <br/><br/>
            The MyMoto app is a vehicle companion app that allows you to have natural text conversations with your vehicle like you will do with a friend.
          </p>
          
          <div className="mt-6 space-y-4">
              <h3 className="font-semibold text-[17px]">Get Started</h3>
              <div className="space-y-4">
                  <div className="flex gap-4 items-start">
                      <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm shrink-0">1</div>
                      <p className="text-[15px] pt-1">
                        {isIOS
                          ? "On iPhone, open this page in Safari, tap Share, then choose Add to Home Screen to install MyMoto."
                          : <>Tap the <span className="font-bold text-[#007AFF]">GET</span> button above to install the MyMoto app.</>}
                      </p>
                  </div>
                  <div className="flex gap-4 items-start">
                      <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm shrink-0">2</div>
                      <p className="text-[15px] pt-1">Create an account if you don't have one.</p>
                  </div>
                  <div className="flex gap-4 items-start">
                      <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm shrink-0">3</div>
                      <p className="text-[15px] pt-1">Login with the credential created and sent to you via email.</p>
                  </div>
              </div>
          </div>

           <div className="mt-8 space-y-3">
              <h3 className="font-semibold text-[17px]">Features</h3>
               <ul className="space-y-3">
                    <li className="flex items-center gap-3 text-[15px] text-muted-foreground">
                        <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-500 flex items-center justify-center"><span className="text-lg">💬</span></div>
                        Chat with your vehicle
                    </li>
                    <li className="flex items-center gap-3 text-[15px] text-muted-foreground">
                        <div className="w-8 h-8 rounded-lg bg-green-50 text-green-500 flex items-center justify-center"><span className="text-lg">📍</span></div>
                        Real-time GPS tracking
                    </li>
                    <li className="flex items-center gap-3 text-[15px] text-muted-foreground">
                        <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-500 flex items-center justify-center"><span className="text-lg">🔋</span></div>
                        Battery & status alerts
                    </li>
                    <li className="flex items-center gap-3 text-[15px] text-muted-foreground">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center"><span className="text-lg">💳</span></div>
                        Wallet management
                    </li>
               </ul>
          </div>
      </div>

      {/* Manual Install Instructions */}
      <div
        id="install-instructions"
        className={`px-5 py-8 space-y-6 transition-all ${highlightInstallInstructions ? "ring-2 ring-[#007AFF]/40 rounded-xl" : ""}`}
      >
          {!isInstalled && (
              <div className="bg-secondary/30 rounded-xl p-6 border border-border/50">
                  <h3 className="font-semibold text-center mb-4 text-foreground">Can't install automatically?</h3>
                  
                  {isIOS ? (
                      <div className="space-y-4">
                        <div className="bg-background p-3 rounded-lg border border-border/50 space-y-3">
                          <p className="text-xs text-muted-foreground">
                            iPhone install link
                          </p>
                          <p className="text-sm break-all font-medium text-foreground">{installLink}</p>
                          <div className="grid grid-cols-2 gap-2">
                            <Button
                              variant="outline"
                              className="w-full"
                              onClick={handleCopyInstallLink}
                            >
                              {copyStatus === "copied" ? "Copied" : copyStatus === "error" ? "Copy failed" : "Copy link"}
                            </Button>
                            <Button asChild variant="outline" className="w-full">
                              <a href={installLink}>
                                Open link
                              </a>
                            </Button>
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground text-center">
                          {isIOSSafari
                            ? "Install MyMoto from Safari using the steps below."
                            : "To install MyMoto, open this page in Safari first, then follow these steps:"}
                        </p>
                        <div className="space-y-3 text-sm">
                            {!isIOSSafari && (
                              <div className="flex items-center gap-3 bg-background p-3 rounded-lg border border-border/50">
                                  <Smartphone className="w-5 h-5 text-[#007AFF]" />
                                  <span>Open this page in <strong>Safari</strong> on your iPhone</span>
                              </div>
                            )}
                            <div className="flex items-center gap-3 bg-background p-3 rounded-lg border border-border/50">
                                <Share className="w-5 h-5 text-[#007AFF]" />
                                <span>{isIOSSafari ? "1." : "2."} Tap the <strong>Share</strong> button in Safari</span>
                            </div>
                            <div className="flex items-center gap-3 bg-background p-3 rounded-lg border border-border/50">
                                <PlusSquare className="w-5 h-5 text-[#007AFF]" />
                                <span>{isIOSSafari ? "2." : "3."} Select <strong>Add to Home Screen</strong> from the menu</span>
                            </div>
                            <div className="flex items-center gap-3 bg-background p-3 rounded-lg border border-border/50">
                                <span className="font-bold text-[#007AFF] px-1">Add</span>
                                <span>{isIOSSafari ? "3." : "4."} Tap <strong>Add</strong> in the top right to finish</span>
                            </div>
                        </div>
                      </div>
                  ) : (
                      <div className="space-y-4">
                          <p className="text-sm text-muted-foreground text-center">
                             {isAndroid 
                                ? "On Android, tap the menu icon (⋮) in Chrome and choose \"Install app\" or \"Add to Home screen\" to add MyMoto to your home screen." 
                                : "Look for the install icon in your browser’s address bar, or open this page in Chrome or Safari for the best install experience."}
                          </p>
                          <Button variant="outline" className="w-full gap-2" onClick={() => navigate("/owner")}>
                              Continue in Browser <ChevronRight className="w-4 h-4" />
                          </Button>
                      </div>
                  )}
              </div>
          )}
          
          <div className="text-center">
               <button
                onClick={() => navigate("/owner")}
                className="text-sm text-muted-foreground hover:text-[#007AFF] transition-colors py-2 font-medium"
              >
                Continue without installing
              </button>
          </div>
      </div>
    </div>
    </div>
  );
};

export default InstallApp;
