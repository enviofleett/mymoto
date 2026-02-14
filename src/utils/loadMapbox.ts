let mapboxPromise: Promise<any> | null = null;
let cssLoaded = false;

export async function loadMapbox() {
  if (!mapboxPromise) {
    mapboxPromise = import("mapbox-gl").then((m) => m.default || m);
  }
  if (!cssLoaded) {
    cssLoaded = true;
    // Don't block map initialization on CSS; start loading it in parallel.
    void import("mapbox-gl/dist/mapbox-gl.css");
  }
  return mapboxPromise;
}

// Optional: warm the chunk early (e.g., on route mount) to reduce perceived delay.
export function preloadMapbox() {
  void loadMapbox();
}
