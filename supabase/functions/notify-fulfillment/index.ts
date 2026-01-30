import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sendEmail } from "../_shared/email-service.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotifyFulfillmentRequest {
  bookingId: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { bookingId }: NotifyFulfillmentRequest = await req.json();

    console.log(`Notifying user about fulfilled booking: ${bookingId}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get booking details
    const { data: booking, error: bookingError } = await supabase
      .from("directory_bookings")
      .select(`
        *,
        provider:service_providers!inner (
          business_name
        )
      `)
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking) {
      throw new Error(`Booking not found: ${bookingError?.message}`);
    }

    // Get user details
    const { data: user, error: userError } = await supabase.auth.admin.getUserById(booking.user_id);

    if (userError || !user.user) {
      throw new Error(`User not found: ${userError?.message}`);
    }

    const providerName = (booking.provider as any).business_name;
    const userEmail = user.user.email;
    const publicAppUrl = Deno.env.get("PUBLIC_APP_URL") || "https://mymotofleet.com";

    if (userEmail) {
      const emailHtml = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Service Completed!</h2>
          <p>Hello,</p>
          <p>Your service with <strong>${providerName}</strong> has been marked as completed.</p>
          <p>We hope you are satisfied with the service. Please take a moment to rate your experience.</p>
          <div style="margin: 20px 0;">
            <a href="${publicAppUrl}/owner/directory" style="background-color: #3b82f6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">Rate Provider</a>
          </div>
          <p>Or open the MyMoto Fleet app to see the rating prompt.</p>
          <p>Thank you,<br>MyMoto Fleet Team</p>
        </div>
      `;

      try {
        await sendEmail({
          to: userEmail,
          subject: `Service Completed - ${providerName}`,
          html: emailHtml,
          text: `Your service with ${providerName} is completed. Please rate your experience in the app.`,
        });
        console.log(`Email sent to ${userEmail}`);
      } catch (emailErr) {
        console.error("Failed to send email:", emailErr);
        // Don't fail the whole request if email fails, but log it
      }
    }

    console.log(`Notification for user ${user.user.email}: Service completed at ${providerName}`);

    // The RatingListener component in the frontend will automatically show the rating prompt
    // when it detects the booking status change via Supabase Realtime

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "User notified successfully",
        notification: {
          bookingId,
          userId: booking.user_id,
          providerName,
        }
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error notifying user:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to notify user" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
