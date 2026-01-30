import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface OwnerVehicle {
  deviceId: string;
  name: string;
  plateNumber: string; // Original device_name / plate number for identification
  nickname: string | null; // Custom nickname from LLM settings
  alias: string | null;
  avatarUrl: string | null; // Avatar from LLM settings
  deviceType: string | null;
  status: "online" | "offline" | "charging";
  battery: number | null;
  speed: number;
  heading: number | null;
  latitude: number | null;
  longitude: number | null;
  ignition: boolean | null;
  isOverspeeding: boolean;
  lastUpdate: Date | null;
  totalMileage: number | null;
  lastMessage: string | null;
  lastMessageTime: Date | null;
  unreadCount: number;
  personality: string | null;
}

async function fetchOwnerVehicles(userId: string): Promise<OwnerVehicle[]> {
  console.log("[useOwnerVehicles] Starting fetch for userId:", userId);
  
  // Check if user is admin
  const { data: adminRole } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  
  const isAdmin = !!adminRole;
  console.log("[useOwnerVehicles] User is admin:", isAdmin);
  
  let deviceIds: string[] = [];
  let assignments: any[] = [];
  
  if (isAdmin) {
    // Admins see ALL vehicles - fetch all device_ids from vehicles table
    console.log("[useOwnerVehicles] Admin user - fetching all vehicles");
    const { data: allVehicles, error: vehiclesError } = await (supabase as any)
      .from("vehicles")
      .select("device_id, device_name");
    
    if (vehiclesError) {
      console.error("[useOwnerVehicles] Error fetching all vehicles:", vehiclesError);
      throw vehiclesError;
    }
    
    deviceIds = (allVehicles || []).map((v: any) => v.device_id);
    // Create mock assignments for admin (so the mapping logic works)
    assignments = (allVehicles || []).map((v: any) => ({
      device_id: v.device_id,
      vehicle_alias: v.device_name
    }));
    
    console.log("[useOwnerVehicles] Admin - found", deviceIds.length, "vehicles");
  } else {
    // Regular users - fetch only assigned vehicles
    // First get the profile for this user
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, name, email")
      .eq("user_id", userId)
      .maybeSingle();

    console.log("[useOwnerVehicles] Profile lookup result:", { profile, profileError });

    let profileId = profile?.id;

    if (profileError || !profile) {
      // Try by email
      console.log("[useOwnerVehicles] No profile by user_id, trying email lookup...");
      const { data: { user } } = await supabase.auth.getUser();
      console.log("[useOwnerVehicles] Auth user:", user?.email);
      
      if (user?.email) {
        const { data: emailProfile, error: emailError } = await supabase
          .from("profiles")
          .select("id, name, email")
          .eq("email", user.email)
          .maybeSingle();
        
        console.log("[useOwnerVehicles] Email profile lookup:", { emailProfile, emailError });
        
        if (!emailProfile) {
          console.warn("[useOwnerVehicles] No profile found for user");
          return [];
        }
        profileId = emailProfile.id;
      } else {
        console.warn("[useOwnerVehicles] No email available for fallback lookup");
        return [];
      }
    }

    if (!profileId) {
      console.warn("[useOwnerVehicles] No profileId available");
      return [];
    }
    
    console.log("[useOwnerVehicles] Using profileId:", profileId);

    // Fetch assignments for this profile
    const { data: userAssignments, error } = await (supabase as any)
      .from("vehicle_assignments")
      .select(`
        device_id,
        vehicle_alias
      `)
      .eq("profile_id", profileId);

    console.log("[useOwnerVehicles] Assignments query:", { assignments: userAssignments, error, count: userAssignments?.length });

    if (error) {
      console.error("[useOwnerVehicles] Assignments error:", error);
      throw error;
    }
    if (!userAssignments || userAssignments.length === 0) {
      console.warn("[useOwnerVehicles] No vehicle assignments found for profile:", profileId);
      return [];
    }

    assignments = userAssignments;
    deviceIds = (userAssignments as any[]).map((a: any) => a.device_id);
    console.log("[useOwnerVehicles] Regular user - found", deviceIds.length, "assigned vehicles");
  }
  
  if (deviceIds.length === 0) {
    return [];
  }
  
  console.log("[useOwnerVehicles] Fetching data for deviceIds:", deviceIds);

  // Reduced chunk size to prevent URL length errors (net::ERR_ABORTED) with Supabase .in() filter
  const CHUNK_SIZE = 10;

  // Helper to fetch in chunks
  const fetchInChunks = async (
    table: string,
    select: string,
    ids: string[],
    orderBy?: { column: string, ascending: boolean }
  ) => {
    const chunks = [];
    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
      chunks.push(ids.slice(i, i + CHUNK_SIZE));
    }

    let aggregatedData: any[] = [];
    
    // Process chunks sequentially to avoid browser connection limits and net::ERR_ABORTED
    for (const chunk of chunks) {
      let query = (supabase as any)
        .from(table)
        .select(select)
        .in("device_id", chunk);
      
      if (orderBy) {
        query = query.order(orderBy.column, { ascending: orderBy.ascending });
      }
      
      const { data, error } = await query;

      if (error) {
        console.error(`[useOwnerVehicles] Error fetching ${table} chunk:`, error);
      } else if (data) {
        aggregatedData = [...aggregatedData, ...data];
      }
    }

    return aggregatedData;
  };

  // Fetch vehicle info
  const vehicles = await fetchInChunks("vehicles", "device_id, device_name, device_type", deviceIds);
  console.log("[useOwnerVehicles] Vehicles data:", { vehicles, count: vehicles?.length });

  // Fetch positions in chunks
  const positions = await fetchInChunks(
    "vehicle_positions", 
    "device_id, latitude, longitude, speed, heading, battery_percent, ignition_on, is_online, is_overspeeding, gps_time, total_mileage", 
    deviceIds
  );
  console.log("[useOwnerVehicles] Positions data:", { positions, count: positions?.length });

  // Create maps for easy lookup
  const vehicleMap = new Map((vehicles as any[])?.map((v: any) => [v.device_id, v]) || []);
  const positionMap = new Map((positions as any[])?.map((p: any) => [p.device_id, p]) || []);

  // Fetch last chat messages for each device
  const chatHistory = await fetchInChunks(
    "vehicle_chat_history",
    "device_id, content, created_at, role",
    deviceIds,
    { column: "created_at", ascending: false }
  );

  // Fetch LLM settings for personality and avatar
  const llmSettings = await fetchInChunks(
    "vehicle_llm_settings",
    "device_id, personality_mode, nickname, avatar_url",
    deviceIds
  );

  // Group chat history by device
  const chatByDevice = new Map<string, { content: string; time: Date; unread: number }>();
  ((chatHistory as any[]) || []).forEach((chat: any) => {
    if (!chatByDevice.has(chat.device_id)) {
      chatByDevice.set(chat.device_id, {
        content: chat.content,
        time: new Date(chat.created_at!),
        unread: chat.role === "assistant" ? 1 : 0,
      });
    }
  });

  // Map LLM settings
  const settingsByDevice = new Map(((llmSettings as any[]) || []).map((s: any) => [s.device_id, s]));

  return (assignments as any[]).map((a: any) => {
    const vehicle = vehicleMap.get(a.device_id) as any;
    const pos = positionMap.get(a.device_id) as any;
    const chat = chatByDevice.get(a.device_id);
    const settings = settingsByDevice.get(a.device_id) as any;
    
    const isOnline = pos?.is_online ?? false;
    const isCharging = pos?.speed === 0 && pos?.ignition_on === false && (pos?.battery_percent ?? 100) < 100;
    
    // Keep original plate number for identification
    const plateNumber = vehicle?.device_name || a.device_id;
    const nickname = settings?.nickname || null;
    // Display name: nickname or alias or plate number
    const displayName = nickname || a.vehicle_alias || plateNumber;

    return {
      deviceId: a.device_id,
      name: displayName,
      plateNumber,
      nickname,
      alias: a.vehicle_alias,
      avatarUrl: settings?.avatar_url || null,
      deviceType: vehicle?.device_type || null,
      status: !isOnline ? "offline" : isCharging ? "charging" : "online" as const,
      battery: pos?.battery_percent ?? null,
      speed: pos?.speed ?? 0,
      latitude: pos?.latitude ?? null,
      longitude: pos?.longitude ?? null,
      heading: pos?.heading ?? null,
      ignition: pos?.ignition_on ?? null,
      isOverspeeding: pos?.is_overspeeding ?? false,
      lastUpdate: pos?.gps_time ? new Date(pos.gps_time) : null,
      // Convert total_mileage from meters to kilometers
      totalMileage: pos?.total_mileage != null ? Math.round(pos.total_mileage / 1000) : null,
      lastMessage: chat?.content?.slice(0, 80) || null,
      lastMessageTime: chat?.time || null,
      unreadCount: chat?.unread || 0,
      personality: settings?.personality_mode || "casual",
    };
  });
}

export function useOwnerVehicles() {
  const { user, isAdmin } = useAuth();

  return useQuery({
    queryKey: ["owner-vehicles", user?.id, isAdmin],
    queryFn: () => fetchOwnerVehicles(user!.id),
    enabled: !!user,
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // 1 minute
  });
}
