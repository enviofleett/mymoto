import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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

    // Create notification message
    const message = `Service completed at ${providerName}. Please rate your experience!`;

    // Here you could:
    // 1. Send push notification to user
    // 2. Send email notification
    // 3. Create in-app notification record
    // 4. The RatingListener component will handle showing the rating prompt via Realtime

    console.log(`Notification for user ${user.user.email}: ${message}`);

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
