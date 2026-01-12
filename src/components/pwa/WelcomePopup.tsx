import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Car, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface PopupConfig {
  id: string;
  is_enabled: boolean;
  title: string;
  message: string;
  button_text: string;
  show_for_ios: boolean;
  show_for_android: boolean;
}

interface WelcomePopupProps {
  isIOS: boolean;
  isAndroid: boolean;
}

const WelcomePopup = ({ isIOS, isAndroid }: WelcomePopupProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<PopupConfig | null>(null);

  useEffect(() => {
    const fetchConfig = async () => {
      const { data, error } = await (supabase as any)
        .from("app_popup_config")
        .select("*")
        .limit(1)
        .single();

      if (error) {
        console.error("Failed to load popup config:", error);
        return;
      }

      if (data) {
        setConfig(data as PopupConfig);

        // Check if popup should show for this device
        const shouldShow = data.is_enabled && (
          (isIOS && data.show_for_ios) ||
          (isAndroid && data.show_for_android) ||
          (!isIOS && !isAndroid) // Desktop/other - show by default
        );

        // Check if user has dismissed this popup before
        const dismissedKey = `popup_dismissed_${data.id}`;
        const wasDismissed = localStorage.getItem(dismissedKey);

        if (shouldShow && !wasDismissed) {
          // Small delay for better UX
          setTimeout(() => setIsOpen(true), 500);
        }
      }
    };

    fetchConfig();
  }, [isIOS, isAndroid]);

  const handleClose = () => {
    setIsOpen(false);
    if (config) {
      localStorage.setItem(`popup_dismissed_${config.id}`, "true");
    }
  };

  if (!config) return null;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md border-border/50 shadow-neumorphic bg-card">
        <DialogHeader className="text-center space-y-4">
          {/* Animated Icon */}
          <div className="mx-auto relative">
            <div className="absolute inset-0 w-20 h-20 rounded-full bg-accent/20 animate-[pulse_2s_ease-in-out_infinite]" />
            <div className="relative w-20 h-20 rounded-full shadow-neumorphic bg-card flex items-center justify-center ring-4 ring-accent/40">
              <div className="w-16 h-16 rounded-full shadow-neumorphic-inset bg-card flex items-center justify-center">
                <Car className="w-8 h-8 text-accent" />
              </div>
            </div>
            <Sparkles className="absolute -top-1 -right-1 w-5 h-5 text-accent animate-pulse" />
          </div>

          <DialogTitle className="text-xl font-bold text-foreground">
            {config.title}
          </DialogTitle>
          
          <DialogDescription className="text-muted-foreground text-base leading-relaxed">
            {config.message}
          </DialogDescription>
        </DialogHeader>

        {/* Feature highlights */}
        <div className="grid grid-cols-2 gap-3 py-4">
          {[
            { emoji: "💬", label: "Chat with car" },
            { emoji: "📍", label: "GPS tracking" },
            { emoji: "🔔", label: "Smart alerts" },
            { emoji: "💳", label: "Easy payments" },
          ].map((feature) => (
            <div
              key={feature.label}
              className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 shadow-neumorphic-inset"
            >
              <span className="text-lg">{feature.emoji}</span>
              <span className="text-sm text-muted-foreground">{feature.label}</span>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button 
            onClick={handleClose} 
            className="w-full shadow-neumorphic-button"
            size="lg"
          >
            {config.button_text}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default WelcomePopup;