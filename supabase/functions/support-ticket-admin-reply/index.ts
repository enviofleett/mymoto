import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeToken(authHeader: string) {
  return authHeader.startsWith("Bearer ")
    ? authHeader.replace("Bearer ", "").trim()
    : authHeader.trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse(401, { error: "Unauthorized" });
    const token = normalizeToken(authHeader);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return jsonResponse(401, { error: "Unauthorized" });

    const { data: isAdmin, error: roleError } = await supabase.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });
    if (roleError || !isAdmin) return jsonResponse(403, { error: "Forbidden: admin access required" });

    const body = (await req.json().catch(() => null)) as {
      ticket_id?: string;
      message?: string;
      representative_id?: string | null;
      status?: "new" | "open" | "pending_support" | "pending_user" | "resolved" | "closed";
      priority?: "low" | "normal" | "high" | "urgent";
      queue_id?: string | null;
    } | null;

    const ticketId = body?.ticket_id?.trim();
    if (!ticketId) return jsonResponse(400, { error: "ticket_id is required" });

    const { data: ticket, error: ticketError } = await supabase
      .from("support_tickets")
      .select("id")
      .eq("id", ticketId)
      .maybeSingle();
    if (ticketError || !ticket) return jsonResponse(404, { error: "Ticket not found" });

    let insertedMessage: any = null;
    const message = body?.message?.trim();
    if (message) {
      const { data, error } = await supabase
        .from("support_ticket_messages")
        .insert({
          ticket_id: ticketId,
          sender_type: "admin",
          sender_user_id: user.id,
          representative_id: body?.representative_id || null,
          content: message,
        })
        .select("*")
        .single();
      if (error) return jsonResponse(500, { error: error.message });
      insertedMessage = data;
    }

    const updatePayload: Record<string, unknown> = {
      last_message_at: new Date().toISOString(),
    };
    if (body?.status) updatePayload.status = body.status;
    else if (message) updatePayload.status = "pending_user";
    if (body?.priority) updatePayload.priority = body.priority;
    if (Object.prototype.hasOwnProperty.call(body || {}, "queue_id")) updatePayload.queue_id = body?.queue_id || null;
    if (Object.prototype.hasOwnProperty.call(body || {}, "representative_id")) updatePayload.representative_id = body?.representative_id || null;

    const { data: updatedTicket, error: updateError } = await supabase
      .from("support_tickets")
      .update(updatePayload)
      .eq("id", ticketId)
      .select("*")
      .single();
    if (updateError) return jsonResponse(500, { error: updateError.message });

    return jsonResponse(200, {
      success: true,
      ticket: updatedTicket,
      message: insertedMessage,
    });
  } catch (error: any) {
    console.error("[support-ticket-admin-reply] error:", error);
    return jsonResponse(500, { error: error?.message || "Internal server error" });
  }
});

