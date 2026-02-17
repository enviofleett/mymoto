import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import type { VehicleTrip } from "./useVehicleProfile";

export interface Gps51TripSyncStatus {
  id: string;
  device_id: string;
  last_trip_sync_at: string | null;
  last_trip_synced: string | null;
  trips_synced_count: number | null;
  trip_sync_error: string | null;
  sync_status: "idle" | "syncing" | "completed" | "error";
  created_at: string;
  updated_at: string;
}

// Fetch sync status for a device
async function fetchTripSyncStatus(deviceId: string): Promise<Gps51TripSyncStatus | null> {
  const { data, error } = await (supabase as any)
    .from("gps51_sync_status")
    .select("*")
    .eq("device_id", deviceId)
    .maybeSingle();

  if (error) {
    console.error("Error fetching sync status:", error);
    return null;
  }

  if (!data) return null;

  return data as Gps51TripSyncStatus;
}

// Trigger manual sync
async function triggerTripSync(deviceId: string, forceFullSync: boolean = false, forceRecent: boolean = false): Promise<any> {
  // Get the current session - refresh if needed
  let { data: { session } } = await supabase.auth.getSession();
  
  
  // If no session, try to get user to ensure we're authenticated
  if (!session) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error("You must be logged in to sync trips. Please sign in and try again.");
    }
    // Retry getting session after user check
    const retry = await supabase.auth.getSession();
    session = retry.data.session;
  }
  
  // Ensure we have a valid access token
  if (!session?.access_token) {
    throw new Error("Authentication token is missing. Please sign in again.");
  }
  
  const now = new Date();
  const FULL_LOOKBACK_DAYS = 30;
  const DEFAULT_LOOKBACK_DAYS = 7;
  const RECENT_LOOKBACK_HOURS = 24;

  let begin = new Date(now);
  if (forceRecent) {
    begin = new Date(now.getTime() - RECENT_LOOKBACK_HOURS * 60 * 60 * 1000);
  } else if (forceFullSync) {
    begin = new Date(now.getTime() - FULL_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  } else {
    begin = new Date(now.getTime() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  }

  const { data, error } = await supabase.functions.invoke("sync-gps51-trips", {
    body: {
      deviceid: deviceId,
      begintime: begin.toISOString(),
      endtime: now.toISOString(),
    },
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });


  if (error) {
    // Provide more helpful error messages
    if (error.message?.includes("401") || error.message?.includes("Unauthorized")) {
      throw new Error("Authentication failed. Please sign in again or check if the function allows your access.");
    }
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
    staleTime: 5 * 1000, // Increased to 5 seconds to reduce refetch frequency
    refetchInterval: (query) => {
      // CRITICAL FIX: Only refetch every 5 seconds when syncing (was 2s), and every 30s when idle
      const status = query.state.data?.sync_status;
      return status === "syncing" ? 5000 : (status === "idle" ? 30000 : false);
    },
  });
}

