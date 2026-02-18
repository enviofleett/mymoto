import { useState, useEffect, Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import SplashScreen from "@/components/SplashScreen";
import { TermsChecker } from "@/components/auth/TermsChecker";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import RatingListener from "@/components/directory/RatingListener";
import { Loader2 } from "lucide-react";
import { usePwaUpdatePrompt } from "@/hooks/usePwaUpdatePrompt";
import { captureAttributionFromUrl } from "@/lib/analytics";

const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Fleet = lazy(() => import("./pages/Fleet"));
const Insights = lazy(() => import("./pages/Insights"));
const Profile = lazy(() => import("./pages/Profile"));
const AdminWallets = lazy(() => import("./pages/AdminWallets"));
const AdminStorage = lazy(() => import("./pages/AdminStorage"));
const AdminAlerts = lazy(() => import("./pages/AdminAlerts"));
const AdminAiSettings = lazy(() => import("./pages/AdminAiSettings"));
const AdminAssignments = lazy(() => import("./pages/AdminAssignments"));
const AdminPrivacySettings = lazy(() => import("./pages/AdminPrivacySettings"));
const AdminEmailTemplates = lazy(() => import("./pages/AdminEmailTemplates"));
const AdminReportTemplates = lazy(() => import("./pages/AdminReportTemplates"));
const AdminResources = lazy(() => import("./pages/AdminResources"));
const AdminGrowthDashboard = lazy(() => import("./pages/AdminGrowthDashboard"));
const NotificationSettings = lazy(() => import("./pages/NotificationSettings"));
const NotFound = lazy(() => import("./pages/NotFound"));
const InstallApp = lazy(() => import("./pages/InstallApp"));
const PwaLogin = lazy(() => import("./pages/PwaLogin"));
const OwnerLanding = lazy(() => import("./pages/OwnerLanding"));

// Partner pages
const PartnerSignup = lazy(() => import("./pages/partner/PartnerSignup"));
const PartnerDashboard = lazy(() => import("./pages/partner/PartnerDashboard"));

// Owner PWA pages
const OwnerChat = lazy(() => import("./pages/owner/OwnerChat"));
const OwnerChatDetail = lazy(() => import("./pages/owner/OwnerChatDetail"));
const OwnerVehicles = lazy(() => import("./pages/owner/OwnerVehicles"));
const OwnerVehiclesDashboard = lazy(() => import("./pages/owner/OwnerVehiclesDashboard"));
const OwnerVehicleProfile = lazy(() => import("./pages/owner/OwnerVehicleProfile"));
const OwnerWallet = lazy(() => import("./pages/owner/OwnerWallet"));
const OwnerProfile = lazy(() => import("./pages/owner/OwnerProfile"));
const OwnerNotificationSettings = lazy(() => import("./pages/owner/OwnerNotificationSettings"));
const OwnerPrivacy = lazy(() => import("./pages/owner/OwnerPrivacy"));
const OwnerResources = lazy(() => import("./pages/owner/OwnerResources"));

// Directory pages
const OwnerDirectory = lazy(() => import("./pages/owner/OwnerDirectory"));
const AdminDirectory = lazy(() => import("./pages/AdminDirectory"));
const AdminVehicleRequests = lazy(() => import("./pages/AdminVehicleRequests"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
    },
    mutations: {
      retry: 1,
    },
  },
});

function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

// Check if running as installed PWA
const isPWA = window.matchMedia('(display-mode: standalone)').matches ||
  (window.navigator as any).standalone === true;

// Role-based redirect component
const RoleBasedRedirect = () => {
  const { user, isAdmin, isProvider, isLoading, isRoleLoaded } = useAuth();
  const navigate = useNavigate();
  
  useEffect(() => {
    if (!isLoading && isRoleLoaded && user) {
      if (isAdmin) {
        navigate('/admin/dashboard', { replace: true });
      } else if (isProvider) {
        navigate('/partner/dashboard', { replace: true });
      } else {
        navigate('/owner/vehicles', { replace: true });
      }
    }
  }, [user, isAdmin, isProvider, isLoading, isRoleLoaded, navigate]);
  
  return null;
};

