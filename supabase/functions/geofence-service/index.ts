import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const Deno: any;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

type Json = Record<string, unknown>;

function jsonResponse(body: Json, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

async function handleZones(
  req: Request,
  supabase: any,
  userId: string | null,
  pathParts: string[],
) {
  if (!userId) {
    return jsonResponse(
      { error: "Unauthorized: user token required" },
      { status: 401 },
    );
  }

  const method = req.method;

  if (method === "GET") {
    const url = new URL(req.url);
    const deviceId = url.searchParams.get("device_id");
    const includeInactive = url.searchParams.get("include_inactive") === "true";

    const query = supabase.from("geofence_zones" as any).select("*");

    if (deviceId) {
      query.or(`device_id.eq.${deviceId},applies_to_all.eq.true`);
    }

    if (!includeInactive) {
      query.eq("is_active", true);
    }

    const { data, error } = await query.order("created_at", {
      ascending: false,
    });

    if (error) {
      return jsonResponse(
        { error: error.message },
        { status: 500 },
      );
    }

    return jsonResponse({ zones: data ?? [] });
  }

  if (method === "POST") {
    const body = await req.json();
    const {
      name,
      description,
      zone_type,
      shape_type,
      latitude,
      longitude,
      radius_meters,
      device_id,
      applies_to_all,
      alert_on,
      alert_enabled,
      notification_message,
      priority,
      effective_start_time,
      effective_end_time,
      active_days,
      speed_limit_kmh,
    } = body as any;

    if (!name || !shape_type) {
      return jsonResponse(
        { error: "name and shape_type are required" },
        { status: 400 },
      );
    }

    let centerPoint: string | null = null;
    if (latitude != null && longitude != null) {
      centerPoint = `POINT(${longitude} ${latitude})`;
    }

    const insertPayload: any = {
      name,
      description,
      zone_type,
      shape_type,
      center_point: centerPoint,
      radius_meters,
      device_id,
      applies_to_all: applies_to_all ?? !device_id,
      alert_on,
      alert_enabled,
      notification_message,
      priority,
      effective_start_time,
      effective_end_time,
      active_days,
      speed_limit_kmh,
      created_by: userId,
    };

    const { data, error } = await supabase
      .from("geofence_zones" as any)
      .insert(insertPayload)
      .select("*")
      .single();

    if (error) {
      return jsonResponse(
        { error: error.message },
        { status: 500 },
      );
    }

    return jsonResponse({ zone: data }, { status: 201 });
  }

  const hasId = pathParts.length >= 3 && pathParts[2];

  if (hasId && method === "PATCH") {
    const id = pathParts[2];
    const body = await req.json();

    const updatePayload: any = {};
    const allowedFields = [
      "name",
      "description",
      "zone_type",
      "alert_on",
      "alert_enabled",
      "notification_message",
      "is_active",
      "priority",
      "effective_start_time",
      "effective_end_time",
      "active_days",
      "speed_limit_kmh",
      "color",
    ];

    for (const key of allowedFields) {
      if (key in body) {
        updatePayload[key] = (body as any)[key];
      }
    }

    if ("latitude" in body && "longitude" in body) {
      const lat = (body as any).latitude;
      const lng = (body as any).longitude;
      if (lat != null && lng != null) {
        updatePayload.center_point = `POINT(${lng} ${lat})`;
      }
    }

    if ("radius_meters" in body) {
      updatePayload.radius_meters = (body as any).radius_meters;
    }

    const { data, error } = await supabase
      .from("geofence_zones" as any)
      .update(updatePayload)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return jsonResponse(
        { error: error.message },
        { status: 500 },
      );
    }

    return jsonResponse({ zone: data });
  }

  if (hasId && method === "DELETE") {
    const id = pathParts[2];

    const { error } = await supabase
      .from("geofence_zones" as any)
      .delete()
      .eq("id", id);

    if (error) {
      return jsonResponse(
        { error: error.message },
        { status: 500 },
      );
    }

    return jsonResponse({ success: true });
  }

  return jsonResponse({ error: "Method not allowed" }, { status: 405 });
}

