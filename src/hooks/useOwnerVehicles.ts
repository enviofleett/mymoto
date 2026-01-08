import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface OwnerVehicle {
  deviceId: string;
  name: string;
  alias: string | null;
  deviceType: string | null;
  status: "online" | "offline" | "charging";
  battery: number | null;
  speed: number;
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
  // First get the profile for this user
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError || !profile) {
    // Try by email
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email) {
      const { data: emailProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", user.email)
        .maybeSingle();
      
      if (!emailProfile) return [];
    } else {
      return [];
    }
  }

  const profileId = profile?.id;
  if (!profileId) return [];

  // Fetch assignments with vehicle data
  const { data: assignments, error } = await supabase
    .from("vehicle_assignments")
    .select(`
      device_id,
      vehicle_alias,
      vehicles (
        device_name,
        device_type
      ),
      vehicle_positions (
        latitude,
        longitude,
        speed,
        battery_percent,
        ignition_on,
        is_online,
        is_overspeeding,
        gps_time,
        total_mileage
      )
    `)
    .eq("profile_id", profileId);

  if (error) throw error;
  if (!assignments) return [];

  // Fetch last chat messages for each device
  const deviceIds = assignments.map(a => a.device_id);
  const { data: chatHistory } = await supabase
    .from("vehicle_chat_history")
    .select("device_id, content, created_at, role")
    .in("device_id", deviceIds)
    .order("created_at", { ascending: false });

  // Fetch LLM settings for personality
  const { data: llmSettings } = await supabase
    .from("vehicle_llm_settings")
    .select("device_id, personality_mode, nickname")
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

  return assignments.map((a: any) => {
    const pos = a.vehicle_positions;
    const chat = chatByDevice.get(a.device_id);
    const settings = settingsByDevice.get(a.device_id);
    
    const isOnline = pos?.is_online ?? false;
    const isCharging = pos?.speed === 0 && pos?.ignition_on === false && (pos?.battery_percent ?? 100) < 100;

    return {
      deviceId: a.device_id,
      name: settings?.nickname || a.vehicle_alias || a.vehicles?.device_name || a.device_id,
      alias: a.vehicle_alias,
      deviceType: a.vehicles?.device_type,
      status: !isOnline ? "offline" : isCharging ? "charging" : "online",
      battery: pos?.battery_percent ?? null,
      speed: pos?.speed ?? 0,
      latitude: pos?.latitude ?? null,
      longitude: pos?.longitude ?? null,
      ignition: pos?.ignition_on ?? null,
      isOverspeeding: pos?.is_overspeeding ?? false,
      lastUpdate: pos?.gps_time ? new Date(pos.gps_time) : null,
      totalMileage: pos?.total_mileage ?? null,
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
