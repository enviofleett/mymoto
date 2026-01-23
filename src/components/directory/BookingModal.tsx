import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Calendar, Clock, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { getStaticMapUrl } from "@/utils/mapbox-geocoding";

interface ServiceProvider {
  id: string;
  business_name: string;
  contact_person: string | null;
  phone: string;
  profile_data: {
    logo_url?: string;
    description?: string;
    location?: {
      lat: number;
      lng: number;
      address: string;
    };
    perks?: string[];
  };
  category?: {
    name: string;
  };
}

interface BookingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: ServiceProvider;
  onSuccess?: () => void;
}

export default function BookingModal({
  open,
  onOpenChange,
  provider,
  onSuccess,
}: BookingModalProps) {
  const { user } = useAuth();
  const [bookingDate, setBookingDate] = useState("");
  const [bookingTime, setBookingTime] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Set minimum date to today
  const today = new Date().toISOString().split('T')[0];

  const handleSubmit = async () => {
    if (!user?.id) {
      toast.error('Please log in to book a service');
      return;
    }

    if (!bookingDate) {
      toast.error('Please select a date');
      return;
    }

    setIsSubmitting(true);
    try {
      // Create booking
      const { error: bookingError } = await supabase
        .from('directory_bookings')
        .insert({
          user_id: user.id,
          provider_id: provider.id,
          booking_date: bookingDate,
          booking_time: bookingTime || null,
          notes: notes.trim() || null,
          status: 'pending',
        });

      if (bookingError) {
        if (bookingError.code === '23505') {
          // Unique constraint violation
          toast.error('You already have a booking with this provider on this date');
        } else {
          throw bookingError;
        }
        return;
      }

      // Notify provider
      await supabase.functions.invoke('notify-booking', {
        body: {
          providerId: provider.id,
          bookingDate,
          bookingTime,
        },
      });

      toast.success('Booking created successfully!');
      onSuccess?.();
      onOpenChange(false);
      
      // Reset form
      setBookingDate("");
      setBookingTime("");
      setNotes("");
    } catch (error: any) {
      console.error('Booking error:', error);
      toast.error('Failed to create booking', { description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const location = provider.profile_data?.location;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{provider.business_name}</DialogTitle>
          <DialogDescription>
            Book a visit with {provider.business_name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Provider Info Summary */}
          <div className="space-y-2">
            {provider.category && (
              <Badge variant="secondary">{provider.category.name}</Badge>
            )}
            {provider.profile_data?.description && (
              <p className="text-sm text-muted-foreground">
                {provider.profile_data.description}
              </p>
            )}
          </div>

          {/* Location Map */}
          {location && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">{location.address}</span>
              </div>
              <img
                src={getStaticMapUrl(location.lng, location.lat, 400, 200)}
                alt="Location map"
                className="w-full h-32 object-cover rounded-lg border"
              />
            </div>
          )}

          {/* Booking Form */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="booking-date">
                <Calendar className="h-4 w-4 inline mr-2" />
                Date *
              </Label>
              <Input
                id="booking-date"
                type="date"
                value={bookingDate}
                onChange={(e) => setBookingDate(e.target.value)}
                min={today}
                className="mt-1"
                required
              />
            </div>

            <div>
              <Label htmlFor="booking-time">
                <Clock className="h-4 w-4 inline mr-2" />
                Time (Optional)
              </Label>
              <Input
                id="booking-time"
                type="time"
                value={bookingTime}
                onChange={(e) => setBookingTime(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="notes">Additional Notes (Optional)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any special requests or notes..."
                rows={3}
                className="mt-1"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !bookingDate}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Booking...
              </>
            ) : (
              <>
                <Calendar className="h-4 w-4 mr-2" />
                Confirm Booking
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
