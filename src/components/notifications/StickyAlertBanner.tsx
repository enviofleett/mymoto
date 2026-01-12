import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { X, AlertTriangle, AlertCircle, Info, MapPin, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

interface ProactiveEvent {
  id: string;
  device_id: string;
  event_type: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  message: string;
  metadata: Record<string, unknown>;
  created_at: string;
  acknowledged: boolean;
}

const SEVERITY_CONFIG = {
  critical: {
    bg: "bg-card",
    iconBg: "bg-destructive/20",
    iconColor: "text-destructive",
    icon: AlertCircle,
  },
  error: {
    bg: "bg-card",
    iconBg: "bg-destructive/20",
    iconColor: "text-destructive",
    icon: AlertCircle,
  },
  warning: {
    bg: "bg-card",
    iconBg: "bg-orange-500/20",
    iconColor: "text-orange-500",
    icon: AlertTriangle,
  },
  info: {
    bg: "bg-card",
    iconBg: "bg-primary/20",
    iconColor: "text-primary",
    icon: Info,
  },
};

export function StickyAlertBanner() {
  const [alerts, setAlerts] = useState<ProactiveEvent[]>([]);
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();

  const dismissAlert = useCallback(async (alertId: string) => {
    // Mark as acknowledged in database
    await (supabase
      .from("proactive_vehicle_events" as any)
      .update({ acknowledged: true, acknowledged_at: new Date().toISOString() } as any)
      .eq("id", alertId) as any);

    setAlerts((prev) => prev.filter((a) => a.id !== alertId));
  }, []);

  const handleAlertClick = useCallback((alert: ProactiveEvent) => {
    navigate(`/owner/chat/${alert.device_id}`);
  }, [navigate]);

  useEffect(() => {
    const channel = supabase
      .channel('sticky_alert_banner')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'proactive_vehicle_events'
        },
        (payload) => {
          const newEvent = payload.new as ProactiveEvent;
          // Only show warning, error, critical alerts in the sticky banner
          if (['warning', 'error', 'critical'].includes(newEvent.severity)) {
            setAlerts((prev) => {
              // Prevent duplicates
              if (prev.some(a => a.id === newEvent.id)) return prev;
              // Keep max 5 alerts
              return [newEvent, ...prev].slice(0, 5);
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (alerts.length === 0) return null;

  const latestAlert = alerts[0];
  const config = SEVERITY_CONFIG[latestAlert.severity];
  const Icon = config.icon;
  const hasLocation = latestAlert.metadata?.latitude && latestAlert.metadata?.longitude;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] safe-area-inset-top">
      {/* Main Banner */}
      <div
        className={cn(
          "flex items-center gap-3 px-4 py-3 shadow-neumorphic cursor-pointer transition-all",
          config.bg
        )}
        onClick={() => alerts.length > 1 ? setExpanded(!expanded) : handleAlertClick(latestAlert)}
      >
        <div className={cn("p-2 rounded-full", config.iconBg)}>
          <Icon className={cn("h-5 w-5 shrink-0", config.iconColor)} />
        </div>
        
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-foreground truncate">{latestAlert.title}</p>
          <p className="text-xs text-muted-foreground truncate">{latestAlert.message}</p>
        </div>

        {hasLocation && (
          <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}

        {alerts.length > 1 && (
          <div className="flex items-center gap-1">
            <span className="text-xs font-medium bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">
              +{alerts.length - 1}
            </span>
            <ChevronDown className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              expanded && "rotate-180"
            )} />
          </div>
        )}

        <button
          onClick={(e) => {
            e.stopPropagation();
            dismissAlert(latestAlert.id);
          }}
          className="p-1.5 hover:bg-muted rounded-full transition-colors shrink-0"
          aria-label="Dismiss alert"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* Expanded Alert List */}
      {expanded && alerts.length > 1 && (
        <div className="bg-card border-b border-border shadow-lg max-h-64 overflow-y-auto">
          {alerts.slice(1).map((alert) => {
            const alertConfig = SEVERITY_CONFIG[alert.severity];
            const AlertIcon = alertConfig.icon;
            const alertHasLocation = alert.metadata?.latitude && alert.metadata?.longitude;

            return (
              <div
                key={alert.id}
                className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50 last:border-b-0 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => handleAlertClick(alert)}
              >
                <div className={cn(
                  "p-1.5 rounded-full",
                  alertConfig.iconBg
                )}>
                  <AlertIcon className={cn("h-3.5 w-3.5", alertConfig.iconColor)} />
                </div>
                
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-foreground truncate">{alert.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{alert.message}</p>
                </div>

                {alertHasLocation && (
                  <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                )}

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    dismissAlert(alert.id);
                  }}
                  className="p-1 hover:bg-muted rounded-full transition-colors shrink-0"
                  aria-label="Dismiss alert"
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
