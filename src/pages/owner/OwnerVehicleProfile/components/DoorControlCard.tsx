import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lock, Unlock, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
    <Card className="border-border bg-card/50">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-2 rounded-full bg-blue-500/10">
            <Lock className="h-4 w-4 text-blue-500" />
          </div>
          <span className="font-medium text-foreground">Door Control</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            className="flex flex-col items-center py-4 h-auto border-green-500/30 hover:border-green-500/50 hover:bg-green-500/5"
            onClick={handleLock}
            disabled={isLoading || !isOnline}
          >
            {isLoading && pendingCommand === "lock" ? (
              <Loader2 className="h-5 w-5 mb-1 animate-spin text-green-500" />
            ) : (
              <Lock className="h-5 w-5 mb-1 text-green-500" />
            )}
            <span className="text-sm font-medium">Lock Doors</span>
          </Button>
          
          <Button
            variant="outline"
            className="flex flex-col items-center py-4 h-auto border-orange-500/30 hover:border-orange-500/50 hover:bg-orange-500/5"
            onClick={handleUnlock}
            disabled={isLoading || !isOnline}
          >
            {isLoading && pendingCommand === "unlock" ? (
              <Loader2 className="h-5 w-5 mb-1 animate-spin text-orange-500" />
            ) : (
              <Unlock className="h-5 w-5 mb-1 text-orange-500" />
            )}
            <span className="text-sm font-medium">Unlock Doors</span>
          </Button>
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
