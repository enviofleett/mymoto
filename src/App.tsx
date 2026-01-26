import { useState, useEffect } from "react";
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
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Fleet from "./pages/Fleet";
import LiveMap from "./pages/LiveMap";
import Insights from "./pages/Insights";
import Profile from "./pages/Profile";
import AdminWallets from "./pages/AdminWallets";
import AdminStorage from "./pages/AdminStorage";
import AdminAlerts from "./pages/AdminAlerts";
import AdminAiSettings from "./pages/AdminAiSettings";
import AdminAssignments from "./pages/AdminAssignments";
import AdminPrivacySettings from "./pages/AdminPrivacySettings";
import AdminEmailTemplates from "./pages/AdminEmailTemplates";
import AdminResources from "./pages/AdminResources";
import NotificationSettings from "./pages/NotificationSettings";
import NotFound from "./pages/NotFound";
import InstallApp from "./pages/InstallApp";
import PwaLogin from "./pages/PwaLogin";

// Owner PWA pages
import OwnerChat from "./pages/owner/OwnerChat";
import OwnerChatDetail from "./pages/owner/OwnerChatDetail";
import OwnerVehicles from "./pages/owner/OwnerVehicles";
import OwnerVehicleProfile from "./pages/owner/OwnerVehicleProfile";
import OwnerWallet from "./pages/owner/OwnerWallet";
import OwnerProfile from "./pages/owner/OwnerProfile";
import OwnerNotificationSettings from "./pages/owner/OwnerNotificationSettings";
import OwnerPrivacy from "./pages/owner/OwnerPrivacy";
import OwnerResources from "./pages/owner/OwnerResources";

// Partner pages
import PartnerDashboard from "./pages/partner/PartnerDashboard";
import PartnerProfile from "./pages/partner/PartnerProfile";
import PartnerSignup from "./pages/partner/PartnerSignup";

// Directory pages
import OwnerDirectory from "./pages/owner/OwnerDirectory";
import AdminDirectory from "./pages/AdminDirectory";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      onError: (error) => {
      },
    },
    mutations: {
      onError: (error) => {
      },
    },
  },
});

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
        navigate('/', { replace: true });
      } else if (isProvider) {
        navigate('/partner/dashboard', { replace: true });
      } else {
        navigate('/owner', { replace: true });
      }
    }
  }, [user, isAdmin, isProvider, isLoading, isRoleLoaded, navigate]);
  
  return null;
};

const App = () => {
  const [showSplash, setShowSplash] = useState(isPWA);

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
          <BrowserRouter>
            <AuthProvider>
              <TermsChecker>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/login" element={<PwaLogin />} />
              <Route path="/app" element={<InstallApp />} />
              
              {/* Public Partner Signup */}
              <Route path="/partner-signup" element={<PartnerSignup />} />
              <Route path="/partner/signup" element={<PartnerSignup />} />
              
              {/* Role-based redirect */}
              <Route path="/redirect" element={<RoleBasedRedirect />} />
              
              {/* Admin Dashboard Routes */}
              <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
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
              <Route path="/admin/resources" element={<ProtectedRoute><AdminResources /></ProtectedRoute>} />
              <Route path="/admin/directory" element={<ProtectedRoute requireAdmin><AdminDirectory /></ProtectedRoute>} />
              
              {/* Partner Routes */}
              <Route path="/partner/dashboard" element={<ProtectedRoute><PartnerDashboard /></ProtectedRoute>} />
              <Route path="/partner/profile" element={<ProtectedRoute><PartnerProfile /></ProtectedRoute>} />
              
              {/* Owner PWA Routes */}
              <Route path="/owner" element={<ProtectedRoute><OwnerChat /></ProtectedRoute>} />
              <Route path="/owner/chat/:deviceId" element={<ProtectedRoute><OwnerChatDetail /></ProtectedRoute>} />
              <Route path="/owner/vehicles" element={<ProtectedRoute><OwnerVehicles /></ProtectedRoute>} />
              <Route path="/owner/vehicle/:deviceId" element={<ProtectedRoute><OwnerVehicleProfile /></ProtectedRoute>} />
              <Route path="/owner/wallet" element={<ProtectedRoute><OwnerWallet /></ProtectedRoute>} />
              <Route path="/owner/profile" element={<ProtectedRoute><OwnerProfile /></ProtectedRoute>} />
              <Route path="/owner/notifications" element={<ProtectedRoute><OwnerNotificationSettings /></ProtectedRoute>} />
              <Route path="/owner/privacy" element={<ProtectedRoute><OwnerPrivacy /></ProtectedRoute>} />
              <Route path="/owner/resources" element={<ProtectedRoute><OwnerResources /></ProtectedRoute>} />
              <Route path="/owner/directory" element={<ProtectedRoute><OwnerDirectory /></ProtectedRoute>} />
              
              <Route path="*" element={<NotFound />} />
            </Routes>
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
