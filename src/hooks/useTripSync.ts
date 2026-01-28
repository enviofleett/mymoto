import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import type { VehicleTrip } from "./useVehicleProfile";

export interface TripSyncStatus {
  id: string;
  device_id: string;
  last_sync_at: string;
  last_position_processed: string | null;
  sync_status: "idle" | "processing" | "completed" | "error";
  trips_processed: number;
  trips_total: number | null;
  sync_progress_percent: number | null;
  current_operation: string | null;
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

  if (!data) return null;

  const status = data as TripSyncStatus;
  
  // CRITICAL FIX: Detect and reset stuck sync statuses
  // A sync is "stuck" if it's been "processing" for more than 10 minutes
  if (status.sync_status === "processing" && status.updated_at) {
    const updatedAt = new Date(status.updated_at);
    const now = new Date();
    const minutesStuck = (now.getTime() - updatedAt.getTime()) / (1000 * 60);
    
    if (minutesStuck > 10) {
      console.warn(`[useTripSync] Detected stuck sync status for device ${deviceId} (stuck for ${minutesStuck.toFixed(1)} minutes). Resetting in database...`);
      
      // Call RPC function to reset stuck status in database
      try {
        const { data: resetResult, error: resetError } = await (supabase as any)
          .rpc('reset_stuck_sync_status', { p_device_id: deviceId });
        
        if (resetError) {
          // Check if RPC function doesn't exist yet (graceful degradation)
          if (resetError.message?.includes('function') && resetError.message?.includes('does not exist')) {
            console.warn(`[useTripSync] RPC function not found. Please run migration 20260126000000_reset_stuck_sync_status.sql. Using frontend-only reset.`);
            // Fall through to frontend-only reset
          } else {
            console.error(`[useTripSync] Failed to reset stuck sync status:`, resetError);
            // Fall through to frontend-only reset
          }
        } else if (resetResult?.success) {
          console.log(`[useTripSync] Successfully reset stuck sync status in database:`, resetResult.message);
          
          // Return reset status (will be fetched fresh on next query)
          return {
            ...status,
            sync_status: "idle" as const,
            error_message: resetResult.message || `Previous sync was stuck for ${minutesStuck.toFixed(1)} minutes and has been reset`,
          };
        }
      } catch (err) {
        console.error(`[useTripSync] Error calling reset RPC:`, err);
      }
      
      // Fallback: return reset status even if RPC call failed (frontend-only)
      return {
        ...status,
        sync_status: "idle" as const,
        error_message: `Previous sync was stuck for ${minutesStuck.toFixed(1)} minutes and has been reset`,
      };
    }
  }

  return status;
}

// Trigger manual sync
async function triggerTripSync(deviceId: string, forceFullSync: boolean = false): Promise<any> {
  // Get the current session - refresh if needed
  let { data: { session }, error: sessionError } = await supabase.auth.getSession();
  
  
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
  
  const { data, error } = await supabase.functions.invoke("sync-trips-incremental", {
    body: {
      device_ids: [deviceId],
      force_full_sync: forceFullSync,
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
      // CRITICAL FIX: Only refetch every 5 seconds when processing (was 2s), and every 30s when idle
      const status = query.state.data?.sync_status;
      return status === "processing" ? 5000 : (status === "idle" ? 30000 : false);
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

      // Create or update sync status optimistically
      queryClient.setQueryData(["trip-sync-status", deviceId], (old: TripSyncStatus | null) => {
        if (!old) {
          // If no status exists, create a new one optimistically
          return {
            id: '',
            device_id: deviceId,
            last_sync_at: new Date().toISOString(),
            last_position_processed: null,
            sync_status: "processing" as const,
            trips_processed: 0,
            trips_total: null,
            sync_progress_percent: 0,
            current_operation: "Initializing sync...",
            error_message: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
        }
        return { 
          ...old, 
          sync_status: "processing" as const,
          trips_processed: 0,
          trips_total: null,
          sync_progress_percent: 0,
          current_operation: "Starting sync...",
        };
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
          const newTrip = payload.new as VehicleTrip;
          if (process.env.NODE_ENV === 'development') {
            console.log("[Realtime] New trip detected:", newTrip);
          }

          // Directly update cache instead of invalidating (instant update, no refetch delay)
          queryClient.setQueryData(
            ["vehicle-trips", deviceId],
            (oldData: VehicleTrip[] | undefined) => {
              if (!oldData) return [newTrip];
              
              // Check if trip already exists (prevent duplicates)
              const exists = oldData.some(t => 
                t.id === newTrip.id || 
                (t.start_time === newTrip.start_time && 
                 Math.abs((t.distance_km || 0) - (newTrip.distance_km || 0)) < 0.1)
              );
              
              if (exists) return oldData;
              
              // Add new trip at the beginning (most recent first)
              return [newTrip, ...oldData];
            }
          );
          
          // Update sync status to reflect new trip processed (real-time countdown)
          queryClient.setQueryData(
            ["trip-sync-status", deviceId],
            (oldStatus: TripSyncStatus | null | undefined) => {
              if (!oldStatus || oldStatus.sync_status !== 'processing') {
                return oldStatus;
              }
              
              const newTripsProcessed = (oldStatus.trips_processed || 0) + 1;
              const tripsTotal = oldStatus.trips_total;
              
              // Calculate new progress
              const newProgress = tripsTotal && tripsTotal > 0
                ? Math.round((newTripsProcessed / tripsTotal) * 100)
                : oldStatus.sync_progress_percent;
              
              return {
                ...oldStatus,
                trips_processed: newTripsProcessed,
                sync_progress_percent: newProgress,
              };
            }
          );
          
          // Invalidate related queries (for derived stats)
          queryClient.invalidateQueries({ queryKey: ["mileage-stats", deviceId] });
          queryClient.invalidateQueries({ queryKey: ["vehicle-daily-stats", deviceId] });

          // Show toast notification with trip details (only if not in silent mode)
          // Don't show toast during sync to avoid spam - progress card shows it
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
