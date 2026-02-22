import { useEffect, useCallback, useMemo, useRef, useState } from "react";
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
import { Star, ShieldCheck, CheckCircle2, AlertCircle, WifiOff, HardDrive, XCircle, Share2, MoreVertical } from "lucide-react";
import { trackEvent, trackEventOnce } from "@/lib/analytics";

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

type Platform = "android" | "ios" | "other";

/**
 * Stages:
 *  idle              – page loaded, nothing started
 *  ios_instructions  – show step-by-step Safari guide (iOS only)
 *  android_instructions – show Chrome "Add to Home Screen" guide (Android, no native prompt)
 *  other_instructions   – desktop / unsupported browser
 *  checking          – (kept for future / edge-case use)
 *  success           – app was installed
 *  dismissed         – user dismissed the native Android prompt
 *  network_error     – offline during a retry attempt
 */
type InstallStage =
  | "idle"
  | "ios_instructions"
  | "ios_wrong_browser"
  | "android_instructions"
  | "other_instructions"
  | "checking"
  | "success"
  | "dismissed"
  | "network_error";

const PRIMARY_COLOR = "#34A853";

// ----------------------------------------------------------------
// Platform helpers
// ----------------------------------------------------------------

const getPlatform = (): Platform => {
  if (typeof navigator === "undefined") return "other";
  const ua = (navigator.userAgent || navigator.vendor || (window as any).opera || "").toLowerCase();
  if (/android/.test(ua)) return "android";
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  return "other";
};

const isIOSChrome = (): boolean => {
  const ua = (navigator.userAgent || "").toLowerCase();
  return /iphone|ipad|ipod/.test(ua) && /crios|fxios/.test(ua);
};

const formatPlatformName = (platform: Platform) => {
  if (platform === "android") return "Android";
  if (platform === "ios") return "iPhone";
  return "your device";
};

// ----------------------------------------------------------------
// Component
// ----------------------------------------------------------------

