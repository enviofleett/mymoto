import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
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
  XCircle,
  Clock,
  Loader2,
  Ban,
  AlertTriangle,
  Shield
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface CommandHistoryProps {
  deviceId: string;
}

interface VehicleCommand {
  id: string;
  device_id: string;
  command_type: string;
  command_text: string;
  status: string;
  priority: string;
  requires_confirmation: boolean;
  safety_warnings: string[];
  requested_by: string;
  requester_email: string;
  approved_by: string | null;
  created_at: string;
  execution_result: any;
  execution_error: string | null;
  age_minutes: number;
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
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  validating: 'bg-blue-100 text-blue-800 border-blue-200',
  approved: 'bg-green-100 text-green-800 border-green-200',
  rejected: 'bg-red-100 text-red-800 border-red-200',
  executing: 'bg-purple-100 text-purple-800 border-purple-200',
  completed: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  failed: 'bg-red-100 text-red-800 border-red-200',
  cancelled: 'bg-gray-100 text-gray-800 border-gray-200',
  timed_out: 'bg-orange-100 text-orange-800 border-orange-200'
};

const STATUS_ICONS: Record<string, any> = {
  pending: Clock,
  validating: Loader2,
  approved: CheckCircle,
  rejected: XCircle,
  executing: Loader2,
  completed: CheckCircle,
  failed: XCircle,
  cancelled: Ban,
  timed_out: AlertTriangle
};

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-gray-500',
  normal: 'bg-blue-500',
  high: 'bg-orange-500',
  urgent: 'bg-red-500'
};

export function CommandHistory({ deviceId }: CommandHistoryProps) {
  const [commands, setCommands] = useState<VehicleCommand[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [commandToApprove, setCommandToApprove] = useState<VehicleCommand | null>(null);
  const [approving, setApproving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchCommands();

    // Subscribe to new commands
    const channel = supabase
      .channel('vehicle_commands')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vehicle_commands',
          filter: `device_id=eq.${deviceId}`
        },
        () => {
          fetchCommands();
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [deviceId]);

  const fetchCommands = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_vehicle_commands', {
        p_device_id: deviceId,
        p_user_id: null,
        p_status: null,
        p_limit: 50
      });

      if (error) throw error;
      setCommands(data || []);
    } catch (err) {
      console.error('Error fetching commands:', err);
      toast({
        title: "Error",
        description: "Failed to load command history",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (commandId: string) => {
    setCancelling(commandId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase.rpc('cancel_vehicle_command', {
        p_command_id: commandId,
        p_user_id: user.id
      });

      if (error) throw error;

      toast({
        title: "Cancelled",
        description: "Command has been cancelled"
      });

      await fetchCommands();
    } catch (err) {
      console.error('Error cancelling command:', err);
      toast({
        title: "Error",
        description: "Failed to cancel command",
        variant: "destructive"
      });
    } finally {
      setCancelling(null);
    }
  };

  const handleApprove = async (safetyOverride: boolean = false) => {
    if (!commandToApprove) return;

    setApproving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase.rpc('approve_vehicle_command', {
        p_command_id: commandToApprove.id,
        p_user_id: user.id,
        p_safety_override: safetyOverride
      });

      if (error) throw error;

      toast({
        title: "Approved",
        description: "Command has been approved for execution"
      });

      setCommandToApprove(null);
      await fetchCommands();
    } catch (err) {
      console.error('Error approving command:', err);
      toast({
        title: "Error",
        description: "Failed to approve command",
        variant: "destructive"
      });
    } finally {
      setApproving(false);
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
        <p className="text-xs mt-1">Command history will appear here</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {commands.map((command) => {
          const Icon = COMMAND_ICONS[command.command_type] || Shield;
          const StatusIcon = STATUS_ICONS[command.status] || Clock;
          const statusColor = STATUS_COLORS[command.status] || STATUS_COLORS.pending;
          const priorityColor = PRIORITY_COLORS[command.priority] || PRIORITY_COLORS.normal;
          const timeAgo = formatDistanceToNow(new Date(command.created_at), { addSuffix: true });
          const canCancel = ['pending', 'approved', 'validating'].includes(command.status);
          const needsApproval = command.status === 'pending' && command.requires_confirmation;

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
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {command.command_text}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge className={`${priorityColor} text-white text-xs`}>
                        {command.priority.toUpperCase()}
                      </Badge>
                      <div className="flex items-center gap-1">
                        <StatusIcon className={`h-4 w-4 ${command.status === 'executing' ? 'animate-spin' : ''}`} />
                        <Badge variant="outline" className="text-xs capitalize">
                          {command.status}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {command.safety_warnings && command.safety_warnings.length > 0 && (
                    <div className="flex items-start gap-2 mb-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs">
                      <AlertTriangle className="h-3 w-3 text-yellow-600 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        {command.safety_warnings.map((warning, i) => (
                          <p key={i} className="text-yellow-800">{warning}</p>
                        ))}
                      </div>
                    </div>
                  )}

                  {command.execution_error && (
                    <div className="text-xs text-red-600 mb-2 p-2 bg-red-50 border border-red-200 rounded">
                      <strong>Error:</strong> {command.execution_error}
                    </div>
                  )}

                  <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {timeAgo}
                    </span>
                    {command.requester_email && (
                      <span className="truncate">
                        by {command.requester_email}
                      </span>
                    )}
                  </div>

                  <div className="flex gap-2">
                    {needsApproval && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => setCommandToApprove(command)}
                        className="h-7 text-xs"
                      >
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Approve
                      </Button>
                    )}
                    {canCancel && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCancel(command.id)}
                        disabled={cancelling === command.id}
                        className="h-7 text-xs"
                      >
                        {cancelling === command.id ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                            Cancelling...
                          </>
                        ) : (
                          <>
                            <Ban className="h-3 w-3 mr-1" />
                            Cancel
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Approval Dialog */}
      <AlertDialog open={!!commandToApprove} onOpenChange={(open) => !open && setCommandToApprove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve Command</AlertDialogTitle>
            <AlertDialogDescription>
              {commandToApprove && (
                <div className="space-y-3">
                  <p className="font-medium text-foreground capitalize">
                    {commandToApprove.command_type.replace(/_/g, ' ')}
                  </p>
                  <p>"{commandToApprove.command_text}"</p>

                  {commandToApprove.safety_warnings && commandToApprove.safety_warnings.length > 0 && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded p-3 space-y-2">
                      <div className="flex items-center gap-2 text-yellow-800 font-medium text-sm">
                        <AlertTriangle className="h-4 w-4" />
                        Safety Warnings:
                      </div>
                      {commandToApprove.safety_warnings.map((warning, i) => (
                        <p key={i} className="text-sm text-yellow-800">• {warning}</p>
                      ))}
                    </div>
                  )}

                  <p className="text-sm">
                    Are you sure you want to approve this command for execution?
                  </p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={approving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleApprove(false)}
              disabled={approving}
            >
              {approving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Approving...
                </>
              ) : (
                'Approve'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
