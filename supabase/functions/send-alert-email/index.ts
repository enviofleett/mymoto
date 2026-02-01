import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sendEmail, EmailTemplates, getEmailConfig } from "../_shared/email-service.ts";

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

// In-memory deduplication cache (per isolate instance)
// Key: eventId or deviceId+eventType, Value: timestamp
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
    // Check if email is configured
    const emailConfig = getEmailConfig();
    if (!emailConfig) {
      console.error("Missing Gmail credentials");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { eventId, deviceId, eventType, severity, title, message, metadata }: AlertEmailRequest = await req.json();

    console.log(`Processing alert email for event: ${eventId}, device: ${deviceId}, severity: ${severity}`);

    // Rate limiting check
    cleanupOldEntries();
    if (emailsSentThisMinute >= MAX_EMAILS_PER_MINUTE) {
      console.log(`Rate limit reached: ${emailsSentThisMinute} emails sent this minute, skipping`);
      return new Response(
        JSON.stringify({ success: true, message: "Rate limit reached, email queued", rateLimited: true }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Deduplication check
    if (isDuplicateAlert(eventId, deviceId, eventType)) {
      return new Response(
        JSON.stringify({ success: true, message: "Duplicate alert skipped", deduplicated: true }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Initialize Supabase client to get admin emails
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get admin users to send notifications to
    const { data: adminRoles, error: rolesError } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    if (rolesError) {
      console.error("Error fetching admin roles:", rolesError);
      throw rolesError;
    }

    if (!adminRoles || adminRoles.length === 0) {
      console.log("No admin users found to notify");
      return new Response(
        JSON.stringify({ success: true, message: "No admins to notify" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Get admin emails from auth.users
    const adminEmails: string[] = [];
    for (const role of adminRoles) {
      const { data: userData, error: userError } = await supabase.auth.admin.getUserById(role.user_id);
      if (!userError && userData.user?.email) {
        adminEmails.push(userData.user.email);
      }
    }

    if (adminEmails.length === 0) {
      console.log("No admin emails found");
      return new Response(
        JSON.stringify({ success: true, message: "No admin emails found" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Sending alert to ${adminEmails.length} admin(s)`);

    // Get vehicle name if available
    const { data: vehicleData } = await supabase
      .from("vehicles")
      .select("device_name")
      .eq("device_id", deviceId)
      .single();

    const vehicleName = vehicleData?.device_name || deviceId;

    // Generate email template
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

    const emailTemplate = EmailTemplates.alert({
      severity: (severity as 'info' | 'warning' | 'error' | 'critical') || 'info',
      title,
      message,
      vehicleName,
      timestamp,
      metadata,
    });

    // Send email using shared email service
    await sendEmail({
      to: adminEmails,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
      text: message,
      supabase,
      templateKey: 'alert'
    });

    // Mark alert as sent for deduplication
    markAlertSent(eventId, deviceId, eventType);

    console.log(`Alert email sent successfully to ${adminEmails.length} recipient(s)`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Email sent to ${adminEmails.length} admin(s)`,
        recipients: adminEmails.length 
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
