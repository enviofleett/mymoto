import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Lock, Unlock, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface DoorControlCardProps {
  deviceId: string;
  isOnline: boolean;
}

export function DoorControlCard({ deviceId, isOnline }: DoorControlCardProps) {
  const [pendingCommand, setPendingCommand] = useState<"lock" | "unlock" | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleLock = async () => {
    setIsLoading(true);
    setPendingCommand("lock");
    
    try {
      const { error } = await supabase.functions.invoke("execute-vehicle-command", {
        body: { device_id: deviceId, command_type: "lock", skip_confirmation: true },
      });
      
      if (error) throw error;
      
      toast({
        title: "Doors Locked",
        description: "Lock command sent to vehicle",
      });
    } catch (err) {
      toast({
        title: "Lock Failed",
        description: err instanceof Error ? err.message : "Failed to lock doors",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setPendingCommand(null);
    }
  };

  const handleUnlock = async () => {
    setIsLoading(true);
    setPendingCommand("unlock");
    
    try {
      const { error } = await supabase.functions.invoke("execute-vehicle-command", {
        body: { device_id: deviceId, command_type: "unlock", skip_confirmation: true },
      });
      
      if (error) throw error;
      
      toast({
        title: "Doors Unlocked",
        description: "Unlock command sent to vehicle",
      });
    } catch (err) {
      toast({
        title: "Unlock Failed",
        description: err instanceof Error ? err.message : "Failed to unlock doors",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setPendingCommand(null);
    }
  };

  return (
    <Card className="border-0 bg-card shadow-neumorphic rounded-xl">
      <CardContent className="p-4">
        <div className="flex items-center gap-3 mb-4">
          {/* Neumorphic icon container */}
          <div className="w-10 h-10 rounded-full shadow-neumorphic-sm bg-card flex items-center justify-center">
            <Lock className="h-5 w-5 text-accent" />
          </div>
          <span className="font-medium text-foreground">Door Control</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Lock button - Neumorphic style */}
          <button
            onClick={handleLock}
            disabled={isLoading || !isOnline}
            className={cn(
              "flex flex-col items-center py-4 rounded-xl transition-all duration-200",
              "shadow-neumorphic-sm bg-card",
              "hover:shadow-neumorphic active:shadow-neumorphic-inset",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {isLoading && pendingCommand === "lock" ? (
              <Loader2 className="h-6 w-6 mb-2 animate-spin text-status-active" />
            ) : (
              <Lock className="h-6 w-6 mb-2 text-status-active" />
            )}
            <span className="text-sm font-medium text-foreground">Lock</span>
          </button>
          
          {/* Unlock button - Neumorphic style with orange accent */}
          <button
            onClick={handleUnlock}
            disabled={isLoading || !isOnline}
            className={cn(
              "flex flex-col items-center py-4 rounded-xl transition-all duration-200",
              "shadow-neumorphic-sm bg-card",
              "hover:shadow-neumorphic active:shadow-neumorphic-inset",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {isLoading && pendingCommand === "unlock" ? (
              <Loader2 className="h-6 w-6 mb-2 animate-spin text-accent" />
            ) : (
              <Unlock className="h-6 w-6 mb-2 text-accent" />
            )}
            <span className="text-sm font-medium text-foreground">Unlock</span>
          </button>
        </div>

        <p className="text-xs text-muted-foreground text-center mt-3">
          {!isOnline 
            ? "Vehicle is offline - commands unavailable" 
            : "Remotely lock or unlock your vehicle doors"}
        </p>
      </CardContent>
    </Card>
  );
}
