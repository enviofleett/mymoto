import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Share, Star, Download, ChevronRight, Smartphone, CheckCircle2, PlusSquare } from "lucide-react";
import myMotoLogo from "@/assets/mymoto-logo-new.png";

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
  const [showFullDescription, setShowFullDescription] = useState(false);

  useEffect(() => {
    // Check if already installed (standalone mode)
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
      setInstallStatus("installed");
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
  }, []);

  const handleInstallClick = async () => {
    if (isInstalled) {
      navigate("/owner");
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
        } else {
          setInstallStatus("idle");
        }
      } catch (error) {
        console.error("Install prompt error:", error);
        setInstallStatus("idle");
      }
      setDeferredPrompt(null);
    } else {
      // Fallback or iOS instructions scroll
      const instructions = document.getElementById("install-instructions");
      if (instructions) {
        instructions.scrollIntoView({ behavior: "smooth" });
      }
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
      }
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
                {isInstalled ? "OPEN" : "GET"}
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
              {/* Mock Screen 1: Chat */}
              <div className="w-[240px] h-[480px] bg-background rounded-[32px] border-[6px] border-muted shadow-xl shrink-0 snap-center relative overflow-hidden flex flex-col">
                   <div className="bg-muted h-6 w-full absolute top-0 left-0 z-10 flex justify-center items-end pb-1">
                      <div className="w-16 h-4 bg-background rounded-full"></div>
                   </div>
                   <div className="mt-8 px-4 space-y-4 flex-1 overflow-hidden bg-background">
                       <div className="flex gap-2">
                           <div className="bg-muted p-3 rounded-2xl rounded-tl-none max-w-[80%] text-[10px] text-muted-foreground">
                               Hello! I noticed your battery is getting low (12.1V).
                           </div>
                       </div>
                       <div className="flex gap-2 justify-end">
                           <div className="bg-[#007AFF] p-3 rounded-2xl rounded-tr-none max-w-[80%] text-[10px] text-white">
                               Thanks! Where are you parked right now?
                           </div>
                       </div>
                        <div className="flex gap-2">
                           <div className="bg-muted p-3 rounded-2xl rounded-tl-none max-w-[80%] text-[10px] text-muted-foreground">
                               I'm at 123 Main St, near the coffee shop.
                           </div>
                       </div>
                   </div>
                   <div className="h-12 border-t flex items-center justify-center text-[10px] text-muted-foreground font-medium bg-muted/10">
                       MyMoto Chat
                   </div>
              </div>

               {/* Mock Screen 2: Map */}
               <div className="w-[240px] h-[480px] bg-muted/10 rounded-[32px] border-[6px] border-muted shadow-xl shrink-0 snap-center relative overflow-hidden flex flex-col">
                   <div className="bg-muted h-6 w-full absolute top-0 left-0 z-10 flex justify-center items-end pb-1">
                      <div className="w-16 h-4 bg-background rounded-full"></div>
                   </div>
                   <div className="absolute inset-0 bg-muted/20 flex items-center justify-center">
                        <div className="w-16 h-16 rounded-full bg-[#007AFF]/20 flex items-center justify-center animate-pulse">
                            <div className="w-4 h-4 bg-[#007AFF] rounded-full border-2 border-white shadow-lg"></div>
                        </div>
                   </div>
                   <div className="absolute bottom-12 left-4 right-4 bg-background/90 backdrop-blur p-3 rounded-xl shadow-sm border border-border/10">
                       <div className="h-2 w-20 bg-muted rounded mb-2"></div>
                       <div className="h-2 w-32 bg-muted rounded"></div>
                   </div>
              </div>
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
                      <p className="text-[15px] pt-1">Download the app by clicking the <span className="font-bold text-[#007AFF]">GET</span> button above.</p>
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
      <div id="install-instructions" className="px-5 py-8 space-y-6">
          {!isInstalled && (
              <div className="bg-secondary/30 rounded-xl p-6 border border-border/50">
                  <h3 className="font-semibold text-center mb-4 text-foreground">Can't install automatically?</h3>
                  
                  {isIOS ? (
                      <div className="space-y-4">
                        <p className="text-sm text-muted-foreground text-center">Follow these steps for iOS:</p>
                        <div className="space-y-3 text-sm">
                            <div className="flex items-center gap-3 bg-background p-3 rounded-lg border border-border/50">
                                <Share className="w-5 h-5 text-[#007AFF]" />
                                <span>1. Tap the <strong>Share</strong> button in Safari</span>
                            </div>
                            <div className="flex items-center gap-3 bg-background p-3 rounded-lg border border-border/50">
                                <PlusSquare className="w-5 h-5 text-[#007AFF]" />
                                <span>2. Select <strong>Add to Home Screen</strong></span>
                            </div>
                            <div className="flex items-center gap-3 bg-background p-3 rounded-lg border border-border/50">
                                <span className="font-bold text-[#007AFF] px-1">Add</span>
                                <span>3. Tap <strong>Add</strong> in the top right</span>
                            </div>
                        </div>
                      </div>
                  ) : (
                      <div className="space-y-4">
                          <p className="text-sm text-muted-foreground text-center">
                             {isAndroid 
                                ? "Tap the menu icon (⋮) in Chrome and select \"Install App\" or \"Add to Home screen\"." 
                                : "Look for the install icon in your browser address bar or use Chrome/Safari for the best experience."}
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
