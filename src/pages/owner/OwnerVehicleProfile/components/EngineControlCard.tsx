import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Power, Loader2, ShieldCheck, ShieldAlert } from "lucide-react";
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
  
  // Engine shutdown is only active when we send a stop command and ignition is off
  // For display: Green = running/secured, Red = shutdown command was used
  const engineStatus = isEngineRunning 
    ? { label: "Engine Running", color: "text-green-500", bgColor: "bg-green-500/10", icon: Power }
    : { label: "Engine Secured", color: "text-green-500", bgColor: "bg-green-500/10", icon: ShieldCheck };

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
      <Card className="border-border bg-card/50">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className={cn("p-2 rounded-full", engineStatus.bgColor)}>
              <engineStatus.icon className={cn("h-4 w-4", engineStatus.color)} />
            </div>
            <span className="font-medium text-foreground">Engine Control</span>
          </div>

          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm text-muted-foreground">Status</div>
              <div className="flex items-center gap-2 mt-1">
                {isEngineRunning ? (
                  <Power className="h-4 w-4 text-green-500" />
                ) : (
                  <ShieldCheck className="h-4 w-4 text-green-500" />
                )}
                <span className={cn("text-sm font-medium", engineStatus.color)}>
                  {engineStatus.label}
                </span>
              </div>
            </div>
            <Badge
              variant="outline"
              className={cn(
                "px-3 py-1",
                isEngineRunning
                  ? "border-green-500/50 text-green-500"
                  : "border-green-500/50 text-green-500"
              )}
            >
              <span className="mr-1.5">●</span>
              {isEngineRunning ? "RUNNING" : "SECURED"}
            </Badge>
          </div>

          <Button
            className={cn(
              "w-full",
              isEngineRunning
                ? "bg-red-500/10 text-red-500 hover:bg-red-500/20"
                : "bg-green-500/10 text-green-500 hover:bg-green-500/20"
            )}
            variant="ghost"
            onClick={handleToggle}
            disabled={isCommandPending || !isOnline}
          >
            {isCommandPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Power className="h-4 w-4 mr-2" />
            )}
            {isEngineRunning ? "Stop Engine" : "Start Engine"}
          </Button>

          <p className="text-xs text-muted-foreground text-center mt-3">
            {!isOnline 
              ? "Vehicle is offline - commands unavailable" 
              : "Remote engine control requires verification"}
          </p>
        </CardContent>
      </Card>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
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
            <AlertDialogCancel onClick={() => setPendingCommand(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              className={cn(
                pendingCommand === "stop_engine"
                  ? "bg-red-500 hover:bg-red-600"
                  : "bg-green-500 hover:bg-green-600"
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
