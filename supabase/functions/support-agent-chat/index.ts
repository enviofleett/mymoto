import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { callLLM } from "../_shared/llm-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

type JsonRecord = Record<string, unknown>;

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

function normalizeSubject(message: string) {
  const clean = message.replace(/\s+/g, " ").trim();
  if (!clean) return "Support Request";
  return clean.length > 100 ? `${clean.slice(0, 97)}...` : clean;
}

function classifyQueueSlug(message: string): "technical" | "sales" | "general" {
  const q = message.toLowerCase();
  const technicalHits = [
    "gps", "offline", "device", "tracker", "tracking", "ignition", "battery", "signal", "map", "location", "trip",
  ];
  const salesHits = [
    "price", "pricing", "plan", "subscription", "upgrade", "demo", "buy", "quote", "sales", "discount",
  ];
  const techScore = technicalHits.reduce((n, term) => n + (q.includes(term) ? 1 : 0), 0);
  const salesScore = salesHits.reduce((n, term) => n + (q.includes(term) ? 1 : 0), 0);
  if (techScore >= salesScore && techScore > 0) return "technical";
  if (salesScore > 0) return "sales";
  return "general";
}

async function getAppSetting(supabase: any, key: string): Promise<string | null> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  return (data?.value as string | undefined) ?? null;
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

    const body = (await req.json().catch(() => null)) as {
      ticket_id?: string;
      message?: string;
      queue_hint?: string;
      voice_meta?: { confidence?: number };
    } | null;

    const message = body?.message?.trim() || "";
    if (!message) return jsonResponse(400, { error: "message is required" });

    const ticketId = body?.ticket_id?.trim() || null;
    const queueHint = body?.queue_hint?.trim().toLowerCase() || null;

    let ticket: any = null;
    if (ticketId) {
      const { data, error } = await supabase
        .from("support_tickets")
        .select("id, user_id, queue_id, representative_id, status, priority, ticket_no")
        .eq("id", ticketId)
        .maybeSingle();
      if (error || !data) return jsonResponse(404, { error: "Ticket not found" });
      if (data.user_id !== user.id) return jsonResponse(403, { error: "Forbidden: ticket ownership mismatch" });
      ticket = data;
    }

    let queue: any = null;
    if (ticket?.queue_id) {
      const { data } = await supabase
        .from("support_queues")
        .select("id, name, slug, routing_instructions")
        .eq("id", ticket.queue_id)
        .maybeSingle();
      queue = data ?? null;
    }

    if (!queue) {
      let resolvedSlug = queueHint || classifyQueueSlug(message);
      if (resolvedSlug !== "technical" && resolvedSlug !== "sales" && resolvedSlug !== "general") {
        resolvedSlug = "general";
      }
      const { data } = await supabase
        .from("support_queues")
        .select("id, name, slug, routing_instructions")
        .eq("slug", resolvedSlug)
        .eq("is_active", true)
        .maybeSingle();
      queue = data ?? null;
    }

    if (!ticket) {
      const subject = normalizeSubject(message);
      const { data: createdTicket, error: createError } = await supabase
        .from("support_tickets")
        .insert({
          user_id: user.id,
          status: "open",
          priority: "normal",
          queue_id: queue?.id ?? null,
          subject,
          summary: subject,
          created_by: "user",
          last_message_at: new Date().toISOString(),
        })
        .select("*")
        .single();
      if (createError) return jsonResponse(500, { error: createError.message });
      ticket = createdTicket;
    }

    const { data: userMessage, error: userMessageError } = await supabase
      .from("support_ticket_messages")
      .insert({
        ticket_id: ticket.id,
        sender_type: "user",
        sender_user_id: user.id,
        content: message,
        metadata: {
          voice_confidence: body?.voice_meta?.confidence ?? null,
        } as JsonRecord,
      })
      .select("*")
      .single();
    if (userMessageError) return jsonResponse(500, { error: userMessageError.message });

    const maxDocsRaw = await getAppSetting(supabase, "support_agent_max_context_docs");
    const maxDocs = Math.max(1, Math.min(Number(maxDocsRaw || 5) || 5, 10));
    const { data: docs } = await supabase.rpc("search_support_knowledge", {
      p_query: message,
      p_queue_id: queue?.id ?? null,
      p_limit: maxDocs,
    });
    const knowledgeDocs = (docs as any[]) || [];

    const globalPrompt =
      (await getAppSetting(supabase, "support_agent_system_prompt")) ||
      "You are MyMoto Support Agent. Be concise, accurate, and action-oriented.";
    const handoffRules = (await getAppSetting(supabase, "support_agent_handoff_rules")) || "{}";
    const modelOverride = (await getAppSetting(supabase, "support_agent_model")) || "";
    const representativeContext = ticket.representative_id
      ? `Assigned representative ID: ${ticket.representative_id}`
      : "No representative assigned.";

    const docContext = knowledgeDocs.length > 0
      ? knowledgeDocs
          .map((d, idx) => `${idx + 1}. [${d.source_type}] ${d.title}: ${d.snippet}`)
          .join("\n")
      : "No relevant support documents found.";

    const systemPrompt = `${globalPrompt}

Queue:
- name: ${queue?.name || "General Support"}
- slug: ${queue?.slug || "general"}
- routing_instructions: ${queue?.routing_instructions || "Provide best-effort support and clear next steps."}

Ticket:
- id: ${ticket.id}
- ticket_no: ${ticket.ticket_no}
- status: ${ticket.status}
- priority: ${ticket.priority}
- ${representativeContext}

Handoff rules (JSON):
${handoffRules}

Knowledge snippets:
${docContext}

Rules:
1) Provide concise practical support steps.
2) If uncertainty remains, ask one clear follow-up question.
3) When escalation is needed, explicitly mention handoff to human support.
4) Reference internal knowledge by title naturally when relevant.`;

    const llm = await callLLM(systemPrompt, message, {
      maxOutputTokens: 500,
      temperature: 0.3,
      model: modelOverride || undefined,
    });

    const assistantContent =
      llm.text?.trim() ||
      "Thanks for the details. I have logged your ticket and a support specialist will follow up shortly.";

    const citations = knowledgeDocs.map((d) => ({
      source_type: d.source_type,
      source_id: d.source_id,
      title: d.title,
      score: d.score,
    }));

    const { data: agentMessage, error: agentError } = await supabase
      .from("support_ticket_messages")
      .insert({
        ticket_id: ticket.id,
        sender_type: "agent",
        content: assistantContent,
        citations,
        metadata: {
          model: modelOverride || Deno.env.get("LLM_MODEL") || null,
          queue_slug: queue?.slug || "general",
        } as JsonRecord,
      })
      .select("*")
      .single();
    if (agentError) return jsonResponse(500, { error: agentError.message });

    const { data: updatedTicket } = await supabase
      .from("support_tickets")
      .update({
        status: "pending_user",
        queue_id: queue?.id ?? null,
        last_message_at: new Date().toISOString(),
      })
      .eq("id", ticket.id)
      .select("*")
      .single();

    return jsonResponse(200, {
      ticket: updatedTicket || ticket,
      user_message: userMessage,
      agent_message: agentMessage,
    });
  } catch (error: any) {
    console.error("[support-agent-chat] error:", error);
    return jsonResponse(500, { error: error?.message || "Internal server error" });
  }
});

