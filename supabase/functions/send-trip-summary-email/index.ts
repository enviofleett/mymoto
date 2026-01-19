import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sendEmail, EmailTemplates, getEmailConfig } from "./email-service.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TripSummaryEmailRequest {
  tripId: string;
  userEmail?: string;
  userId?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const config = getEmailConfig();
    if (!config) {
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { tripId, userEmail, userId }: TripSummaryEmailRequest = await req.json();

    if (!tripId) {
      return new Response(
        JSON.stringify({ error: "tripId is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch trip details
    const { data: trip, error: tripError } = await supabase
      .from("vehicle_trips")
      .select(`
        *,
        vehicles(device_name),
        trip_analytics(driver_score, summary)
      `)
      .eq("id", tripId)
      .single();

    if (tripError || !trip) {
      return new Response(
        JSON.stringify({ error: "Trip not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Get user email if not provided
    let recipientEmail = userEmail;
    if (!recipientEmail && userId) {
      const { data: userData } = await supabase.auth.admin.getUserById(userId);
      recipientEmail = userData.user?.email;
    }

    // If still no email, try to get from profile
    if (!recipientEmail) {
      const { data: assignments } = await supabase
        .from("vehicle_assignments")
        .select("profile_id, profiles(email)")
        .eq("device_id", trip.device_id)
        .limit(1)
        .maybeSingle();

      if (assignments?.profiles?.email) {
        recipientEmail = (assignments.profiles as any).email;
      }
    }

    if (!recipientEmail) {
      return new Response(
        JSON.stringify({ error: "User email not found" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Get user name
    const { data: profile } = await supabase
      .from("profiles")
      .select("name, email")
      .eq("email", recipientEmail)
      .maybeSingle();

    const userName = profile?.name || recipientEmail.split("@")[0];
    const vehicleName = (trip as any).vehicles?.device_name || trip.device_id;

    // Format trip data
    const startTime = new Date(trip.start_time);
    const endTime = new Date(trip.end_time);
    const date = startTime.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const durationMinutes = Math.round(trip.duration_seconds / 60);
    const duration = `${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m`;

    const distance = trip.distance_km ? `${trip.distance_km.toFixed(2)} km` : "N/A";

    const emailTemplate = EmailTemplates.tripSummary({
      userName,
      vehicleName,
      date,
      distance,
      duration,
      startLocation: trip.start_location || undefined,
      endLocation: trip.end_location || undefined,
      maxSpeed: trip.max_speed ? `${trip.max_speed} km/h` : undefined,
      avgSpeed: trip.avg_speed ? `${trip.avg_speed} km/h` : undefined,
    });

    await sendEmail({
      to: recipientEmail,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
    });

    return new Response(
      JSON.stringify({ success: true, message: "Trip summary email sent successfully" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[send-trip-summary-email] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
