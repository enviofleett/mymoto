import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sendEmail, EmailTemplates, getEmailConfig, renderEmailTemplate } from "../_shared/email-service.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WelcomeEmailRequest {
  userId: string;
  userEmail: string;
  userName?: string;
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

    const { userId, userEmail, userName }: WelcomeEmailRequest = await req.json();

    if (!userId || !userEmail) {
      return new Response(
        JSON.stringify({ error: "userId and userEmail are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user's name from profile if not provided
    let finalUserName = userName;
    if (!finalUserName) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("name")
        .eq("user_id", userId)
        .maybeSingle();
      
      finalUserName = profile?.name || userEmail.split("@")[0];
    }

    const loginLink = `${supabaseUrl.replace("/rest/v1", "")}/auth`;

    const fallback = EmailTemplates.welcome({
      userName: finalUserName,
      loginLink,
    });

    const rendered = await renderEmailTemplate({
      supabase,
      templateKey: "welcome",
      data: {
        userName: finalUserName,
        loginLink,
        body_content: fallback.html,
      },
      fallback,
    });

    if (rendered.skipped) {
      return new Response(
        JSON.stringify({ success: true, skipped: true, message: "Welcome template is disabled" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    await sendEmail({
      to: userEmail,
      subject: rendered.template.subject,
      html: rendered.template.html,
      text: rendered.template.text,
      senderId: rendered.senderId,
      supabase,
      templateKey: 'welcome'
    });

    return new Response(
      JSON.stringify({ success: true, message: "Welcome email sent successfully" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[send-welcome-email] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