const InstallApp = () => {
  const [platform, setPlatform] = useState<Platform>("other");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [stage, setStage] = useState<InstallStage>("idle");

  const isError = stage === "network_error";
  const isComplete = stage === "success";

  const isAndroid = platform === "android";
  const isIOS = platform === "ios";

  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const autoStartTriggeredRef = useRef(false);

  // ── Analytics on page view ──────────────────────────────────────
  useEffect(() => {
    trackEventOnce("install_view", "install_page");
  }, []);

  // ── Platform detection + beforeinstallprompt listener ──────────
  useEffect(() => {
    setPlatform(getPlatform());

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      deferredPromptRef.current = event as BeforeInstallPromptEvent;
      void trackEventOnce("install_beforeinstallprompt", "global");
    };

    const handleAppInstalled = () => {
      void trackEventOnce("install_appinstalled", "global");
      // Show success in whatever dialog is open (or open a new one)
      setDialogOpen(true);
      setStage("success");
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt as EventListener);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt as EventListener);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  // ── Main install handler ────────────────────────────────────────
  const handleStartInstall = useCallback(async () => {
    await trackEvent("install_cta_click", { platform });

    // ── Android with native Chrome prompt ────────────────────────
    if (isAndroid && deferredPromptRef.current) {
      try {
        deferredPromptRef.current.prompt();
        const choiceResult = await deferredPromptRef.current.userChoice;
        deferredPromptRef.current = null;

        if (choiceResult.outcome === "accepted") {
          await trackEvent("install_prompt_accepted", { platform: "android" });
          // `appinstalled` event will fire → sets success state.
          // Open success dialog as an immediate fallback in case the event is slow.
          setDialogOpen(true);
          setStage("success");
        } else {
          await trackEvent("install_prompt_dismissed", { platform: "android" });
          setDialogOpen(true);
          setStage("dismissed");
        }
      } catch {
        await trackEvent("install_error", { platform: "android", source: "prompt" });
      }
      // Return early – native prompt is the only mechanism needed.
      return;
    }

    // ── iOS ───────────────────────────────────────────────────────
    if (isIOS) {
      await trackEventOnce("install_instruction_view", "ios_help");
      setDialogOpen(true);
      // If user is on Chrome/Firefox for iOS they can't install; show special message
      setStage(isIOSChrome() ? "ios_wrong_browser" : "ios_instructions");
      return;
    }

    // ── Android without native prompt ─────────────────────────────
    // (non-Chrome browser, or criteria not yet met, or already installed)
    if (isAndroid) {
      setDialogOpen(true);
      setStage("android_instructions");
      return;
    }

    // ── Desktop / other ───────────────────────────────────────────
    setDialogOpen(true);
    setStage("other_instructions");
  }, [isAndroid, isIOS, platform]);

  // ── Auto-start via ?autostart=1 ─────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("autostart") === "1" && !autoStartTriggeredRef.current) {
      autoStartTriggeredRef.current = true;
      const timer = window.setTimeout(() => {
        handleStartInstall();
      }, 600);
      return () => window.clearTimeout(timer);
    }
  }, [handleStartInstall]);

  const handleRetry = () => {
    if (navigator.onLine === false) {
      setStage("network_error");
      return;
    }
    handleStartInstall();
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setStage("idle");
  };

  // ── Ratings data ─────────────────────────────────────────────────
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

  // ── UI helpers ───────────────────────────────────────────────────

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
    return isAndroid ? "Install" : isIOS ? "Get" : "Install";
  };

  // ── Dialog description ───────────────────────────────────────────

  const renderDialogDescription = () => {
    if (stage === "ios_instructions") {
      return "Follow these steps in Safari to add MyMoto to your home screen.";
    }
    if (stage === "ios_wrong_browser") {
      return "You need to use Safari to install MyMoto on your iPhone.";
    }
    if (stage === "android_instructions") {
      return "Open this page in Chrome to install MyMoto with one tap.";
    }
    if (stage === "other_instructions") {
      return "Scan or open this link on your phone to install MyMoto.";
    }
    if (stage === "success") {
      return "MyMoto has been added to your home screen.";
    }
    if (stage === "dismissed") {
      return "You can install MyMoto any time by tapping Install again.";
    }
    if (stage === "network_error") {
      return "Check your internet connection and try again.";
    }
    return "Follow the steps below to install MyMoto.";
  };

  // ── Dialog body ──────────────────────────────────────────────────

  const renderInstallDialogBody = () => {
    // ── iOS: step-by-step Safari instructions ──────────────────────
    if (stage === "ios_instructions") {
      return (
        <div className="space-y-4">
          <ol className="space-y-3">
            {[
              {
                icon: (
                  <div className="h-7 w-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                    <span className="text-blue-700 text-[11px] font-bold">1</span>
                  </div>
                ),
                text: (
                  <>
                    Make sure you&apos;re using{" "}
                    <span className="font-semibold text-foreground">Safari</span> (not Chrome or Firefox).
                  </>
                ),
              },
              {
                icon: (
                  <div className="h-7 w-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                    <Share2 className="h-4 w-4 text-blue-700" />
                  </div>
                ),
                text: (
                  <>
                    Tap the{" "}
                    <span className="font-semibold text-foreground">Share button</span>{" "}
                    <Share2 className="inline h-3.5 w-3.5 text-blue-600" /> at the bottom of Safari.
                  </>
                ),
              },
              {
                icon: (
                  <div className="h-7 w-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                    <span className="text-blue-700 text-[11px] font-bold">3</span>
                  </div>
                ),
                text: (
                  <>
                    Scroll down the sheet and tap{" "}
                    <span className="font-semibold text-foreground">&ldquo;Add to Home Screen&rdquo;</span>.
                  </>
                ),
              },
              {
                icon: (
                  <div className="h-7 w-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-4 w-4 text-blue-700" />
                  </div>
                ),
                text: (
                  <>
                    Tap{" "}
                    <span className="font-semibold text-foreground">&ldquo;Add&rdquo;</span> in
                    the top-right corner to confirm.
                  </>
                ),
              },
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                {step.icon}
                <p className="text-[13px] text-muted-foreground leading-snug pt-1">{step.text}</p>
              </li>
            ))}
          </ol>
          <p className="text-[11px] text-muted-foreground bg-muted/60 rounded-xl px-3 py-2">
            MyMoto will appear on your home screen and work like a native app — offline, fast, and without App Store updates.
          </p>
        </div>
      );
    }

    // ── iOS: wrong browser warning ─────────────────────────────────
    if (stage === "ios_wrong_browser") {
      return (
        <div className="space-y-3">
          <div className="flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-200 px-3 py-3">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-[13px] font-semibold text-amber-800">Open in Safari</p>
              <p className="text-[12px] text-amber-700 mt-0.5">
                Chrome and Firefox on iPhone do not support adding apps to the home screen.
                Copy this link and open it in <span className="font-semibold">Safari</span> to install.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-[13px] font-medium active:scale-[0.98] transition"
            onClick={() => {
              navigator.clipboard?.writeText(window.location.href).catch(() => {});
            }}
          >
            Copy link
          </button>
        </div>
      );
    }

    // ── Android: no native prompt – show manual instructions ───────
    if (stage === "android_instructions") {
      return (
        <div className="space-y-4">
          <p className="text-[13px] text-muted-foreground">
            Your browser doesn&apos;t support automatic install. Follow these steps:
          </p>
          <ol className="space-y-3">
            {[
              {
                step: "1",
                text: (
                  <>
                    Open this page in{" "}
                    <span className="font-semibold text-foreground">Chrome for Android</span>.
                  </>
                ),
              },
              {
                step: <MoreVertical className="h-3.5 w-3.5" />,
                text: (
                  <>
                    Tap the{" "}
                    <span className="font-semibold text-foreground">three-dot menu</span>{" "}
                    <MoreVertical className="inline h-3.5 w-3.5" /> in the top-right corner.
                  </>
                ),
              },
              {
                step: "3",
                text: (
                  <>
                    Tap{" "}
                    <span className="font-semibold text-foreground">&ldquo;Add to Home screen&rdquo;</span>{" "}
                    and confirm.
                  </>
                ),
              },
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-3">
                <div className="h-7 w-7 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 text-emerald-700 text-[11px] font-bold">
                  {item.step}
                </div>
                <p className="text-[13px] text-muted-foreground leading-snug pt-1">{item.text}</p>
              </li>
            ))}
          </ol>
        </div>
      );
    }

    // ── Other / desktop ────────────────────────────────────────────
    if (stage === "other_instructions") {
      return (
        <div className="space-y-3">
          <p className="text-[13px] text-muted-foreground">
            MyMoto is a mobile app. To install it:
          </p>
          <ul className="space-y-2 text-[13px] text-muted-foreground">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                Open <span className="font-medium text-foreground">this page on your Android phone</span> in Chrome, then use the browser menu to &ldquo;Add to Home screen&rdquo;.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
              <span>
                On <span className="font-medium text-foreground">iPhone</span>, open this page in Safari, tap the Share icon, then &ldquo;Add to Home Screen&rdquo;.
              </span>
            </li>
          </ul>
        </div>
      );
    }

    // ── Checking ───────────────────────────────────────────────────
    if (stage === "checking") {
      return (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Checking compatibility with {formatPlatformName(platform)}.
          </p>
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <span className="text-xs text-muted-foreground">This usually only takes a moment.</span>
          </div>
        </div>
      );
    }

    // ── Success ────────────────────────────────────────────────────
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

    // ── Dismissed ──────────────────────────────────────────────────
    if (stage === "dismissed") {
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
              <XCircle className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold">Installation skipped</p>
              <p className="text-xs text-muted-foreground">
                You can install MyMoto any time — just tap Install again.
              </p>
            </div>
          </div>
        </div>
      );
    }

    // ── Network error ──────────────────────────────────────────────
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
                Check your connection and try again. MyMoto could not be reached.
              </p>
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  // ── Dialog footer ────────────────────────────────────────────────

  const renderDialogFooter = () => {
    if (isComplete) {
      return (
        <Button
          type="button"
          className="w-full sm:w-auto"
          style={{ backgroundColor: PRIMARY_COLOR }}
          onClick={handleCloseDialog}
        >
          Done
        </Button>
      );
    }

    if (stage === "dismissed" || stage === "ios_instructions" || stage === "ios_wrong_browser" ||
        stage === "android_instructions" || stage === "other_instructions") {
      return (
        <Button
          type="button"
          variant="outline"
          className="w-full sm:w-auto"
          onClick={handleCloseDialog}
        >
          Got it
        </Button>
      );
    }

    if (isError) {
      return (
        <>
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={handleRetry}
          >
            Try again
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full sm:w-auto"
            onClick={handleCloseDialog}
          >
            Close
          </Button>
        </>
      );
    }

    // checking / any other in-progress state
    return (
      <Button
        type="button"
        variant="outline"
        className="w-full sm:w-auto"
        onClick={handleCloseDialog}
      >
        Cancel
      </Button>
    );
  };

  // ── Render ────────────────────────────────────────────────────────

  return (
    <>
      <div className="min-h-screen w-full bg-background flex justify-center font-sans">
        <div className="w-full max-w-[480px] min-h-screen pb-6 flex flex-col">
          {/* ── App header ── */}
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
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Button
                    className="rounded-full px-6 h-10 text-[13px] font-semibold tracking-wide"
                    style={{ backgroundColor: PRIMARY_COLOR }}
                    onClick={handleStartInstall}
                  >
                    {renderInstallButtonLabel()}
                  </Button>
                  <span className="text-[10px] text-muted-foreground">In-app purchases</span>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                {renderCompatibilityBadge()}
              </div>
            </div>
          </div>

          {/* ── Stats bar ── */}
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
              <div className="text-[22px] font-semibold text-foreground h-6">4+</div>
              <p className="text-[11px] text-muted-foreground">Rated for 4+</p>
            </div>
            <div className="w-px bg-border/40 h-8 self-center" />
            <div className="flex-1 flex flex-col items-center justify-center space-y-1">
              <div className="text-[22px] font-semibold text-foreground h-6 truncate max-w-full px-1">
                {isAndroid ? "Android" : isIOS ? "iPhone" : "Mobile"}
              </div>
              <p className="text-[11px] text-muted-foreground">Platform</p>
            </div>
          </div>

          {/* ── Screenshots ── */}
          <div className="py-4 border-b border-border/60">
            <div className="flex justify-between items-baseline px-5 mb-2">
              <h2 className="text-[16px] font-semibold tracking-tight">Screenshots</h2>
              <span className="text-[11px] text-muted-foreground">In-app experience</span>
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

          {/* ── About ── */}
          <div className="px-5 py-4 border-b border-border/60 space-y-3">
            <h2 className="text-[16px] font-semibold tracking-tight">About this app</h2>
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

          {/* ── Ratings ── */}
          <div className="px-5 py-4 border-b border-border/60 space-y-3">
            <h2 className="text-[16px] font-semibold tracking-tight">Ratings and reviews</h2>
            <div className="flex gap-4">
              <div className="flex flex-col items-center justify-center w-[96px]">
                <span className="text-[32px] leading-none font-semibold">
                  {ratingSummary.score.toFixed(1)}
                </span>
                <div className="flex items-center mt-1">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Star key={index} className="w-3.5 h-3.5 fill-foreground text-foreground" />
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
                    <span className="w-3 text-[11px] text-muted-foreground">{row.label}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${row.ratio * 100}%`, backgroundColor: PRIMARY_COLOR }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <div className="rounded-2xl border border-border/60 p-3">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-[11px] font-semibold">
                    OA
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold">Olamide A.</p>
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <div className="flex">
                        {Array.from({ length: 5 }).map((_, index) => (
                          <Star key={index} className="w-3 h-3 fill-foreground text-foreground" />
                        ))}
                      </div>
                      <span>•</span>
                      <span>2 weeks ago</span>
                    </div>
                  </div>
                </div>
                <p className="mt-2 text-[13px] text-foreground leading-relaxed">
                  The live tracking and trip history are spot on. I love being able to chat with my car and
                  get quick answers about my driving.
                </p>
              </div>

              <div className="rounded-2xl border border-border/60 p-3">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-[11px] font-semibold">
                    FD
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold">Fleet Director</p>
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <div className="flex">
                        {Array.from({ length: 5 }).map((_, index) => (
                          <Star key={index} className="w-3 h-3 fill-foreground text-foreground" />
                        ))}
                      </div>
                      <span>•</span>
                      <span>1 month ago</span>
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

          {/* ── Compatibility ── */}
          <div className="px-5 py-4 space-y-3">
            <h2 className="text-[16px] font-semibold tracking-tight">Compatibility</h2>
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
                <span>Works best with GPS devices that are linked to your MyMoto account.</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Install dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={handleCloseDialog}>
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <img
                src={myMotoLogo}
                alt="MyMoto"
                className="w-7 h-7 rounded-md object-contain"
              />
              <span>
                {stage === "success"
                  ? "MyMoto installed!"
                  : stage === "dismissed"
                  ? "Skipped for now"
                  : isIOS
                  ? "Add to Home Screen"
                  : "Install MyMoto"}
              </span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              {renderDialogDescription()}
            </DialogDescription>
          </DialogHeader>

          {renderInstallDialogBody()}

          <DialogFooter className="mt-4 gap-2 sm:gap-2">
            {renderDialogFooter()}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default InstallApp;
