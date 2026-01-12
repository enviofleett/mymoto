import { useState } from "react";
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
import { Power, Loader2, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useVehicleCommand } from "@/hooks/useVehicleProfile";

interface EngineControlCardProps {
  deviceId: string;
  ignitionOn: boolean | null;
  isOnline: boolean;
}

export function EngineControlCard({ 
  deviceId, 
  ignitionOn, 
  isOnline 
}: EngineControlCardProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingCommand, setPendingCommand] = useState<"start_engine" | "stop_engine" | null>(null);
  const { mutate: executeCommand, isPending: isCommandPending } = useVehicleCommand();

  const isEngineRunning = ignitionOn === true;
  
  const engineStatus = isEngineRunning 
    ? { label: "Engine Running", color: "text-status-active", icon: Power }
    : { label: "Engine Secured", color: "text-status-active", icon: ShieldCheck };

  const handleToggle = () => {
    const command = isEngineRunning ? "stop_engine" : "start_engine";
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
            {/* Neumorphic icon container */}
            <div className={cn(
              "w-10 h-10 rounded-full shadow-neumorphic-sm bg-card flex items-center justify-center",
              isEngineRunning && "ring-2 ring-status-active/50"
            )}>
              <engineStatus.icon className={cn("h-5 w-5", engineStatus.color)} />
            </div>
            <span className="font-medium text-foreground">Engine Control</span>
          </div>

          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm text-muted-foreground">Status</div>
              <div className="flex items-center gap-2 mt-1">
                {isEngineRunning ? (
                  <Power className="h-4 w-4 text-status-active" />
                ) : (
                  <ShieldCheck className="h-4 w-4 text-status-active" />
                )}
                <span className={cn("text-sm font-medium", engineStatus.color)}>
                  {engineStatus.label}
                </span>
              </div>
            </div>
            <Badge
              variant="outline"
              className={cn(
                "px-3 py-1 border-0 shadow-neumorphic-sm bg-card",
                isEngineRunning
                  ? "text-status-active"
                  : "text-status-active"
              )}
            >
              <span className="mr-1.5">●</span>
              {isEngineRunning ? "RUNNING" : "SECURED"}
            </Badge>
          </div>

          {/* Neumorphic action button */}
          <button
            onClick={handleToggle}
            disabled={isCommandPending || !isOnline}
            className={cn(
              "w-full py-3 rounded-xl font-medium transition-all duration-200",
              "shadow-neumorphic-sm bg-card",
              "hover:shadow-neumorphic active:shadow-neumorphic-inset",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              isEngineRunning
                ? "text-destructive"
                : "text-status-active"
            )}
          >
            {isCommandPending ? (
              <Loader2 className="h-4 w-4 mr-2 inline animate-spin" />
            ) : (
              <Power className="h-4 w-4 mr-2 inline" />
            )}
            {isEngineRunning ? "Stop Engine" : "Start Engine"}
          </button>

          <p className="text-xs text-muted-foreground text-center mt-3">
            {!isOnline 
              ? "Vehicle is offline - commands unavailable" 
              : "Remote engine control requires verification"}
          </p>
        </CardContent>
      </Card>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent className="bg-card border-border shadow-neumorphic">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingCommand === "stop_engine" ? "Stop Engine?" : "Start Engine?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingCommand === "stop_engine" 
                ? "This will remotely stop the engine. The vehicle will be secured."
                : "This will remotely start the engine. Make sure the vehicle is in a safe location."
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
                pendingCommand === "stop_engine"
                  ? "bg-destructive hover:bg-destructive/90"
                  : "bg-status-active hover:bg-status-active/90 text-primary-foreground"
              )}
            >
              {isCommandPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
