/**
 * Proactive Alarm to Push Edge Function
 *
 * Triggered by DB insert into proactive_vehicle_events.
 * Sends Web Push notifications to subscribed devices for users assigned to a vehicle,
 * respecting per-vehicle notification preferences (vehicle_notification_preferences).
 *
 * Requires Supabase secrets:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * - VAPID_PUBLIC_KEY (base64url, uncompressed 65-byte public key)
 * - VAPID_PRIVATE_KEY (base64url, 32-byte private key)
 *
 * Client build env:
 * - VITE_VAPID_PUBLIC_KEY (same as VAPID_PUBLIC_KEY)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  ApplicationServer,
  importVapidKeys,
  type PushSubscription,
  PushMessageError,
} from "jsr:@negrel/webpush@0.3.0";

declare const Deno: any;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Severity = "info" | "warning" | "error" | "critical";

interface ProactiveEvent {
  id: string;
  device_id: string;
  event_type: string;
  severity: Severity;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

function base64UrlToBytes(input: string): Uint8Array {
  // Normalize base64url to base64.
  const pad = "=".repeat((4 - (input.length % 4)) % 4);
  const b64 = (input + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  const b64 = btoa(s);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function vapidJwksFromBase64UrlKeys(publicKeyB64Url: string, privateKeyB64Url: string) {
  const pub = base64UrlToBytes(publicKeyB64Url);
  if (pub.length !== 65 || pub[0] !== 4) {
    throw new Error("VAPID_PUBLIC_KEY must be base64url of 65-byte uncompressed P-256 public key");
  }
  const x = pub.slice(1, 33);
  const y = pub.slice(33, 65);

  const dBytes = base64UrlToBytes(privateKeyB64Url);
  if (dBytes.length !== 32) {
    throw new Error("VAPID_PRIVATE_KEY must be base64url of 32-byte P-256 private key");
  }

  const xB64Url = bytesToBase64Url(x);
  const yB64Url = bytesToBase64Url(y);
  const dB64Url = bytesToBase64Url(dBytes);

  const publicKeyJwk = {
    kty: "EC",
    crv: "P-256",
    x: xB64Url,
    y: yB64Url,
    ext: true,
  } as const;

  const privateKeyJwk = {
    kty: "EC",
    crv: "P-256",
    x: xB64Url,
    y: yB64Url,
    d: dB64Url,
    ext: true,
  } as const;

  return { publicKey: publicKeyJwk, privateKey: privateKeyJwk };
}

function getPreferenceKey(eventType: string): string | null {
  const map: Record<string, string> = {
    low_battery: "low_battery",
    critical_battery: "critical_battery",
    overspeeding: "overspeeding",
    harsh_braking: "harsh_braking",
    rapid_acceleration: "rapid_acceleration",
    ignition_on: "ignition_on",
    ignition_off: "ignition_off",
    power_off: "ignition_off",
    geofence_enter: "geofence_enter",
    geofence_exit: "geofence_exit",
    idle_too_long: "idle_too_long",
    offline: "offline",
    online: "online",
    maintenance_due: "maintenance_due",
    trip_completed: "trip_completed",
    anomaly_detected: "anomaly_detected",
    vehicle_moving: "vehicle_moving",
    morning_greeting: "morning_greeting",
  };
  return map[eventType] ?? null;
}

function getVibrationPattern(severity: Severity): number[] {
  switch (severity) {
    case "info":
      return [200];
    case "warning":
      return [200, 100, 200];
    case "error":
      return [200, 100, 200, 100, 200];
    case "critical":
      return [300, 100, 300, 100, 300, 100, 300];
  }
}

async function logError(
  supabase: any,
  params: { event_id?: string; device_id?: string; error_message: string; error_stack?: string }
) {
  try {
    await supabase.from("edge_function_errors").insert({
      function_name: "proactive-alarm-to-push",
      event_id: params.event_id ?? null,
      device_id: params.device_id ?? null,
      error_message: params.error_message,
      error_stack: params.error_stack ?? null,
      resolved: false,
    });
  } catch (e) {
    console.warn("[proactive-alarm-to-push] Could not log error to database:", e);
  }
}

async function getAssignedUserIds(supabase: any, deviceId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("vehicle_assignments")
    .select(
      `
      profile_id,
      profiles:profile_id (
        user_id
      )
    `
    )
    .eq("device_id", deviceId)
    .eq("status", "active");

  if (error) {
    console.error("[proactive-alarm-to-push] Error fetching assignments:", error);
    return [];
  }

  return (data || [])
    .map((a: any) => a.profiles?.user_id)
    .filter(Boolean) as string[];
}

function buildRoute(eventId: string, deviceId: string) {
  const qs = new URLSearchParams();
  qs.set("eventId", eventId);
  qs.set("deviceId", deviceId);
  return `/notifications?${qs.toString()}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let proactiveEvent: ProactiveEvent | undefined;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.json();

    if (body.record) {
      proactiveEvent = body.record as ProactiveEvent;
    } else if (body.event) {
      proactiveEvent = body.event as ProactiveEvent;
    } else if (body.device_id) {
      proactiveEvent = body as ProactiveEvent;
    } else {
      throw new Error('Missing event data: expected "record", "event", or direct event object');
    }

    if (!proactiveEvent?.id || !proactiveEvent.device_id || !proactiveEvent.event_type) {
      throw new Error("Invalid event payload");
    }

    const preferenceKey = getPreferenceKey(proactiveEvent.event_type);
    if (!preferenceKey) {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "event_type_not_mapped" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build VAPID app server once per invocation.
    const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
    if (!vapidPublic || !vapidPrivate) {
      throw new Error("Missing VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY secrets");
    }

    const jwks = vapidJwksFromBase64UrlKeys(vapidPublic, vapidPrivate);
    const vapidKeys = await importVapidKeys(jwks);
    const as = await ApplicationServer.new({
      contactInformation: "mailto:support@mymoto.app",
      vapidKeys,
    });

    const assignedUserIds = await getAssignedUserIds(supabase, proactiveEvent.device_id);
    if (assignedUserIds.length === 0) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: "no_assigned_users" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch per-vehicle push preferences for this event.
    const { data: prefs, error: prefsError } = await supabase
      .from("vehicle_notification_preferences")
      .select(`user_id, ${preferenceKey}`)
      .eq("device_id", proactiveEvent.device_id)
      .in("user_id", assignedUserIds);

    if (prefsError) {
      console.error("[proactive-alarm-to-push] Error fetching vehicle preferences:", prefsError);
      await logError(supabase, {
        event_id: proactiveEvent.id,
        device_id: proactiveEvent.device_id,
        error_message: prefsError.message ?? "preferences_fetch_failed",
      });
      return new Response(JSON.stringify({ success: false, error: "preferences_fetch_failed" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const enabledUserIds = (prefs || [])
      .filter((p: any) => p[preferenceKey] === true)
      .map((p: any) => p.user_id) as string[];

    if (enabledUserIds.length === 0) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: "no_users_enabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: subs, error: subsError } = await supabase
      .from("user_push_subscriptions")
      .select("user_id, endpoint, p256dh, auth")
      .in("user_id", enabledUserIds);

    if (subsError) {
      console.error("[proactive-alarm-to-push] Error fetching subscriptions:", subsError);
      await logError(supabase, {
        event_id: proactiveEvent.id,
        device_id: proactiveEvent.device_id,
        error_message: subsError.message ?? "subscriptions_fetch_failed",
      });
      return new Response(JSON.stringify({ success: false, error: "subscriptions_fetch_failed" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const route = buildRoute(proactiveEvent.id, proactiveEvent.device_id);
    const tag = `alert-${proactiveEvent.id}`;
    const payload = JSON.stringify({
      title: proactiveEvent.severity === "critical" ? `🚨 ${proactiveEvent.title}` : proactiveEvent.title,
      body: proactiveEvent.message || proactiveEvent.title,
      icon: "/pwa-192x192.png",
      badge: "/pwa-192x192.png",
      tag,
      requireInteraction: proactiveEvent.severity === "critical",
      silent: false,
      vibrate: getVibrationPattern(proactiveEvent.severity),
      renotify: false,
      timestamp: Date.now(),
      data: {
        eventId: proactiveEvent.id,
        deviceId: proactiveEvent.device_id,
        eventType: proactiveEvent.event_type,
        route,
      },
    });

    const urgency =
      proactiveEvent.severity === "critical" || proactiveEvent.severity === "error"
        ? "high"
        : proactiveEvent.severity === "warning"
          ? "normal"
          : "low";

    const results = await Promise.allSettled(
      (subs || []).map(async (s: any) => {
        const sub: PushSubscription = {
          endpoint: s.endpoint,
          keys: { p256dh: s.p256dh, auth: s.auth },
        };

        const subscriber = as.subscribe(sub);
        await subscriber.pushTextMessage(payload, {
          urgency,
          ttl: 60 * 60, // 1 hour
          topic: tag, // helps collapse duplicates at the push service
        });
        return { user_id: s.user_id, endpoint: s.endpoint };
      })
    );

    // Cleanup stale endpoints on permanent errors.
    let sent = 0;
    let failed = 0;
    for (const r of results) {
      if (r.status === "fulfilled") {
        sent++;
        continue;
      }
      failed++;
      const reason = r.reason;
      if (reason instanceof PushMessageError) {
        const status = reason.status;
        const endpoint = reason.endpoint;
        if (status === 404 || status === 410) {
          try {
            await supabase.from("user_push_subscriptions").delete().eq("endpoint", endpoint);
          } catch {
            // ignore
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent,
        failed,
        users_enabled: enabledUserIds.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[proactive-alarm-to-push] Error:", error);

    // Best-effort logging if supabase client exists not available here; skip.
    return new Response(JSON.stringify({ success: false, error: error?.message ?? "unknown_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

