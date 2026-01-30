import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { X, AlertTriangle, AlertCircle, Info, MapPin, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useOwnerVehicles } from "@/hooks/useOwnerVehicles";

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
    bg: "bg-destructive/20",
    border: "border-destructive/50",
    text: "text-destructive",
    icon: AlertCircle,
    iconBg: "bg-destructive",
  },
  error: {
    bg: "bg-destructive/15",
    border: "border-destructive/40",
    text: "text-destructive",
    icon: AlertCircle,
    iconBg: "bg-destructive/90",
  },
  warning: {
    bg: "bg-orange-500/20",
    border: "border-orange-500/50",
    text: "text-orange-500",
    icon: AlertTriangle,
    iconBg: "bg-orange-500",
  },
  info: {
    bg: "bg-blue-500/20",
    border: "border-blue-500/50",
    text: "text-blue-500",
    icon: Info,
    iconBg: "bg-blue-500",
  },
};

export function StickyAlertBanner() {
  const [alerts, setAlerts] = useState<ProactiveEvent[]>([]);
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { data: ownerVehicles } = useOwnerVehicles();
  
  // Get list of device IDs for user's assigned vehicles
  const userDeviceIds = ownerVehicles?.map(v => v.deviceId) || [];

  const dismissAlert = useCallback(async (alertId: string) => {
    // Mark as acknowledged in database
    await (supabase as any)
      .from("proactive_vehicle_events")
      .update({ acknowledged: true, acknowledged_at: new Date().toISOString() })
      .eq("id", alertId);

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
          
          // CRITICAL: Filter by user's vehicle assignments
          // Admins see all events, regular users only see events for their vehicles
          if (!isAdmin && !userDeviceIds.includes(newEvent.device_id)) {
            return; // Ignore alerts for unassigned vehicles
          }
          
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
  }, [isAdmin, userDeviceIds]);

  if (alerts.length === 0) return null;

  const latestAlert = alerts[0];
  const config = SEVERITY_CONFIG[latestAlert.severity];
  const Icon = config.icon;
  const hasLocation = latestAlert.metadata?.latitude && latestAlert.metadata?.longitude;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] pt-[env(safe-area-inset-top)]">
      {/* Main Banner - Neumorphic PWA Design */}
      <div
        className={cn(
          "flex items-center gap-3 px-4 py-3 cursor-pointer transition-all",
          "bg-card shadow-neumorphic rounded-b-2xl border-0",
          "border-l-4", // Left border for severity indicator
          config.border
        )}
        onClick={() => alerts.length > 1 ? setExpanded(!expanded) : handleAlertClick(latestAlert)}
      >
        <div className={cn(
          "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
          "shadow-neumorphic-sm",
          config.iconBg
        )}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        
        <div className="flex-1 min-w-0">
          <p className={cn("font-semibold text-sm truncate", config.text)}>{latestAlert.title}</p>
          <p className="text-xs text-muted-foreground truncate">{latestAlert.message}</p>
        </div>

        {hasLocation && (
          <MapPin className="h-4 w-4 shrink-0 opacity-75" />
        )}

        {alerts.length > 1 && (
          <div className="flex items-center gap-1">
            <span className="text-xs font-medium bg-white/20 px-1.5 py-0.5 rounded-full">
              +{alerts.length - 1}
            </span>
            <ChevronDown className={cn(
              "h-4 w-4 transition-transform",
              expanded && "rotate-180"
            )} />
          </div>
        )}

        <button
          onClick={(e) => {
            e.stopPropagation();
            dismissAlert(latestAlert.id);
          }}
          className="w-8 h-8 rounded-full bg-card shadow-neumorphic-sm flex items-center justify-center transition-all duration-200 active:shadow-neumorphic-inset shrink-0"
          aria-label="Dismiss alert"
        >
          <X className="h-4 w-4 text-foreground" />
        </button>
      </div>

      {/* Expanded Alert List - Neumorphic Design */}
      {expanded && alerts.length > 1 && (
        <div className="bg-card shadow-neumorphic rounded-b-2xl max-h-64 overflow-y-auto border-0">
          {alerts.slice(1).map((alert) => {
            const alertConfig = SEVERITY_CONFIG[alert.severity];
            const AlertIcon = alertConfig.icon;
            const alertHasLocation = alert.metadata?.latitude && alert.metadata?.longitude;

            return (
              <div
                key={alert.id}
                className="flex items-center gap-3 px-4 py-2.5 border-b border-border/30 last:border-b-0 cursor-pointer hover:bg-muted/30 transition-all duration-200 active:bg-muted/50"
                onClick={() => handleAlertClick(alert)}
              >
                <div className={cn(
                  "w-9 h-9 rounded-full flex items-center justify-center",
                  "shadow-neumorphic-sm",
                  alertConfig.iconBg
                )}>
                  <AlertIcon className="h-4 w-4 text-white" />
                </div>
                
                <div className="flex-1 min-w-0">
                  <p className={cn("font-medium text-sm truncate", alertConfig.text)}>{alert.title}</p>
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
                  className="w-7 h-7 rounded-full bg-card shadow-neumorphic-sm flex items-center justify-center transition-all duration-200 active:shadow-neumorphic-inset shrink-0"
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
