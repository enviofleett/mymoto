import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerSW } from 'virtual:pwa-register';
import { initViewportInsets } from "@/hooks/useViewportInsets";

// App version for cache busting
const APP_VERSION = '1.3.1';

declare global {
  interface Window {
    __PWA_UPDATE_AVAILABLE__?: boolean;
    __PWA_APPLY_UPDATE__?: (() => void) | null;
  }
}

// Persist version for diagnostics, but do not force-reload mid-session.
try {
  const storedVersion = localStorage.getItem('mymoto-app-version');
  if (!storedVersion) localStorage.setItem('mymoto-app-version', APP_VERSION);
} catch {
  // ignore
}

let applyUpdate: ((reloadPage?: boolean) => Promise<void>) | null = null;

// Register service worker with user-friendly update flow.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    // Signal the app shell to prompt the user. Do not clear caches and do not reload immediately.
    window.__PWA_UPDATE_AVAILABLE__ = true;
    window.__PWA_APPLY_UPDATE__ = () => {
      try {
        localStorage.setItem('mymoto-app-version', APP_VERSION);
      } catch {
        // ignore
      }
      void applyUpdate?.(true);
    };
    window.dispatchEvent(new CustomEvent("pwa:update-available", { detail: { version: APP_VERSION } }));
  },
  onOfflineReady() {
    if (import.meta.env.DEV) {
      console.log('[PWA] App ready to work offline');
    }
  },
  onRegisteredSW(swUrl, r) {
    if (import.meta.env.DEV) {
      console.log('[PWA] Service Worker registered:', swUrl, 'Version:', APP_VERSION);
    }
    if (!r) return;
    const doUpdateCheck = () => {
      void r.update();
    };

    // Check on focus/visibility changes (feels immediate without spamming).
    window.addEventListener("focus", doUpdateCheck);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") doUpdateCheck();
    });

    // Periodic background checks (30 minutes).
    setInterval(doUpdateCheck, 30 * 60 * 1000);
  },
  onRegisterError(error) {
    console.error('[PWA] Service Worker registration error:', error);
  },
});

applyUpdate = updateSW;

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

try {
  // Initialize viewport/keyboard CSS vars for stable mobile PWA layout behavior.
  initViewportInsets();
  createRoot(rootElement).render(<App />);
} catch (error) {
  console.error("Failed to render app:", error);
  rootElement.innerHTML = `
    <div style="padding: 20px; font-family: sans-serif;">
      <h1>Error Loading App</h1>
      <p>${error instanceof Error ? error.message : String(error)}</p>
      <pre>${error instanceof Error ? error.stack : ''}</pre>
    </div>
  `;
}
