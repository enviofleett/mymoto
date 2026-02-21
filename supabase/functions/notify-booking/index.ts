import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sendEmail, getEmailConfig } from "../_shared/email-service.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotifyBookingRequest {
  providerId: string;
  bookingDate: string;
  bookingTime?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { providerId, bookingDate, bookingTime }: NotifyBookingRequest = await req.json();

    console.log(`Notifying provider ${providerId} about new booking`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get provider details
    const { data: provider, error: providerError } = await supabase
      .from("service_providers")
      .select("user_id, business_name, email")
      .eq("id", providerId)
      .single();

    if (providerError || !provider) {
      throw new Error(`Provider not found: ${providerError?.message}`);
    }

    // Get provider auth user for email fallback
    const { data: providerUser } = await supabase.auth.admin.getUserById(provider.user_id);

    // Resolve email: prefer stored email on provider record, fall back to auth email
    const providerEmail = provider.email || providerUser?.user?.email;

    // Format booking date
    const date = new Date(bookingDate);
    const formattedDate = date.toLocaleDateString('en-US', {
      timeZone: 'Africa/Lagos',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    const timeText = bookingTime ? ` at ${bookingTime}` : '';

    const dashboardUrl = `${Deno.env.get("PUBLIC_APP_URL") || "https://mymotofleet.com"}/partner/dashboard`;

    // Send email notification to provider
    if (providerEmail) {
      const emailConfig = getEmailConfig();
      if (emailConfig) {
        try {
          await sendEmail({
            to: providerEmail,
            subject: `New Booking Request - ${formattedDate}`,
            html: `
              <h2>New Booking Request</h2>
              <p>Hello ${provider.business_name},</p>
              <p>You have received a new booking request for <strong>${formattedDate}${timeText}</strong>.</p>
              <p>Please log in to your dashboard to view the details and confirm the appointment.</p>
              <p><a href="${dashboardUrl}">View Booking on Dashboard</a></p>
            `,
            text: `New booking request for ${formattedDate}${timeText}. Log in to your dashboard: ${dashboardUrl}`,
          });
          console.log(`Booking notification email sent to ${providerEmail}`);
        } catch (emailErr) {
          console.error("Failed to send booking notification email:", emailErr);
          // Don't fail the request if email fails
        }
      } else {
        console.warn("Email service not configured; skipping booking notification email");
      }
    } else {
      console.warn(`No email address found for provider ${provider.business_name}`);
    }

    console.log(`Notification for provider ${provider.business_name}: New booking for ${formattedDate}${timeText}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Provider notified successfully",
        notification: {
          providerId,
          businessName: provider.business_name,
          bookingDate: formattedDate,
          bookingTime,
        }
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error notifying provider:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to notify provider" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
