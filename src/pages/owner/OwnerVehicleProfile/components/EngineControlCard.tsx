import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
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
import { Loader2, Power, PowerOff, WifiOff } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  const [pendingCommand, setPendingCommand] = useState<"immobilize_engine" | "demobilize_engine" | null>(null);
  const { mutate: executeCommand, isPending: isCommandPending } = useVehicleCommand();

  const handleCommandRequest = (command: "immobilize_engine" | "demobilize_engine") => {
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
        <CardContent className="p-6">
          <div className="flex items-center justify-center mb-6">
            <span className="font-medium text-foreground">Security Control</span>
          </div>

          {!isOnline && (
            <Alert className="mb-4 bg-muted/50 border-muted">
              <WifiOff className="h-4 w-4" />
              <AlertDescription className="text-sm">
                Vehicle is offline. Engine controls are unavailable until the vehicle reconnects.
              </AlertDescription>
            </Alert>
          )}
          
          <div className="flex items-center justify-center gap-6">
            {/* Engine On Button */}
            <button
              onClick={() => handleCommandRequest("demobilize_engine")}
              disabled={isCommandPending || !isOnline}
              className={cn(
                "w-16 h-16 rounded-full transition-all duration-200 flex items-center justify-center",
                "shadow-neumorphic-sm bg-card text-green-500",
                "hover:shadow-neumorphic active:shadow-neumorphic-inset",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
              )}
              aria-label="Engine On"
              title={!isOnline ? "Vehicle is offline" : "Engine On"}
            >
              {isCommandPending && pendingCommand === "demobilize_engine" ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <Power className="h-6 w-6" />
              )}
            </button>

            {/* Engine Off Button */}
            <button
              onClick={() => handleCommandRequest("immobilize_engine")}
              disabled={isCommandPending || !isOnline}
              className={cn(
                "w-16 h-16 rounded-full transition-all duration-200 flex items-center justify-center",
                "shadow-neumorphic-sm bg-card text-destructive",
                "hover:shadow-neumorphic active:shadow-neumorphic-inset",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "focus:outline-none focus:ring-2 focus:ring-destructive focus:ring-offset-2"
              )}
              aria-label="Engine Off"
              title={!isOnline ? "Vehicle is offline" : "Engine Off"}
            >
              {isCommandPending && pendingCommand === "immobilize_engine" ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <PowerOff className="h-6 w-6" />
              )}
            </button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent className="bg-card border-border shadow-neumorphic">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingCommand === "immobilize_engine" 
                ? "Immobilize Vehicle?" 
                : "Mobilize Vehicle?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingCommand === "immobilize_engine" 
                ? "This will cut the fuel supply. If the vehicle is moving, it may stop abruptly or fail to accelerate. Ensure it is safe to do so."
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
                pendingCommand === "immobilize_engine"
                  ? "bg-destructive hover:bg-destructive/90"
                  : "bg-green-600 hover:bg-green-700 text-white"
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
