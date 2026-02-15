import type { DateRange } from "react-day-picker";

interface ReportFilterBarProps {
  dateRange: DateRange | undefined;
  onDateRangeChange: (range: DateRange | undefined) => void;
  onGenerate: () => void;
  isLoading?: boolean;
  className?: string;
}

export function ReportFilterBar(_: ReportFilterBarProps) {
  return null;
}
