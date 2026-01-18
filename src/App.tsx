import { useState, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import SplashScreen from "@/components/SplashScreen";
import { TermsChecker } from "@/components/auth/TermsChecker";
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

const queryClient = new QueryClient();

// Check if running as installed PWA
const isPWA = window.matchMedia('(display-mode: standalone)').matches ||
  (window.navigator as any).standalone === true;

const App = () => {
  const [showSplash, setShowSplash] = useState(isPWA);

  return (
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
              
              {/* Admin Dashboard Routes */}
              <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
              <Route path="/fleet" element={<ProtectedRoute><Fleet /></ProtectedRoute>} />
              <Route path="/map" element={<Navigate to="/fleet" replace />} />
              <Route path="/insights" element={<ProtectedRoute><Insights /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
              <Route path="/profile" element={<Navigate to="/settings" replace />} />
              <Route path="/notifications" element={<ProtectedRoute><NotificationSettings /></ProtectedRoute>} />
              <Route path="/admin/wallets" element={<ProtectedRoute><AdminWallets /></ProtectedRoute>} />
              <Route path="/admin/storage" element={<ProtectedRoute><AdminStorage /></ProtectedRoute>} />
              <Route path="/admin/alerts" element={<ProtectedRoute><AdminAlerts /></ProtectedRoute>} />
              <Route path="/admin/ai-settings" element={<ProtectedRoute><AdminAiSettings /></ProtectedRoute>} />
              <Route path="/admin/assignments" element={<ProtectedRoute><AdminAssignments /></ProtectedRoute>} />
              <Route path="/admin/privacy-settings" element={<ProtectedRoute><AdminPrivacySettings /></ProtectedRoute>} />
              <Route path="/admin/email-templates" element={<ProtectedRoute><AdminEmailTemplates /></ProtectedRoute>} />
              
              {/* Owner PWA Routes */}
              <Route path="/owner" element={<ProtectedRoute><OwnerChat /></ProtectedRoute>} />
              <Route path="/owner/chat/:deviceId" element={<ProtectedRoute><OwnerChatDetail /></ProtectedRoute>} />
              <Route path="/owner/vehicles" element={<ProtectedRoute><OwnerVehicles /></ProtectedRoute>} />
              <Route path="/owner/vehicle/:deviceId" element={<ProtectedRoute><OwnerVehicleProfile /></ProtectedRoute>} />
              <Route path="/owner/wallet" element={<ProtectedRoute><OwnerWallet /></ProtectedRoute>} />
              <Route path="/owner/profile" element={<ProtectedRoute><OwnerProfile /></ProtectedRoute>} />
              <Route path="/owner/notifications" element={<ProtectedRoute><OwnerNotificationSettings /></ProtectedRoute>} />
              
              <Route path="*" element={<NotFound />} />
            </Routes>
            </TermsChecker>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
