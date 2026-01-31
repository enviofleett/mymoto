/// <reference lib="deno.ns" />
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sendEmail, getEmailConfig } from "../_shared/email-service.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RejectionEmailRequest {
  providerEmail: string;
  businessName: string;
  reason: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Verify admin auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "").trim();
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user is admin (simplified check)
    const { data: userRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!userRole) {
       // Also check via RPC if available, but this is a good fallback
       const { data: isAdmin } = await supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' });
       if (!isAdmin) {
         return new Response(
           JSON.stringify({ error: "Forbidden: Admin access required" }),
           { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
         );
       }
    }

    const emailConfig = getEmailConfig();
    if (!emailConfig) {
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { providerEmail, businessName, reason }: RejectionEmailRequest = await req.json();

    console.log(`Sending rejection email to: ${providerEmail}`);

    const emailTemplate = EmailTemplates.providerRejection({
        businessName: businessName,
        reason: reason
    });

    await sendEmail({
      to: providerEmail,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
    });

    return new Response(
      JSON.stringify({ success: true, message: "Rejection email sent" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("Error sending rejection email:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to send email" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
