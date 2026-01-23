import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { OwnerLayout } from "@/components/layouts/OwnerLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { useOwnerVehicles } from "@/hooks/useOwnerVehicles";
import { VehicleNotificationSettings } from "@/components/fleet/VehicleNotificationSettings";
import { Car, ChevronRight, ArrowLeft } from "lucide-react";

export default function OwnerNotificationSettings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: vehicles, isLoading } = useOwnerVehicles();
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);

  if (!user?.id) {
    return (
      <OwnerLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <p className="text-muted-foreground mb-4">Please sign in to configure notifications</p>
            <Button onClick={() => navigate("/auth")}>Sign In</Button>
          </div>
        </div>
      </OwnerLayout>
    );
  }

  // If a vehicle is selected, show its notification settings
  if (selectedVehicleId) {
    return (
      <OwnerLayout>
        <div className="flex flex-col min-h-full">
          {/* Header */}
          <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm pt-[env(safe-area-inset-top)] -mt-[env(safe-area-inset-top)]">
            <div className="px-4 py-4">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedVehicleId(null)}
                  className="p-2"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <h1 className="text-xl font-bold text-foreground">Notification Settings</h1>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 p-4">
            <VehicleNotificationSettings deviceId={selectedVehicleId} userId={user.id} />
          </div>
        </div>
      </OwnerLayout>
    );
  }

  // Show list of vehicles to select
  return (
    <OwnerLayout>
      <div className="flex flex-col min-h-full">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm pt-[env(safe-area-inset-top)] -mt-[env(safe-area-inset-top)]">
          <div className="px-4 py-4">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/owner/profile")}
                className="p-2"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <h1 className="text-xl font-bold text-foreground">Notification Settings</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Choose a vehicle to configure its notification preferences
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-4 space-y-4">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : vehicles && vehicles.length > 0 ? (
            vehicles.map((vehicle) => (
              <Card
                key={vehicle.deviceId}
                className="border-0 bg-card shadow-neumorphic rounded-xl cursor-pointer transition-all duration-200 active:scale-[0.99]"
                onClick={() => setSelectedVehicleId(vehicle.deviceId)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full shadow-neumorphic-sm bg-card p-0.5 shrink-0 overflow-hidden">
                        {vehicle.avatarUrl ? (
                          <div className="w-full h-full rounded-full bg-secondary flex items-center justify-center overflow-hidden">
                            <img
                              src={vehicle.avatarUrl}
                              alt={vehicle.name}
                              className="max-w-full max-h-full w-auto h-auto object-contain rounded-full"
                            />
                          </div>
                        ) : (
                          <div className="w-full h-full rounded-full bg-secondary flex items-center justify-center">
                            <Car className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-base font-medium text-foreground truncate">
                          {vehicle.name}
                        </div>
                        {vehicle.nickname && vehicle.nickname !== vehicle.plateNumber && (
                          <div className="text-xs text-muted-foreground truncate">
                            {vehicle.plateNumber}
                          </div>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="p-6 text-center">
                <Car className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground mb-4">No vehicles found</p>
                <Button onClick={() => navigate("/owner/vehicles")}>
                  View Vehicles
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </OwnerLayout>
  );
}
