import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerSW } from 'virtual:pwa-register';

// App version for cache busting
const APP_VERSION = '1.3.0';

// Force update check for existing PWA users
const checkAndForceUpdate = async () => {
  const storedVersion = localStorage.getItem('mymoto-app-version');
  
  if (storedVersion && storedVersion !== APP_VERSION) {
    if (import.meta.env.DEV) {
      console.log('[PWA] Version mismatch detected:', storedVersion, '->', APP_VERSION);
    }
    
    // Clear all caches
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      if (import.meta.env.DEV) {
        console.log('[PWA] Clearing caches:', cacheNames);
      }
      await Promise.all(cacheNames.map(name => caches.delete(name)));
    }
    
    // Update stored version
    localStorage.setItem('mymoto-app-version', APP_VERSION);
    
    // Force reload to get fresh assets
    if (import.meta.env.DEV) {
      console.log('[PWA] Forcing reload for new version...');
    }
    window.location.reload();
    return;
  }
  
  // Set version if not set
  if (!storedVersion) {
    localStorage.setItem('mymoto-app-version', APP_VERSION);
  }
};

// Run version check immediately (don't block rendering)
checkAndForceUpdate().catch(console.error);

// Register service worker with aggressive auto-update
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    if (import.meta.env.DEV) {
      console.log('[PWA] New version available, force updating...');
    }
    
    // Clear all caches before update
    if ('caches' in window) {
      caches.keys().then(names => {
        if (import.meta.env.DEV) {
          console.log('[PWA] Clearing caches before update:', names);
        }
        Promise.all(names.map(name => caches.delete(name))).then(() => {
          localStorage.setItem('mymoto-app-version', APP_VERSION);
          updateSW(true);
        });
      });
    } else {
      updateSW(true);
    }
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
    // Check for updates every 30 seconds for faster propagation
    if (r) {
      setInterval(() => {
        if (import.meta.env.DEV) {
          console.log('[PWA] Checking for updates...');
        }
        r.update();
      }, 30000);
    }
  },
  onRegisterError(error) {
    console.error('[PWA] Service Worker registration error:', error);
  },
});

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

try {
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
