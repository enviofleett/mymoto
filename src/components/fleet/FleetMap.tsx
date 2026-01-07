import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { FleetVehicle } from "@/hooks/useFleetData";

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

export function FleetMap({ vehicles, loading }: FleetMapProps) {
  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 flex items-center justify-center h-[400px]">
        <p className="text-muted-foreground">Loading Map...</p>
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

  const getStatusLabel = (status: FleetVehicle['status']) => {
    switch (status) {
      case 'moving': return 'Moving';
      case 'stopped': return 'Stopped';
      case 'offline': return 'Offline';
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
        <MarkerClusterGroup
          chunkedLoading
          spiderfyOnMaxZoom
          showCoverageOnHover={false}
        >
          {vehiclesWithLocation.map((v) => (
            <Marker key={v.id} position={[v.lat!, v.lon!]}>
              <Popup>
                <div className="text-sm">
                  <p className="font-semibold">{v.name}</p>
                  <p>Status: {getStatusLabel(v.status)}</p>
                  <p>Speed: {v.speed} km/h</p>
                  {v.driver && (
                    <p className="mt-1 pt-1 border-t">Driver: {v.driver.name}</p>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}
        </MarkerClusterGroup>
      </MapContainer>
    </div>
  );
}
