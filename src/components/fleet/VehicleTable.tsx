import { useEffect, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

export function VehicleTable() {
  const [vehicles, setVehicles] = useState<any[]>([]);
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
        // Passing empty deviceids array gets ALL positions per PDF Page 12
        const { data: posData, error: posError } = await supabase.functions.invoke('gps-data', {
          body: { action: 'lastposition', body_payload: { deviceids: [] } }
        });

        if (posError) throw new Error("Failed to fetch positions");

        // Merge static info (name) with live info (speed, lat, lon)
        const mergedData = allDevices.map((dev: any) => {
          const liveInfo = posData?.data?.records?.find((r: any) => r.deviceid === dev.deviceid);
          return {
            id: dev.deviceid,
            name: dev.devicename,
            plate: dev.carplate || "N/A", // Adjust key based on exact API response
            status: liveInfo?.speed > 0 ? "active" : "inactive",
            fuel: liveInfo?.fuel || 0, // Adjust key
            location: liveInfo ? `${liveInfo.lat}, ${liveInfo.lon}` : "Unknown",
            speed: liveInfo?.speed || 0
          };
        });

        setVehicles(mergedData);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) return <div>Loading Live Fleet Data...</div>;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Vehicle Name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Speed (km/h)</TableHead>
            <TableHead>Location</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {vehicles.map((v) => (
            <TableRow key={v.id}>
              <TableCell>{v.name}</TableCell>
              <TableCell>
                <Badge variant={v.status === 'active' ? 'default' : 'secondary'}>{v.status}</Badge>
              </TableCell>
              <TableCell>{v.speed}</TableCell>
              <TableCell>{v.location}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