async function handleRules(
  req: Request,
  supabase: any,
  userId: string | null,
  pathParts: string[],
) {
  if (!userId) {
    return jsonResponse(
      { error: "Unauthorized: user token required" },
      { status: 401 },
    );
  }

  const method = req.method;

  if (method === "GET") {
    const url = new URL(req.url);
    const geofenceId = url.searchParams.get("geofence_id");
    const deviceId = url.searchParams.get("device_id");
    const activeOnly = url.searchParams.get("active_only") !== "false";

    let query = supabase.from("geofence_rules").select("*");

    if (geofenceId) {
      query = query.eq("geofence_id", geofenceId);
    }

    if (deviceId) {
      query = query.eq("device_id", deviceId);
    }

    if (activeOnly) {
      query = query.eq("is_active", true);
    }

    const { data, error } = await query.order("priority", {
      ascending: false,
    });

    if (error) {
      return jsonResponse(
        { error: error.message },
        { status: 500 },
      );
    }

    return jsonResponse({ rules: data ?? [] });
  }

  if (method === "POST") {
    const body = await req.json();
    const {
      geofence_id,
      device_id,
      rule_type,
      name,
      description,
      priority,
      config,
      is_active,
    } = body as any;

    if (!geofence_id || !rule_type || !name) {
      return jsonResponse(
        { error: "geofence_id, rule_type, and name are required" },
        { status: 400 },
      );
    }

    const insertPayload: any = {
      geofence_id,
      device_id,
      rule_type,
      name,
      description,
      priority,
      config: config || {},
      is_active: is_active !== false,
      created_by: userId,
    };

    const { data, error } = await supabase
      .from("geofence_rules")
      .insert(insertPayload)
      .select("*")
      .single();

    if (error) {
      return jsonResponse(
        { error: error.message },
        { status: 500 },
      );
    }

    return jsonResponse({ rule: data }, { status: 201 });
  }

  const hasId = pathParts.length >= 3 && pathParts[2];

  if (hasId && method === "PATCH") {
    const id = pathParts[2];
    const body = await req.json();

    const updatePayload: any = {};
    const allowedFields = [
      "name",
      "description",
      "priority",
      "config",
      "is_active",
      "rule_type",
      "device_id",
    ];

    for (const key of allowedFields) {
      if (key in body) {
        updatePayload[key] = (body as any)[key];
      }
    }

    const { data, error } = await supabase
      .from("geofence_rules")
      .update(updatePayload)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return jsonResponse(
        { error: error.message },
        { status: 500 },
      );
    }

    return jsonResponse({ rule: data });
  }

  if (hasId && method === "DELETE") {
    const id = pathParts[2];

    const { error } = await supabase
      .from("geofence_rules")
      .delete()
      .eq("id", id);

    if (error) {
      return jsonResponse(
        { error: error.message },
        { status: 500 },
      );
    }

    return jsonResponse({ success: true });
  }

  return jsonResponse({ error: "Method not allowed" }, { status: 405 });
}

