import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useFleetData, FleetVehicle } from "@/hooks/useFleetData";
import { useRealtimeFleetUpdates } from "@/hooks/useRealtimeVehicleUpdates";
import { Crosshair, Layers } from "lucide-react";
import { VehiclePopupContent } from "@/components/fleet/VehiclePopupContent";

// Fix for default Leaflet marker icons in React
import icon from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";

const DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

// Auto-fit bounds component
function MapBoundsHandler({ vehicles, recenter }: { vehicles: FleetVehicle[]; recenter: number }) {
  const map = useMap();

  useEffect(() => {
    if (vehicles.length > 0) {
      const bounds = L.latLngBounds(vehicles.map((v) => [v.lat!, v.lon!]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    }
  }, [vehicles, map, recenter]);

  return null;
}

const LiveMap = () => {
  const { vehicles, loading, connectionStatus } = useFleetData();
  const [mapLayer, setMapLayer] = useState<"street" | "satellite">("street");
  const [recenterTrigger, setRecenterTrigger] = useState(0);

  // Enable real-time updates for all fleet vehicles
  const deviceIds = vehicles.map((v) => v.id).filter(Boolean) as string[];
  useRealtimeFleetUpdates(deviceIds);

  // Filter vehicles with valid coordinates
  const vehiclesWithLocation = vehicles.filter(
    (v) => v.lat !== null && v.lon !== null && v.lat !== 0 && v.lon !== 0
  );

  // Calculate center
  const center: [number, number] =
    vehiclesWithLocation.length > 0
      ? [vehiclesWithLocation[0].lat!, vehiclesWithLocation[0].lon!]
      : [9.0820, 8.6753]; // Default to Nigeria center

  const handleRecenter = () => {
    setRecenterTrigger((prev) => prev + 1);
  };

  const toggleLayer = () => {
    setMapLayer((prev) => (prev === "street" ? "satellite" : "street"));
  };

  const tileUrl =
    mapLayer === "street"
      ? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

  const tileAttribution =
    mapLayer === "street"
      ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      : '&copy; <a href="https://www.esri.com">Esri</a>';

  if (loading) {
    return (
      <DashboardLayout connectionStatus={connectionStatus}>
        <div className="h-[calc(100vh-8rem)] md:h-[calc(100vh-5rem)]">
          <Skeleton className="h-full w-full rounded-lg" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout connectionStatus={connectionStatus}>
      <div className="relative h-[calc(100vh-10rem)] md:h-[calc(100vh-7rem)] -mx-6 -my-6">
        {/* Stats Bar */}
        <div className="absolute top-4 left-4 right-4 z-[1000] flex flex-wrap gap-2">
          <Badge variant="secondary" className="bg-background/90 backdrop-blur">
            {vehiclesWithLocation.length} vehicles on map
          </Badge>
          <Badge variant="default" className="bg-green-600/90">
            {vehicles.filter((v) => v.status === "moving").length} moving
          </Badge>
          <Badge variant="secondary" className="bg-background/90 backdrop-blur">
            {vehicles.filter((v) => v.status === "stopped").length} stopped
          </Badge>
        </div>

        {/* Floating Action Buttons */}
        <div className="absolute bottom-24 md:bottom-8 right-4 z-[1000] flex flex-col gap-2">
          <Button
            size="icon"
            variant="secondary"
            className="h-12 w-12 rounded-full shadow-lg bg-background/90 backdrop-blur"
            onClick={handleRecenter}
            title="Recenter Fleet"
          >
            <Crosshair className="h-5 w-5" />
          </Button>
          <Button
            size="icon"
            variant="secondary"
            className="h-12 w-12 rounded-full shadow-lg bg-background/90 backdrop-blur"
            onClick={toggleLayer}
            title="Toggle Map Layer"
          >
            <Layers className="h-5 w-5" />
          </Button>
        </div>

        {/* Map */}
        <MapContainer
          center={center}
          zoom={vehiclesWithLocation.length > 0 ? 10 : 6}
          scrollWheelZoom={true}
          style={{ height: "100%", width: "100%" }}
          className="z-0"
        >
          <TileLayer attribution={tileAttribution} url={tileUrl} />
          <MapBoundsHandler vehicles={vehiclesWithLocation} recenter={recenterTrigger} />
          <MarkerClusterGroup chunkedLoading spiderfyOnMaxZoom showCoverageOnHover={false}>
            {vehiclesWithLocation.map((v) => (
              <Marker key={v.id} position={[v.lat!, v.lon!]}>
                <Popup>
                  <VehiclePopupContent vehicle={v} />
                </Popup>
              </Marker>
            ))}
          </MarkerClusterGroup>
        </MapContainer>
      </div>
    </DashboardLayout>
  );
};

export default LiveMap;
