import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ShieldAlert, ShieldCheck, Loader2, Power } from "lucide-react";
import { cn } from "@/lib/utils";
import { useVehicleCommand, useVehicleEvents, type VehicleEvent } from "@/hooks/useVehicleProfile";
import { formatRelativeTime } from "@/lib/timezone";

interface EngineControlCardProps {
  deviceId: string;
  ignitionOn: boolean | null;
  isOnline: boolean;
}

export function getLastEngineControlEvent(events: VehicleEvent[] | undefined | null): VehicleEvent | null {
  if (!events || events.length === 0) return null;
  const relevant = events
    .filter((evt) => {
      return (
        evt.event_type === "engine_shutdown" ||
        evt.event_type === "engine_enable" ||
        evt.event_type === "engine_immobilize" ||
        evt.event_type === "engine_demobilize"
      );
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  if (relevant.length === 0) return null;
  return relevant[0];
}

export function getLastEngineControlLabel(event: VehicleEvent | null): string | null {
  if (!event) return null;

  let action: string;
  switch (event.event_type) {
    case "engine_shutdown":
      action = "Shutdown";
      break;
    case "engine_enable":
    case "engine_demobilize":
      action = "Engine enabled";
      break;
    case "engine_immobilize":
      action = "Engine immobilized";
      break;
    default:
      action = event.title || "Command";
  }

  const when = formatRelativeTime(event.created_at);
  return `Last action: ${action} ${when}`;
}

export function EngineControlCard({ 
  deviceId, 
  ignitionOn, 
  isOnline 
}: EngineControlCardProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingCommand, setPendingCommand] = useState<"immobilize_engine" | "demobilize_engine" | "shutdown_engine" | null>(null);
  const { mutate: executeCommand, isPending: isCommandPending } = useVehicleCommand();
  const { data: events } = useVehicleEvents(deviceId, { limit: 50 }, true);

  const isEngineRunning = ignitionOn === true;

  const lastControlEvent = useMemo(
    () => getLastEngineControlEvent(events as VehicleEvent[] | undefined),
    [events]
  );

  const lastActionLabel = useMemo(
    () => getLastEngineControlLabel(lastControlEvent),
    [lastControlEvent]
  );

  const isEngineDisabled = useMemo(() => {
    if (!lastControlEvent) return false;
    return (
      lastControlEvent.event_type === "engine_shutdown" ||
      lastControlEvent.event_type === "engine_immobilize"
    );
  }, [lastControlEvent]);

  const disabledSinceLabel = useMemo(() => {
    if (!isEngineDisabled || !lastControlEvent) return null;
    const when = formatRelativeTime(lastControlEvent.created_at);
    return `Disabled ${when}`;
  }, [isEngineDisabled, lastControlEvent]);

  const handleCommandRequest = (command: "demobilize_engine" | "shutdown_engine") => {
    setPendingCommand(command);
    setShowConfirm(true);
  };

  const handleConfirm = () => {
    if (!pendingCommand) return;
    
    executeCommand({
      device_id: deviceId,
      command_type: pendingCommand,
      confirmed: true,
    });
    
    setShowConfirm(false);
    setPendingCommand(null);
  };

  return (
    <>
      <Card className="border-0 bg-card shadow-neumorphic rounded-xl">
        <CardContent className="p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full shadow-neumorphic-sm bg-card flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-primary" />
            </div>
            <span className="font-medium text-foreground">Security Control</span>
          </div>

          <div className="flex">
            <button
              onClick={() =>
                handleCommandRequest(isEngineDisabled ? "demobilize_engine" : "shutdown_engine")
              }
              disabled={isCommandPending || !isOnline}
              aria-pressed={isEngineDisabled}
              aria-busy={isCommandPending}
              aria-label={
                isEngineDisabled
                  ? "Engine disabled. Press to enable engine."
                  : "Engine OK. Press to initiate shutdown."
              }
              className={cn(
                "w-full py-3 rounded-xl font-medium transition-all duration-200 flex items-center justify-center",
                "shadow-neumorphic-sm hover:shadow-neumorphic active:shadow-neumorphic-inset",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                isEngineDisabled ? "bg-card text-destructive" : "bg-card text-green-500"
              )}
            >
              {isCommandPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Power className="h-4 w-4 mr-2" />
              )}
              {isCommandPending
                ? isEngineDisabled
                  ? "Enabling..."
                  : "Shutting down..."
                : isEngineDisabled
                  ? "Engine Disabled"
                  : "Engine OK"}
            </button>
          </div>

          <div className="mt-4 flex flex-col gap-1 text-xs text-muted-foreground">
            <span>Status: {isOnline ? "Connected" : "Offline"}</span>
            {disabledSinceLabel && (
              <span className="text-[11px] text-muted-foreground/80">
                {disabledSinceLabel}
              </span>
            )}
            {!disabledSinceLabel && lastActionLabel && (
              <span className="text-[11px] text-muted-foreground/80">
                {lastActionLabel}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent className="bg-card border-border shadow-neumorphic">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingCommand === "shutdown_engine"
                ? "Emergency Shutdown?"
                : "Enable Engine?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingCommand === "shutdown_engine"
                ? "WARNING: This will issue a STOP command using the 'zhuyi' password authentication. This is a critical safety command. Only use in emergencies."
                : "This will restore the fuel supply, allowing the engine to start."
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              onClick={() => setPendingCommand(null)}
              className="shadow-neumorphic-sm bg-card border-0"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              className={cn(
                "shadow-neumorphic-sm border-0",
                (pendingCommand === "shutdown_engine")
                  ? "bg-destructive hover:bg-destructive/90"
                  : "bg-green-600 hover:bg-green-700 text-white"
              )}
            >
              {isCommandPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {pendingCommand === "shutdown_engine" ? "SHUTDOWN" : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
