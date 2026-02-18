import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Fuel, Gauge } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";
import { useVehicleMileageDetails } from "@/hooks/useVehicleProfile";

interface StatusMetricsRowProps {
  deviceId: string;
  totalMileage: number | null;
  dateRange: DateRange | undefined;
}

export function StatusMetricsRow({ deviceId, totalMileage, dateRange }: StatusMetricsRowProps) {
  const startDate = dateRange?.from?.toISOString().split("T")[0];
  const endDate = dateRange?.to?.toISOString().split("T")[0];

  const { data: mileageDetails, error: mileageError } = useVehicleMileageDetails(
    deviceId,
    startDate,
    endDate,
    true
  );

  const fuelStats = useMemo(() => {
    const tableExists = !mileageError || (mileageError as any)?.code !== "PGRST205";
    if (!tableExists || !mileageDetails || mileageDetails.length === 0) {
      return null;
    }

    const withActual = mileageDetails
      .filter((m) => m.oilper100km !== null)
      .sort((a, b) => {
        if (!a.statisticsday || !b.statisticsday) return 0;
        return a.statisticsday.localeCompare(b.statisticsday);
      });
    const withEstimated = mileageDetails.filter((m) => m.estimated_fuel_consumption_combined !== null);
    const withBoth = mileageDetails.filter(
      (m) => m.oilper100km !== null && m.estimated_fuel_consumption_combined !== null
    );

    const avgActual =
      withActual.length > 0
        ? withActual.reduce((sum, m) => sum + (m.oilper100km || 0), 0) / withActual.length
        : null;

    const avgEstimated =
      withEstimated.length > 0
        ? withEstimated.reduce((sum, m) => sum + (m.estimated_fuel_consumption_combined || 0), 0) /
          withEstimated.length
        : null;

    const avgVariance =
      withBoth.length > 0
        ? withBoth.reduce((sum, m) => sum + (m.fuel_consumption_variance || 0), 0) / withBoth.length
        : null;

    let trend:
      | {
          hasTrend: boolean;
          recentAvg: number | null;
          pastAvg: number | null;
          percentChange: number | null;
          direction: "increasing" | "decreasing" | "stable";
        }
      | null = null;

    if (withActual.length >= 4) {
      const mid = Math.floor(withActual.length / 2);
      const pastSlice = withActual.slice(0, mid);
      const recentSlice = withActual.slice(mid);

      const pastAvg =
        pastSlice.reduce((sum, m) => sum + (m.oilper100km || 0), 0) / pastSlice.length;
      const recentAvg =
        recentSlice.reduce((sum, m) => sum + (m.oilper100km || 0), 0) / recentSlice.length;

      if (pastAvg > 0) {
        const delta = recentAvg - pastAvg;
        const percentChange = (delta / pastAvg) * 100;
        const absPercent = Math.abs(percentChange);
        const threshold = 5;

        let direction: "increasing" | "decreasing" | "stable" = "stable";
        if (absPercent >= threshold) {
          direction = percentChange > 0 ? "increasing" : "decreasing";
        }

        trend = {
          hasTrend: true,
          recentAvg,
          pastAvg,
          percentChange,
          direction,
        };
      }
    }

    if (!trend) {
      trend = {
        hasTrend: false,
        recentAvg: null,
        pastAvg: null,
        percentChange: null,
        direction: "stable",
      };
    }

    return {
      avgActual,
      avgEstimated,
      avgVariance,
      trend,
    };
  }, [mileageDetails, mileageError]);

  const fuelValue =
    fuelStats && fuelStats.avgActual !== null && fuelStats.avgActual !== undefined
      ? `${fuelStats.avgActual.toFixed(1)} L/100km`
      : fuelStats && fuelStats.avgEstimated !== null && fuelStats.avgEstimated !== undefined
        ? `${fuelStats.avgEstimated.toFixed(1)} L/100km`
        : "--";

  const fuelLabel = (() => {
    if (!fuelStats) return "No fuel data yet";
    if (fuelStats.avgActual !== null && fuelStats.avgEstimated !== null && fuelStats.avgVariance !== null) {
      const percent = Math.round(fuelStats.avgVariance);
      if (percent > 0) return `About ${percent}% above rated`;
      if (percent < 0) return `About ${Math.abs(percent)}% better than rated`;
      return "In line with rated";
    }
    if (fuelStats.avgActual !== null) return "Based on GPS data";
    if (fuelStats.avgEstimated !== null) return "Manufacturer estimate";
    return "No fuel data yet";
  })();

  const fuelTrendLabel = (() => {
    if (!fuelStats || !fuelStats.trend || !fuelStats.trend.hasTrend) {
      return "Trend: Not enough data yet";
    }
    const { percentChange, direction, recentAvg } = fuelStats.trend;
    if (percentChange === null || recentAvg === null) {
      return "Trend: Not enough data yet";
    }
    const roundedPercent = Math.round(Math.abs(percentChange));
    const roundedRecent = Math.round(recentAvg * 10) / 10;
    if (direction === "increasing") {
      return `Trend: Up about ${roundedPercent}% (now ~${roundedRecent} L/100km)`;
    }
    if (direction === "decreasing") {
      return `Trend: Down about ${roundedPercent}% (now ~${roundedRecent} L/100km)`;
    }
    return `Trend: Stable (around ${roundedRecent} L/100km)`;
  })();

  return (
    <div className="grid grid-cols-2 gap-4">
      <Card className="border-0 bg-card shadow-neumorphic-inset rounded-xl">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-full shadow-neumorphic-sm bg-card flex items-center justify-center">
              <Fuel className="h-4 w-4 text-muted-foreground" />
            </div>
            <span className="text-sm text-muted-foreground">Fuel Consumption</span>
          </div>
          <div className={cn("text-2xl font-bold text-foreground")}>
            {fuelValue}
          </div>
          <div className="text-xs text-muted-foreground">{fuelLabel}</div>
          <div className="text-[11px] text-muted-foreground mt-1">{fuelTrendLabel}</div>
        </CardContent>
      </Card>

      {/* Mileage */}
      <Card className="border-0 bg-card shadow-neumorphic-inset rounded-xl">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-full shadow-neumorphic-sm bg-card flex items-center justify-center">
              <Gauge className="h-4 w-4 text-muted-foreground" />
            </div>
            <span className="text-sm text-muted-foreground">Mileage</span>
          </div>
          <div className="text-2xl font-bold text-foreground">
            {/* DEFENSIVE FIX: Check strictly for number type */}
            {typeof totalMileage === 'number'
              ? totalMileage.toLocaleString(undefined, { maximumFractionDigits: 0 }) 
              : "--"} <span className="text-sm font-normal text-muted-foreground">km</span>
          </div>
          <div className="text-xs text-muted-foreground">Total</div>
        </CardContent>
      </Card>
    </div>
  );
}
