let mapboxPromise: Promise<any> | null = null;
let cssLoaded = false;

export async function loadMapbox() {
  if (!mapboxPromise) {
    mapboxPromise = import("mapbox-gl").then((m) => m.default || m);
  }
  if (!cssLoaded) {
    cssLoaded = true;
    await import("mapbox-gl/dist/mapbox-gl.css");
  }
  return mapboxPromise;
}
