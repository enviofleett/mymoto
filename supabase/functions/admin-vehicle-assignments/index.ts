import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

type Action = "assign" | "unassign" | "unassign_all";

type ErrorItem = {
  device_id?: string;
  code?: string;
  message: string;
  details?: string;
  hint?: string;
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
  return value.filter((v) => typeof v === "string" && v.trim().length > 0).map((v) => v.trim());
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
      return jsonResponse(401, { success: false, message: `Unauthorized: ${authError?.message || "Invalid token"}` });
    }

    const { data: isAdmin, error: roleError } = await supabase.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });

    if (roleError || !isAdmin) {
      // Fallback check (keeps behavior consistent with other admin functions in this repo).
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

    const body = await req.json().catch(() => null) as any;
    const action = body?.action as Action | undefined;

    if (action !== "assign" && action !== "unassign" && action !== "unassign_all") {
      return jsonResponse(200, {
        success: false,
        message: 'Invalid action. Expected "assign" | "unassign" | "unassign_all".',
      });
    }

    if (action === "unassign_all") {
      const { error } = await supabase
        .from("vehicle_assignments")
        .delete()
        .neq("device_id", ""); // delete all rows

      if (error) {
        return jsonResponse(200, {
          success: false,
          message: "Failed to unassign all vehicles",
          errors: [{ message: error.message, code: error.code, details: (error as any).details, hint: (error as any).hint }],
        });
      }

      return jsonResponse(200, {
        success: true,
        message: "Unassigned all vehicles",
        unassigned_count: null, // PostgREST count isn't guaranteed; frontend can treat this as success.
        errors: [],
      });
    }

    const profile_id = typeof body?.profile_id === "string" ? body.profile_id : null;
    const device_ids = safeArrayOfStrings(body?.device_ids);
    const vehicle_aliases = (body?.vehicle_aliases && typeof body.vehicle_aliases === "object")
      ? (body.vehicle_aliases as Record<string, string>)
      : undefined;

    if (device_ids.length === 0) {
      return jsonResponse(200, { success: false, message: "device_ids is required (non-empty array)" });
    }

    if (action === "assign") {
      if (!profile_id) {
        return jsonResponse(200, { success: false, message: "profile_id is required for assign" });
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, user_id, email, name")
        .eq("id", profile_id)
        .maybeSingle();

      if (profileError || !profile) {
        return jsonResponse(200, { success: false, message: "Profile not found" });
      }

      if (!profile.user_id) {
        return jsonResponse(200, {
          success: false,
          message:
            "Profile is not linked to an auth user. Create/link the user account first so they can see vehicles in the PWA.",
          errors: [],
        });
      }

      const errors: ErrorItem[] = [];
      let assigned_count = 0;

      for (const device_id of device_ids) {
        const payload = {
          device_id,
          profile_id,
          vehicle_alias: vehicle_aliases?.[device_id] ?? null,
          updated_at: new Date().toISOString(),
        };

        const { error } = await supabase
          .from("vehicle_assignments")
          .upsert(payload, { onConflict: "device_id,profile_id" });

        if (error) {
          errors.push({
            device_id,
            message: error.message,
            code: error.code,
            details: (error as any).details,
            hint: (error as any).hint,
          });
        } else {
          assigned_count += 1;
        }
      }

      if (errors.length > 0) {
        return jsonResponse(200, {
          success: false,
          message: `Failed to assign ${errors.length} vehicle(s)`,
          assigned_count,
          errors,
        });
      }

      return jsonResponse(200, {
        success: true,
        message: `Assigned ${assigned_count} vehicle(s)`,
        assigned_count,
        errors: [],
      });
    }

    // action === "unassign"
    // profile_id is optional: if omitted, we unassign these device_ids from all profiles.
    const errors: ErrorItem[] = [];
    let unassigned_count = 0;

    for (const device_id of device_ids) {
      let q = supabase
        .from("vehicle_assignments")
        .delete()
        .eq("device_id", device_id);
      if (profile_id) q = q.eq("profile_id", profile_id);

      const { error } = await q;
      if (error) {
        errors.push({
          device_id,
          message: error.message,
          code: error.code,
          details: (error as any).details,
          hint: (error as any).hint,
        });
      } else {
        unassigned_count += 1;
      }
    }

    if (errors.length > 0) {
      return jsonResponse(200, {
        success: false,
        message: `Failed to unassign ${errors.length} vehicle(s)`,
        unassigned_count,
        errors,
      });
    }

    return jsonResponse(200, {
      success: true,
      message: `Unassigned ${unassigned_count} vehicle(s)`,
      unassigned_count,
      errors: [],
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(200, { success: false, message });
  }
});
