import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect } from "react";
import { FleetVehicle } from "@/hooks/useFleetData";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { User, Battery } from "lucide-react";

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

interface FleetMapProps {
  vehicles: FleetVehicle[];
  loading: boolean;
}

// Auto-fit bounds component
function MapBoundsHandler({ vehicles }: { vehicles: FleetVehicle[] }) {
  const map = useMap();
  
  useEffect(() => {
    if (vehicles.length > 0) {
      const bounds = L.latLngBounds(vehicles.map(v => [v.lat!, v.lon!]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    }
  }, [vehicles, map]);
  
  return null;
}

export function FleetMap({ vehicles, loading }: FleetMapProps) {
  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card overflow-hidden h-[400px]">
        <Skeleton className="h-full w-full" />
      </div>
    );
  }

  // Filter vehicles with valid coordinates (exclude offline/no GPS)
  const vehiclesWithLocation = vehicles.filter(
    (v) => v.lat !== null && v.lon !== null && v.lat !== 0 && v.lon !== 0
  );

  // Calculate center: use first vehicle with location, or default to [0, 0]
  const center: [number, number] =
    vehiclesWithLocation.length > 0
      ? [vehiclesWithLocation[0].lat!, vehiclesWithLocation[0].lon!]
      : [0, 0];

  const getStatusVariant = (status: FleetVehicle['status']) => {
    switch (status) {
      case 'moving': return 'default';
      case 'stopped': return 'secondary';
      case 'offline': return 'outline';
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden h-[400px]">
      <MapContainer
        center={center}
        zoom={vehiclesWithLocation.length > 0 ? 10 : 2}
        scrollWheelZoom={true}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapBoundsHandler vehicles={vehiclesWithLocation} />
        <MarkerClusterGroup
          chunkedLoading
          spiderfyOnMaxZoom
          showCoverageOnHover={false}
        >
          {vehiclesWithLocation.map((v) => (
            <Marker key={v.id} position={[v.lat!, v.lon!]}>
              <Popup>
                <div className="p-1 min-w-[160px]">
                  <div className="flex justify-between items-center mb-2 gap-2">
                    <h3 className="font-bold text-sm text-foreground">{v.name}</h3>
                    <Badge variant={getStatusVariant(v.status)} className="text-[10px] h-5">
                      {v.speed} km/h
                    </Badge>
                  </div>
                  {v.gpsOwner && (
                    <p className="text-xs text-muted-foreground mb-2">Owner: {v.gpsOwner}</p>
                  )}
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <User className="w-3 h-3" /> 
                      {v.driver?.name || 'Unassigned'}
                    </div>
                    <div className="flex items-center gap-1">
                      <Battery className="w-3 h-3" /> 
                      {v.battery !== null ? `${v.battery}%` : 'N/A'}
                    </div>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MarkerClusterGroup>
      </MapContainer>
    </div>
  );
}
