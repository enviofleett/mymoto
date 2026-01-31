
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MapPin,
  Home,
  Briefcase,
  Shield,
  Circle,
  Trash2,
  Activity
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export interface Geofence {
  id: string;
  name: string;
  description: string | null;
  zone_type: string;
  center_latitude: number;
  center_longitude: number;
  radius_meters: number;
  is_active: boolean;
  created_at?: string;
}

interface GeofenceListProps {
  geofences: Geofence[];
  onDelete: (id: string) => void;
  loading?: boolean;
}

const ZONE_TYPE_ICONS: Record<string, any> = {
  home: Home,
  work: Briefcase,
  restricted: Shield,
  custom: MapPin
};

const ZONE_TYPE_STYLES: Record<string, { iconBg: string, iconColor: string }> = {
  home: { iconBg: 'bg-blue-100 dark:bg-blue-900/20', iconColor: 'text-blue-600 dark:text-blue-400' },
  work: { iconBg: 'bg-purple-100 dark:bg-purple-900/20', iconColor: 'text-purple-600 dark:text-purple-400' },
  restricted: { iconBg: 'bg-red-100 dark:bg-red-900/20', iconColor: 'text-red-600 dark:text-red-400' },
  custom: { iconBg: 'bg-gray-100 dark:bg-gray-800', iconColor: 'text-gray-600 dark:text-gray-400' }
};

const GeofenceCardSkeleton = () => (
  <Card className="group overflow-hidden">
    <div className="relative p-4">
      <div className="flex items-start gap-3">
        <Skeleton className="h-9 w-9 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
          <div className="flex items-center gap-4 mt-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-20" />
          </div>
          <div className="flex gap-2 mt-3">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-12" />
          </div>
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-dashed">
        <Skeleton className="h-3 w-28" />
      </div>
    </div>
  </Card>
);

export function GeofenceList({ geofences, onDelete, loading }: GeofenceListProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <GeofenceCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (geofences.length === 0) {
    return (
      <div className="text-center py-12 border-2 border-dashed border-muted rounded-lg bg-muted/5">
        <MapPin className="h-12 w-12 mx-auto mb-3 opacity-40 text-muted-foreground" />
        <p className="text-sm font-medium">No geofences configured</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-[200px] mx-auto">
          Create a geofence to monitor vehicle movements and receive alerts
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {geofences.map((geofence) => {
        const Icon = ZONE_TYPE_ICONS[geofence.zone_type] || MapPin;
        const styles = ZONE_TYPE_STYLES[geofence.zone_type] || ZONE_TYPE_STYLES.custom;

        return (
          <Card
            key={geofence.id}
            className="group overflow-hidden border-border/60 hover:border-border transition-colors"
          >
            <div className="relative p-4 bg-card">
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-full ${styles.iconBg} ${styles.iconColor}`}>
                  <Icon className="h-5 w-5" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-semibold text-sm text-foreground">{geofence.name}</h4>
                      {geofence.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                          {geofence.description}
                        </p>
                      )}
                    </div>
                    
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity absolute top-3 right-3"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Geofence?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will remove the "{geofence.name}" geofence. Any active alerts associated with this zone will be disabled.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={() => onDelete(geofence.id)}
                            className="bg-destructive hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>

                  <div className="flex items-center gap-4 mt-3">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Circle className="h-3.5 w-3.5" />
                      <span>{geofence.radius_meters}m Radius</span>
                    </div>
                    
                    <a
                      href={`https://www.google.com/maps?q=${geofence.center_latitude},${geofence.center_longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      <MapPin className="h-3 w-3" />
                      View on Map
                    </a>
                  </div>

                  <div className="flex gap-2 mt-3">
                    <Badge variant="outline" className="text-[10px] capitalize px-2 py-0 h-5">
                      {geofence.zone_type}
                    </Badge>
                    <Badge 
                      variant={geofence.is_active ? "default" : "secondary"} 
                      className={`text-[10px] px-2 py-0 h-5 ${geofence.is_active ? 'bg-green-600 hover:bg-green-700' : ''}`}
                    >
                      {geofence.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </div>
              </div>
              
              {/* Recent Activity Indicator (Mock) */}
              <div className="mt-3 pt-3 border-t border-dashed flex items-center gap-2 text-xs text-muted-foreground">
                <Activity className="h-3 w-3" />
                <span>No recent activity</span>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
