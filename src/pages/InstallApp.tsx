import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import myMotoLogo from "@/assets/mymoto-logo-new.png";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Star, ShieldCheck, CheckCircle2, AlertCircle, WifiOff } from "lucide-react";
import { trackEvent, trackEventOnce } from "@/lib/analytics";
import {
  getAndroidStageAfterPromptChoice,
  getInstallEntryStage,
  getInstallPlatform,
  isRunningAsInstalledPwa,
  shouldShowOpenApp,
  shouldAutostartInstall,
  type InstallPlatform,
} from "@/utils/pwa-install";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

type InstallStage =
  | "idle"
  | "prompting"
  | "awaiting_install"
  | "instructions"
  | "success"
  | "network_error";

const PRIMARY_COLOR = "#34A853";

const formatPlatformName = (platform: InstallPlatform) => {
  if (platform === "android") return "Android";
  if (platform === "ios") return "iPhone";
  if (platform === "mac") return "Mac";
  return "your device";
};

const InstallApp = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [platform, setPlatform] = useState<InstallPlatform>("other");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [stage, setStage] = useState<InstallStage>("idle");
  const [isInstalled, setIsInstalled] = useState(() => isRunningAsInstalledPwa());

  const isError = stage === "network_error";

  const isComplete = shouldShowOpenApp(stage === "success" || isInstalled);

  const isAndroid = platform === "android";
  const isIOS = platform === "ios";
  const isMac = platform === "mac";

  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const autostartAttemptedRef = useRef(false);
  const installTrackedRef = useRef(false);
  const manualInstructionTrackedRef = useRef(false);

  useEffect(() => {
    trackEventOnce("install_view", "install_page");
  }, []);

  const confirmInstalled = useCallback(() => {
    if (!isRunningAsInstalledPwa()) return false;
    setIsInstalled(true);
    setStage("success");
    if (!installTrackedRef.current) {
      installTrackedRef.current = true;
      void trackEventOnce("install_appinstalled", "global");
    }
    return true;
  }, []);

  useEffect(() => {
    setPlatform(getInstallPlatform(navigator));
    confirmInstalled();

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      deferredPromptRef.current = event as BeforeInstallPromptEvent;
      void trackEventOnce("install_beforeinstallprompt", "global");
    };

    const handleAppInstalled = () => {
      confirmInstalled();
    };

    const handleInstallCheck = () => {
      confirmInstalled();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        handleInstallCheck();
      }
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt as EventListener);
    window.addEventListener("appinstalled", handleAppInstalled);
    window.addEventListener("focus", handleInstallCheck);
    window.addEventListener("pageshow", handleInstallCheck);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt as EventListener);
      window.removeEventListener("appinstalled", handleAppInstalled);
      window.removeEventListener("focus", handleInstallCheck);
      window.removeEventListener("pageshow", handleInstallCheck);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [confirmInstalled]);

  const ratingSummary = useMemo(
    () => ({
      score: 4.8,
      reviews: "1K",
      fiveStarRatio: 0.82,
      fourStarRatio: 0.12,
      threeStarRatio: 0.04,
      twoStarRatio: 0.01,
      oneStarRatio: 0.01,
    }),
    [],
  );

  const screenshotImages = [
    {
      src: "/screens/mymoto-screen-dashboard.jpg",
      alt: "Bond better with your car – MyMoto dashboard home screen",
    },
    {
      src: "/screens/mymoto-screen-trips.jpg",
      alt: "MyMoto trips list showing detailed trip statistics",
    },
    {
      src: "/screens/mymoto-screen-chat-overview.jpg",
      alt: "MyMoto chat and device overview on dark background",
    },
    {
      src: "/screens/mymoto-screen-chat-detail.jpg",
      alt: "MyMoto vehicle chat conversation with driving insights",
    },
  ];

  const showInstructions = useCallback(async () => {
    setDialogOpen(true);
    setStage("instructions");
    if (!manualInstructionTrackedRef.current) {
      manualInstructionTrackedRef.current = true;
      await trackEventOnce("install_instruction_view", isIOS ? "ios_help" : "manual_help");
    }
  }, [isIOS]);

  const handleStartInstall = useCallback(async () => {
    await trackEvent("install_cta_click", { platform });

    if (confirmInstalled()) {
      navigate("/auth");
      return;
    }

    if (navigator.onLine === false) {
      setDialogOpen(true);
      setStage("network_error");
      return;
    }

    if (isIOS) {
      await showInstructions();
      return;
    }

    if (deferredPromptRef.current && isAndroid) {
      try {
        setDialogOpen(true);
        setStage(getInstallEntryStage({ platform, hasDeferredPrompt: true }));
        await deferredPromptRef.current.prompt();
        const choiceResult = await deferredPromptRef.current.userChoice;
        if (choiceResult.outcome === "accepted") {
          await trackEvent("install_prompt_accepted", { platform });
          setStage(getAndroidStageAfterPromptChoice(choiceResult.outcome));
        } else {
          await trackEvent("install_prompt_dismissed", { platform });
          setStage(getAndroidStageAfterPromptChoice(choiceResult.outcome));
          await showInstructions();
        }
        deferredPromptRef.current = null;
      } catch {
        await trackEvent("install_error", { platform, source: "prompt" });
        await showInstructions();
      }
      return;
    }

    await showInstructions();
  }, [confirmInstalled, isAndroid, isIOS, navigate, platform, showInstructions]);

  const handleRetry = () => {
    if (navigator.onLine === false) {
      setStage("network_error");
      return;
    }
    void handleStartInstall();
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    if (!isInstalled) {
      setStage("idle");
    }
  };

  useEffect(() => {
    if (!shouldAutostartInstall(location.search)) return;
    if (autostartAttemptedRef.current) return;
    autostartAttemptedRef.current = true;
    void handleStartInstall();
  }, [handleStartInstall, location.search]);

  const handleOpenApp = () => {
    navigate("/auth");
  };

  const renderCompatibilityBadge = () => {
    if (isAndroid) {
      return (
        <div className="flex items-center gap-2 rounded-full bg-emerald-50 text-emerald-700 px-3 py-1 text-[11px] font-medium">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>Compatible with your Android device</span>
        </div>
      );
    }

    if (isIOS) {
      return (
        <div className="flex items-center gap-2 rounded-full bg-blue-50 text-blue-700 px-3 py-1 text-[11px] font-medium">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>Works great on your iPhone</span>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2 rounded-full bg-muted text-muted-foreground px-3 py-1 text-[11px] font-medium">
        <ShieldCheck className="h-3.5 w-3.5" />
        <span>Optimized for modern mobile browsers</span>
      </div>
    );
  };

  const renderInstallButtonLabel = () => {
    if (isComplete) return "Open app";
    if (stage === "prompting") return "Waiting for prompt…";
    if (stage === "awaiting_install") return "Waiting for install…";
    return isAndroid ? "Install" : isIOS ? "Get" : "Install";
  };

  const renderInstallDialogBody = () => {
    if (stage === "prompting") {
      return (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Waiting for your browser&apos;s install prompt on {formatPlatformName(platform)}.
          </p>
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <span className="text-xs text-muted-foreground">
              Accept the prompt to continue.
            </span>
          </div>
        </div>
      );
    }

    if (stage === "awaiting_install") {
      return (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Install request accepted. We&apos;re waiting for confirmation from your device.
          </p>
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <span className="text-xs text-muted-foreground">
              Once installed, this page will switch to Open app.
            </span>
          </div>
        </div>
      );
    }

    if (stage === "instructions") {
      return (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {isIOS
              ? "On iPhone/iPad: tap Share, then choose Add to Home Screen."
              : "If no prompt appears, use your browser menu and select Install app or Add to Home screen."}
          </p>
          <p className="text-xs text-muted-foreground">
            Return to this tab after installing. We only show Open app after installation is confirmed.
          </p>
        </div>
      );
    }

    if (stage === "success") {
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-semibold">MyMoto is installed</p>
              <p className="text-xs text-muted-foreground">
                You can open it from your home screen like any other app.
              </p>
            </div>
          </div>
        </div>
      );
    }

    if (stage === "network_error") {
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-red-50 flex items-center justify-center">
              <WifiOff className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm font-semibold">Network error</p>
              <p className="text-xs text-muted-foreground">
                Check your connection and try again. MyMoto could not be downloaded.
              </p>
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <>
      <div className="min-h-screen w-full bg-background flex justify-center font-sans">
        <div className="w-full max-w-[480px] min-h-screen pb-6 flex flex-col">
          <div className="px-5 pt-4 pb-3 flex gap-4 items-start">
            <div className="w-[72px] h-[72px] rounded-2xl bg-muted flex items-center justify-center overflow-hidden">
              <img
                src={myMotoLogo}
                alt="MyMoto"
                className="w-[64px] h-[64px] object-contain"
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h1 className="text-[22px] font-semibold leading-snug tracking-tight text-foreground truncate">
                    MyMoto – Vehicle Companion
                  </h1>
                  <p className="text-[13px] text-muted-foreground mt-1">
                    MyMoto Labs • Auto &amp; Vehicles
                  </p>
                  <div className="flex items-center gap-2 mt-1 text-[12px] text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 fill-foreground text-foreground" />
                      <span>{ratingSummary.score}</span>
                    </div>
                    <span>•</span>
                    <span>{ratingSummary.reviews}+ reviews</span>
                    <span>•</span>
                    <span>Downloads</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Button
                    className="rounded-full px-6 h-10 text-[13px] font-semibold tracking-wide"
                    style={{
                      backgroundColor: PRIMARY_COLOR,
                    }}
                    onClick={isComplete ? handleOpenApp : handleStartInstall}
                  >
                    {renderInstallButtonLabel()}
                  </Button>
                  <span className="text-[10px] text-muted-foreground">
                    In-app purchases
                  </span>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                {renderCompatibilityBadge()}
              </div>
            </div>
          </div>

          <div className="px-5 py-3 flex justify-between border-y border-border/60 bg-muted/40">
            <div className="flex-1 flex flex-col items-center justify-center space-y-1">
              <div className="flex items-center gap-1 text-[22px] font-semibold text-foreground h-6">
                {ratingSummary.score}
                <Star className="w-4 h-4 fill-foreground text-foreground" />
              </div>
              <p className="text-[11px] text-muted-foreground">Rating</p>
            </div>
            <div className="w-px bg-border/40 h-8 self-center" />
            <div className="flex-1 flex flex-col items-center justify-center space-y-1">
              <div className="text-[22px] font-semibold text-foreground h-6">
                4+
              </div>
              <p className="text-[11px] text-muted-foreground">Rated for 4+</p>
            </div>
            <div className="w-px bg-border/40 h-8 self-center" />
            <div className="flex-1 flex flex-col items-center justify-center space-y-1">
              <div className="text-[22px] font-semibold text-foreground h-6 truncate max-w-full px-1">
                {isAndroid ? "Android" : isIOS ? "iPhone" : isMac ? "Mac" : "Mobile"}
              </div>
              <p className="text-[11px] text-muted-foreground">Platform</p>
            </div>
          </div>

          <div className="py-4 border-b border-border/60">
            <div className="flex justify-between items-baseline px-5 mb-2">
              <h2 className="text-[16px] font-semibold tracking-tight">
                Screenshots
              </h2>
              <span className="text-[11px] text-muted-foreground">
                In-app experience
              </span>
            </div>
            <div className="flex overflow-x-auto px-5 gap-3 pb-2 scrollbar-hide snap-x">
              {screenshotImages.map((shot, index) => (
                <div
                  key={shot.alt}
                  className="w-[220px] h-[440px] rounded-3xl border border-border/60 shadow-sm shrink-0 snap-start overflow-hidden bg-muted"
                >
                  <img
                    src={shot.src}
                    alt={shot.alt}
                    className="w-full h-full object-contain bg-background"
                    loading={index === 0 ? "eager" : "lazy"}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="px-5 py-4 border-b border-border/60 space-y-3">
            <h2 className="text-[16px] font-semibold tracking-tight">
              About this app
            </h2>
            <p className="text-[13px] leading-relaxed text-foreground">
              MyMoto is your vehicle&apos;s companion app. Chat naturally with your car, see live location,
              review detailed trip history, and get proactive alerts that keep your vehicle safe and healthy.
            </p>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              Designed for fleets and individual drivers, MyMoto combines AI, GPS, and smart automation so
              you always know what&apos;s happening with your vehicles.
            </p>
            <div className="flex flex-wrap gap-2 mt-1">
              <span className="px-2.5 py-1 rounded-full bg-muted text-[11px] font-medium">
                Auto &amp; Vehicles
              </span>
              <span className="px-2.5 py-1 rounded-full bg-muted text-[11px] font-medium">
                GPS Tracking
              </span>
              <span className="px-2.5 py-1 rounded-full bg-muted text-[11px] font-medium">
                AI Assistant
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
              <span>Updated on</span>
              <span>20 Feb 2026</span>
            </div>
          </div>

          <div className="px-5 py-4 border-b border-border/60 space-y-3">
            <h2 className="text-[16px] font-semibold tracking-tight">
              Ratings and reviews
            </h2>
            <div className="flex gap-4">
              <div className="flex flex-col items-center justify-center w-[96px]">
                <span className="text-[32px] leading-none font-semibold">
                  {ratingSummary.score.toFixed(1)}
                </span>
                <div className="flex items-center mt-1">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Star
                      key={index}
                      className="w-3.5 h-3.5 fill-foreground text-foreground"
                    />
                  ))}
                </div>
                <span className="mt-1 text-[11px] text-muted-foreground">
                  {ratingSummary.reviews}+ reviews
                </span>
              </div>
              <div className="flex-1 space-y-1.5">
                {[
                  { label: "5", ratio: ratingSummary.fiveStarRatio },
                  { label: "4", ratio: ratingSummary.fourStarRatio },
                  { label: "3", ratio: ratingSummary.threeStarRatio },
                  { label: "2", ratio: ratingSummary.twoStarRatio },
                  { label: "1", ratio: ratingSummary.oneStarRatio },
                ].map((row) => (
                  <div key={row.label} className="flex items-center gap-2">
                    <span className="w-3 text-[11px] text-muted-foreground">
                      {row.label}
                    </span>
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${row.ratio * 100}%`,
                          backgroundColor: PRIMARY_COLOR,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <div className="rounded-2xl border border-border/60 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-[11px] font-semibold">
                      OA
                    </div>
                    <div>
                      <p className="text-[13px] font-semibold">Olamide A.</p>
                      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <div className="flex">
                          {Array.from({ length: 5 }).map((_, index) => (
                            <Star
                              key={index}
                              className="w-3 h-3 fill-foreground text-foreground"
                            />
                          ))}
                        </div>
                        <span>•</span>
                        <span>2 weeks ago</span>
                      </div>
                    </div>
                  </div>
                </div>
                <p className="mt-2 text-[13px] text-foreground leading-relaxed">
                  The live tracking and trip history are spot on. I love being able to chat with my car and
                  get quick answers about my driving.
                </p>
              </div>

              <div className="rounded-2xl border border-border/60 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-[11px] font-semibold">
                      FD
                    </div>
                    <div>
                      <p className="text-[13px] font-semibold">Fleet Director</p>
                      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <div className="flex">
                          {Array.from({ length: 5 }).map((_, index) => (
                            <Star
                              key={index}
                              className="w-3 h-3 fill-foreground text-foreground"
                            />
                          ))}
                        </div>
                        <span>•</span>
                        <span>1 month ago</span>
                      </div>
                    </div>
                  </div>
                </div>
                <p className="mt-2 text-[13px] text-foreground leading-relaxed">
                  We rolled MyMoto out across our fleet and it has been reliable. Alerts are timely and the
                  dashboard is easy to use on mobile.
                </p>
              </div>
            </div>
          </div>

          <div className="px-5 py-4 space-y-3">
            <h2 className="text-[16px] font-semibold tracking-tight">
              Compatibility
            </h2>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[13px] text-foreground">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>Designed for {formatPlatformName(platform)}.</span>
              </div>
              <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                <span>End-to-end encrypted communication with MyMoto servers.</span>
              </div>
              <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
                <span>
                  Works best with GPS devices that are linked to your MyMoto account.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={handleCloseDialog}>
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <img
                src={myMotoLogo}
                alt="MyMoto"
                className="w-7 h-7 rounded-md object-contain"
              />
              <span>Installing MyMoto</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              {isIOS
                ? "On iPhone, tap the share icon in Safari, then choose “Add to Home Screen”. After that, open MyMoto from your Home Screen like a regular app."
                : isAndroid
                  ? "When your browser shows the install prompt, tap Install. If you don’t see a prompt, open the browser menu and choose “Install app” or “Add to Home screen”."
                  : isMac
                    ? "On your Mac, use the browser menu to install MyMoto. In Chrome, click the install icon or use “Install MyMoto”. In Safari, choose “Add to Dock”."
                    : `Follow the steps below to complete installation on ${formatPlatformName(platform)}.`}
            </DialogDescription>
          </DialogHeader>

          {renderInstallDialogBody()}

          <DialogFooter className="mt-4 gap-2 sm:gap-2">
            {isError && (
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={handleRetry}
              >
                Retry download
              </Button>
            )}
            {stage === "instructions" && (
              <Button
                type="button"
                className="w-full sm:w-auto"
                style={{ backgroundColor: PRIMARY_COLOR }}
                onClick={handleStartInstall}
              >
                Re-check install
              </Button>
            )}
            {isComplete && (
              <Button
                type="button"
                className="w-full sm:w-auto"
                style={{ backgroundColor: PRIMARY_COLOR }}
                onClick={handleOpenApp}
              >
                Open app
              </Button>
            )}
            {!isError && stage !== "instructions" && !isComplete && stage !== "idle" && (
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={handleCloseDialog}
              >
                Cancel
              </Button>
            )}
            {stage === "idle" && (
              <Button
                type="button"
                className="w-full sm:w-auto"
                style={{ backgroundColor: PRIMARY_COLOR }}
                onClick={handleStartInstall}
              >
                Start install
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default InstallApp;