async function handleInstructions(
  req: Request,
  supabase: any,
  userId: string | null,
) {
  if (!userId) {
    return jsonResponse(
      { error: "Unauthorized: user token required" },
      { status: 401 },
    );
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  }

  const body = await req.json();
  const { type, payload } = body as any;

  if (!type || !payload) {
    return jsonResponse(
      { error: "type and payload are required" },
      { status: 400 },
    );
  }

  if (type === "notify_enter_exit") {
    const {
      device_id,
      geofence_id,
      trigger_on,
      expires_at,
      one_time,
    } = payload as any;

    if (!device_id || !geofence_id || !trigger_on) {
      return jsonResponse(
        { error: "device_id, geofence_id, and trigger_on are required" },
        { status: 400 },
      );
    }

    const { data: zone, error: zoneError } = await supabase
      .from("geofence_zones" as any)
      .select("id, name, center_point, radius_meters")
      .eq("id", geofence_id)
      .maybeSingle();

    if (zoneError || !zone) {
      return jsonResponse(
        { error: "geofence not found" },
        { status: 404 },
      );
    }

    let latitude = null;
    let longitude = null;

    if (zone.center_point) {
      const text = zone.center_point as string;
      const match = text.match(/POINT\(([-\d\.]+)\s+([-\d\.]+)\)/);
      if (match) {
        longitude = parseFloat(match[1]);
        latitude = parseFloat(match[2]);
      }
    }

    const insertPayload: any = {
      device_id,
      location_id: geofence_id,
      location_name: zone.name,
      latitude,
      longitude,
      radius_meters: zone.radius_meters,
      trigger_on,
      is_active: true,
      one_time: one_time ?? false,
      created_by: userId,
      expires_at,
    };

    const { data, error } = await supabase
      .from("geofence_monitors")
      .insert(insertPayload)
      .select("*")
      .single();

    if (error) {
      return jsonResponse(
        { error: error.message },
        { status: 500 },
      );
    }

    return jsonResponse({ monitor: data }, { status: 201 });
  }

  if (type === "set_speed_limit") {
    const { geofence_id, speed_limit_kmh } = payload as any;

    if (!geofence_id || speed_limit_kmh == null) {
      return jsonResponse(
        { error: "geofence_id and speed_limit_kmh are required" },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("geofence_zones" as any)
      .update({ speed_limit_kmh })
      .eq("id", geofence_id)
      .select("*")
      .single();

    if (error) {
      return jsonResponse(
        { error: error.message },
        { status: 500 },
      );
    }

    return jsonResponse({ zone: data });
  }

  if (type === "create_rule") {
    const {
      geofence_id,
      device_id,
      rule_type,
      name,
      description,
      priority,
      config,
      is_active,
    } = payload as any;

    if (!geofence_id || !rule_type || !name) {
      return jsonResponse(
        { error: "geofence_id, rule_type, and name are required" },
        { status: 400 },
      );
    }

    const insertPayload: any = {
      geofence_id,
      device_id,
      rule_type,
      name,
      description,
      priority,
      config: config || {},
      is_active: is_active !== false,
      created_by: userId,
    };

    const { data, error } = await supabase
      .from("geofence_rules")
      .insert(insertPayload)
      .select("*")
      .single();

    if (error) {
      return jsonResponse(
        { error: error.message },
        { status: 500 },
      );
    }

    return jsonResponse({ rule: data }, { status: 201 });
  }

  return jsonResponse(
    { error: "Unsupported instruction type" },
    { status: 400 },
  );
}
addEventListener("fetch", (event: FetchEvent) => {
  event.respondWith(handler(event.request));
});

async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/+/, "");
  const parts = path.split("/");
  const baseIndex = parts.findIndex((p) => p === "geofence-service");
  const pathParts = baseIndex >= 0 ? parts.slice(baseIndex + 1) : [];
  const resource = pathParts[0] || "";

  const supabaseService = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  let userId: string | null = null;
  const authHeader = req.headers.get("Authorization");

  if (authHeader) {
    const anonKey =
      Deno.env.get("SUPABASE_ANON_KEY") ??
      Deno.env.get("SUPABASE_ANON_KEY_JWT") ??
      "";

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      anonKey,
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      },
    );

    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();

    if (user) {
      userId = user.id as string;
    }
  }

  try {
    if (resource === "zones") {
      return await handleZones(req, supabaseService, userId, pathParts);
    }

    if (resource === "rules") {
      return await handleRules(req, supabaseService, userId, pathParts);
    }

    if (resource === "instructions") {
      return await handleInstructions(req, supabaseService, userId);
    }

    return jsonResponse({ error: "Not found" }, { status: 404 });
  } catch (error: any) {
    return jsonResponse(
      { error: error.message || "Unexpected error" },
      { status: 500 },
    );
  }
}
