import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ProactiveNotifications } from "@/components/fleet/ProactiveNotifications";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Bell, Settings } from "lucide-react";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";

function normalizeIdParam(v: string | null): string | undefined {
  if (!v) return undefined;
  const trimmed = v.trim();
  return trimmed.length ? trimmed : undefined;
}

export default function NotificationsFeed() {
  const [searchParams] = useSearchParams();
  const deviceId = normalizeIdParam(searchParams.get("deviceId"));
  const eventId = normalizeIdParam(searchParams.get("eventId"));
  const [highlightEventId, setHighlightEventId] = useState<string | null>(eventId ?? null);

  // Keep highlight in sync when navigating via query params.
  useEffect(() => {
    setHighlightEventId(eventId ?? null);
  }, [eventId]);

  // Scroll to the event card when requested.
  useEffect(() => {
    if (!eventId) return;

    let cancelled = false;
    const startedAt = Date.now();

    const tryScroll = () => {
      if (cancelled) return;

      const el = document.getElementById(`event-${eventId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        // Auto-clear highlight after a short moment.
        window.setTimeout(() => {
          if (!cancelled) setHighlightEventId(null);
        }, 4000);
        return;
      }

      // Retry briefly while data loads.
      if (Date.now() - startedAt < 2500) {
        window.setTimeout(tryScroll, 150);
      }
    };

    window.setTimeout(tryScroll, 0);
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  const title = useMemo(() => {
    if (deviceId) return "Notifications";
    return "Notifications";
  }, [deviceId]);

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-lg font-semibold">{title}</h1>
          </div>

          <Button asChild variant="outline" size="sm">
            <Link to="/notification-settings">
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Link>
          </Button>
        </div>

        {deviceId && (
          <Card className="p-3 text-sm text-muted-foreground">
            Showing alerts for vehicle: <span className="font-medium text-foreground">{deviceId}</span>
          </Card>
        )}

        <ProactiveNotifications
          deviceId={deviceId}
          limit={50}
          showHistory
          highlightEventId={highlightEventId ?? undefined}
        />
      </div>
    </DashboardLayout>
  );
}
