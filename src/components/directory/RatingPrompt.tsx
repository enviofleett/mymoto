import { useState, useEffect } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Star, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface RatingPromptProps {
  bookingId: string;
  providerName: string;
  onSuccess?: () => void;
}

export default function RatingPrompt({
  bookingId,
  providerName,
  onSuccess,
}: RatingPromptProps) {
  const { user } = useAuth();
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [open, setOpen] = useState(true);

  // Check if rating already exists
  useEffect(() => {
    const checkExistingRating = async () => {
      if (!user?.id) return;

      const { data } = await supabase
        .from('provider_ratings')
        .select('id')
        .eq('booking_id', bookingId)
        .single();

      if (data) {
        // Rating already exists, close dialog
        setOpen(false);
      }
    };

    checkExistingRating();
  }, [bookingId, user?.id]);

  const handleSubmit = async () => {
    if (!user?.id) {
      toast.error('Please log in to submit a rating');
      return;
    }

    if (rating === 0) {
      toast.error('Please select a rating');
      return;
    }

    setIsSubmitting(true);
    try {
      // Get provider_id from booking
      const { data: booking, error: bookingError } = await supabase
        .from('directory_bookings')
        .select('provider_id')
        .eq('id', bookingId)
        .single();

      if (bookingError || !booking) {
        throw bookingError || new Error('Booking not found');
      }

      // Create rating
      const { error: ratingError } = await supabase
        .from('provider_ratings')
        .insert({
          booking_id: bookingId,
          provider_id: booking.provider_id,
          user_id: user.id,
          rating,
          comment: comment.trim() || null,
        });

      if (ratingError) {
        throw ratingError;
      }

      toast.success('Thank you for your feedback!');
      setOpen(false);
      onSuccess?.();
    } catch (error: unknown) {
      console.error('Rating error:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error('Failed to submit rating', { description: message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rate Your Experience</DialogTitle>
          <DialogDescription>
            How was your experience at {providerName}?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Star Rating */}
          <div>
            <Label>Rating *</Label>
            <div className="flex gap-2 mt-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoveredRating(star)}
                  onMouseLeave={() => setHoveredRating(0)}
                  className="focus:outline-none"
                >
                  <Star
                    className={cn(
                      "h-8 w-8 transition-colors",
                      star <= (hoveredRating || rating)
                        ? "fill-yellow-400 text-yellow-400"
                        : "text-muted-foreground"
                    )}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Comment */}
          <div>
            <Label htmlFor="comment">Comment (Optional)</Label>
            <Textarea
              id="comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Share your experience..."
              rows={4}
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Skip
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || rating === 0}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              "Submit Rating"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
