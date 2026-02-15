import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sendEmail, EmailTemplates, getEmailConfig } from "../_shared/email-service.ts";

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

function safeArrayOfStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v) => typeof v === "string" && v.trim().length > 0)
    .map((v) => v.trim());
}

type RequestBody = {
  email?: string | null;
  password?: string | null;
  name?: string | null;
  phone?: string | null;
  deviceIds?: string[] | null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Admin auth required (this function can create users and assign vehicles).
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse(401, { success: false, error: "Unauthorized: No authorization header" });

    const token = normalizeToken(authHeader);
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return jsonResponse(401, { success: false, error: "Unauthorized: Invalid token" });

    const { data: isAdmin, error: roleError } = await supabaseAdmin.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });
    if (roleError || !isAdmin) {
      const { data: adminRole } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (!adminRole) return jsonResponse(403, { success: false, error: "Forbidden: Admin access required" });
    }

    const body = (await req.json().catch(() => null)) as RequestBody | null;
    const name = (body?.name || "").trim();
    const email = (body?.email || "").trim().toLowerCase();
    const password = (body?.password || "").trim();
    const phone = (body?.phone || "").trim();
    const deviceIds = safeArrayOfStrings(body?.deviceIds);

    if (!name) return jsonResponse(400, { success: false, error: "Name is required" });
    if (password && !email) return jsonResponse(400, { success: false, error: "Email is required when password is provided" });

    let userId: string | null = null;
    let createdNewAuthUser = false;

    // Prefer lookup via profiles table to avoid listUsers where possible.
    if (email && !password) {
      const { data: existingProfile } = await supabaseAdmin
        .from("profiles")
        .select("user_id")
        .ilike("email", email)
        .not("user_id", "is", null)
        .maybeSingle();
      if (existingProfile?.user_id) userId = existingProfile.user_id as any;
    }

    // 1) Create or reuse auth user
    if (email && password) {
      const { data: authData, error: authCreateError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        // Skip DB trigger welcome email for admin-created users; this function sends the welcome email itself.
        user_metadata: { full_name: name, name, phone: phone || null, skip_welcome_email: true },
      });
      if (authCreateError) {
        return jsonResponse(400, { success: false, error: `Failed to create auth user: ${authCreateError.message}` });
      }
      userId = authData.user.id;
      createdNewAuthUser = true;
    } else if (email && !userId) {
      // Fallback: find existing auth user by email (paginated, but acceptable for typical admin usage).
      const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      if (listError) return jsonResponse(400, { success: false, error: `Failed to list auth users: ${listError.message}` });
      const match = usersData?.users?.find((u) => (u.email || "").trim().toLowerCase() === email) || null;
      if (match) userId = match.id;
    }

    // 2) Create or update profile
    // If auth user exists, use canonical profile id=userId to avoid duplicate profile rows.
    let profileId: string;
    if (userId) {
      profileId = userId;

      // Ensure canonical profile exists and is updated.
      // The DB trigger (handle_new_user_profile) normally creates this, but we upsert to keep name/email/phone correct.
      const { error: upsertError } = await supabaseAdmin
        .from("profiles")
        .upsert(
          { id: profileId, user_id: userId, name, email: email || null, phone: phone || null },
          { onConflict: "id" }
        );

      if (upsertError) {
        // Cleanup: if we created an auth user and profile upsert fails, delete the auth user.
        if (createdNewAuthUser) {
          await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => null);
        }
        return jsonResponse(400, { success: false, error: `Failed to upsert profile: ${upsertError.message}` });
      }
    } else {
      // Profile-only (unlinked) profile creation is allowed for pre-provisioning.
      const { data: profileData, error: profileError } = await supabaseAdmin
        .from("profiles")
        .insert({ name, email: email || null, phone: phone || null, user_id: null })
        .select("id")
        .single();

      if (profileError || !profileData?.id) {
        return jsonResponse(400, { success: false, error: `Failed to create profile: ${profileError?.message || "Unknown error"}` });
      }
      profileId = profileData.id as any;
    }

    // 3) Assign vehicles (optional)
    let assignedVehicles: string[] = [];
    if (deviceIds.length > 0) {
      const { data: vehicleDetails, error: vehicleCheckError } = await supabaseAdmin
        .from("vehicles")
        .select("device_id, device_name")
        .in("device_id", deviceIds);

      if (vehicleCheckError) {
        console.warn("[create-test-user] vehicle lookup failed:", vehicleCheckError);
      }

      const existingDeviceIds = (vehicleDetails || []).map((v: any) => v.device_id);
      const assignments = existingDeviceIds.map((deviceId: string) => {
        const v = (vehicleDetails || []).find((row: any) => row.device_id === deviceId);
        return {
          device_id: deviceId,
          profile_id: profileId,
          vehicle_alias: v?.device_name || null,
        };
      });

      if (assignments.length > 0) {
        const { data: assignmentData, error: assignError } = await supabaseAdmin
          .from("vehicle_assignments")
          .upsert(assignments, { onConflict: "device_id,profile_id" })
          .select("device_id");

        if (assignError) {
          console.warn("[create-test-user] vehicle assignment failed:", assignError);
        } else {
          assignedVehicles = (assignmentData || []).map((a: any) => a.device_id);
        }
      }
    }

    // 4) Emails (always attempt when configured)
    const emailConfig = getEmailConfig();
    if (emailConfig && email) {
      // Welcome email: only for newly created auth users.
      if (createdNewAuthUser && userId) {
        try {
          const t = EmailTemplates.welcome({ userName: name, loginLink: `${supabaseUrl.replace("/rest/v1", "")}/auth` });
          await sendEmail({ to: email, subject: t.subject, html: t.html, supabase: supabaseAdmin, templateKey: "welcome" });
        } catch (e) {
          console.warn("[create-test-user] welcome email failed:", e);
        }
      }

      // Assignment email: if vehicles were assigned.
      if (assignedVehicles.length > 0) {
        try {
          const subject = "New Vehicle(s) Assigned to Your Account";
          const html = `
            <h2>Vehicles Assigned</h2>
            <p>Hello ${name},</p>
            <p>${assignedVehicles.length} vehicle(s) have been assigned to your account.</p>
            <p><a href="${supabaseUrl.replace("/rest/v1", "")}/">Open MyMoto Fleet</a></p>
          `;
          await sendEmail({ to: email, subject, html, supabase: supabaseAdmin, templateKey: "vehicle_assignment" });
        } catch (e) {
          console.warn("[create-test-user] assignment email failed:", e);
        }
      }
    }

    return jsonResponse(200, {
      success: true,
      userId,
      profileId,
      assignedVehicles,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(500, { success: false, error: message });
  }
});
