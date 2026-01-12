import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ProfileWithAssignments {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  user_id: string | null;
  assignmentCount: number;
}

export interface VehicleWithAssignment {
  device_id: string;
  device_name: string;
  device_type: string | null;
  gps_owner: string | null;
  group_name: string | null;
  assignedTo: {
    profile_id: string;
    profile_name: string;
    vehicle_alias: string | null;
  } | null;
}

export interface AssignmentStats {
  totalVehicles: number;
  assignedVehicles: number;
  unassignedVehicles: number;
  totalUsers: number;
  usersWithVehicles: number;
}

export function useAssignmentStats() {
  return useQuery({
    queryKey: ["assignment-stats"],
    queryFn: async (): Promise<AssignmentStats> => {
      const [vehiclesRes, assignmentsRes, profilesRes] = await Promise.all([
        (supabase.from("vehicles" as any).select("device_id", { count: "exact", head: true }) as any),
        (supabase.from("vehicle_assignments" as any).select("device_id", { count: "exact", head: true }) as any),
        (supabase.from("profiles" as any).select("id", { count: "exact", head: true }) as any),
      ]);

      const totalVehicles = vehiclesRes.count || 0;
      const assignedVehicles = assignmentsRes.count || 0;
      const totalUsers = profilesRes.count || 0;

      // Get users with at least one vehicle
      const { data: usersWithAssignments } = await (supabase
        .from("vehicle_assignments" as any)
        .select("profile_id")
        .not("profile_id", "is", null) as any);

      const uniqueUsersWithVehicles = new Set((usersWithAssignments as any[])?.map((a: any) => a.profile_id)).size;

      return {
        totalVehicles,
        assignedVehicles,
        unassignedVehicles: totalVehicles - assignedVehicles,
        totalUsers,
        usersWithVehicles: uniqueUsersWithVehicles,
      };
    },
  });
}

export function useProfiles() {
  return useQuery({
    queryKey: ["profiles-with-assignments"],
    queryFn: async (): Promise<ProfileWithAssignments[]> => {
      // Get all profiles
      const { data: profiles, error } = await (supabase
        .from("profiles" as any)
        .select("id, name, email, phone, user_id")
        .order("name") as any);

      if (error) throw error;

      // Get assignment counts per profile
      const { data: assignments } = await (supabase
        .from("vehicle_assignments" as any)
        .select("profile_id") as any);

      const countMap = new Map<string, number>();
      ((assignments || []) as any[]).forEach((a: any) => {
        if (a.profile_id) {
          countMap.set(a.profile_id, (countMap.get(a.profile_id) || 0) + 1);
        }
      });

      return ((profiles || []) as any[]).map((p: any) => ({
        ...p,
        assignmentCount: countMap.get(p.id) || 0,
      }));
    },
  });
}

export function useVehiclesWithAssignments(search: string = "", filter: "all" | "assigned" | "unassigned" = "all") {
  return useQuery({
    queryKey: ["vehicles-with-assignments", search, filter],
    queryFn: async (): Promise<VehicleWithAssignment[]> => {
      // Get ALL vehicles - no limit for admin panel
      let query = (supabase
        .from("vehicles" as any)
        .select("device_id, device_name, device_type, gps_owner, group_name")
        .order("device_name")) as any;

      if (search) {
        query = query.or(`device_name.ilike.%${search}%,device_id.ilike.%${search}%,gps_owner.ilike.%${search}%`);
      }

      const { data: vehicles, error } = await query;
      if (error) throw error;

      // Get all assignments with profile names
      const { data: assignments } = await (supabase
        .from("vehicle_assignments" as any)
        .select(`
          device_id,
          profile_id,
          vehicle_alias,
          profiles:profile_id (name)
        `) as any);

      const assignmentMap = new Map<string, { profile_id: string; profile_name: string; vehicle_alias: string | null }>();
      ((assignments || []) as any[]).forEach((a: any) => {
        if (a.profile_id) {
          assignmentMap.set(a.device_id, {
            profile_id: a.profile_id,
            profile_name: (a.profiles as any)?.name || "Unknown",
            vehicle_alias: a.vehicle_alias,
          });
        }
      });

      let result = ((vehicles || []) as any[]).map((v: any) => ({
        ...v,
        assignedTo: assignmentMap.get(v.device_id) || null,
      }));

      // Apply filter
      if (filter === "assigned") {
        result = result.filter((v: any) => v.assignedTo !== null);
      } else if (filter === "unassigned") {
        result = result.filter((v: any) => v.assignedTo === null);
      }

      return result;
    },
  });
}

// Get unique GPS owners from vehicles
export function useGpsOwners() {
  return useQuery({
    queryKey: ["gps-owners"],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("vehicles" as any)
        .select("gps_owner")
        .not("gps_owner", "is", null)
        .order("gps_owner") as any);

      if (error) throw error;

      // Get unique owners with vehicle counts
      const ownerCounts = new Map<string, number>();
      ((data || []) as any[]).forEach((v: any) => {
        if (v.gps_owner) {
          ownerCounts.set(v.gps_owner, (ownerCounts.get(v.gps_owner) || 0) + 1);
        }
      });

      return Array.from(ownerCounts.entries()).map(([owner, count]) => ({
        gps_owner: owner,
        vehicleCount: count,
      }));
    },
  });
}

