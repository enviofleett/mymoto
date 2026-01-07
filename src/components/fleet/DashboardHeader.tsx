import { Bell, Search, Plus, Wifi, WifiOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ConnectionStatus } from "@/hooks/useFleetData";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface DashboardHeaderProps {
  connectionStatus?: ConnectionStatus;
}

export function DashboardHeader({ connectionStatus = 'connecting' }: DashboardHeaderProps) {
  const statusConfig = {
    connected: {
      icon: Wifi,
      label: 'Live updates active',
      className: 'text-status-active',
    },
    connecting: {
      icon: Loader2,
      label: 'Connecting...',
      className: 'text-muted-foreground animate-spin',
    },
    disconnected: {
      icon: WifiOff,
      label: 'Disconnected - using polling',
      className: 'text-status-inactive',
    },
  };

  const config = statusConfig[connectionStatus];
  const StatusIcon = config.icon;

  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-background px-6">
      <div className="flex items-center gap-4">
        <SidebarTrigger className="md:hidden" />
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search vehicles, drivers..."
            className="w-64 pl-9 bg-secondary border-border focus:border-primary"
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-secondary">
              <StatusIcon className={`h-4 w-4 ${config.className}`} />
              <span className="text-xs text-muted-foreground hidden sm:inline">
                {connectionStatus === 'connected' ? 'Live' : connectionStatus === 'connecting' ? 'Connecting' : 'Offline'}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{config.label}</p>
          </TooltipContent>
        </Tooltip>
        <Button variant="ghost" size="icon" className="relative text-muted-foreground hover:text-foreground">
          <Bell className="h-5 w-5" />
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-status-inactive" />
        </Button>
        <Button className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" />
          Add Vehicle
        </Button>
      </div>
    </header>
  );
}
