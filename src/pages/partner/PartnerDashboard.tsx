import { useNavigate } from "react-router-dom";
import { OwnerLayout } from "@/components/layouts/OwnerLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Calendar,
  CheckCircle2,
  Clock,
  Star,
  Edit,
  TrendingUp,
  Loader2,
  Package,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatLagos } from "@/lib/timezone";

interface Booking {
  id: string;
  user_id: string;
  provider_id: string;
  booking_date: string;
  booking_time: string | null;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  fulfilled_at: string | null;
  notes: string | null;
  created_at: string;
  user?: {
    email: string;
    profiles?: {
      name: string | null;
    };
  };
}

interface ProviderMetrics {
  totalCompleted: number;
  pendingBookings: number;
  averageRating: number;
}

interface ProviderProfile {
  id: string;
  business_name: string;
  approval_status: 'pending' | 'approved' | 'rejected' | 'needs_reapproval';
}

export default function PartnerDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch provider profile
  const { data: provider, isLoading: providerLoading } = useQuery({
    queryKey: ['provider-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      
      const { data, error } = await supabase
        .from('service_providers')
        .select('id, business_name, approval_status')
        .eq('user_id', user.id)
        .single();
      
      if (error) throw error;
      return data as ProviderProfile;
    },
    enabled: !!user?.id,
  });

  // Fetch bookings
  const { data: bookings = [], isLoading: bookingsLoading } = useQuery({
    queryKey: ['provider-bookings', provider?.id],
    queryFn: async () => {
      if (!provider?.id) return [];
      
      const { data, error } = await supabase
        .from('directory_bookings')
        .select(`
          *,
          user:user_id (
            email,
            profiles (
              name
            )
          )
        `)
        .eq('provider_id', provider.id)
        .in('status', ['pending', 'confirmed'])
        .order('booking_date', { ascending: true });
      
      if (error) throw error;
      return data as unknown as Booking[];
    },
    enabled: !!provider?.id,
  });

  // Fetch metrics
  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['provider-metrics', provider?.id],
    queryFn: async (): Promise<ProviderMetrics> => {
      if (!provider?.id) {
        return { totalCompleted: 0, pendingBookings: 0, averageRating: 0 };
      }

      // Get completed bookings count
      const { count: completedCount } = await supabase
        .from('directory_bookings')
        .select('*', { count: 'exact', head: true })
        .eq('provider_id', provider.id)
        .eq('status', 'completed');

      // Get pending bookings count
      const { count: pendingCount } = await supabase
        .from('directory_bookings')
        .select('*', { count: 'exact', head: true })
        .eq('provider_id', provider.id)
        .in('status', ['pending', 'confirmed']);

      // Get average rating
      const { data: ratings } = await supabase
        .from('provider_ratings')
        .select('rating')
        .eq('provider_id', provider.id);

      const ratingValues = (ratings || []) as Array<{ rating: number }>;
      const avgRating = ratingValues.length > 0
        ? ratingValues.reduce((sum, r) => sum + r.rating, 0) / ratingValues.length
        : 0;

      return {
        totalCompleted: completedCount || 0,
        pendingBookings: pendingCount || 0,
        averageRating: Math.round(avgRating * 10) / 10,
      };
    },
    enabled: !!provider?.id,
  });

  // Mark booking as delivered
  const markDelivered = useMutation({
    mutationFn: async (bookingId: string) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('directory_bookings')
        .update({
          status: 'completed',
          fulfilled_at: new Date().toISOString(),
          fulfilled_by: user.id,
        })
        .eq('id', bookingId);
      
      if (error) throw error;

      // Notify user
      await supabase.functions.invoke('notify-fulfillment', {
        body: { bookingId },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['provider-bookings'] });
      queryClient.invalidateQueries({ queryKey: ['provider-metrics'] });
      toast.success('Booking marked as delivered');
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error('Failed to mark as delivered', { description: message });
    },
  });

  const canMarkDelivered = (bookingDate: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const booking = new Date(bookingDate);
    booking.setHours(0, 0, 0, 0);
    return booking <= today;
  };

  const getUserName = (booking: Booking) => {
    if (booking.user?.profiles?.name) {
      return booking.user.profiles.name;
    }
    if (booking.user?.email) {
      return booking.user.email.split('@')[0];
    }
    return 'User';
  };

  if (providerLoading) {
    return (
      <OwnerLayout>
        <div className="space-y-4 p-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </OwnerLayout>
    );
  }

  // Redirect if not found
  if (!provider) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center">
        <h2 className="text-2xl font-bold mb-2">Partner Profile Not Found</h2>
        <p className="text-muted-foreground mb-4">You need to register as a service provider to view this dashboard.</p>
        <Button onClick={() => navigate('/partner/signup')}>Register Now</Button>
      </div>
    );
  }

  if (provider.approval_status !== 'approved') {
    const statusCopy =
      provider.approval_status === 'pending'
        ? 'Your registration is pending approval.'
        : provider.approval_status === 'needs_reapproval'
          ? 'Your profile changes are pending re-approval.'
          : 'Your registration was rejected. Please update your profile or contact support.';

    return (
      <OwnerLayout>
        <div className="space-y-4 p-4">
          <Card>
            <CardContent className="pt-6 text-center space-y-2">
              <h2 className="text-xl font-semibold">Approval Required</h2>
              <p className="text-muted-foreground">{statusCopy}</p>
              <div className="flex items-center justify-center gap-2 pt-2">
                <Button onClick={() => navigate('/partner/profile')} variant="outline">
                  Update Profile
                </Button>
                <Button onClick={() => navigate('/auth')}>
                  Sign Out
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </OwnerLayout>
    );
  }

  return (
    <OwnerLayout>
      <div className="space-y-4 p-4">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Partner Dashboard</h1>
          <p className="text-muted-foreground">{provider.business_name}</p>
        </div>

        {/* Metrics Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Performance Metrics
            </CardTitle>
          </CardHeader>
          <CardContent>
            {metricsLoading ? (
              <div className="grid grid-cols-3 gap-4">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-foreground">
                    {metrics?.totalCompleted || 0}
                  </div>
                  <div className="text-sm text-muted-foreground">Completed</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-foreground">
                    {metrics?.pendingBookings || 0}
                  </div>
                  <div className="text-sm text-muted-foreground">Pending</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-foreground flex items-center justify-center gap-1">
                    <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                    {metrics?.averageRating || 0}
                  </div>
                  <div className="text-sm text-muted-foreground">Avg Rating</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Booking Requests */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Booking Requests
            </CardTitle>
            <CardDescription>
              Upcoming appointments that need attention
            </CardDescription>
          </CardHeader>
          <CardContent>
            {bookingsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : bookings.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No upcoming bookings
              </div>
            ) : (
              <div className="space-y-2">
                {bookings.map((booking) => (
                  <div
                    key={booking.id}
                    className="flex items-center justify-between p-4 rounded-lg border bg-card"
                  >
                    <div className="flex-1">
                      <div className="font-medium">{getUserName(booking)}</div>
                      <div className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                        <Calendar className="h-3 w-3" />
                        {formatLagos(new Date(booking.booking_date), 'MMM dd, yyyy')}
                        {booking.booking_time && (
                          <>
                            <Clock className="h-3 w-3 ml-2" />
                            {booking.booking_time}
                          </>
                        )}
                      </div>
                      {booking.notes && (
                        <div className="text-sm text-muted-foreground mt-1">
                          {booking.notes}
                        </div>
                      )}
                      <Badge variant="secondary" className="mt-2">
                        {booking.status}
                      </Badge>
                    </div>
                    <div className="ml-4">
                      <Button
                        size="sm"
                        onClick={() => markDelivered.mutate(booking.id)}
                        disabled={
                          !canMarkDelivered(booking.booking_date) ||
                          markDelivered.isPending ||
                          booking.status === 'completed'
                        }
                      >
                        {markDelivered.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <CheckCircle2 className="h-4 w-4 mr-1" />
                            Mark Delivered
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => navigate('/partner/profile')}
            >
              <Edit className="h-4 w-4 mr-2" />
              Edit Profile
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => {
                // Navigate to performance report (can be implemented later)
                toast.info('Performance report coming soon');
              }}
            >
              <Package className="h-4 w-4 mr-2" />
              View Performance Report
            </Button>
          </CardContent>
        </Card>
      </div>
    </OwnerLayout>
  );
}
