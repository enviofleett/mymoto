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
  sim_number: string | null;
  group_id: string | null;
  last_synced_at: string | null;
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
        (supabase as any).from("vehicles").select("device_id", { count: "exact", head: true }),
        (supabase as any).from("vehicle_assignments").select("device_id", { count: "exact", head: true }),
        (supabase as any).from("profiles").select("id", { count: "exact", head: true }),
      ]);

      const totalVehicles = vehiclesRes.count || 0;
      const assignedVehicles = assignmentsRes.count || 0;
      const totalUsers = profilesRes.count || 0;

      // Get users with at least one vehicle
      const { data: usersWithAssignments } = await (supabase as any)
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
      const { data: profiles, error } = await (supabase as any)
        .from("profiles")
        .select("id, name, email, phone, user_id")
        .order("name");

      if (error) throw error;

      // Get assignment counts per profile
      const { data: assignments } = await (supabase as any)
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
      // Get ALL vehicles - no limit for admin panel
      let query = (supabase as any)
        .from("vehicles")
        .select("device_id, device_name, device_type, gps_owner, group_name, sim_number, group_id, last_synced_at")
        .order("device_name");

      if (search) {
        query = query.or(`device_name.ilike.%${search}%,device_id.ilike.%${search}%,gps_owner.ilike.%${search}%`);
      }

      const { data: vehicles, error } = await query;
      if (error) throw error;

      // Get all assignments with profile names
      const { data: assignments } = await (supabase as any)
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

// Get unique GPS owners from vehicles
export function useGpsOwners() {
  return useQuery({
    queryKey: ["gps-owners"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vehicles")
        .select("gps_owner")
        .not("gps_owner", "is", null)
        .order("gps_owner");

      if (error) throw error;

      // Get unique owners with vehicle counts
      const ownerCounts = new Map<string, number>();
      data?.forEach(v => {
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
      const { error, count } = await (supabase as any)
        .from("vehicle_assignments")
        .delete()
        .neq("device_id", ""); // Delete all rows

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
      vehicleAliases,
      sendEmail
    }: { 
      deviceIds: string[]; 
      profileId: string; 
      vehicleAliases?: Record<string, string>;
      sendEmail?: {
        to: string;
        userName: string;
        vehicleCount: number;
        isNewUser?: boolean;
      };
    }) => {
      // Upsert assignments one by one with composite primary key (device_id, profile_id)
      // Workaround: Use insert with ON CONFLICT handling since Supabase client may have issues with composite keys
      const results = await Promise.all(
        deviceIds.map(async (deviceId) => {
          const payload = {
            device_id: deviceId,
            profile_id: profileId,
            vehicle_alias: vehicleAliases?.[deviceId] || null,
            updated_at: new Date().toISOString()
          };
          
          // Use check-then-update-or-insert pattern to avoid Supabase composite key upsert issues
          // Check if assignment already exists
          const { data: existing, error: checkError } = await (supabase as any)
            .from("vehicle_assignments")
            .select("device_id, profile_id")
            .eq("device_id", deviceId)
            .eq("profile_id", profileId)
            .maybeSingle();
          
          if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = no rows returned, which is fine
            return { deviceId, error: checkError };
          }
          
          let error: any = null;
          
          if (existing) {
            // Update existing assignment
            const { error: updateError } = await (supabase as any)
              .from("vehicle_assignments")
              .update({
                vehicle_alias: payload.vehicle_alias,
                updated_at: payload.updated_at,
              })
              .eq("device_id", deviceId)
              .eq("profile_id", profileId);
            
            error = updateError;
          } else {
            // Insert new assignment
            const { error: insertError } = await (supabase as any)
              .from("vehicle_assignments")
              .insert(payload);
            
            error = insertError;
          }
          
          return { deviceId, error };
        })
      );

      const errors = results.filter(r => r.error);
      if (errors.length > 0) {
        throw new Error(`Failed to assign ${errors.length} vehicles`);
      }

      // Send email notification if requested
      if (sendEmail) {
        try {
          const { sendVehicleAssignmentEmail } = await import("@/utils/email-helpers");
          await sendVehicleAssignmentEmail(
            sendEmail.to,
            {
              userName: sendEmail.userName,
              vehicleCount: sendEmail.vehicleCount,
              isNewUser: sendEmail.isNewUser ?? false,
            }
          );
        } catch (emailError: any) {
          console.error("[useAssignVehicles] Email notification error:", emailError);
          // Don't fail the assignment if email fails, just log it
        }
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
          // Use check-then-update-or-insert pattern to avoid Supabase composite key upsert issues
          const { data: existing, error: checkError } = await (supabase as any)
            .from("vehicle_assignments")
            .select("device_id, profile_id")
            .eq("device_id", deviceId)
            .eq("profile_id", profileId)
            .maybeSingle();
          
          if (checkError && checkError.code !== 'PGRST116') {
            return { deviceId, error: checkError };
          }
          
          const payload = {
            device_id: deviceId,
            profile_id: profileId,
            updated_at: new Date().toISOString(),
          };
          
          let error: any = null;
          
          if (existing) {
            // Update existing assignment
            const { error: updateError } = await (supabase as any)
              .from("vehicle_assignments")
              .update({ updated_at: payload.updated_at })
              .eq("device_id", deviceId)
              .eq("profile_id", profileId);
            error = updateError;
          } else {
            // Insert new assignment
            const { error: insertError } = await (supabase as any)
              .from("vehicle_assignments")
              .insert(payload);
            error = insertError;
          }
          
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
      const { error } = await (supabase as any)
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
      const { data, error } = await (supabase as any)
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

      const { data, error } = await supabase
        .from("profiles")
        .insert(profilesToCreate)
        .select();

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
