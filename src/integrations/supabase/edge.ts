import { supabase } from "@/integrations/supabase/client";
import { isIssuerMismatch, parseJwtPayload } from "@/integrations/supabase/jwt";

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || "https://cmvpnsqiefbsqkwnraka.supabase.co";
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtdnBuc3FpZWZic3Frd25yYWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MjIwMDEsImV4cCI6MjA4MzI5ODAwMX0.nJLb5znjUiGsCk_S2QubhBtqIl3DB3I8LbZihIMJdwo";

const AUTH_NOTICE_KEY = "mymoto-auth-notice";

// Helper to safely sign out without throwing errors (e.g. ERR_ABORTED if navigating)
async function safeSignOut() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error && !error.message.includes("session_not_found")) {
      console.warn("Auto-signout warning:", error);
    }
  } catch (err) {
    // Ignore errors like ERR_ABORTED or network failures during sign out
    console.warn("Auto-signout failed:", err);
  }
}

function writeAuthNotice(reason: "issuer_mismatch" | "malformed" | "invalid_jwt") {
  try {
    localStorage.setItem(
      AUTH_NOTICE_KEY,
      JSON.stringify({ type: "session_invalid", reason, ts: Date.now() })
    );
  } catch {
    // ignore
  }
}

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  let token = data.session?.access_token;
  
  if (!token) {
    // Attempt refresh if token is missing but we might have a refresh token
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
    if (!refreshError && refreshData.session?.access_token) {
      token = refreshData.session.access_token;
    } else {
      throw new Error("Unauthorized: please sign in again and retry.");
    }
  }
  return token;
}

async function getValidatedAccessToken() {
  const token = await getAccessToken();
  const payload = parseJwtPayload(token);
  if (!payload) {
    writeAuthNotice("malformed");
    await safeSignOut();
    throw new Error("Session invalid for this environment. Please sign in again.");
  }
  if (isIssuerMismatch(payload.iss as any, SUPABASE_URL)) {
    writeAuthNotice("issuer_mismatch");
    await safeSignOut();
    throw new Error("Session invalid for this environment. Please sign in again.");
  }

  // If token is expired (or about to), attempt a refresh before calling Edge.
  const exp = typeof (payload as any).exp === "number" ? (payload as any).exp : null;
  if (exp) {
    const nowSec = Math.floor(Date.now() / 1000);
    // Refresh if expiring within the next 60 seconds to avoid gateway rejections.
    if (exp <= nowSec + 60) {
      const { data, error } = await supabase.auth.refreshSession();
      if (!error && data.session?.access_token) {
        return data.session.access_token;
      }
      // If refresh failed, continue with current token; the gateway handler below may sign out.
    }
  }
  return token;
}

function extractErrorMessage(payload: unknown) {
  if (typeof payload === "string") return payload;
  const p = payload as any;
  return p?.message || p?.error || JSON.stringify(payload);
}

function isExpiredJwtMessage(msg: string) {
  const m = msg.toLowerCase();
  return m.includes("jwt expired") || m.includes("token is expired") || m.includes("expired");
}

function isInvalidJwtMessage(msg: string) {
  const m = msg.toLowerCase();
  return (
    m.includes("invalid jwt") ||
    m.includes("jwt is invalid") ||
    m.includes("unauthorized: invalid token") ||
    m.includes("unauthorized: no authorization header") ||
    m.includes("session invalid")
  );
}

export async function invokeEdgeFunction<TResponse>(
  functionName: string,
  body: unknown,
  opts?: { accessToken?: string }
): Promise<TResponse> {
  const token = opts?.accessToken ?? (await getValidatedAccessToken());

  const doFetch = async (t: string) =>
    fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${t}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body ?? {}),
    });

  const readPayload = async (res: Response) => {
    const contentType = res.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");
    return isJson ? await res.json().catch(() => null) : await res.text().catch(() => "");
  };

  // First attempt
  let res = await doFetch(token);
  let payload = await readPayload(res);

  // One retry on expired token
  if (res.status === 401) {
    const msg = extractErrorMessage(payload);
    if (isExpiredJwtMessage(msg)) {
      const { data, error } = await supabase.auth.refreshSession();
      if (!error && data.session?.access_token) {
        res = await doFetch(data.session.access_token);
        payload = await readPayload(res);
      }
    }
  }

  if (!res.ok) {
    const msg = extractErrorMessage(payload);
    if (res.status === 401 && isInvalidJwtMessage(msg)) {
      // Try one refresh+retry. This covers cases where the JWT secret rotated or the access token
      // got corrupted while the refresh token remains valid.
      const { data, error } = await supabase.auth.refreshSession();
      if (!error && data.session?.access_token) {
        const retryRes = await doFetch(data.session.access_token);
        const retryPayload = await readPayload(retryRes);
        if (retryRes.ok) {
          return retryPayload as TResponse;
        }
      }

      writeAuthNotice("invalid_jwt");
      await safeSignOut();
      throw new Error("Session invalid; please sign in again.");
    }
    throw new Error(`Edge function ${functionName} failed (${res.status}): ${msg}`);
  }

  return payload as TResponse;
}
