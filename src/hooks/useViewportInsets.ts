// Boot-time helper to keep PWA layouts stable on mobile:
// - --app-height: usable viewport height (accounts for dynamic browser chrome)
// - --keyboard-inset: bottom occlusion when the on-screen keyboard is open
//
// Uses visualViewport when available (best signal inside PWAs/webviews).

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function initViewportInsets() {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const root = document.documentElement;

  let raf = 0;
  const update = () => {
    raf = 0;
    const vv = window.visualViewport;

    const innerH = window.innerHeight || 0;
    const vvH = vv?.height ?? innerH;
    const vvOffsetTop = vv?.offsetTop ?? 0;

    // Usable height is the visual viewport height when available.
    const appHeightPx = Math.max(0, vvH);

    // Keyboard inset is the part of the layout viewport that is occluded from the bottom.
    // Use layout viewport (innerHeight) vs visual viewport (vv.height + offsetTop) delta.
    // Clamp aggressively to avoid flicker/noise during scroll.
    const rawInset = vv ? innerH - (vvH + vvOffsetTop) : 0;
    const keyboardInsetPx = clamp(Math.max(0, rawInset), 0, innerH * 0.8);

    root.style.setProperty("--app-height", `${appHeightPx}px`);
    root.style.setProperty("--keyboard-inset", `${keyboardInsetPx}px`);
  };

  const schedule = () => {
    if (raf) return;
    raf = window.requestAnimationFrame(update);
  };

  // Initial.
  update();

  // Keep updated.
  window.addEventListener("resize", schedule, { passive: true });
  window.addEventListener("orientationchange", schedule, { passive: true });

  const vv = window.visualViewport;
  vv?.addEventListener("resize", schedule, { passive: true } as any);
  vv?.addEventListener("scroll", schedule, { passive: true } as any);
}

