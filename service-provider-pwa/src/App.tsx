import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AuthProvider } from './contexts/AuthContext';
import ProviderAuth from './pages/ProviderAuth';
import ProviderDashboard from './pages/ProviderDashboard';
import ProviderProfile from './pages/ProviderProfile';
import ProviderServices from './pages/ProviderServices';
import ProviderBookings from './pages/ProviderBookings';
import ProtectedRoute from './components/ProtectedRoute';
// Styles are loaded from ./index.css in main.tsx

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router basename="/partner">
          <div className="min-h-[100dvh] pb-[env(safe-area-inset-bottom)] bg-gradient-to-br from-blue-50 to-indigo-100">
            <Routes>
              {/* Public routes */}
              <Route path="/auth" element={<ProviderAuth />} />
              
              {/* Protected routes */}
              <Route path="/dashboard" element={
                <ProtectedRoute>
                  <ProviderDashboard />
                </ProtectedRoute>
              } />
              <Route path="/profile" element={
                <ProtectedRoute>
                  <ProviderProfile />
                </ProtectedRoute>
              } />
              <Route path="/services" element={
                <ProtectedRoute>
                  <ProviderServices />
                </ProtectedRoute>
              } />
              <Route path="/bookings" element={
                <ProtectedRoute>
                  <ProviderBookings />
                </ProtectedRoute>
              } />
              
              {/* Redirect root to dashboard if authenticated, otherwise to auth */}
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              
              {/* Catch all route */}
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
            
            <Toaster 
              position="top-right"
              toastOptions={{
                className: 'bg-card border border-border shadow-provider',
                duration: 4000,
              }}
            />
          </div>
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
