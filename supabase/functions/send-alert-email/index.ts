import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sendEmail, EmailTemplates, getEmailConfig, renderEmailTemplate } from "../_shared/email-service.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AlertEmailRequest {
  eventId: string;
  deviceId: string;
  eventType: string;
  severity: string;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

const recentAlerts = new Map<string, number>();
const COOLDOWN_MS = 60000; // 1 minute cooldown between duplicate alerts
const MAX_EMAILS_PER_MINUTE = 3;
let emailsSentThisMinute = 0;
let lastMinuteReset = Date.now();

function cleanupOldEntries() {
  const now = Date.now();
  // Reset minute counter
  if (now - lastMinuteReset > 60000) {
    emailsSentThisMinute = 0;
    lastMinuteReset = now;
  }
  // Cleanup old deduplication entries
  for (const [key, timestamp] of recentAlerts.entries()) {
    if (now - timestamp > COOLDOWN_MS * 5) {
      recentAlerts.delete(key);
    }
  }
}

function getPreferenceKey(eventType: string): string | null {
  const map: Record<string, string> = {
    low_battery: "low_battery",
    critical_battery: "critical_battery",
    overspeeding: "overspeeding",
    harsh_braking: "harsh_braking",
    rapid_acceleration: "rapid_acceleration",
    ignition_on: "ignition_on",
    ignition_off: "ignition_off",
    power_off: "ignition_off",
    geofence_enter: "geofence_enter",
    geofence_exit: "geofence_exit",
    idle_too_long: "idle_too_long",
    offline: "offline",
    online: "online",
    maintenance_due: "maintenance_due",
    trip_completed: "trip_completed",
    anomaly_detected: "anomaly_detected",
    vehicle_moving: "vehicle_moving",
    morning_greeting: "morning_greeting",
    predictive_briefing: "predictive_briefing",
  };
  return map[eventType] ?? null;
}

async function getVehicleAssignments(supabase: any, deviceId: string): Promise<string[]> {
  const { data: assignments, error } = await supabase
    .from("vehicle_assignments")
    .select(`
      profile_id,
      profiles:profile_id (
        user_id
      )
    `)
    .eq("device_id", deviceId);

  if (error) {
    console.error("[send-alert-email] Error fetching assignments:", error);
    return [];
  }

  return (assignments || [])
    .map((a: any) => a.profiles?.user_id)
    .filter((id: string | undefined) => id !== undefined);
}

function isDuplicateAlert(eventId: string, deviceId: string, eventType: string): boolean {
  cleanupOldEntries();
  
  const now = Date.now();
  const eventKey = eventId;
  const typeKey = `${deviceId}:${eventType}`;
  
  // Check if same eventId was sent recently
  if (recentAlerts.has(eventKey)) {
    const lastSent = recentAlerts.get(eventKey)!;
    if (now - lastSent < COOLDOWN_MS) {
      console.log(`Skipping duplicate alert: eventId ${eventId} sent ${Math.round((now - lastSent) / 1000)}s ago`);
      return true;
    }
  }
  
  // Check if same device+eventType was sent recently
  if (recentAlerts.has(typeKey)) {
    const lastSent = recentAlerts.get(typeKey)!;
    if (now - lastSent < COOLDOWN_MS) {
      console.log(`Skipping duplicate alert: ${typeKey} sent ${Math.round((now - lastSent) / 1000)}s ago`);
      return true;
    }
  }
  
  return false;
}

function markAlertSent(eventId: string, deviceId: string, eventType: string) {
  const now = Date.now();
  recentAlerts.set(eventId, now);
  recentAlerts.set(`${deviceId}:${eventType}`, now);
  emailsSentThisMinute++;
}

