import { ReactNode } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/fleet/AppSidebar";
import { DashboardHeader } from "@/components/fleet/DashboardHeader";
import { DashboardFooter } from "@/components/fleet/DashboardFooter";
import { ConnectionStatus } from "@/hooks/useFleetData";

interface DashboardLayoutProps {
  children: ReactNode;
  connectionStatus?: ConnectionStatus;
}

export function DashboardLayout({ children, connectionStatus }: DashboardLayoutProps) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <DashboardHeader connectionStatus={connectionStatus} />
          <main className="flex-1 overflow-auto p-6">{children}</main>
          <DashboardFooter />
        </div>
      </div>
    </SidebarProvider>
  );
}
