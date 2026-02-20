import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Navigation, X } from "lucide-react";

interface TripPlaybackProps {
  deviceId: string;
  deviceName: string;
  onClose: () => void;
}

export function TripPlayback({ deviceId, deviceName, onClose }: TripPlaybackProps) {
  return (
    <Card className="border-border bg-card max-w-6xl mx-auto">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Navigation className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">History playback</CardTitle>
              <p className="text-sm text-muted-foreground">{deviceName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close playback">
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Trip playback is currently disabled for this vehicle.
        </p>
      </CardContent>
    </Card>
  );
}
