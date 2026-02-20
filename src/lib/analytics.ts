import { supabase } from "@/integrations/supabase/client";

export type AnalyticsEvent =
  | "landing_view"
  | "auth_view"
  | "auth_submit"
  | "auth_success"
  | "auth_error"
  | "install_view"
  | "install_cta_click"
  | "install_instruction_view"
  | "install_beforeinstallprompt"
  | "install_prompt_accepted"
  | "install_prompt_dismissed"
  | "install_appinstalled"
  | "install_error"
  | "install_share"
  | "install_copy_link"
  | "vehicle_request_open"
  | "vehicle_request_submit"
  | "vehicle_request_approved"
  | "first_vehicle_visible"
  | "first_chat_open"
  | "first_chat_sent"
  | "first_alert_seen"
  | "push_banner_view"
  | "push_permission_prompt"
  | "push_permission_granted"
  | "push_permission_denied"
  | "voice_mic_tap"
  | "voice_recording_started"
  | "voice_recording_stopped"
  | "voice_transcript_success"
  | "voice_transcript_empty"
  | "voice_permission_denied"
  | "voice_tts_play"
  | "voice_tts_stop"
  | "voice_unsupported"
  | "d1_return"
  | "d7_return";

export interface AttributionContext {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  referrer: string | null;
  entry_path: string;
  referral_code: string | null;
  campaign_variant: string | null;
  first_seen_at: string;
}

const SESSION_KEY = "mymoto-analytics-session-id";
const FIRST_TOUCH_KEY = "mymoto-first-touch-attribution";
const ONCE_KEY_PREFIX = "mymoto-analytics-once";
const RETURN_STATE_PREFIX = "mymoto-return-state";

let currentUserId: string | null = null;

function nowIso() {
  return new Date().toISOString();
}

function randomId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getSessionId() {
  try {
    const existing = localStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const id = randomId();
    localStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return randomId();
  }
}

function getPath() {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}`;
}

export function captureAttributionFromUrl() {
  if (typeof window === "undefined") return null;
  try {
    const existing = localStorage.getItem(FIRST_TOUCH_KEY);
    if (existing) return JSON.parse(existing) as AttributionContext;

    const p = new URLSearchParams(window.location.search);
    const payload: AttributionContext = {
      utm_source: p.get("utm_source"),
      utm_medium: p.get("utm_medium"),
      utm_campaign: p.get("utm_campaign"),
      utm_term: p.get("utm_term"),
      utm_content: p.get("utm_content"),
      referrer: document.referrer || null,
      entry_path: getPath(),
      referral_code: p.get("ref"),
      campaign_variant: p.get("campaign") ?? p.get("ch"),
      first_seen_at: nowIso(),
    };
    localStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(payload));
    return payload;
  } catch {
    return null;
  }
}

export function getAttributionContext(): AttributionContext | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(FIRST_TOUCH_KEY);
    if (!raw) return captureAttributionFromUrl();
    return JSON.parse(raw) as AttributionContext;
  } catch {
    return null;
  }
}

export function setAnalyticsUserId(userId: string | null) {
  currentUserId = userId;
}

export async function attachUserAttribution(userId: string) {
  const attribution = getAttributionContext();
  if (!attribution) return;
  try {
    await (supabase as any).from("user_attribution").upsert(
      {
        user_id: userId,
        first_touch: attribution,
        latest_touch: {
          ...attribution,
          attached_at: nowIso(),
          attach_path: getPath(),
        },
      },
      { onConflict: "user_id" }
    );
  } catch {
    // Fail open for analytics writes.
  }
}

export async function trackEvent(
  eventName: AnalyticsEvent,
  properties: Record<string, unknown> = {}
) {
  const attribution = getAttributionContext();
  const payload = {
    event_name: eventName,
    user_id: currentUserId,
    session_id: getSessionId(),
    path: getPath(),
    properties: {
      ...properties,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    },
    attribution,
    created_at: nowIso(),
  };

  try {
    await (supabase as any).from("analytics_events").insert(payload);
  } catch {
    // Fail open.
  }
}

export async function trackEventOnce(
  eventName: AnalyticsEvent,
  dedupeKey: string,
  properties: Record<string, unknown> = {}
) {
  try {
    const key = `${ONCE_KEY_PREFIX}:${eventName}:${dedupeKey}`;
    if (localStorage.getItem(key) === "1") return;
    localStorage.setItem(key, "1");
  } catch {
    // Ignore localStorage failures.
  }
  await trackEvent(eventName, properties);
}

export async function trackReturnMilestones(userId: string) {
  try {
    const key = `${RETURN_STATE_PREFIX}:${userId}`;
    const raw = localStorage.getItem(key);
    const nowTs = Date.now();
    if (!raw) {
      localStorage.setItem(
        key,
        JSON.stringify({
          firstSeenAt: nowTs,
          lastSeenAt: nowTs,
          d1Tracked: false,
          d7Tracked: false,
        })
      );
      return;
    }

    const state = JSON.parse(raw) as {
      firstSeenAt: number;
      lastSeenAt: number;
      d1Tracked: boolean;
      d7Tracked: boolean;
    };

    const sinceFirst = nowTs - state.firstSeenAt;
    if (!state.d1Tracked && sinceFirst >= 24 * 60 * 60 * 1000) {
      state.d1Tracked = true;
      await trackEvent("d1_return", { user_id: userId });
    }
    if (!state.d7Tracked && sinceFirst >= 7 * 24 * 60 * 60 * 1000) {
      state.d7Tracked = true;
      await trackEvent("d7_return", { user_id: userId });
    }

    state.lastSeenAt = nowTs;
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // Fail open.
  }
}
