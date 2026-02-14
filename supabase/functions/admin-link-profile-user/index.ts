import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse(401, { success: false, message: "Unauthorized: No authorization header" });
    }

    const token = normalizeToken(authHeader);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return jsonResponse(401, { success: false, message: "Unauthorized: Invalid token" });
    }

    const { data: isAdmin, error: roleError } = await supabase.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });
    if (roleError || !isAdmin) {
      const { data: adminRole } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (!adminRole) {
        return jsonResponse(403, { success: false, message: "Forbidden: Admin access required" });
      }
    }

    const body = (await req.json().catch(() => null)) as any;
    const profile_id = typeof body?.profile_id === "string" ? body.profile_id : null;
    if (!profile_id) {
      return jsonResponse(200, { success: false, message: "profile_id is required" });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, user_id, email, name")
      .eq("id", profile_id)
      .maybeSingle();

    if (profileError || !profile) {
      return jsonResponse(200, { success: false, message: "Profile not found" });
    }

    if (profile.user_id) {
      return jsonResponse(200, { success: true, message: "Profile already linked", user_id: profile.user_id });
    }

    const email = (profile.email || "").trim().toLowerCase();
    if (!email) {
      return jsonResponse(200, {
        success: false,
        message: "Profile has no email. Add an email to this profile first, then link.",
      });
    }

    // Find an existing auth user by email.
    // Note: listUsers is paginated; this is fine for typical admin usage.
    const { data: usersData, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) {
      return jsonResponse(200, { success: false, message: `Failed to list auth users: ${listError.message}` });
    }

    const match = usersData?.users?.find((u) => (u.email || "").trim().toLowerCase() === email) || null;
    if (!match) {
      return jsonResponse(200, {
        success: false,
        message:
          "No auth user exists for this email yet. Ask the user to sign up/login first, then retry linking (or create an account for them via the admin user creation flow).",
      });
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ user_id: match.id })
      .eq("id", profile_id);

    if (updateError) {
      return jsonResponse(200, { success: false, message: `Failed to link profile: ${updateError.message}` });
    }

    // Ensure role exists for typical owner flows.
    const { error: roleInsertError } = await supabase
      .from("user_roles")
      .insert({ user_id: match.id, role: "owner" });
    if (roleInsertError && roleInsertError.code !== "23505") {
      // Non-fatal; linking is still useful for assignment visibility.
      console.warn("[admin-link-profile-user] Failed to insert owner role:", roleInsertError);
    }

    return jsonResponse(200, {
      success: true,
      message: "Profile linked successfully",
      user_id: match.id,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(200, { success: false, message });
  }
});

