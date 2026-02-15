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

  const [isSubscribed, setIsSubscribed] = useState<boolean>(false);
  const [isChecking, setIsChecking] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async () => {
    setError(null);
    if (!isSupported) {
      setIsSubscribed(false);
      setIsChecking(false);
      return;
    }

    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      setIsSubscribed(!!existing);
    } catch (e: any) {
      setError(e instanceof Error ? e.message : String(e));
      setIsSubscribed(false);
    } finally {
      setIsChecking(false);
    }
  }, [isSupported]);

  useEffect(() => {
    void check();
  }, [check]);

  const ensureSubscribed = useCallback(async () => {
    setError(null);
    if (!isSupported) throw new Error("Push notifications are not supported in this browser");
    if (!user?.id) throw new Error("You must be signed in to enable push notifications");
    if (Notification.permission !== "granted") throw new Error("Notification permission is not granted");

    const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
    if (!publicKey) throw new Error("Missing VITE_VAPID_PUBLIC_KEY");

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(publicKey),
      });
    }

    const row = subscriptionToRow(sub);

    await supabase.from("user_push_subscriptions").upsert(
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

    setIsSubscribed(true);
  }, [isSupported, user?.id]);

  const unsubscribe = useCallback(async () => {
    setError(null);
    if (!isSupported) return;
    if (!user?.id) return;

    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const row = subscriptionToRow(sub);
      await sub.unsubscribe();
      await supabase
        .from("user_push_subscriptions")
        .delete()
        .eq("user_id", user.id)
        .eq("endpoint", row.endpoint);
    }

    setIsSubscribed(false);
  }, [isSupported, user?.id]);

  return {
    isSupported,
    isSubscribed,
    isChecking,
    error,
    check,
    ensureSubscribed,
    unsubscribe,
  };
}

