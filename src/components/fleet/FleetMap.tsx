import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import { supabase } from "@/integrations/supabase/client";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

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

interface Vehicle {
  id: string;
  name: string;
  status: string;
  speed: number;
  lat: number | null;
  lon: number | null;
}

export function FleetMap() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        // 1. Get List of Devices
        const { data: listData, error: listError } = await supabase.functions.invoke('gps-data', {
          body: { action: 'querymonitorlist' }
        });

        if (listError || !listData?.data?.groups) throw new Error("Failed to fetch vehicle list");

        // Flatten groups to get all devices
        const allDevices = listData.data.groups.flatMap((g: any) => g.devices);

        // 2. Get Live Position Data for all devices
        const { data: posData, error: posError } = await supabase.functions.invoke('gps-data', {
          body: { action: 'lastposition', body_payload: { deviceids: [] } }
        });

        if (posError) throw new Error("Failed to fetch positions");

        // Merge static info with live position data
        const mergedData: Vehicle[] = allDevices.map((dev: any) => {
          const liveInfo = posData?.data?.records?.find((r: any) => r.deviceid === dev.deviceid);
          return {
            id: dev.deviceid,
            name: dev.devicename,
            status: liveInfo?.speed > 0 ? "active" : "inactive",
            speed: liveInfo?.speed || 0,
            lat: liveInfo?.lat || null,
            lon: liveInfo?.lon || null,
          };
        });

        setVehicles(mergedData);
      } catch (err) {
        console.error("FleetMap load error:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 flex items-center justify-center h-[400px]">
        <p className="text-muted-foreground">Loading Map...</p>
      </div>
    );
  }

  // Filter vehicles with valid coordinates
  const vehiclesWithLocation = vehicles.filter(v => v.lat !== null && v.lon !== null);

  // Calculate center: use first vehicle with location, or default to [0, 0]
  const center: [number, number] = vehiclesWithLocation.length > 0
    ? [vehiclesWithLocation[0].lat!, vehiclesWithLocation[0].lon!]
    : [0, 0];

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
                  <p>Status: {v.status}</p>
                  <p>Speed: {v.speed} km/h</p>
                </div>
              </Popup>
            </Marker>
          ))}
        </MarkerClusterGroup>
      </MapContainer>
    </div>
  );
}
