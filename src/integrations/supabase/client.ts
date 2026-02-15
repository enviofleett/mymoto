// src/integrations/supabase/client.ts
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { isIssuerMismatch, parseJwtPayload } from './jwt';

const IS_TEST = import.meta.env.MODE === "test";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || (IS_TEST ? "http://localhost:54321" : "");
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  (IS_TEST ? "test-anon-key" : "");

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Missing Supabase environment variables: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY'
  );
}

function getSupabaseRef(url: string) {
  try {
    const host = new URL(url).hostname;
    return host.split(".")[0] || "unknown";
  } catch {
    return "unknown";
  }
}

function getLocalStorageSafe(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function createMemoryStorage(): Storage {
  // Minimal in-memory Storage implementation for SSR/tests.
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

const STORAGE = getLocalStorageSafe() ?? createMemoryStorage();

const SUPABASE_REF = getSupabaseRef(SUPABASE_URL);
const LEGACY_AUTH_STORAGE_KEY = "mymoto-auth-v1";
const AUTH_STORAGE_KEY = `mymoto-auth-v1:${SUPABASE_REF}`;
const LEGACY_AUTH_NOTICE_KEY = "mymoto-auth-notice";
const AUTH_NOTICE_KEY = `mymoto-auth-notice:${SUPABASE_REF}`;

// One-time migration: prevent cross-environment session collisions on the same origin.
// Only migrate if the new key is empty to avoid overwriting an active session.
(() => {
  const ls = getLocalStorageSafe();
  if (!ls) return;
  try {
    const legacy = ls.getItem(LEGACY_AUTH_STORAGE_KEY);
    const existing = ls.getItem(AUTH_STORAGE_KEY);
    if (legacy && !existing) {
      ls.setItem(AUTH_STORAGE_KEY, legacy);
      ls.removeItem(LEGACY_AUTH_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
})();

function writeAuthNotice(reason: 'issuer_mismatch' | 'malformed' | 'invalid_jwt') {
  try {
    STORAGE.setItem(
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
    storage: STORAGE,
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
      try {
        STORAGE.removeItem(AUTH_STORAGE_KEY);
        STORAGE.removeItem(LEGACY_AUTH_STORAGE_KEY);
      } catch {
        // ignore
      }
      return;
    }
    if (isIssuerMismatch(payload.iss as any, SUPABASE_URL)) {
      writeAuthNotice('issuer_mismatch');
      await supabase.auth.signOut();
      try {
        STORAGE.removeItem(AUTH_STORAGE_KEY);
        STORAGE.removeItem(LEGACY_AUTH_STORAGE_KEY);
      } catch {
        // ignore
      }
      return;
    }
  }

  if (session && !session.refresh_token) {
    writeAuthNotice('invalid_jwt');
    await supabase.auth.signOut();
    try {
      STORAGE.removeItem(AUTH_STORAGE_KEY);
      STORAGE.removeItem(LEGACY_AUTH_STORAGE_KEY);
    } catch {
      // ignore
    }
    return;
  }
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      try {
        STORAGE.removeItem(AUTH_STORAGE_KEY);
        STORAGE.removeItem(LEGACY_AUTH_STORAGE_KEY);
      } catch {
        // ignore
      }
    }
  });
})();
