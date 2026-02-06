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
  // console.log("[useOwnerVehicles] Starting fetch for userId:", userId);
  
  // Check if user is admin
  const { data: adminRole } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  
  const isAdmin = !!adminRole;
  // console.log("[useOwnerVehicles] User is admin:", isAdmin);
  
  let deviceIds: string[] = [];
  let assignments: any[] = [];
  
  if (isAdmin) {
    // Admins see ALL vehicles - fetch all device_ids from vehicles table
    // console.log("[useOwnerVehicles] Admin user - fetching all vehicles");
    
    let allVehicles: any[] = [];
    let from = 0;
    const batchSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error: vehiclesError } = await (supabase as any)
        .from("vehicles")
        .select("device_id, device_name")
        .range(from, from + batchSize - 1);
      
      if (vehiclesError) {
        console.error("[useOwnerVehicles] Error fetching all vehicles:", vehiclesError);
        throw vehiclesError;
      }

      if (data && data.length > 0) {
        allVehicles = [...allVehicles, ...data];
        if (data.length < batchSize) {
          hasMore = false;
        } else {
          from += batchSize;
        }
      } else {
        hasMore = false;
      }
    }
    
    // Deduplicate deviceIds
    deviceIds = [...new Set(deviceIds)];
    
    // Create mock assignments for admin (so the mapping logic works)
    assignments = (allVehicles || []).map((v: any) => ({
      device_id: v.device_id,
      vehicle_alias: v.device_name
    }));
    
    // console.log("[useOwnerVehicles] Admin - found", deviceIds.length, "vehicles");
  } else {
    // Regular users - fetch only assigned vehicles
    // First get the profile for this user
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, name, email")
      .eq("user_id", userId)
      .maybeSingle();

    // console.log("[useOwnerVehicles] Profile lookup result:", { profile, profileError });

    let profileId = profile?.id;

    if (profileError || !profile) {
      // Try by email
      // console.log("[useOwnerVehicles] No profile by user_id, trying email lookup...");
      const { data: { user } } = await supabase.auth.getUser();
      // console.log("[useOwnerVehicles] Auth user:", user?.email);
      
      if (user?.email) {
        const { data: emailProfile, error: emailError } = await supabase
          .from("profiles")
          .select("id, name, email")
          .eq("email", user.email)
          .maybeSingle();
        
        // console.log("[useOwnerVehicles] Email profile lookup:", { emailProfile, emailError });
        
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
    
    // console.log("[useOwnerVehicles] Using profileId:", profileId);

    // Fetch assignments for this profile
    const { data: userAssignments, error } = await (supabase as any)
      .from("vehicle_assignments")
      .select(`
        device_id,
        vehicle_alias
      `)
      .eq("profile_id", profileId);

    // console.log("[useOwnerVehicles] Assignments query:", { assignments: userAssignments, error, count: userAssignments?.length });

    if (error) {
      console.error("[useOwnerVehicles] Assignments error:", error);
      throw error;
    }
    if (!userAssignments || userAssignments.length === 0) {
      console.warn("[useOwnerVehicles] No vehicle assignments found for profile:", profileId);
      return [];
    }

    assignments = userAssignments;
    deviceIds = [...new Set((userAssignments as any[]).map((a: any) => a.device_id))];
    // console.log("[useOwnerVehicles] Regular user - found", deviceIds.length, "assigned vehicles");
  }
  
  if (deviceIds.length === 0) {
    return [];
  }
  
  // console.log("[useOwnerVehicles] Fetching data for deviceIds:", deviceIds);

  // Increased chunk size to 50 (safe limit for URL length is ~2000 chars, 50 UUIDs is ~1800)
  // This reduces the number of requests significantly (e.g. 3000 vehicles -> 60 requests instead of 300)
  const CHUNK_SIZE = 50;

  // Helper to fetch in chunks
  const fetchInChunks = async (
    table: string,
    select: string,
    ids: string[],
    orderBy?: { column: string, ascending: boolean },
    limit?: number
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
      
      if (limit) {
        query = query.limit(limit);
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

  // Helper to fetch ALL rows from a table using pagination (for Admin)
  const fetchAllTable = async (table: string, select: string) => {
    let allRows: any[] = [];
    let from = 0;
    const BATCH_SIZE = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await (supabase as any)
        .from(table)
        .select(select)
        .range(from, from + BATCH_SIZE - 1);
      
      if (error) {
        console.error(`[useOwnerVehicles] Error fetching all ${table}:`, error);
        // Don't throw, just return what we have to avoid breaking everything
        hasMore = false;
      } else if (data && data.length > 0) {
        allRows = [...allRows, ...data];
        if (data.length < BATCH_SIZE) {
          hasMore = false;
        } else {
          from += BATCH_SIZE;
        }
      } else {
        hasMore = false;
      }
    }
    return allRows;
  };

  let vehicles: any[] = [];
  let positions: any[] = [];
  let chatHistory: any[] = [];
  let llmSettings: any[] = [];

  if (isAdmin) {
    // Admin Optimization: Use efficient bulk fetching instead of 1000s of small requests
    // console.log("[useOwnerVehicles] Admin optimization: Fetching tables in bulk...");
    
    // 1. Vehicles are already fetched in the ID discovery phase (allVehicles), but we need to ensure we have device_type
    // Note: The initial fetch only got device_id and device_name. 
    // Since we didn't store device_type there, we can either:
    // a) modify the initial fetch (requires refactoring the loop above)
    // b) just fetch all vehicles again with device_type (efficient enough via range)
    // Let's do (b) for simplicity and code separation, or better:
    // actually, let's fetch 'vehicles' using fetchAllTable.
    
    const vehiclesPromise = fetchAllTable("vehicles", "device_id, device_name, device_type");

    const positionsPromise = fetchAllTable(
      "vehicle_positions", 
      "device_id, latitude, longitude, speed, heading, battery_percent, ignition_on, is_online, is_overspeeding, gps_time, total_mileage"
    );

    const settingsPromise = fetchAllTable(
      "vehicle_llm_settings",
      "device_id, personality_mode, nickname, avatar_url"
    );

    // Chat history is still fetched in chunks because "latest per device" is hard to do efficiently in one query without a view
    // But with CHUNK_SIZE=50, it's manageable (e.g. 60 requests for 3000 vehicles)
    const chatPromise = fetchInChunks(
      "vehicle_chat_history",
      "device_id, content, created_at, role",
      deviceIds,
      { column: "created_at", ascending: false },
      200 // Increased limit to ensure we get messages for most vehicles in the chunk
    );

    // Run parallel
    const [vehData, posData, settingsData, chatData] = await Promise.all([
      vehiclesPromise,
      positionsPromise,
      settingsPromise,
      chatPromise
    ]);

    vehicles = vehData;
    positions = posData;
    llmSettings = settingsData;
    chatHistory = chatData;

  } else {
    // Regular User: Fetch specific IDs in chunks
    vehicles = await fetchInChunks("vehicles", "device_id, device_name, device_type", deviceIds);
    
    positions = await fetchInChunks(
      "vehicle_positions", 
      "device_id, latitude, longitude, speed, heading, battery_percent, ignition_on, is_online, is_overspeeding, gps_time, total_mileage", 
      deviceIds
    );

    chatHistory = await fetchInChunks(
      "vehicle_chat_history",
      "device_id, content, created_at, role",
      deviceIds,
      { column: "created_at", ascending: false },
      200
    );

    llmSettings = await fetchInChunks(
      "vehicle_llm_settings",
      "device_id, personality_mode, nickname, avatar_url",
      deviceIds
    );
  }

  // console.log("[useOwnerVehicles] Data fetched:", { 
  //   vehicles: vehicles?.length, 
  //   positions: positions?.length, 
  //   chat: chatHistory?.length 
  // });

  // Sort positions by gps_time so the Map keeps the latest one (Map constructor overwrites duplicates)
  if (positions) {
    (positions as any[]).sort((a, b) => {
      const timeA = a.gps_time ? new Date(a.gps_time).getTime() : 0;
      const timeB = b.gps_time ? new Date(b.gps_time).getTime() : 0;
      return timeA - timeB; // Ascending, so latest is last
    });
  }

  // Create maps for easy lookup
  const vehicleMap = new Map((vehicles as any[])?.map((v: any) => [v.device_id, v]) || []);
  const positionMap = new Map((positions as any[])?.map((p: any) => [p.device_id, p]) || []);

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

  const finalVehicles = (assignments as any[]).map((a: any) => {
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
      status: (!isOnline ? "offline" : isCharging ? "charging" : "online") as OwnerVehicle['status'],
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

  return finalVehicles;
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
