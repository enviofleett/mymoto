import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  MapPin,
  Home,
  Briefcase,
  ParkingCircle,
  Loader2,
  Clock,
  TrendingUp
} from "lucide-react";

interface LearnedLocationsProps {
  deviceId: string;
}

interface LearnedLocation {
  id: string;
  location_name: string | null;
  location_type: string;
  latitude: number;
  longitude: number;
  visit_count: number;
}

const LOCATION_TYPE_ICONS: Record<string, any> = {
  home: Home,
  work: Briefcase,
  parking: ParkingCircle,
  frequent: MapPin,
  unknown: MapPin
};

const LOCATION_TYPE_COLORS: Record<string, string> = {
  home: 'bg-blue-100 text-blue-800 border-blue-200',
  work: 'bg-purple-100 text-purple-800 border-purple-200',
  parking: 'bg-gray-100 text-gray-800 border-gray-200',
  frequent: 'bg-green-100 text-green-800 border-green-200',
  unknown: 'bg-slate-100 text-slate-800 border-slate-200'
};

export function LearnedLocations({ deviceId }: LearnedLocationsProps) {
  const [locations, setLocations] = useState<LearnedLocation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Learned locations table doesn't exist yet - show empty state
    setLoading(false);
    setLocations([]);
  }, [deviceId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading learned locations...
      </div>
    );
  }

  if (locations.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <MapPin className="h-12 w-12 mx-auto mb-3 opacity-40" />
        <p className="text-sm">No learned locations yet</p>
        <p className="text-xs mt-1">
          Locations will be learned automatically as the vehicle parks at the same places
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {locations.map((location) => {
        const Icon = LOCATION_TYPE_ICONS[location.location_type] || MapPin;
        const colorClass = LOCATION_TYPE_COLORS[location.location_type] || LOCATION_TYPE_COLORS.unknown;
        const displayName = location.location_name || `${location.location_type} Location`;

        return (
          <Card
            key={location.id}
            className={`p-4 border-l-4 ${colorClass}`}
          >
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-full ${colorClass} bg-opacity-20`}>
                <Icon className={`h-5 w-5`} />
              </div>

              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-sm leading-tight">
                  {displayName}
                </h4>

                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                  <TrendingUp className="h-3 w-3" />
                  <span>{location.visit_count} visits</span>
                </div>

                <div className="flex gap-2 mt-2">
                  <Badge variant="outline" className="text-xs capitalize">
                    {location.location_type}
                  </Badge>
                </div>

                <a
                  href={`https://www.google.com/maps?q=${location.latitude},${location.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline mt-2 inline-block"
                >
                  View on Google Maps →
                </a>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}