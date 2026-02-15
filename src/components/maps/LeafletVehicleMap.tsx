import { Suspense, lazy } from "react";

type LatLon = { lat: number; lon: number };

export type LeafletVehicleMapProps = {
  latitude: number | null | undefined;
  longitude: number | null | undefined;
  className?: string;
  mapHeight?: string;
  interactive?: boolean;
  routeCoords?: LatLon[];
  routeStartEnd?: { start: LatLon; end: LatLon } | undefined;
  geofences?: Array<{ latitude: number; longitude: number; radius: number; name?: string }>;
};

const LeafletVehicleMapClient = lazy(async () => {
  const m = await import("./LeafletVehicleMap.client");
  return { default: m.LeafletVehicleMapClient };
});

export function LeafletVehicleMap(props: LeafletVehicleMapProps) {
  // Vitest/node/SSR: don't even try to load Leaflet.
  if (typeof window === "undefined") {
    return (
      <div className={props.className}>
        <div className={props.mapHeight ?? "h-64"} />
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className={props.className}>
          <div className={props.mapHeight ?? "h-64"} />
        </div>
      }
    >
      <LeafletVehicleMapClient {...props} />
    </Suspense>
  );
}

