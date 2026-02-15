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
      .select("id, user_id, email, name, phone")
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

    const canonicalProfileId = match.id;

    // Ensure canonical profile exists (triggers normally create it, but keep this idempotent).
    const { data: canonical, error: canonicalError } = await supabase
      .from("profiles")
      .select("id, user_id, email, name, phone")
      .eq("id", canonicalProfileId)
      .maybeSingle();

    if (canonicalError) {
      return jsonResponse(200, { success: false, message: `Failed to load canonical profile: ${canonicalError.message}` });
    }

    if (!canonical) {
      const { error: insertCanonicalError } = await supabase
        .from("profiles")
        .insert({
          id: canonicalProfileId,
          user_id: canonicalProfileId,
          email: match.email || profile.email,
          name: profile.name || match.email || "User",
        });

      if (insertCanonicalError) {
        return jsonResponse(200, { success: false, message: `Failed to create canonical profile: ${insertCanonicalError.message}` });
      }
    }

    if (profile.id === canonicalProfileId) {
      // Simple case: the selected profile is already canonical, just link it.
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          user_id: canonicalProfileId,
          // Keep user-facing fields in sync.
          email: profile.email || match.email,
          name: profile.name || match.email || "User",
        })
        .eq("id", canonicalProfileId);

      if (updateError) {
        return jsonResponse(200, { success: false, message: `Failed to link profile: ${updateError.message}` });
      }

      return jsonResponse(200, {
        success: true,
        message: "Profile linked successfully",
        user_id: canonicalProfileId,
        profile_id: canonicalProfileId,
      });
    }

    // Merge unlinked profile into canonical to avoid duplicate profiles.user_id entries.
    // 1) Update canonical fields with any data present on the unlinked profile.
    const { error: mergeProfileError } = await supabase
      .from("profiles")
      .update({
        user_id: canonicalProfileId,
        name: profile.name || (canonical as any)?.name || match.email || "User",
        email: profile.email || (canonical as any)?.email || match.email,
        phone: (profile as any)?.phone || (canonical as any)?.phone || null,
      })
      .eq("id", canonicalProfileId);
    if (mergeProfileError) {
      return jsonResponse(200, { success: false, message: `Failed to merge profile data: ${mergeProfileError.message}` });
    }

    // 2) Move vehicle assignments to canonical (idempotent)
    const { data: existingAssignments, error: assignLoadError } = await supabase
      .from("vehicle_assignments")
      .select("device_id, vehicle_alias, created_at, updated_at")
      .eq("profile_id", profile.id);
    if (assignLoadError) {
      return jsonResponse(200, { success: false, message: `Failed to load assignments: ${assignLoadError.message}` });
    }

    if (existingAssignments && existingAssignments.length > 0) {
      const rows = existingAssignments.map((a: any) => ({
        device_id: a.device_id,
        profile_id: canonicalProfileId,
        vehicle_alias: a.vehicle_alias,
        created_at: a.created_at,
        updated_at: a.updated_at,
      }));

      const { error: upsertError } = await supabase
        .from("vehicle_assignments")
        .upsert(rows, { onConflict: "device_id,profile_id" });
      if (upsertError) {
        return jsonResponse(200, { success: false, message: `Failed to migrate assignments: ${upsertError.message}` });
      }

      const { error: deleteOldError } = await supabase
        .from("vehicle_assignments")
        .delete()
        .eq("profile_id", profile.id);
      if (deleteOldError) {
        return jsonResponse(200, { success: false, message: `Failed to cleanup old assignments: ${deleteOldError.message}` });
      }
    }

    // 3) Delete old unlinked profile (safe because it had user_id null).
    const { error: deleteProfileError } = await supabase
      .from("profiles")
      .delete()
      .eq("id", profile.id);
    if (deleteProfileError) {
      return jsonResponse(200, { success: false, message: `Failed to cleanup old profile: ${deleteProfileError.message}` });
    }

    return jsonResponse(200, {
      success: true,
      message: "Profile linked successfully (merged into canonical profile)",
      user_id: canonicalProfileId,
      profile_id: canonicalProfileId,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(200, { success: false, message });
  }
});
