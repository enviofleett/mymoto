import { useEffect, useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { addDays, endOfDay, isAfter, startOfDay, subDays } from "date-fns";
import { Calendar as CalendarIcon, Filter } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface ReportFilterBarProps {
  dateRange: DateRange | undefined;
  onDateRangeChange: (range: DateRange | undefined) => void;
  onGenerate: () => void;
  isLoading?: boolean;
  className?: string;
}

type PresetKey = "today" | "last7" | "last30" | "thisMonth" | "custom";

const STORAGE_KEY = "owner-vehicle-profile:date-filter";

export function ReportFilterBar({
  dateRange,
  onDateRangeChange,
  onGenerate,
  isLoading,
  className,
}: ReportFilterBarProps) {
  const [preset, setPreset] = useState<PresetKey>("last30");
  const [validationError, setValidationError] = useState<string | null>(null);

  // Persist + hydrate filter
  useEffect(() => {
    try {
      const stored = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
      if (!stored) return;
      const parsed = JSON.parse(stored) as { preset: PresetKey; from?: string; to?: string } | null;
      if (!parsed || !parsed.preset) return;

      const now = new Date();
      let nextRange: DateRange | undefined;

      if (parsed.preset === "custom" && parsed.from) {
        const from = new Date(parsed.from);
        const to = parsed.to ? new Date(parsed.to) : from;
        if (!isAfter(from, addDays(now, 1)) && !isAfter(to, addDays(now, 1))) {
          nextRange = { from, to };
        }
      } else {
        const computed = computePresetRange(parsed.preset, now);
        nextRange = computed;
      }

      setPreset(parsed.preset);
      if (nextRange) {
        onDateRangeChange(nextRange);
      }
    } catch {
      // ignore
    }
  }, [onDateRangeChange]);

  useEffect(() => {
    try {
      const payload =
        dateRange?.from && dateRange.to
          ? {
              preset,
              from: dateRange.from.toISOString(),
              to: dateRange.to.toISOString(),
            }
          : { preset };
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      }
    } catch {
      // ignore
    }
  }, [preset, dateRange?.from, dateRange?.to]);

  const handlePresetChange = (value: string) => {
    const next = value as PresetKey;
    setPreset(next);
    setValidationError(null);

    if (next === "custom") {
      return;
    }

    const range = computePresetRange(next, new Date());
    onDateRangeChange(range);
    onGenerate();
  };

  const handleCalendarSelect = (range: DateRange | undefined) => {
    if (!range?.from) {
      onDateRangeChange(undefined);
      setValidationError(null);
      return;
    }

    const today = endOfDay(new Date());
    const from = startOfDay(range.from);
    const to = range.to ? endOfDay(range.to) : endOfDay(range.from);

    if (isAfter(from, today) || isAfter(to, today)) {
      setValidationError("You cannot select future dates.");
      return;
    }

    if (isAfter(from, to)) {
      setValidationError("Start date cannot be after end date.");
      return;
    }

    setValidationError(null);
    setPreset("custom");
    onDateRangeChange({ from, to });
    onGenerate();
  };

  return (
    <div className={cn("bg-card/70 border border-border/70 px-3 py-3 rounded-2xl", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
          <Filter className="h-3.5 w-3.5" />
          <span>Filter</span>
        </div>
        <div className="flex flex-col gap-2 w-full sm:w-auto">
          <Select value={preset} onValueChange={handlePresetChange} disabled={isLoading}>
            <SelectTrigger className="h-9 w-full sm:w-[220px] text-xs">
              <SelectValue placeholder="Select range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="last7">Last 7 days</SelectItem>
              <SelectItem value="custom">Custom date selection</SelectItem>
            </SelectContent>
          </Select>

          {preset === "custom" && (
            <div className="rounded-xl border border-border/60 bg-card/80 p-2">
              <div className="flex items-center gap-2 mb-2 text-[11px] font-medium text-muted-foreground">
                <CalendarIcon className="h-3.5 w-3.5" />
                <span>Select custom date range</span>
              </div>
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={handleCalendarSelect}
                numberOfMonths={2}
                defaultMonth={dateRange?.from}
                disabled={(date) => isAfter(date, new Date())}
              />
              <div className="mt-1 text-[11px] text-destructive min-h-[1.25rem]">
                {validationError ? validationError : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function computePresetRange(preset: PresetKey, now: Date): DateRange {
  const today = startOfDay(now);

  switch (preset) {
    case "today": {
      return { from: today, to: endOfDay(today) };
    }
    case "last7": {
      const from = startOfDay(subDays(today, 6));
      return { from, to: endOfDay(today) };
    }
    case "last30": {
      const from = startOfDay(subDays(today, 29));
      return { from, to: endOfDay(today) };
    }
    case "thisMonth": {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: startOfDay(start), to: endOfDay(today) };
    }
    case "custom":
    default: {
      return { from: today, to: endOfDay(today) };
    }
  }
}