// Unassign ALL vehicles (reset all assignments)
export function useUnassignAllVehicles() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { error, count } = await (supabase
        .from("vehicle_assignments" as any)
        .delete()
        .neq("device_id", "") as any); // Delete all rows

      if (error) throw error;
      return { unassigned: count || 0 };
    },
    onSuccess: (data) => {
      toast.success(`Successfully unassigned all ${data.unassigned} vehicle(s)`);
      queryClient.invalidateQueries({ queryKey: ["vehicles-with-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["profiles-with-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["assignment-stats"] });
    },
    onError: (error) => {
      toast.error(`Failed to unassign all: ${error.message}`);
    },
  });
}

export function useAssignVehicles() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      deviceIds, 
      profileId, 
      vehicleAliases 
    }: { 
      deviceIds: string[]; 
      profileId: string; 
      vehicleAliases?: Record<string, string>;
    }) => {
      // Upsert assignments one by one (Supabase doesn't support bulk upsert well with ON CONFLICT)
      const results = await Promise.all(
        deviceIds.map(async (deviceId) => {
          const { error } = await (supabase
            .from("vehicle_assignments" as any)
            .upsert({
              device_id: deviceId,
              profile_id: profileId,
              vehicle_alias: vehicleAliases?.[deviceId] || null,
              updated_at: new Date().toISOString(),
            } as any, {
              onConflict: "device_id",
            }) as any);
          return { deviceId, error };
        })
      );

      const errors = results.filter(r => r.error);
      if (errors.length > 0) {
        throw new Error(`Failed to assign ${errors.length} vehicles`);
      }

      return { assigned: deviceIds.length };
    },
    onSuccess: (data) => {
      toast.success(`Successfully assigned ${data.assigned} vehicle(s)`);
      queryClient.invalidateQueries({ queryKey: ["vehicles-with-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["profiles-with-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["assignment-stats"] });
    },
    onError: (error) => {
      toast.error(`Assignment failed: ${error.message}`);
    },
  });
}

export function useBulkAutoAssign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (assignments: { deviceId: string; profileId: string }[]) => {
      const results = await Promise.all(
        assignments.map(async ({ deviceId, profileId }) => {
          const { error } = await (supabase
            .from("vehicle_assignments" as any)
            .upsert({
              device_id: deviceId,
              profile_id: profileId,
              updated_at: new Date().toISOString(),
            } as any, {
              onConflict: "device_id",
            }) as any);
          return { deviceId, error };
        })
      );

      const errors = results.filter(r => r.error);
      if (errors.length > 0) {
        throw new Error(`Failed to assign ${errors.length} vehicles`);
      }

      return { assigned: assignments.length };
    },
    onSuccess: (data) => {
      toast.success(`Auto-assigned ${data.assigned} vehicle(s) successfully`);
      queryClient.invalidateQueries({ queryKey: ["vehicles-with-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["profiles-with-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["assignment-stats"] });
    },
    onError: (error) => {
      toast.error(`Auto-assignment failed: ${error.message}`);
    },
  });
}

export function useUnassignVehicles() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (deviceIds: string[]) => {
      const { error } = await (supabase
        .from("vehicle_assignments" as any)
        .delete()
        .in("device_id", deviceIds) as any);

      if (error) throw error;
      return { unassigned: deviceIds.length };
    },
    onSuccess: (data) => {
      toast.success(`Successfully unassigned ${data.unassigned} vehicle(s)`);
      queryClient.invalidateQueries({ queryKey: ["vehicles-with-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["profiles-with-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["assignment-stats"] });
    },
    onError: (error) => {
      toast.error(`Unassignment failed: ${error.message}`);
    },
  });
}

export function useCreateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ name, email, phone }: { name: string; email?: string; phone?: string }) => {
      const { data, error } = await (supabase
        .from("profiles" as any)
        .insert({ name, email, phone } as any)
        .select()
        .single() as any);

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Profile created successfully");
      queryClient.invalidateQueries({ queryKey: ["profiles-with-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["assignment-stats"] });
    },
    onError: (error) => {
      toast.error(`Failed to create profile: ${error.message}`);
    },
  });
}

// Bulk create profiles from GPS owner names
export function useBulkCreateProfiles() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (gpsOwnerNames: string[]) => {
      // Detect if GPS owner looks like a phone number
      const isPhoneNumber = (value: string) => {
        const digits = value.replace(/\D/g, "");
        return digits.length >= 10;
      };

      const profilesToCreate = gpsOwnerNames.map((ownerName) => {
        if (isPhoneNumber(ownerName)) {
          // If it looks like a phone, use it as phone and generate a name
          return {
            name: ownerName,
            phone: ownerName,
          };
        } else {
          // Otherwise use as name
          return {
            name: ownerName,
          };
        }
      });

      const { data, error } = await (supabase
        .from("profiles" as any)
        .insert(profilesToCreate as any)
        .select() as any);

      if (error) throw error;
      return { created: data?.length || 0 };
    },
    onSuccess: (data) => {
      toast.success(`Successfully created ${data.created} profile(s)`);
      queryClient.invalidateQueries({ queryKey: ["profiles-with-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["assignment-stats"] });
      queryClient.invalidateQueries({ queryKey: ["gps-owners"] });
    },
    onError: (error) => {
      toast.error(`Failed to create profiles: ${error.message}`);
    },
  });
}
