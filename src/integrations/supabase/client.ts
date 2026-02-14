// src/integrations/supabase/client.ts
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { isIssuerMismatch, parseJwtPayload } from './jwt';

// Hardcoded fallbacks ensure connection persistence even if .env isn't loaded correctly in some environments
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://cmvpnsqiefbsqkwnraka.supabase.co";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtdnBuc3FpZWZic3Frd25yYWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MjIwMDEsImV4cCI6MjA4MzI5ODAwMX0.nJLb5znjUiGsCk_S2QubhBtqIl3DB3I8LbZihIMJdwo";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Missing Supabase environment variables: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY'
  );
}

const AUTH_STORAGE_KEY = 'mymoto-auth-v1';
const AUTH_NOTICE_KEY = 'mymoto-auth-notice';

function writeAuthNotice(reason: 'issuer_mismatch' | 'malformed' | 'invalid_jwt') {
  try {
    localStorage.setItem(
      AUTH_NOTICE_KEY,
      JSON.stringify({
        type: 'session_invalid',
        reason,
        ts: Date.now(),
      })
    );
  } catch {
    // ignore
  }
}

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: localStorage,
    storageKey: AUTH_STORAGE_KEY,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
});

void (async () => {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (session?.access_token) {
    const payload = parseJwtPayload(session.access_token);
    if (!payload) {
      writeAuthNotice('malformed');
      await supabase.auth.signOut();
      localStorage.removeItem(AUTH_STORAGE_KEY);
      return;
    }
    if (isIssuerMismatch(payload.iss as any, SUPABASE_URL)) {
      writeAuthNotice('issuer_mismatch');
      await supabase.auth.signOut();
      localStorage.removeItem(AUTH_STORAGE_KEY);
      return;
    }
  }

  if (session && !session.refresh_token) {
    writeAuthNotice('invalid_jwt');
    await supabase.auth.signOut();
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return;
  }
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  });
})();