const handler = async (req: Request): Promise<Response> => {
  console.log("send-alert-email function called");

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const emailConfig = getEmailConfig();
    if (!emailConfig) {
      console.error("Missing Gmail credentials");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    let payload: Partial<AlertEmailRequest> = {};
    try {
      if (req.headers.get("content-type")?.includes("application/json")) {
        payload = await req.json();
      }
    } catch {
      payload = {};
    }

    const url = new URL(req.url);
    const eventIdFromQuery = url.searchParams.get("eventId") || undefined;

    const eventId = payload.eventId ?? eventIdFromQuery;
    if (!eventId) {
      return new Response(
        JSON.stringify({ error: "Missing eventId" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    cleanupOldEntries();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: eventRow, error: eventError } = await supabase
      .from("proactive_vehicle_events")
      .select("id, device_id, event_type, severity, title, message, metadata, email_sent")
      .eq("id", eventId)
      .maybeSingle();

    if (eventError || !eventRow) {
      console.error("Failed to load proactive event for email:", eventError);
      return new Response(
        JSON.stringify({ error: "Event not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const deviceId = eventRow.device_id as string;
    const eventType = eventRow.event_type as string;
    const severity = eventRow.severity as string;
    const isCriticalLike = severity === "critical" || severity === "error";
    const title = eventRow.title as string;
    const message = (eventRow as any).message as string;
    const metadata = (eventRow.metadata as Record<string, unknown>) ?? {};

    if (eventRow.email_sent === true) {
      console.log(`Email already sent for event ${eventId}, skipping`);
      return new Response(
        JSON.stringify({ success: true, message: "Email already sent", deduplicated: true }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (emailsSentThisMinute >= MAX_EMAILS_PER_MINUTE) {
      console.log(`Rate limit reached: ${emailsSentThisMinute} emails sent this minute, skipping`);
      return new Response(
        JSON.stringify({ success: true, message: "Rate limit reached, email queued", rateLimited: true }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (isDuplicateAlert(eventId, deviceId, eventType)) {
      return new Response(
        JSON.stringify({ success: true, message: "Duplicate alert skipped", deduplicated: true }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { data: vehicleStatusRow } = await supabase
      .from("vehicles")
      .select("device_id, vehicle_status")
      .eq("device_id", deviceId)
      .maybeSingle();

    if (vehicleStatusRow && vehicleStatusRow.vehicle_status === "hibernated") {
      console.log(`Skipping alert email for hibernated vehicle ${deviceId}`);
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "vehicle_hibernated" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const assignedUserIds = await getVehicleAssignments(supabase, deviceId);
    const preferenceKey = getPreferenceKey(eventType);
    const ownerEmailsSet = new Set<string>();

    if (assignedUserIds.length > 0 && preferenceKey) {
      const { data: vehiclePrefs, error: vehiclePrefsError } = await supabase
        .from("vehicle_notification_preferences")
        .select("user_id, " + preferenceKey)
        .eq("device_id", deviceId)
        .in("user_id", assignedUserIds);

      let enabledUserIds: string[] = [];
      let prefsFound = false;

      if (vehiclePrefsError) {
        console.error("[send-alert-email] Error fetching vehicle notification preferences:", vehiclePrefsError);
      } else if (vehiclePrefs && vehiclePrefs.length > 0) {
        enabledUserIds = vehiclePrefs
          .filter((pref: any) => pref[preferenceKey] === true)
          .map((pref: any) => pref.user_id);
        prefsFound = true;
      }

      if (enabledUserIds.length === 0 && isCriticalLike && !prefsFound) {
        const defaultEnabled = ["critical_battery", "offline", "anomaly_detected", "maintenance_due", "vehicle_moving", "geofence_enter"].includes(eventType);
        if (defaultEnabled) {
          enabledUserIds = assignedUserIds;
        }
      }

      if (enabledUserIds.length > 0) {
        for (const userId of enabledUserIds) {
          const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);
          if (!userError && userData.user?.email) {
            ownerEmailsSet.add(userData.user.email);
          }
        }
      }
    }

    const { data: adminRoles, error: rolesError } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    if (rolesError) {
      console.error("Error fetching admin roles:", rolesError);
      throw rolesError;
    }

    const adminEmails: string[] = [];
    if (isCriticalLike && adminRoles && adminRoles.length > 0) {
      for (const role of adminRoles) {
        const { data: userData, error: userError } = await supabase.auth.admin.getUserById(role.user_id);
        if (!userError && userData.user?.email) {
          adminEmails.push(userData.user.email);
        }
      }
    }

    const allRecipientEmails = Array.from(new Set<string>([...adminEmails, ...ownerEmailsSet]));

    if (allRecipientEmails.length === 0) {
      console.log("No admin or owner emails found to notify");
      return new Response(
        JSON.stringify({ success: true, message: "No emails found to notify" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Sending alert to ${allRecipientEmails.length} recipient(s)`);

    const { data: vehicleData } = await supabase
      .from("vehicles")
      .select("device_name")
      .eq("device_id", deviceId)
      .single();

    const vehicleName = vehicleData?.device_name || deviceId;

    const timestamp = new Date().toLocaleString("en-US", {
      timeZone: "Africa/Lagos",
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });

    const fallback = EmailTemplates.alert({
      severity: (severity as 'info' | 'warning' | 'error' | 'critical') || 'info',
      title,
      message,
      vehicleName,
      timestamp,
      metadata,
    });

    const rendered = await renderEmailTemplate({
      supabase,
      templateKey: "alert",
      data: {
        severity,
        title,
        message,
        vehicleName,
        timestamp,
        metadata,
        body_content: fallback.html,
      },
      fallback,
    });

    if (rendered.skipped) {
      return new Response(
        JSON.stringify({ success: true, skipped: true, message: "Alert template is disabled" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    await sendEmail({
      to: allRecipientEmails,
      subject: rendered.template.subject,
      html: rendered.template.html,
      text: rendered.template.text || message,
      senderId: rendered.senderId,
      supabase,
      templateKey: 'alert'
    });

    markAlertSent(eventId, deviceId, eventType);

    const { error: updateError } = await supabase
      .from("proactive_vehicle_events")
      .update({
        email_sent: true,
        email_sent_at: new Date().toISOString(),
      })
      .eq("id", eventId);

    if (updateError) {
      console.warn("Failed to update email_sent flag:", updateError.message);
    }

    console.log(`Alert email sent successfully to ${allRecipientEmails.length} recipient(s)`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Email sent to ${allRecipientEmails.length} recipient(s)`,
        recipients: allRecipientEmails.length 
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in send-alert-email function:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
