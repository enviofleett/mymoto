import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ReportFilterBarProps {
  dateRange: DateRange | undefined;
  onDateRangeChange: (range: DateRange | undefined) => void;
  onGenerate: () => void;
  isLoading?: boolean;
  className?: string;
}

export function ReportFilterBar({
  dateRange,
  onDateRangeChange,
  onGenerate,
  isLoading,
  className,
}: ReportFilterBarProps) {
  const [isOpen] = useState(false);

  // Preset Handlers
  const applyPreset = (days: number) => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);
    onDateRangeChange({ from, to });
  };

  const applyToday = () => {
    const today = new Date();
    onDateRangeChange({ from: today, to: today });
  };

  const applyYesterday = () => {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    onDateRangeChange({ from: y, to: y });
  };

  const isFiltered = !!dateRange?.from;

  const FilterContent = () => (
    <div className="flex flex-col gap-3 md:flex-row md:items-center">
      <div className="flex-1 max-w-xs">
        <Select
          onValueChange={(v) => {
            if (v === "today") applyToday();
            else if (v === "yesterday") applyYesterday();
            else if (v === "7") applyPreset(7);
            else if (v === "30") applyPreset(30);
            else if (v === "reset") onDateRangeChange(undefined);
          }}
        >
          <SelectTrigger className="w-full h-10">
            <SelectValue placeholder="Choose preset" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="yesterday">Yesterday</SelectItem>
            <SelectItem value="7">Last 7 Days</SelectItem>
            <SelectItem value="30">Last 30 Days</SelectItem>
            {isFiltered && <SelectItem value="reset">Reset</SelectItem>}
          </SelectContent>
        </Select>
      </div>
      <div className="md:text-right">
        <Button
          onClick={() => onGenerate()}
          disabled={isLoading || !dateRange?.from}
          className="w-full md:w-auto"
        >
          <RefreshCw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} />
          Generate Report
        </Button>
      </div>
    </div>
  );

  return (
    <div className={cn("", className)}>
      <FilterContent />
    </div>
  );
}
