import { useEffect, useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { addDays, endOfDay, isAfter, startOfDay, subDays } from "date-fns";
import { Calendar as CalendarIcon, Filter, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  const [calendarOpen, setCalendarOpen] = useState(false);
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

  const displayLabel = useMemo(() => {
    if (!dateRange?.from || !dateRange.to) return "Filter by date";
    const from = startOfDay(dateRange.from);
    const to = endOfDay(dateRange.to);
    const sameDay = from.getTime() === to.getTime();
    const formatter = new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

    if (sameDay) {
      return formatter.format(from);
    }

    return `${formatter.format(from)} – ${formatter.format(to)}`;
  }, [dateRange?.from, dateRange?.to]);

  const handlePresetChange = (value: string) => {
    const next = value as PresetKey;
    setPreset(next);
    setValidationError(null);

    if (next === "custom") {
      setCalendarOpen(true);
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
    onDateRangeChange({ from, to });
  };

  const handleApply = () => {
    if (!dateRange?.from || !dateRange.to) {
      setValidationError("Select a valid date range first.");
      return;
    }
    setValidationError(null);
    setCalendarOpen(false);
    onGenerate();
  };

  return (
    <div className={cn("bg-card/70 border border-border/70 px-3 py-3 rounded-2xl", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
          <Filter className="h-3.5 w-3.5" />
          <span>Filter</span>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <Select value={preset} onValueChange={handlePresetChange} disabled={isLoading}>
            <SelectTrigger className="h-9 w-full sm:w-[150px] text-xs">
              <SelectValue placeholder="Preset" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="last7">Last 7 days</SelectItem>
              <SelectItem value="last30">Last 30 days</SelectItem>
              <SelectItem value="thisMonth">This month</SelectItem>
              <SelectItem value="custom">Custom range</SelectItem>
            </SelectContent>
          </Select>

          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "h-9 px-3 text-xs justify-between w-full sm:w-auto",
                  !dateRange?.from && "text-muted-foreground",
                  isLoading && "cursor-wait",
                )}
                disabled={isLoading}
              >
                <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                {displayLabel}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={handleCalendarSelect}
                numberOfMonths={2}
                defaultMonth={dateRange?.from}
                disabled={(date) => isAfter(date, new Date())}
              />
              <div className="flex items-center justify-between gap-2 border-t border-border/60 px-3 py-2">
                <div className="text-[11px] text-destructive min-h-[1.25rem]">
                  {validationError ? validationError : null}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => {
                      setValidationError(null);
                      onDateRangeChange(undefined);
                    }}
                  >
                    Clear
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 px-3 text-[11px]"
                    onClick={handleApply}
                    disabled={isLoading}
                  >
                    <RefreshCw className={cn("mr-1 h-3 w-3", isLoading && "animate-spin")} />
                    Apply
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
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
