import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Lock,
  Unlock,
  AlertOctagon,
  Play,
  Gauge,
  MapPin,
  Radio,
  Power,
  Bell,
  BellOff,
  CheckCircle,
  Clock,
  Loader2,
  Shield
} from "lucide-react";
import { formatRelativeTime } from "@/lib/timezone";

interface CommandHistoryProps {
  deviceId: string;
}

interface VehicleCommand {
  id: string;
  device_id: string;
  command_type: string;
  status: string;
  created_at: string;
  result?: Record<string, unknown>;
  error_message?: string;
  user_id?: string;
}

const COMMAND_ICONS: Record<string, any> = {
  lock: Lock,
  unlock: Unlock,
  immobilize: AlertOctagon,
  restore: Play,
  set_speed_limit: Gauge,
  clear_speed_limit: Gauge,
  enable_geofence: MapPin,
  disable_geofence: MapPin,
  request_location: Radio,
  request_status: Radio,
  start_engine: Power,
  stop_engine: Power,
  sound_alarm: Bell,
  silence_alarm: BellOff
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-700',
  executing: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700',
  success: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700',
  completed: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700',
  failed: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700'
};

export function CommandHistory({ deviceId }: CommandHistoryProps) {
  const [commands, setCommands] = useState<VehicleCommand[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchCommands();
    
    // Set up realtime subscription for command updates
    const channel = supabase
      .channel(`command_logs:${deviceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vehicle_command_logs',
          filter: `device_id=eq.${deviceId}`
        },
        () => {
          fetchCommands();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [deviceId]);

  const confirmCommand = async (commandId: string) => {
    try {
      toast({
        title: "Confirming Command...",
        description: "Please wait while we process your request.",
      });

      const { data, error } = await supabase.functions.invoke('execute-vehicle-command', {
        body: { command_id: commandId, skip_confirmation: true }
      });
      
      if (error) throw error;
      
      if (!data.success) {
        throw new Error(data.message || "Command confirmation failed");
      }

      toast({
        title: "Command Confirmed",
        description: "The command is now being executed.",
      });
      
      // Refresh list
      fetchCommands();
    } catch (error: any) {
      console.error('Error confirming command:', error);
      toast({
        variant: "destructive",
        title: "Confirmation Failed",
        description: error.message || "Could not confirm command",
      });
    }
  };

  const fetchCommands = async () => {
    setLoading(true);
    try {
      // Fetch from actual vehicle_command_logs table
      const { data, error } = await (supabase as any)
        .from('vehicle_command_logs')
        .select('id, device_id, command_type, status, created_at, result, error_message, user_id')
        .eq('device_id', deviceId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      
      setCommands((data as VehicleCommand[]) || []);
    } catch (err) {
      console.error('Error fetching commands:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading commands...
      </div>
    );
  }

  if (commands.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Shield className="h-12 w-12 mx-auto mb-3 opacity-40" />
        <p className="text-sm">No commands yet</p>
        <p className="text-xs mt-1">Use the Lock/Unlock buttons or chat to send commands</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {commands.map((command) => {
        const Icon = COMMAND_ICONS[command.command_type] || Shield;
        const statusColor = STATUS_COLORS[command.status] || STATUS_COLORS.pending;
        const timeAgo = formatRelativeTime(new Date(command.created_at));
        const isSuccess = command.status === 'success' || command.status === 'completed';
        const isFailed = command.status === 'failed';
        const isPending = command.status === 'pending' || command.status === 'executing';

        return (
          <Card
            key={command.id}
            className={`p-4 border-l-4 ${statusColor}`}
          >
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-full ${statusColor} bg-opacity-20`}>
                <Icon className="h-5 w-5" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div>
                    <h4 className="font-semibold text-sm leading-tight capitalize">
                      {command.command_type.replace(/_/g, ' ')}
                    </h4>
                    {command.error_message && (
                      <p className="text-xs text-red-500 mt-0.5">
                        {command.error_message}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {command.status === 'pending' && (
                      <Button 
                        size="sm" 
                        variant="default" 
                        className="h-7 text-xs bg-yellow-600 hover:bg-yellow-700 text-white mr-1 px-2"
                        onClick={() => confirmCommand(command.id)}
                      >
                        Confirm
                      </Button>
                    )}
                    {isSuccess && <CheckCircle className="h-4 w-4 text-green-600" />}
                    {isFailed && <AlertOctagon className="h-4 w-4 text-red-600" />}
                    {isPending && <Loader2 className="h-4 w-4 text-yellow-600 animate-spin" />}
                    <Badge variant="outline" className="text-xs capitalize">
                      {command.status}
                    </Badge>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {timeAgo}
                  </span>
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}