import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BookingRequest {
  service_id: string;
  scheduled_at: string; // ISO timestamp
  customer_notes?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const body: BookingRequest = await req.json();
    const { service_id, scheduled_at, customer_notes } = body;

    // Input validation
    if (!service_id || !scheduled_at) {
      return new Response(
        JSON.stringify({ error: "service_id and scheduled_at are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate scheduled_at is in the future
    const scheduledDate = new Date(scheduled_at);
    if (isNaN(scheduledDate.getTime())) {
      return new Response(
        JSON.stringify({ error: "Invalid scheduled_at format. Use ISO 8601 format." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (scheduledDate < new Date()) {
      return new Response(
        JSON.stringify({ error: "scheduled_at must be in the future" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user's profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: "User profile not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get service details and verify it exists and is approved
    const { data: service, error: serviceError } = await supabase
      .from("marketplace_services")
      .select(`
        id,
        provider_id,
        title,
        duration_minutes,
        service_providers!inner (
          id,
          business_name,
          is_approved,
          is_active,
          office_hours
        )
      `)
      .eq("id", service_id)
      .eq("is_approved", true)
      .eq("is_active", true)
      .single();

    if (serviceError || !service) {
      return new Response(
        JSON.stringify({ error: "Service not found or not available" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const provider = service.service_providers;
    if (!provider.is_approved || !provider.is_active) {
      return new Response(
        JSON.stringify({ error: "Provider is not approved or inactive" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check business hours if provided
    if (provider.office_hours && typeof provider.office_hours === "object") {
      const dayOfWeek = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][scheduledDate.getDay()];
      const dayHours = provider.office_hours[dayOfWeek];

      if (dayHours && dayHours.closed !== true && dayHours.open && dayHours.close) {
        const scheduledTime = scheduledDate.toTimeString().slice(0, 5); // HH:MM format
        if (scheduledTime < dayHours.open || scheduledTime > dayHours.close) {
          return new Response(
            JSON.stringify({
              error: `Service is only available between ${dayHours.open} and ${dayHours.close} on ${dayOfWeek}`,
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else if (dayHours && dayHours.closed === true) {
        return new Response(
          JSON.stringify({ error: `Provider is closed on ${dayOfWeek}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Check for double-booking (same provider, overlapping time slots)
    const durationMinutes = service.duration_minutes || 60; // Default 1 hour
    const endTime = new Date(scheduledDate.getTime() + durationMinutes * 60 * 1000);

    const { data: conflictingAppointments, error: conflictError } = await supabase
      .from("marketplace_appointments")
      .select("id")
      .eq("provider_id", service.provider_id)
      .eq("status", "confirmed")
      .or(
        `and(scheduled_at.lte.${scheduledDate.toISOString()},scheduled_at.gte.${endTime.toISOString()}),and(scheduled_at.gte.${scheduledDate.toISOString()},scheduled_at.lte.${endTime.toISOString()})`
      );

    if (conflictError) {
      console.error("[booking-handler] Error checking conflicts:", conflictError);
      // Continue anyway - better to allow booking than block due to query error
    } else if (conflictingAppointments && conflictingAppointments.length > 0) {
      return new Response(
        JSON.stringify({ error: "This time slot is already booked. Please choose another time." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create appointment (atomic transaction)
    const { data: appointment, error: appointmentError } = await supabase
      .from("marketplace_appointments")
      .insert({
        service_id: service_id,
        customer_id: profile.id,
        provider_id: service.provider_id,
        scheduled_at: scheduled_at,
        status: "pending",
        customer_notes: customer_notes || null,
      })
      .select()
      .single();

    if (appointmentError) {
      console.error("[booking-handler] Error creating appointment:", appointmentError);
      return new Response(
        JSON.stringify({ error: "Failed to create appointment", details: appointmentError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // TODO: Send notification to provider (can be implemented later)
    // For now, just log it
    console.log(`[booking-handler] Appointment created: ${appointment.id} for provider ${service.provider_id}`);

    return new Response(
      JSON.stringify({
        success: true,
        appointment: {
          id: appointment.id,
          service_title: service.title,
          provider_name: provider.business_name,
          scheduled_at: appointment.scheduled_at,
          status: appointment.status,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[booking-handler] Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
