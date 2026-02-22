import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type SubscriptionRow = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const pad = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function subscriptionToRow(sub: PushSubscription): SubscriptionRow {
  const json = sub.toJSON() as any;
  const endpoint = json?.endpoint;
  const p256dh = json?.keys?.p256dh;
  const auth = json?.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    throw new Error("Invalid PushSubscription payload (missing endpoint/keys)");
  }
  return { endpoint, keys: { p256dh, auth } };
}

export function usePushSubscription() {
  const { user } = useAuth();

  const isSupported = useMemo(() => {
    return (
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window
    );
  }, []);

  const isDevMock = useMemo(() => {
    const key = import.meta.env.VITE_VAPID_PUBLIC_KEY;
    return import.meta.env.DEV && (!key || key.trim() === "");
  }, []);

  const [isSubscribed, setIsSubscribed] = useState<boolean>(() => {
    if (typeof window !== "undefined" && isDevMock) {
      try {
        const stored = window.localStorage.getItem("dev_mock_push_subscribed");
        return stored === "1";
      } catch {
        return false;
      }
    }
    return false;
  });
  const [isChecking, setIsChecking] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async () => {
    if (import.meta.env.DEV) {
      console.log("[push] Checking subscription status...");
    }
    setError(null);
    if (!isSupported) {
      if (import.meta.env.DEV) {
        console.warn("[push] Push not supported in this environment");
      }
      setIsSubscribed(false);
      setIsChecking(false);
      return;
    }

    if (isDevMock) {
      if (import.meta.env.DEV) {
        console.log("[push] Dev mock mode active; skipping real push subscription check");
      }
      setIsChecking(false);
      return;
    }

    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      setIsSubscribed(!!existing);
      if (import.meta.env.DEV) {
        console.log("[push] Existing subscription found:", !!existing);
      }
    } catch (e: any) {
      console.error("[push] Failed to check subscription:", e);
      setError(e instanceof Error ? e.message : String(e));
      setIsSubscribed(false);
    } finally {
      setIsChecking(false);
    }
  }, [isSupported, isDevMock]);

  useEffect(() => {
    void check();
  }, [check]);

  const ensureSubscribed = useCallback(async () => {
    setError(null);
    if (!isSupported) {
      const message = "Push notifications are not supported in this browser";
      console.warn("[push] " + message);
      setError(message);
      throw new Error(message);
    }
    if (!user?.id) {
      const message = "You must be signed in to enable push notifications";
      console.warn("[push] " + message);
      setError(message);
      throw new Error(message);
    }
    if (Notification.permission !== "granted") {
      const message = "Notification permission is not granted";
      console.warn("[push] " + message);
      setError(message);
      throw new Error(message);
    }

    const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
    if (isDevMock && !publicKey) {
      const message = "Missing VITE_VAPID_PUBLIC_KEY (dev mock mode)";
      console.warn("[push] " + message);
      setError(null);
      setIsSubscribed(true);
      try {
        if (typeof window !== "undefined") {
          window.localStorage.setItem("dev_mock_push_subscribed", "1");
        }
      } catch {
      }
      if (import.meta.env.DEV) {
        console.log("[push] Dev mock subscription enabled");
      }
      return;
    }

    if (!publicKey) {
      const message = "Missing VITE_VAPID_PUBLIC_KEY";
      console.error("[push] " + message);
      setError(message);
      throw new Error(message);
    }

    try {
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        if (import.meta.env.DEV) {
          console.log("[push] No existing subscription, creating a new one");
        }
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToUint8Array(publicKey) as any,
        });
      }

      const row = subscriptionToRow(sub);

      const { error: dbError } = await (supabase as any).from("user_push_subscriptions").upsert(
        {
          user_id: user.id,
          endpoint: row.endpoint,
          p256dh: row.keys.p256dh,
          auth: row.keys.auth,
          user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
          platform: typeof navigator !== "undefined" ? (navigator as any).platform ?? null : null,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "user_id,endpoint" }
      );

      if (dbError) {
        console.error("[push] Failed to upsert push subscription:", dbError);
        const message = dbError.message || "Failed to save push subscription";
        setError(message);
        setIsSubscribed(false);
        throw new Error(message);
      }

      setIsSubscribed(true);
      if (import.meta.env.DEV) {
        console.log("[push] Subscription stored successfully");
      }
    } catch (e: any) {
      console.error("[push] Failed to ensure push subscription:", e);
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      setIsSubscribed(false);
      throw e;
    }
  }, [isSupported, user?.id, isDevMock]);

  const unsubscribe = useCallback(async () => {
    setError(null);
    if (!isSupported) return;
    if (!user?.id) return;

    const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
    if (isDevMock && !publicKey) {
      setIsSubscribed(false);
      setError(null);
      try {
        if (typeof window !== "undefined") {
          window.localStorage.removeItem("dev_mock_push_subscribed");
        }
      } catch {
      }
      if (import.meta.env.DEV) {
        console.log("[push] Dev mock push subscription removed");
      }
      return;
    }

    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const row = subscriptionToRow(sub);
        await sub.unsubscribe();
        const { error: dbError } = await (supabase as any)
          .from("user_push_subscriptions")
          .delete()
          .eq("user_id", user.id)
          .eq("endpoint", row.endpoint);
        if (dbError) {
          console.error("[push] Failed to delete push subscription:", dbError);
          setError(dbError.message || "Failed to delete push subscription");
        }
      }

      setIsSubscribed(false);
      if (import.meta.env.DEV) {
        console.log("[push] Push subscription removed");
      }
    } catch (e: any) {
      console.error("[push] Failed to unsubscribe from push:", e);
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      throw e;
    }
  }, [isSupported, user?.id, isDevMock]);

  return {
    isSupported,
    isDevMock,
    isSubscribed,
    isChecking,
    error,
    check,
    ensureSubscribed,
    unsubscribe,
  };
}
