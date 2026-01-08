import { useAddress } from "@/hooks/useAddress";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin } from "lucide-react";

interface LocationCellProps {
  lat: number | null;
  lon: number | null;
  className?: string;
}

export function LocationCell({ lat, lon, className = "" }: LocationCellProps) {
  const { address, isLoading } = useAddress(lat, lon);

  if (!lat || !lon || lat === 0 || lon === 0) {
    return <span className="text-muted-foreground text-xs">No location</span>;
  }

  if (isLoading) {
    return <Skeleton className="h-4 w-32" />;
  }

  return (
    <div className={`flex items-start gap-1.5 ${className}`}>
      <MapPin className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
      <span className="text-xs line-clamp-2">{address || `${lat.toFixed(4)}, ${lon.toFixed(4)}`}</span>
    </div>
  );
}
