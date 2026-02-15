import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { CalendarIcon, Filter, RefreshCw, X } from "lucide-react";
import { formatLagos } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";

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
  // Simple media query check (or just use CSS classes)
  // For simplicity in this environment without checking hooks, I'll rely on responsive classes (hidden md:flex)
  
  const [isOpen, setIsOpen] = useState(false);

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
    <div className="flex flex-col gap-4 md:flex-row md:items-center">
      <div className="grid gap-2">
        <label className="text-xs font-medium text-muted-foreground">Date Presets</label>
        <div className="flex flex-wrap gap-2">
           <Button variant="outline" size="sm" onClick={applyToday} className="h-8 text-xs">
             Today
           </Button>
           <Button variant="outline" size="sm" onClick={applyYesterday} className="h-8 text-xs">
             Yesterday
           </Button>
           <Button variant="outline" size="sm" onClick={() => applyPreset(7)} className="h-8 text-xs">
             Last 7 Days
           </Button>
           <Button variant="outline" size="sm" onClick={() => applyPreset(30)} className="h-8 text-xs">
             Last 30 Days
           </Button>
        </div>
      </div>

      <div className="grid gap-2 md:ml-4">
        <label className="text-xs font-medium text-muted-foreground">Custom Range</label>
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "h-8 justify-start text-left font-normal w-full sm:w-[240px]",
                  !dateRange && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateRange?.from ? (
                  dateRange.to ? (
                    <>
                      {formatLagos(dateRange.from, "MMM d")} -{" "}
                      {formatLagos(dateRange.to, "MMM d, yyyy")}
                    </>
                  ) : (
                    formatLagos(dateRange.from, "MMM d, yyyy")
                  )
                ) : (
                  <span>Pick a date</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={dateRange?.from}
                selected={dateRange}
                onSelect={onDateRangeChange}
                numberOfMonths={1}
              />
            </PopoverContent>
          </Popover>
          
          {isFiltered && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onDateRangeChange(undefined)}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 md:text-right pt-4 md:pt-0">
         <Button 
            onClick={() => {
                onGenerate();
                setIsOpen(false); // Close drawer on mobile
            }} 
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
    <div className={cn("bg-card border-b p-4", className)}>
      {/* Desktop View */}
      <div className="hidden md:block">
        <FilterContent />
      </div>

      {/* Mobile View */}
      <div className="md:hidden flex items-center justify-between">
        <div className="text-sm font-medium">
            {dateRange?.from ? (
                <span className="flex items-center gap-2">
                    <CalendarIcon className="h-4 w-4 text-primary" />
                    {formatLagos(dateRange.from, "MMM d")} - {dateRange.to ? formatLagos(dateRange.to, "MMM d") : "..."}
                </span>
            ) : (
                <span className="text-muted-foreground">Default View (30 Days)</span>
            )}
        </div>
        <Drawer open={isOpen} onOpenChange={setIsOpen}>
          <DrawerTrigger asChild>
            <Button variant="outline" size="sm">
              <Filter className="h-4 w-4 mr-2" />
              Filter
            </Button>
          </DrawerTrigger>
          <DrawerContent>
            <DrawerHeader className="text-left">
              <DrawerTitle>Filter Reports</DrawerTitle>
              <DrawerDescription>
                Select date range and criteria to generate report.
              </DrawerDescription>
            </DrawerHeader>
            <div className="px-4 pb-8">
                <FilterContent />
            </div>
            <DrawerFooter className="pt-2">
              <DrawerClose asChild>
                <Button variant="outline">Cancel</Button>
              </DrawerClose>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      </div>
    </div>
  );
}
