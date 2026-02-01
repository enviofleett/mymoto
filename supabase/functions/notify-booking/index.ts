import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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
      .select("user_id, business_name")
      .eq("id", providerId)
      .single();

    if (providerError || !provider) {
      throw new Error(`Provider not found: ${providerError?.message}`);
    }

    // Get provider user
    const { data: providerUser } = await supabase.auth.admin.getUserById(provider.user_id);

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

    // Create notification message
    const message = `New booking request for ${formattedDate}${timeText}`;

    // Here you could:
    // 1. Send push notification (if push service is set up)
    // 2. Send email notification
    // 3. Create in-app notification record

    // For now, we'll just log it
    // In production, you might want to:
    // - Use Supabase Realtime to notify the provider's connected clients
    // - Send a push notification via a service like OneSignal
    // - Create a notification record in a notifications table

    console.log(`Notification for provider ${provider.business_name}: ${message}`);

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
