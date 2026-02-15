import { supabase } from "@/integrations/supabase/client";
import { isIssuerMismatch, parseJwtPayload } from "@/integrations/supabase/jwt";

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || "https://cmvpnsqiefbsqkwnraka.supabase.co";
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtdnBuc3FpZWZic3Frd25yYWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MjIwMDEsImV4cCI6MjA4MzI5ODAwMX0.nJLb5znjUiGsCk_S2QubhBtqIl3DB3I8LbZihIMJdwo";

function getSupabaseRef(url: string) {
  try {
    const host = new URL(url).hostname;
    return host.split(".")[0] || "unknown";
  } catch {
    return "unknown";
  }
}

const AUTH_NOTICE_KEY = `mymoto-auth-notice:${getSupabaseRef(SUPABASE_URL)}`;
const SESSION_NOT_READY_MSG = "Session not ready. Please wait 2 seconds and retry.";

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
    // Session can be temporarily unavailable while auth rehydrates (PWA restore / cold start).
    // Do one short retry, but DO NOT refresh here: refresh failures can cascade into SIGNED_OUT.
    await new Promise((r) => setTimeout(r, 120));
    const retry = await supabase.auth.getSession();
    if (retry.error) throw retry.error;
    token = retry.data.session?.access_token;

    if (import.meta.env.DEV) {
      console.log("[edge] getAccessToken missing token; retry", {
        hadSession: !!data.session,
        retryHasSession: !!retry.data.session,
        hasToken: !!token,
      });
    }

    if (!token) {
      throw new Error(SESSION_NOT_READY_MSG);
    }
  }
  return token;
}

async function getValidatedAccessToken() {
  const token = await getAccessToken();
  const payload = parseJwtPayload(token);
  if (!payload) {
    writeAuthNotice("malformed");
    throw new Error(
      "Session appears corrupted or invalid. Please sign out and sign in again."
    );
  }
  if (isIssuerMismatch(payload.iss as any, SUPABASE_URL)) {
    writeAuthNotice("issuer_mismatch");
    throw new Error(
      "Session appears to be for a different environment. Please sign out and sign in again."
    );
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

  const doInvoke = async (t: string) => {
    return await supabase.functions.invoke(functionName, {
      body: body ?? {},
      headers: {
        // Important: passing custom headers can override Supabase defaults.
        // Always include apikey explicitly to satisfy the Functions gateway.
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${t}`,
        "Content-Type": "application/json",
      },
    });
  };

  const getInvokeStatus = (err: any): number | null => {
    if (!err) return null;
    if (typeof err.status === "number") return err.status;
    const ctxStatus = err.context?.status;
    return typeof ctxStatus === "number" ? ctxStatus : null;
  };

  // First attempt
  let { data, error } = await doInvoke(token);

  // One retry on expired token
  if (error) {
    const status = getInvokeStatus(error);
    const msg = extractErrorMessage(error);
    if (status === 401 && isExpiredJwtMessage(msg)) {
      const refreshed = await supabase.auth.refreshSession();
      const newToken = refreshed.data.session?.access_token;
      if (!refreshed.error && newToken) {
        const retry = await doInvoke(newToken);
        data = retry.data;
        error = retry.error;
      }
    }
  }

  if (error) {
    const status = getInvokeStatus(error);
    const msg = extractErrorMessage(error);

    if (import.meta.env.DEV) {
      console.log("[edge] invoke error", {
        functionName,
        status,
        message: msg,
        error_status: (error as any)?.status ?? null,
        context_status: (error as any)?.context?.status ?? null,
        context_body: (error as any)?.context?.body ?? null,
        raw: error,
      });
    }

    if (msg === SESSION_NOT_READY_MSG) {
      throw new Error(SESSION_NOT_READY_MSG);
    }

    if (status === 401 && isInvalidJwtMessage(msg)) {
      writeAuthNotice("invalid_jwt");
      throw new Error(
        `Unauthorized: ${msg}. If you recently switched environments, sign out and sign in again.`
      );
    }

    throw new Error(`Edge function ${functionName} failed (${status ?? "unknown"}): ${msg}`);
  }

  return data as TResponse;
}
