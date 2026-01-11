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
        supabase.from("vehicles").select("device_id", { count: "exact", head: true }),
        supabase.from("vehicle_assignments").select("device_id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
      ]);

      const totalVehicles = vehiclesRes.count || 0;
      const assignedVehicles = assignmentsRes.count || 0;
      const totalUsers = profilesRes.count || 0;

      // Get users with at least one vehicle
      const { data: usersWithAssignments } = await supabase
        .from("vehicle_assignments")
        .select("profile_id")
        .not("profile_id", "is", null);

      const uniqueUsersWithVehicles = new Set(usersWithAssignments?.map(a => a.profile_id)).size;

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
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, name, email, phone, user_id")
        .order("name");

      if (error) throw error;

      // Get assignment counts per profile
      const { data: assignments } = await supabase
        .from("vehicle_assignments")
        .select("profile_id");

      const countMap = new Map<string, number>();
      assignments?.forEach(a => {
        if (a.profile_id) {
          countMap.set(a.profile_id, (countMap.get(a.profile_id) || 0) + 1);
        }
      });

      return (profiles || []).map(p => ({
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
      // Get all vehicles
      let query = supabase
        .from("vehicles")
        .select("device_id, device_name, device_type, gps_owner, group_name")
        .order("device_name");

      if (search) {
        query = query.or(`device_name.ilike.%${search}%,device_id.ilike.%${search}%,gps_owner.ilike.%${search}%`);
      }

      const { data: vehicles, error } = await query.limit(500);
      if (error) throw error;

      // Get all assignments with profile names
      const { data: assignments } = await supabase
        .from("vehicle_assignments")
        .select(`
          device_id,
          profile_id,
          vehicle_alias,
          profiles:profile_id (name)
        `);

      const assignmentMap = new Map<string, { profile_id: string; profile_name: string; vehicle_alias: string | null }>();
      assignments?.forEach(a => {
        if (a.profile_id) {
          assignmentMap.set(a.device_id, {
            profile_id: a.profile_id,
            profile_name: (a.profiles as any)?.name || "Unknown",
            vehicle_alias: a.vehicle_alias,
          });
        }
      });

      let result = (vehicles || []).map(v => ({
        ...v,
        assignedTo: assignmentMap.get(v.device_id) || null,
      }));

      // Apply filter
      if (filter === "assigned") {
        result = result.filter(v => v.assignedTo !== null);
      } else if (filter === "unassigned") {
        result = result.filter(v => v.assignedTo === null);
      }

      return result;
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
          const { error } = await supabase
            .from("vehicle_assignments")
            .upsert({
              device_id: deviceId,
              profile_id: profileId,
              vehicle_alias: vehicleAliases?.[deviceId] || null,
              updated_at: new Date().toISOString(),
            }, {
              onConflict: "device_id",
            });
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

export function useUnassignVehicles() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (deviceIds: string[]) => {
      const { error } = await supabase
        .from("vehicle_assignments")
        .delete()
        .in("device_id", deviceIds);

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
      const { data, error } = await supabase
        .from("profiles")
        .insert({ name, email, phone })
        .select()
        .single();

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
