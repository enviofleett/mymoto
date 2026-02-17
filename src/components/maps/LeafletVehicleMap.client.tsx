import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Polyline, TileLayer, useMap } from "react-leaflet";
import { Circle } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const orangeDotIcon = L.divIcon({
  className: "leaflet-orange-dot-icon",
  html: '<div class="leaflet-orange-dot"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

type LatLon = { lat: number; lon: number };

function isValidCoord(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n !== 0;
}

function FitBounds({
  points,
  recenterKey,
}: {
  points: Array<[number, number]>;
  recenterKey?: string | number;
}) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], Math.max(map.getZoom(), 14), { animate: false });
      return;
    }
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 16, animate: false });
  }, [map, points, recenterKey]);

  return null;
}

export function LeafletVehicleMapClient({
  latitude,
  longitude,
  className,
  mapHeight = "h-64",
  interactive = true,
  routeCoords,
  routeStartEnd,
  geofences,
}: {
  latitude: number | null | undefined;
  longitude: number | null | undefined;
  className?: string;
  mapHeight?: string;
  interactive?: boolean;
  routeCoords?: LatLon[];
  routeStartEnd?: { start: LatLon; end: LatLon } | undefined;
  geofences?: Array<{ latitude: number; longitude: number; radius: number; name?: string }>;
}) {
  const hasValidCoordinates = isValidCoord(latitude) && isValidCoord(longitude);

  const routeLatLngs = useMemo(() => {
    const coords = (routeCoords || []).filter((p) => isValidCoord(p.lat) && isValidCoord(p.lon));
    return coords.map((p) => [p.lat, p.lon] as [number, number]);
  }, [routeCoords]);

  const pointsForBounds = useMemo(() => {
    const pts: Array<[number, number]> = [];
    if (hasValidCoordinates) pts.push([latitude as number, longitude as number]);
    for (const p of routeLatLngs) pts.push(p);
    if (routeStartEnd && isValidCoord(routeStartEnd.start.lat) && isValidCoord(routeStartEnd.start.lon)) {
      pts.push([routeStartEnd.start.lat, routeStartEnd.start.lon]);
    }
    if (routeStartEnd && isValidCoord(routeStartEnd.end.lat) && isValidCoord(routeStartEnd.end.lon)) {
      pts.push([routeStartEnd.end.lat, routeStartEnd.end.lon]);
    }
    return pts;
  }, [hasValidCoordinates, latitude, longitude, routeLatLngs, routeStartEnd]);

  const center: [number, number] = useMemo(() => {
    if (hasValidCoordinates) return [latitude as number, longitude as number];
    if (routeStartEnd && isValidCoord(routeStartEnd.start.lat) && isValidCoord(routeStartEnd.start.lon)) {
      return [routeStartEnd.start.lat, routeStartEnd.start.lon];
    }
    if (routeLatLngs.length > 0) return routeLatLngs[0];
    return [6.5244, 3.3792]; // Lagos default
  }, [hasValidCoordinates, latitude, longitude, routeStartEnd, routeLatLngs]);

  const tileUrl = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
  const tileAttribution =
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

  const zones = useMemo(() => {
    return (geofences || []).filter(
      (z) => isValidCoord(z.latitude) && isValidCoord(z.longitude) && typeof z.radius === "number" && z.radius > 0
    );
  }, [geofences]);

  return (
    <div className={className}>
      <style>{`
        .leaflet-orange-dot {
          width: 18px;
          height: 18px;
          border-radius: 9999px;
          background: #ea580c;
          box-shadow: 0 0 0 6px rgba(234, 88, 12, 0.3);
        }
      `}</style>
      <MapContainer
        center={center}
        zoom={15}
        scrollWheelZoom={interactive}
        dragging={interactive}
        doubleClickZoom={interactive}
        touchZoom={interactive}
        keyboard={interactive}
        zoomControl={interactive}
        attributionControl={false}
        style={{ height: "100%", width: "100%" }}
        className={mapHeight}
      >
        <TileLayer attribution={tileAttribution} url={tileUrl} />
        <FitBounds points={pointsForBounds} recenterKey={pointsForBounds.length} />

        {routeLatLngs.length > 1 ? (
          <Polyline positions={routeLatLngs} pathOptions={{ color: "#3b82f6", weight: 4, opacity: 0.7 }} />
        ) : null}

        {routeStartEnd ? (
          <>
            <Marker position={[routeStartEnd.start.lat, routeStartEnd.start.lon]} icon={orangeDotIcon} />
            <Marker position={[routeStartEnd.end.lat, routeStartEnd.end.lon]} icon={orangeDotIcon} />
          </>
        ) : null}

        {hasValidCoordinates ? (
          <Marker position={[latitude as number, longitude as number]} icon={orangeDotIcon} />
        ) : null}

        {zones.map((z, idx) => (
          <Circle
            key={`${z.name || "zone"}:${idx}`}
            center={[z.latitude, z.longitude]}
            radius={z.radius}
            pathOptions={{ color: "#10b981", weight: 2, opacity: 0.8, fillColor: "#10b981", fillOpacity: 0.15 }}
          />
        ))}
      </MapContainer>
    </div>
  );
}
