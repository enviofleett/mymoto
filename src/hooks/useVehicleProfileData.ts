import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ... [Keep existing Interfaces like VehicleTrip, VehicleEvent, etc.] ...

// ============ Command Execution ============

interface CommandPayload {
  device_id: string;
  // UPDATE: Changed types to match new requirements
  command_type: "immobilize_engine" | "demobilize_engine"; 
  confirmed?: boolean;
}

async function executeVehicleCommand(payload: CommandPayload): Promise<{ success: boolean; message: string }> {
  // The Edge Function will map:
  // 'immobilize_engine' -> cmdcode: "TYPE_SERVER_SET_RELAY_OIL", params: ["1"]
  // 'demobilize_engine' -> cmdcode: "TYPE_SERVER_SET_RELAY_OIL", params: ["0"]
  
  const { data, error } = await supabase.functions.invoke("execute-vehicle-command", {
    body: payload,
  });

  if (error) {
    throw new Error(error.message || "Failed to execute command");
  }

  return data as { success: boolean; message: string };
}

// ... [Keep the rest of the file unchanged] ...

export function useVehicleCommand() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: executeVehicleCommand,
    onSuccess: (data, variables) => {
      if (data.success) {
        // Success message based on command type
        const action = variables.command_type === 'immobilize_engine' ? 'Immobilized' : 'Mobilized';
        toast.success(data.message || `Vehicle ${action} successfully`);
        
        // Invalidate queries to refresh data
        queryClient.invalidateQueries({ queryKey: ["vehicle-events", variables.device_id] });
        queryClient.invalidateQueries({ queryKey: ["vehicle-live-data", variables.device_id] });
      } else {
        toast.error(data.message || "Command failed");
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to send command");
    },
  });
}
