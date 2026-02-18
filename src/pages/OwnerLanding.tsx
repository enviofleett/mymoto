import { Button } from "@/components/ui/button";
import myMotoLogo from "@/assets/mymoto-logo-new.png";
import { captureAttributionFromUrl, trackEvent } from "@/lib/analytics";
import { useEffect, useMemo } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

const campaignCopy: Record<string, { title: string; subtitle: string }> = {
  default: {
    title: "Talk to your car like a friend.",
    subtitle: "Track location, get battery alerts, and chat with your vehicle in real-time.",
  },
  whatsapp: {
    title: "Shared by a friend on WhatsApp",
    subtitle: "Install MyMoto and get instant alerts when your vehicle needs attention.",
  },
  installer: {
    title: "Installer-ready vehicle companion",
    subtitle: "Connect devices fast, monitor health, and give owners live updates from day one.",
  },
  qr: {
    title: "Scan. Install. Start tracking.",
    subtitle: "Use MyMoto for location, smart alerts, and instant vehicle chat.",
  },
};

export default function OwnerLanding() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ channel?: string }>();

  const variant = useMemo(() => {
    const channel = (params.channel || "default").toLowerCase();
    if (channel in campaignCopy) return channel;
    return "default";
  }, [params.channel]);

  useEffect(() => {
    captureAttributionFromUrl();
    void trackEvent("landing_view", {
      variant,
      path: location.pathname,
      search: location.search,
    });
  }, [variant, location.pathname, location.search]);

  const c = campaignCopy[variant] ?? campaignCopy.default;

  const onCta = (destination: "/install" | "/auth" | "/login", cta: string) => {
    void trackEvent("install_cta_click", { destination, cta, source: "landing", variant });
    navigate(destination);
  };

  return (
    <div className="min-h-screen bg-background px-5 py-10">
      <div className="mx-auto max-w-xl">
        <div className="mb-8 flex items-center gap-3">
          <img src={myMotoLogo} alt="MyMoto" className="h-10 w-10 rounded-xl" />
          <div>
            <h1 className="text-xl font-semibold text-foreground">MyMoto</h1>
            <p className="text-sm text-muted-foreground">Vehicle Companion</p>
          </div>
        </div>

        <h2 className="text-3xl font-bold text-foreground leading-tight">{c.title}</h2>
        <p className="mt-3 text-base text-muted-foreground">{c.subtitle}</p>

        <div className="mt-8 grid gap-3">
          <Button className="h-12 text-base" onClick={() => onCta("/install", "Install App")}>
            Install App
          </Button>
          <Button variant="outline" className="h-12 text-base" onClick={() => onCta("/auth", "Create Account")}>
            Create Account / Sign In
          </Button>
          <Button variant="ghost" className="h-12 text-base" onClick={() => onCta("/login", "GPS51 Login")}>
            GPS51 Quick Login
          </Button>
        </div>

        <div className="mt-10 rounded-xl border border-border/60 bg-card p-4">
          <p className="text-sm text-muted-foreground">
            Built for vehicle owners in Nigeria: live location, battery and offline alerts, plus AI chat.
          </p>
        </div>
      </div>
    </div>
  );
}
