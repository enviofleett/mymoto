import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sendEmail, EmailTemplates, getEmailConfig, renderTemplateString } from "../_shared/email-service.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Max-Age": "86400",
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

async function renderDbTemplate(
  supabase: any,
  templateKey: string,
  vars: Record<string, unknown>,
  fallback: { subject: string; html: string }
): Promise<{ subject: string; html: string; senderId?: string } | null> {
  const { data, error } = await supabase
    .from("email_templates")
    .select("subject, html_content, sender_id, is_active")
    .eq("template_key", templateKey)
    .maybeSingle();

  if (error || !data) return null;
  if (data.is_active === false) return null;

  const subject = renderTemplateString(data.subject, vars);
  const html = renderTemplateString(data.html_content, vars, { rawHtmlKeys: ["body_content"] });
  return { subject, html, senderId: data.sender_id || undefined };
}

type Body = {
  action?: "approve" | "reject";
  request_id?: string;
  device_id?: string | null;
  admin_notes?: string | null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Admin auth required.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse(401, { success: false, error: "Unauthorized: No authorization header" });
    const token = normalizeToken(authHeader);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return jsonResponse(401, { success: false, error: "Unauthorized: Invalid token" });

    const { data: isAdmin, error: roleError } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (roleError || !isAdmin) {
      const { data: adminRole } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (!adminRole) return jsonResponse(403, { success: false, error: "Forbidden: Admin access required" });
    }

    const body = (await req.json().catch(() => null)) as Body | null;
    const action = body?.action;
    const requestId = body?.request_id;
    const adminNotes = (body?.admin_notes || "").trim();

    if (action !== "approve" && action !== "reject") {
      return jsonResponse(400, { success: false, error: 'Invalid action. Expected "approve" | "reject".' });
    }
    if (!requestId) return jsonResponse(400, { success: false, error: "request_id is required" });

    const { data: request, error: requestError } = await supabase
      .from("vehicle_onboarding_requests")
      .select("*")
      .eq("id", requestId)
      .maybeSingle();
    if (requestError || !request) {
      return jsonResponse(404, { success: false, error: "Request not found" });
    }
    if (request.status !== "pending") {
      return jsonResponse(400, { success: false, error: "Request is not pending" });
    }

    // Resolve user email for notifications.
    const { data: userData } = await supabase.auth.admin.getUserById(request.user_id);
    const userEmail = (userData?.user?.email || "").trim().toLowerCase();
    const userName =
      (userData?.user?.user_metadata?.full_name as string | undefined) ||
      (userData?.user?.user_metadata?.name as string | undefined) ||
      userEmail.split("@")[0] ||
      "User";

    const emailConfigured = !!getEmailConfig();
    const appBaseUrl =
      (Deno.env.get("APP_URL") || Deno.env.get("PUBLIC_SITE_URL") || Deno.env.get("SITE_URL") || "").trim();
    const fleetLink = appBaseUrl ? `${appBaseUrl.replace(/\\/+$/, "")}/fleet` : "/fleet";

    if (action === "reject") {
      const { error: rejectError } = await supabase
        .from("vehicle_onboarding_requests")
        .update({
          status: "rejected",
          processed_at: new Date().toISOString(),
          processed_by: user.id,
          admin_notes: adminNotes || request.admin_notes || null,
        })
        .eq("id", requestId);
      if (rejectError) return jsonResponse(400, { success: false, error: rejectError.message });

      if (emailConfigured && userEmail) {
        try {
          const bodyContent = `
            <h2>Vehicle Request Update</h2>
            <p>Hello ${userName},</p>
            <p>Your vehicle request for <strong>${request.plate_number}</strong> was rejected.</p>
            ${adminNotes ? `<p><strong>Notes:</strong> ${adminNotes}</p>` : ""}
          `;
          const fallback = EmailTemplates.systemNotification({
            title: "Your vehicle request was rejected",
            message: `Your vehicle request (${request.plate_number}) was rejected.${adminNotes ? ` Notes: ${adminNotes}` : ""}`,
          });
          const rendered =
            (await renderDbTemplate(
              supabase,
              "vehicle_request_rejected",
              {
                userName,
                plateNumber: request.plate_number,
                adminNotes: adminNotes || "",
                body_content: bodyContent,
              },
              fallback
            )) || fallback;

          await sendEmail({
            to: userEmail,
            subject: rendered.subject,
            html: rendered.html,
            senderId: (rendered as any).senderId,
            supabase,
            templateKey: "vehicle_request_rejected",
          });
        } catch (e) {
          console.warn("[admin-process-vehicle-onboarding-request] rejection email failed:", e);
        }
      }

      return jsonResponse(200, { success: true });
    }

    // action === "approve"
    const deviceId =
      (body?.device_id || request.requested_device_id || "").toString().trim();
    if (!deviceId) return jsonResponse(400, { success: false, error: "device_id is required (or must be present on request)" });

    // Require device exists in vehicles (GPS51 sync/import first).
    const { data: vehicle, error: vehicleError } = await supabase
      .from("vehicles")
      .select("device_id, device_name")
      .eq("device_id", deviceId)
      .maybeSingle();
    if (vehicleError) return jsonResponse(400, { success: false, error: vehicleError.message });
    if (!vehicle) return jsonResponse(400, { success: false, error: "Device not found. Sync/import from GPS51 first." });

    const profileId = request.user_id; // canonical profile id=user_id

    // Ensure canonical profile exists (should be created by trigger; this is a safety net).
    await supabase
      .from("profiles")
      .upsert(
        { id: profileId, user_id: profileId, email: userEmail || null, name: userName },
        { onConflict: "id" }
      );

    // Create assignment (idempotent)
    await supabase
      .from("vehicle_assignments")
      .upsert(
        {
          device_id: deviceId,
          profile_id: profileId,
          vehicle_alias: vehicle.device_name || request.plate_number || deviceId,
        },
        { onConflict: "device_id,profile_id" }
      );

    // Set primary owner (full control)
    await supabase
      .from("vehicles")
      .update({ primary_owner_profile_id: profileId })
      .eq("device_id", deviceId);

    const { error: approveError } = await supabase
      .from("vehicle_onboarding_requests")
      .update({
        status: "approved",
        processed_at: new Date().toISOString(),
        processed_by: user.id,
        admin_notes: adminNotes || request.admin_notes || `Approved and linked to device ${deviceId}`,
        approved_device_id: deviceId,
      })
      .eq("id", requestId);
    if (approveError) return jsonResponse(400, { success: false, error: approveError.message });

    if (emailConfigured && userEmail) {
      try {
        const bodyContent = `
          <h2>Vehicle Request Approved</h2>
          <p>Hello ${userName},</p>
          <p>Your vehicle request for <strong>${request.plate_number}</strong> has been approved.</p>
          <p>Device ID (IMEI): <strong>${deviceId}</strong></p>
          <p>
            <a href="${fleetLink}" style="display:inline-block;padding:10px 14px;border-radius:8px;background:#111827;color:#ffffff;text-decoration:none;">
              View Your Vehicles
            </a>
          </p>
        `;
        const fallback = EmailTemplates.systemNotification({
          title: "Your vehicle request has been approved",
          message: `Your vehicle request (${request.plate_number}) was approved and linked to device ${deviceId}.`,
          actionLink: "/fleet",
          actionText: "View vehicles",
        });
        const rendered =
          (await renderDbTemplate(
            supabase,
            "vehicle_request_approved",
            {
              userName,
              deviceId,
              plateNumber: request.plate_number,
              actionLink: fleetLink,
              body_content: bodyContent,
            },
            fallback
          )) || fallback;

        await sendEmail({
          to: userEmail,
          subject: rendered.subject,
          html: rendered.html,
          senderId: (rendered as any).senderId,
          supabase,
          templateKey: "vehicle_request_approved",
        });
      } catch (e) {
        console.warn("[admin-process-vehicle-onboarding-request] approval email failed:", e);
      }
    }

    return jsonResponse(200, { success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(500, { success: false, error: message });
  }
});
