import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, Calendar, Users, Wrench, DollarSign, TrendingUp } from 'lucide-react';

const ProviderDashboard = () => {
  const { user, providerProfile, signOut } = useAuth();
  const [stats, setStats] = useState({
    totalServices: 0,
    pendingServices: 0,
    completedServices: 0,
    totalRevenue: 0,
  });

  useEffect(() => {
    // Simulate loading stats data
    const timer = setTimeout(() => {
      setStats({
        totalServices: 47,
        pendingServices: 8,
        completedServices: 39,
        totalRevenue: 125000,
      });
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
    }).format(amount);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white border-b border-blue-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <Building2 className="h-8 w-8 text-blue-600" />
              <div>
                <h1 className="text-xl font-bold text-blue-900">Service Provider Portal</h1>
                <p className="text-sm text-blue-600">Welcome back, {providerProfile?.business_name}</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <Button
                variant="outline"
                className="text-blue-600 border-blue-200 hover:bg-blue-50"
                onClick={() => signOut()}
              >
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Stats Cards */}
          <Card className="border-blue-200 bg-white/80 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-blue-800">Total Services</CardTitle>
              <Wrench className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-900">{stats.totalServices}</div>
              <p className="text-xs text-blue-600">All time services</p>
            </CardContent>
          </Card>

          <Card className="border-orange-200 bg-white/80 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-orange-800">Pending</CardTitle>
              <Calendar className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-900">{stats.pendingServices}</div>
              <p className="text-xs text-orange-600">Awaiting completion</p>
            </CardContent>
          </Card>

          <Card className="border-green-200 bg-white/80 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-green-800">Completed</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-900">{stats.completedServices}</div>
              <p className="text-xs text-green-600">Successful services</p>
            </CardContent>
          </Card>

          <Card className="border-purple-200 bg-white/80 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-purple-800">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-900">{formatCurrency(stats.totalRevenue)}</div>
              <p className="text-xs text-purple-600">Total earnings</p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="border-blue-200 bg-white/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-blue-900">Quick Actions</CardTitle>
              <CardDescription className="text-blue-600">
                Manage your service operations
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                View Service Requests
              </Button>
              <Button variant="outline" className="w-full border-blue-200 text-blue-600 hover:bg-blue-50">
                Update Availability
              </Button>
              <Button variant="outline" className="w-full border-blue-200 text-blue-600 hover:bg-blue-50">
                Manage Profile
              </Button>
            </CardContent>
          </Card>

          <Card className="border-green-200 bg-white/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-green-900">Recent Activity</CardTitle>
              <CardDescription className="text-green-600">
                Latest service updates
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Oil Change Service</span>
                  <span className="text-green-600 font-medium">Completed</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Brake Inspection</span>
                  <span className="text-orange-600 font-medium">Pending</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Tire Replacement</span>
                  <span className="text-green-600 font-medium">Completed</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-blue-200 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-blue-600">
              MyMoto Service Provider Portal v1.0
            </p>
            <p className="text-sm text-blue-600">
              {user?.email}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default ProviderDashboard;