import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useEffect, useState } from "react";

export interface TripSyncStatus {
  id: string;
  device_id: string;
  last_sync_at: string;
  last_position_processed: string | null;
  sync_status: "idle" | "processing" | "completed" | "error";
  trips_processed: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

// Fetch sync status for a device
async function fetchTripSyncStatus(deviceId: string): Promise<TripSyncStatus | null> {
  const { data, error } = await (supabase as any)
    .from("trip_sync_status")
    .select("*")
    .eq("device_id", deviceId)
    .maybeSingle();

  if (error) {
    console.error("Error fetching sync status:", error);
    return null;
  }

  return data as TripSyncStatus | null;
}

// Trigger manual sync
async function triggerTripSync(deviceId: string, forceFullSync: boolean = false): Promise<any> {
  // Get the current session to ensure we send auth token
  const { data: { session } } = await supabase.auth.getSession();
  
  const { data, error } = await supabase.functions.invoke("sync-trips-incremental", {
    body: {
      device_ids: [deviceId],
      force_full_sync: forceFullSync,
    },
    headers: session?.access_token
      ? {
          Authorization: `Bearer ${session.access_token}`,
        }
      : undefined,
  });

  if (error) {
    throw new Error(error.message || "Failed to sync trips");
  }

  return data;
}

// Hook to get sync status
export function useTripSyncStatus(deviceId: string | null, enabled: boolean = true) {
  return useQuery({
    queryKey: ["trip-sync-status", deviceId],
    queryFn: () => fetchTripSyncStatus(deviceId!),
    enabled: enabled && !!deviceId,
    staleTime: 10 * 1000, // Fresh for 10 seconds
    refetchInterval: (query) => {
      // Auto-refetch every 5 seconds if status is "processing"
      const status = query.state.data?.sync_status;
      return status === "processing" ? 5000 : false;
    },
  });
}

// Hook to trigger manual sync
export function useTriggerTripSync() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ deviceId, forceFullSync }: { deviceId: string; forceFullSync?: boolean }) =>
      triggerTripSync(deviceId, forceFullSync),
    onMutate: async ({ deviceId }) => {
      // Optimistically update status to "processing"
      await queryClient.cancelQueries({ queryKey: ["trip-sync-status", deviceId] });

      const previousStatus = queryClient.getQueryData(["trip-sync-status", deviceId]);

      queryClient.setQueryData(["trip-sync-status", deviceId], (old: TripSyncStatus | null) => {
        if (!old) return null;
        return { ...old, sync_status: "processing" as const };
      });

      return { previousStatus };
    },
    onSuccess: (data, variables) => {
      const { deviceId } = variables;

      // Show success toast
      toast.success(`Synced ${data.trips_created || 0} new trips`, {
        description: `Processed ${data.devices_processed || 1} device(s) in ${data.duration_ms}ms`,
      });

      // Invalidate and refetch related queries
      queryClient.invalidateQueries({ queryKey: ["trip-sync-status", deviceId] });
      queryClient.invalidateQueries({ queryKey: ["vehicle-trips", deviceId] });
      queryClient.invalidateQueries({ queryKey: ["vehicle-events", deviceId] });
      queryClient.invalidateQueries({ queryKey: ["mileage-stats", deviceId] });
      queryClient.invalidateQueries({ queryKey: ["daily-mileage", deviceId] });
      queryClient.invalidateQueries({ queryKey: ["vehicle-daily-stats", deviceId] });
    },
    onError: (error: Error, variables, context) => {
      // Revert optimistic update on error
      if (context?.previousStatus) {
        queryClient.setQueryData(
          ["trip-sync-status", variables.deviceId],
          context.previousStatus
        );
      }

      toast.error("Failed to sync trips", {
        description: error.message,
      });
    },
  });
}

// Hook for realtime trip updates
export function useRealtimeTripUpdates(deviceId: string | null, enabled: boolean = true) {
  const queryClient = useQueryClient();
  const [isSubscribed, setIsSubscribed] = useState(false);

  useEffect(() => {
    if (!enabled || !deviceId) return;

    console.log(`[Realtime] Subscribing to trip updates for device: ${deviceId}`);

    // Subscribe to new trips
    const tripsChannel = supabase
      .channel(`trips:${deviceId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "vehicle_trips",
          filter: `device_id=eq.${deviceId}`,
        },
        (payload) => {
          console.log("[Realtime] New trip detected:", payload.new);

          // Invalidate trips query to refetch
          queryClient.invalidateQueries({ queryKey: ["vehicle-trips", deviceId] });
          queryClient.invalidateQueries({ queryKey: ["mileage-stats", deviceId] });
          queryClient.invalidateQueries({ queryKey: ["vehicle-daily-stats", deviceId] });

          // Show toast notification
          toast.success("New trip recorded", {
            description: "Travel history updated",
          });
        }
      )
      .subscribe((status) => {
        console.log(`[Realtime] Trips subscription status:`, status);
        setIsSubscribed(status === "SUBSCRIBED");
      });

    // Subscribe to sync status updates
    const syncChannel = supabase
      .channel(`sync-status:${deviceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "trip_sync_status",
          filter: `device_id=eq.${deviceId}`,
        },
        (payload) => {
          console.log("[Realtime] Sync status updated:", payload.new);

          // Update sync status query
          queryClient.setQueryData(
            ["trip-sync-status", deviceId],
            payload.new as TripSyncStatus
          );
        }
      )
      .subscribe();

    // Cleanup subscriptions
    return () => {
      console.log(`[Realtime] Unsubscribing from trip updates for device: ${deviceId}`);
      tripsChannel.unsubscribe();
      syncChannel.unsubscribe();
      setIsSubscribed(false);
    };
  }, [deviceId, enabled, queryClient]);

  return { isSubscribed };
}
