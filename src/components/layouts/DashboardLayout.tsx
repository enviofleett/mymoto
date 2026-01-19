import { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { TopNavigation } from "@/components/navigation/TopNavigation";
import { BottomNavigation } from "@/components/navigation/BottomNavigation";
import { AdminBottomNav } from "@/components/navigation/AdminBottomNav";
import { DashboardFooter } from "@/components/fleet/DashboardFooter";
import { GlobalAlertListener } from "@/components/notifications/GlobalAlertListener";
import { StickyAlertBanner } from "@/components/notifications/StickyAlertBanner";
import { useAuth } from "@/contexts/AuthContext";
import { ConnectionStatus } from "@/hooks/useFleetData";
import { useFooterPadding } from "@/hooks/useFooterPadding";

interface DashboardLayoutProps {
  children: ReactNode;
  connectionStatus?: ConnectionStatus;
}

export function DashboardLayout({ children, connectionStatus }: DashboardLayoutProps) {
  const location = useLocation();
  const { isAdmin } = useAuth();
  const footerPadding = useFooterPadding();
  
  // Determine if we should show AdminBottomNav
  // Admin routes: /, /fleet, /map, /insights, /settings, /notifications, and all /admin/* routes
  const isAdminRoute = location.pathname.startsWith('/admin') || 
                       location.pathname === '/' || 
                       location.pathname === '/fleet' ||
                       location.pathname === '/map' ||
                       location.pathname === '/insights' ||
                       location.pathname === '/settings' ||
                       location.pathname === '/notifications';
  const shouldShowAdminNav = isAdmin && isAdminRoute;

  return (
    <div className="flex h-[100dvh] w-full flex-col bg-background overflow-hidden">
      {/* Global Alert Listener - Real-time notifications */}
      <GlobalAlertListener />
      
      {/* Sticky Alert Banner - Shows at top header */}
      <StickyAlertBanner />
      
      {/* Desktop Top Navigation - DISABLED: Using footer navigation only */}
      {/* <div className="hidden md:block">
        <TopNavigation connectionStatus={connectionStatus} />
      </div> */}

      {/* Mobile Header - Simple branding */}
      {/* CRITICAL FIX: z-40 ensures header stays above content but below AdminBottomNav (z-50) */}
      <header className="md:hidden sticky top-0 z-40 flex-none flex h-14 items-center border-b border-border bg-background/95 backdrop-blur px-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4 text-primary-foreground"
            >
              <path d="M10 17h4V5H2v12h3" />
              <path d="M20 17h2v-3.34a4 4 0 0 0-1.17-2.83L19 9h-5v8h1" />
              <circle cx="7.5" cy="17.5" r="2.5" />
              <circle cx="17.5" cy="17.5" r="2.5" />
            </svg>
          </div>
          <span className="font-bold text-foreground">FleetHub</span>
        </div>
        {/* Connection Status on Mobile */}
        {connectionStatus && (
          <div className="ml-auto">
            {connectionStatus === "connected" && (
              <div className="flex items-center gap-1.5 text-xs text-green-400">
                <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                Live
              </div>
            )}
            {connectionStatus === "connecting" && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />
                Connecting
              </div>
            )}
            {connectionStatus === "disconnected" && (
              <div className="flex items-center gap-1.5 text-xs text-destructive">
                <span className="h-2 w-2 rounded-full bg-destructive" />
                Offline
              </div>
            )}
          </div>
        )}
      </header>

      {/* Main Content - Dynamic padding ensures content is never cut off by footer */}
      {/* CRITICAL FIX: overflow-x-hidden prevents horizontal scroll, pb-32 ensures content clears footer */}
      <main className={`flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 pb-32 safe-area-bottom ${footerPadding}`}>
        <div className="mx-auto max-w-5xl animate-in fade-in slide-in-from-bottom-4 duration-500">
          {children}
        </div>
      </main>

      {/* Bottom Navigation - Shows on all screen sizes */}
      {shouldShowAdminNav ? (
        <AdminBottomNav />
      ) : (
        <BottomNavigation />
      )}
    </div>
  );
}
