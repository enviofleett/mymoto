import { useEffect, useState } from "react";
import { toast } from "sonner";

declare global {
  interface Window {
    __PWA_UPDATE_AVAILABLE__?: boolean;
    __PWA_APPLY_UPDATE__?: (() => void) | null;
  }
}

export function usePwaUpdatePrompt() {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const show = (version?: string) => {
      if (shown) return;
      setShown(true);
      toast("Update available", {
        description: version ? `Version ${version} is ready.` : "A new version is ready.",
        duration: Infinity,
        action: {
          label: "Update",
          onClick: () => {
            window.__PWA_APPLY_UPDATE__?.();
          },
        },
      });
    };

    const onEvt = (e: Event) => {
      const ce = e as CustomEvent;
      show(ce?.detail?.version);
    };

    window.addEventListener("pwa:update-available", onEvt as any);
    if (window.__PWA_UPDATE_AVAILABLE__) {
      show();
    }
    return () => {
      window.removeEventListener("pwa:update-available", onEvt as any);
    };
  }, [shown]);
}

