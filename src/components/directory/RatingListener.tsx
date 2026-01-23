import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import RatingPrompt from "./RatingPrompt";

interface CompletedBooking {
  id: string;
  provider_id: string;
  fulfilled_at: string;
  service_providers: {
    business_name: string;
  };
}

export default function RatingListener() {
  const { user, isLoading } = useAuth();
  const [pendingRating, setPendingRating] = useState<CompletedBooking | null>(null);

  useEffect(() => {
    if (isLoading || !user?.id) return;

    // Subscribe to booking changes
    const channel = supabase
      .channel('booking-rating-listener')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'directory_bookings',
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          const booking = payload.new as any;
          
          // Check if booking was just completed
          if (
            booking.status === 'completed' &&
            booking.fulfilled_at &&
            payload.old.status !== 'completed'
          ) {
            // Fetch provider name
            const { data: provider } = await supabase
              .from('service_providers')
              .select('business_name')
              .eq('id', booking.provider_id)
              .single();

            if (provider) {
              setPendingRating({
                id: booking.id,
                provider_id: booking.provider_id,
                fulfilled_at: booking.fulfilled_at,
                service_providers: {
                  business_name: provider.business_name,
                },
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, isLoading]);

  if (!pendingRating) return null;

  return (
    <RatingPrompt
      bookingId={pendingRating.id}
      providerName={pendingRating.service_providers.business_name}
      onSuccess={() => setPendingRating(null)}
    />
  );
}
