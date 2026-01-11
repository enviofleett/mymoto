import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerSW } from 'virtual:pwa-register';

// Register service worker with auto-update
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    console.log('[PWA] New version available, updating...');
    updateSW(true); // Auto-update without prompt
  },
  onOfflineReady() {
    console.log('[PWA] App ready to work offline');
  },
  onRegisteredSW(swUrl, r) {
    console.log('[PWA] Service Worker registered:', swUrl);
    // Check for updates every 60 seconds
    if (r) {
      setInterval(() => {
        r.update();
      }, 60000);
    }
  },
  onRegisterError(error) {
    console.error('[PWA] Service Worker registration error:', error);
  },
});

createRoot(document.getElementById("root")!).render(<App />);