// Hook to trigger manual sync
export function useTriggerTripSync() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ deviceId, forceFullSync, forceRecent }: { deviceId: string; forceFullSync?: boolean; forceRecent?: boolean }) =>
      triggerTripSync(deviceId, forceFullSync || false, forceRecent || false),
    onMutate: async ({ deviceId }) => {
      // Optimistically update status to "syncing"
      await queryClient.cancelQueries({ queryKey: ["trip-sync-status", deviceId] });

      const previousStatus = queryClient.getQueryData(["trip-sync-status", deviceId]);

      // Create or update sync status optimistically
      queryClient.setQueryData(["trip-sync-status", deviceId], (old: Gps51TripSyncStatus | null) => {
        if (!old) {
          // If no status exists, create a new one optimistically
          return {
            id: '',
            device_id: deviceId,
            last_trip_sync_at: new Date().toISOString(),
            last_trip_synced: null,
            trips_synced_count: 0,
            trip_sync_error: null,
            sync_status: "syncing" as const,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
        }
        return { 
          ...old, 
          sync_status: "syncing" as const,
          last_trip_sync_at: new Date().toISOString(),
        };
      });

      return { previousStatus };
    },
    onSuccess: (data, variables) => {
      const { deviceId } = variables;

      const inserted = data?.trips_inserted || 0;
      const updated = data?.trips_updated || 0;
      const received = data?.records_received || 0;
      const total = inserted + updated;

      toast.success(`Synced ${total} trip${total === 1 ? "" : "s"}`, {
        description: `Received ${received} trip${received === 1 ? "" : "s"} from GPS51`,
      });

      // Invalidate and refetch related queries
      queryClient.invalidateQueries({ queryKey: ["trip-sync-status", deviceId] });
      queryClient.invalidateQueries({ queryKey: ["vehicle-trips", deviceId] });
      queryClient.invalidateQueries({ queryKey: ["vehicle-events", deviceId] });
      queryClient.invalidateQueries({ queryKey: ["mileage-stats", deviceId] });
      queryClient.invalidateQueries({ queryKey: ["daily-mileage", deviceId] });
      queryClient.invalidateQueries({ queryKey: ["vehicle-daily-stats", deviceId] });
      queryClient.invalidateQueries({ queryKey: ["vehicle-live-data", deviceId] }); // Ensure odometer is refreshed
    },
    onError: (error: Error, variables, context) => {
      // Revert optimistic update on error
      if (context?.previousStatus) {
        queryClient.setQueryData(
          ["trip-sync-status", variables.deviceId],
          context.previousStatus
        );
      }

      // Provide user-friendly error messages for rate limit errors
      let errorMessage = "Failed to sync trips";
      let errorDescription = error.message;
      
      if (error.message?.includes("8902") || error.message?.includes("ip limit")) {
        errorMessage = "Rate limit reached";
        errorDescription = "GPS51 API rate limit exceeded. Please wait 1-2 minutes before syncing again.";
      } else if (error.message?.includes("rate limit")) {
        errorMessage = "Too many requests";
        errorDescription = "Please wait a moment before syncing again.";
      }

      toast.error(errorMessage, {
        description: errorDescription,
        duration: 5000, // Show for 5 seconds
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

    // Subscribe to new and updated trips
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
          const newTrip = payload.new as VehicleTrip;
          if (process.env.NODE_ENV === 'development') {
            console.log("[Realtime] New trip detected:", newTrip);
          }

          queryClient.setQueriesData(
            { queryKey: ["vehicle-trips", deviceId] },
            (oldData: VehicleTrip[] | undefined) => {
              if (!oldData) return [newTrip];
              
              const exists = oldData.some(t => 
                t.id === newTrip.id || 
                (t.start_time === newTrip.start_time && 
                 Math.abs((t.distance_km || 0) - (newTrip.distance_km || 0)) < 0.1)
              );
              
              if (exists) return oldData;
              
              return [newTrip, ...oldData];
            }
          );
          
          queryClient.invalidateQueries({ queryKey: ["mileage-stats", deviceId] });
          queryClient.invalidateQueries({ queryKey: ["vehicle-daily-stats", deviceId] });
          queryClient.invalidateQueries({ queryKey: ["daily-travel-stats", deviceId] });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "vehicle_trips",
          filter: `device_id=eq.${deviceId}`,
        },
        (payload) => {
          const updatedTrip = payload.new as VehicleTrip;
          if (process.env.NODE_ENV === 'development') {
            console.log("[Realtime] Trip updated:", updatedTrip);
          }

          queryClient.setQueriesData(
            { queryKey: ["vehicle-trips", deviceId] },
            (oldData: VehicleTrip[] | undefined) => {
              if (!oldData) return oldData;

              const index = oldData.findIndex(t => t.id === updatedTrip.id);
              if (index === -1) return oldData;

              const next = [...oldData];
              next[index] = { ...next[index], ...updatedTrip };
              return next;
            }
          );

          queryClient.invalidateQueries({ queryKey: ["mileage-stats", deviceId] });
          queryClient.invalidateQueries({ queryKey: ["vehicle-daily-stats", deviceId] });
          queryClient.invalidateQueries({ queryKey: ["daily-travel-stats", deviceId] });
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
          table: "gps51_sync_status",
          filter: `device_id=eq.${deviceId}`,
        },
        (payload) => {
          console.log("[Realtime] Sync status updated:", payload.new);

          // Update sync status query
          queryClient.setQueryData(
            ["trip-sync-status", deviceId],
            payload.new as Gps51TripSyncStatus
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
