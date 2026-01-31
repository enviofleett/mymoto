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
import { ShieldAlert, ShieldCheck, Loader2, Power } from "lucide-react";
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
  const [pendingCommand, setPendingCommand] = useState<"immobilize_engine" | "demobilize_engine" | "shutdown_engine" | null>(null);
  const { mutate: executeCommand, isPending: isCommandPending } = useVehicleCommand();

  // Note: True relay status is not always available in basic GPS heartbeat.
  // We use ignition status only as a safety warning.
  const isEngineRunning = ignitionOn === true;

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

          <div className="flex gap-3">
            {/* Demobilize (Enable) Button */}
            <button
              onClick={() => handleCommandRequest("demobilize_engine")}
              disabled={isCommandPending || !isOnline}
              className={cn(
                "w-full py-3 rounded-xl font-medium transition-all duration-200 flex items-center justify-center",
                "shadow-neumorphic-sm bg-card text-green-500",
                "hover:shadow-neumorphic active:shadow-neumorphic-inset",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {isCommandPending && pendingCommand === "demobilize_engine" ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Power className="h-4 w-4 mr-2" />
              )}
              Enable Engine
            </button>

            {/* Shutdown (Emergency) Button - Critical Style */}
            <button
              onClick={() => handleCommandRequest("shutdown_engine")}
              disabled={isCommandPending || !isOnline}
              className={cn(
                "w-full py-3 rounded-xl font-medium transition-all duration-200 flex items-center justify-center",
                "shadow-neumorphic-sm bg-card text-destructive",
                "hover:shadow-neumorphic active:shadow-neumorphic-inset",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {isCommandPending && pendingCommand === "shutdown_engine" ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Power className="h-4 w-4 mr-2" />
              )}
              Shutdown
            </button>
          </div>

          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
             <span>Status: {isOnline ? "Connected" : "Offline"}</span>
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
