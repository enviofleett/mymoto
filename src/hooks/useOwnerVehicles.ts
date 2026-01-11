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
  const { data: assignments, error } = await supabase
    .from("vehicle_assignments")
    .select(`
      device_id,
      vehicle_alias
    `)
    .eq("profile_id", profileId);

  console.log("[useOwnerVehicles] Assignments query:", { assignments, error, count: assignments?.length });

  if (error) {
    console.error("[useOwnerVehicles] Assignments error:", error);
    throw error;
  }
  if (!assignments || assignments.length === 0) {
    console.warn("[useOwnerVehicles] No vehicle assignments found for profile:", profileId);
    return [];
  }

  const deviceIds = assignments.map(a => a.device_id);
  console.log("[useOwnerVehicles] Fetching data for deviceIds:", deviceIds);

  // Fetch vehicle info
  const { data: vehicles, error: vehiclesError } = await supabase
    .from("vehicles")
    .select("device_id, device_name, device_type")
    .in("device_id", deviceIds);

  console.log("[useOwnerVehicles] Vehicles data:", { vehicles, vehiclesError, count: vehicles?.length });

  // Fetch positions - note: total_mileage is stored in meters
  const { data: positions, error: positionsError } = await supabase
    .from("vehicle_positions")
    .select("device_id, latitude, longitude, speed, heading, battery_percent, ignition_on, is_online, is_overspeeding, gps_time, total_mileage")
    .in("device_id", deviceIds);

  console.log("[useOwnerVehicles] Positions data:", { positions, positionsError, count: positions?.length });

  // Create maps for easy lookup
  const vehicleMap = new Map(vehicles?.map(v => [v.device_id, v]) || []);
  const positionMap = new Map(positions?.map(p => [p.device_id, p]) || []);

  // Fetch last chat messages for each device
  const { data: chatHistory } = await supabase
    .from("vehicle_chat_history")
    .select("device_id, content, created_at, role")
    .in("device_id", deviceIds)
    .order("created_at", { ascending: false });

  // Fetch LLM settings for personality and avatar
  const { data: llmSettings } = await supabase
    .from("vehicle_llm_settings")
    .select("device_id, personality_mode, nickname, avatar_url")
    .in("device_id", deviceIds);

  // Group chat history by device
  const chatByDevice = new Map<string, { content: string; time: Date; unread: number }>();
  chatHistory?.forEach((chat) => {
    if (!chatByDevice.has(chat.device_id)) {
      chatByDevice.set(chat.device_id, {
        content: chat.content,
        time: new Date(chat.created_at!),
        unread: chat.role === "assistant" ? 1 : 0,
      });
    }
  });

  // Map LLM settings
  const settingsByDevice = new Map(llmSettings?.map(s => [s.device_id, s]) || []);

  return assignments.map((a) => {
    const vehicle = vehicleMap.get(a.device_id);
    const pos = positionMap.get(a.device_id);
    const chat = chatByDevice.get(a.device_id);
    const settings = settingsByDevice.get(a.device_id);
    
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
  const { user } = useAuth();

  return useQuery({
    queryKey: ["owner-vehicles", user?.id],
    queryFn: () => fetchOwnerVehicles(user!.id),
    enabled: !!user,
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // 1 minute
  });
}