const App = () => {
  const [showSplash, setShowSplash] = useState(isPWA);

  usePwaUpdatePrompt();

  useEffect(() => {
    captureAttributionFromUrl();
  }, []);

  useEffect(() => {
    const handleOnline = () => {
    };
    const handleOffline = () => {
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} />}
          <Toaster />
          <Sonner />
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <AuthProvider>
              <TermsChecker>
            <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<OwnerLanding />} />
              <Route path="/go/:channel" element={<OwnerLanding />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/login" element={<PwaLogin />} />
              <Route path="/install" element={<InstallApp />} />
              
              {/* Role-based redirect */}
              <Route path="/redirect" element={<RoleBasedRedirect />} />
              
              {/* Admin Dashboard Routes */}
              <Route path="/admin/dashboard" element={<ProtectedRoute requireAdmin><Index /></ProtectedRoute>} />
              <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
              <Route path="/fleet" element={<ProtectedRoute><Fleet /></ProtectedRoute>} />
              <Route path="/map" element={<Navigate to="/fleet" replace />} />
              <Route path="/insights" element={<ProtectedRoute><Insights /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
              <Route path="/profile" element={<Navigate to="/settings" replace />} />
              <Route path="/notifications" element={<ProtectedRoute><NotificationSettings /></ProtectedRoute>} />
              
              {/* Admin Routes */}
              <Route path="/admin/wallets" element={<ProtectedRoute><AdminWallets /></ProtectedRoute>} />
              <Route path="/admin/storage" element={<ProtectedRoute><AdminStorage /></ProtectedRoute>} />
              <Route path="/admin/alerts" element={<ProtectedRoute><AdminAlerts /></ProtectedRoute>} />
              <Route path="/admin/ai-settings" element={<ProtectedRoute><AdminAiSettings /></ProtectedRoute>} />
              <Route path="/admin/assignments" element={<ProtectedRoute><AdminAssignments /></ProtectedRoute>} />
              <Route path="/admin/privacy-settings" element={<ProtectedRoute><AdminPrivacySettings /></ProtectedRoute>} />
              <Route path="/admin/email-templates" element={<ProtectedRoute><AdminEmailTemplates /></ProtectedRoute>} />
              <Route path="/admin/report-templates" element={<ProtectedRoute><AdminReportTemplates /></ProtectedRoute>} />
              <Route path="/admin/resources" element={<ProtectedRoute><AdminResources /></ProtectedRoute>} />
              <Route path="/admin/growth" element={<ProtectedRoute requireAdmin><AdminGrowthDashboard /></ProtectedRoute>} />
              <Route path="/admin/directory" element={<ProtectedRoute requireAdmin><AdminDirectory /></ProtectedRoute>} />
              <Route path="/admin/vehicle-requests" element={<ProtectedRoute requireAdmin><AdminVehicleRequests /></ProtectedRoute>} />
              
              {/* Partner Routes */}
              <Route path="/partner/signup" element={<PartnerSignup />} />
              <Route path="/partner/dashboard" element={<ProtectedRoute requireProvider><PartnerDashboard /></ProtectedRoute>} />
              
              {/* Owner PWA Routes */}
              <Route path="/owner" element={<ProtectedRoute><OwnerChat /></ProtectedRoute>} />
              <Route path="/owner/chat/:deviceId" element={<ProtectedRoute><OwnerChatDetail /></ProtectedRoute>} />
              <Route path="/owner/vehicles" element={<ProtectedRoute><OwnerVehiclesDashboard /></ProtectedRoute>} />
              <Route path="/owner/vehicles/list" element={<ProtectedRoute><OwnerVehicles /></ProtectedRoute>} />
              <Route path="/owner/vehicle/:deviceId" element={<ProtectedRoute><OwnerVehicleProfile /></ProtectedRoute>} />
              <Route path="/owner/wallet" element={<ProtectedRoute><OwnerWallet /></ProtectedRoute>} />
              <Route path="/owner/profile" element={<ProtectedRoute><OwnerProfile /></ProtectedRoute>} />
              <Route path="/owner/notifications" element={<ProtectedRoute><OwnerNotificationSettings /></ProtectedRoute>} />
              <Route path="/owner/privacy" element={<ProtectedRoute><OwnerPrivacy /></ProtectedRoute>} />
              <Route path="/owner/resources" element={<ProtectedRoute><OwnerResources /></ProtectedRoute>} />
              <Route path="/owner/directory" element={<ProtectedRoute><OwnerDirectory /></ProtectedRoute>} />
              
              <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
            <RatingListener />
            </TermsChecker>
          </AuthProvider>
        </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
