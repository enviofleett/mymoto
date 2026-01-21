import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Store, MapPin, Star, Clock, Phone, Mail, Loader2, Navigation, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface ServiceCategory {
  id: string;
  name: string;
  icon: string | null;
}

interface Provider {
  id: string;
  business_name: string;
  description: string | null;
  logo_url: string | null;
  contact_phone: string | null;
  address: string | null;
  latitude: number;
  longitude: number;
  distance_km: number;
  average_rating: number;
  total_ratings: number;
  category_id: string | null;
  category_name: string | null;
  services: Service[];
}

interface Service {
  id: string;
  title: string;
  description: string | null;
  price: number;
  currency: string;
  duration_minutes: number | null;
  image_url: string | null;
}

export default function Marketplace() {
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [bookingDate, setBookingDate] = useState<Date>();
  const [bookingTime, setBookingTime] = useState("");
  const [bookingNotes, setBookingNotes] = useState("");
  const [bookingDialogOpen, setBookingDialogOpen] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const { toast } = useToast();

  // Fetch categories
  useEffect(() => {
    const fetchCategories = async () => {
      const { data, error } = await supabase
        .from("service_categories")
        .select("id, name, icon")
        .eq("is_active", true)
        .order("display_order", { ascending: true });

      if (error) {
        console.error("Error fetching categories:", error);
        // If table doesn't exist, show user-friendly message
        if (error.code === 'PGRST205' || error.code === '42P01') {
          setSetupError("Marketplace feature is being set up. Database migrations need to be run. Please contact support.");
        }
      } else {
        setCategories(data || []);
        setSetupError(null); // Clear error if successful
      }
    };

    fetchCategories();
  }, []);

  // Request user location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lon: position.coords.longitude,
          });
          setLocationError(null);
        },
        (error) => {
          console.error("Geolocation error:", error);
          setLocationError("Unable to get your location. Please enable location services.");
          // Default to Lagos, Nigeria if location unavailable
          setUserLocation({ lat: 6.5244, lon: 3.3792 });
        }
      );
    } else {
      setLocationError("Geolocation is not supported by your browser.");
      setUserLocation({ lat: 6.5244, lon: 3.3792 }); // Default to Lagos
    }
  }, []);

  // Search providers when location or category changes
  useEffect(() => {
    if (userLocation) {
      searchProviders();
    }
  }, [userLocation, selectedCategory]);

  const searchProviders = async () => {
    if (!userLocation) return;

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("Missing Supabase environment variables");
      toast({
        title: "Configuration Error",
        description: "Marketplace service is not properly configured. Please contact support.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/marketplace-search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
          latitude: userLocation.lat,
          longitude: userLocation.lon,
          radius_km: 10,
          category_id: selectedCategory === "all" ? null : selectedCategory,
          limit: 50,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = "Failed to search providers";
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error || errorMessage;
        } catch {
          // If response isn't JSON, use default message
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      setProviders(data.providers || []);
    } catch (error: any) {
      console.error("Error searching providers:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to search providers. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBookService = (provider: Provider, service: Service) => {
    setSelectedProvider(provider);
    setSelectedService(service);
    setBookingDate(undefined);
    setBookingTime("");
    setBookingNotes("");
    setBookingDialogOpen(true);
  };

  const submitBooking = async () => {
    if (!selectedProvider || !selectedService || !bookingDate || !bookingTime) {
      toast({
        title: "Error",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    // Combine date and time
    const [hours, minutes] = bookingTime.split(":").map(Number);
    const scheduledAt = new Date(bookingDate);
    scheduledAt.setHours(hours, minutes, 0, 0);

    if (scheduledAt < new Date()) {
      toast({
        title: "Error",
        description: "Please select a future date and time.",
        variant: "destructive",
      });
      return;
    }

    setBookingLoading(true);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        throw new Error("Please log in to book a service");
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      if (!supabaseUrl) {
        throw new Error("Service configuration error. Please contact support.");
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/booking-handler`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          service_id: selectedService.id,
          scheduled_at: scheduledAt.toISOString(),
          customer_notes: bookingNotes || null,
        }),
      });

      if (!response.ok) {
        let errorMessage = "Failed to create booking";
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          // If response isn't JSON, use default message
        }
        throw new Error(errorMessage);
      }

      toast({
        title: "Success",
        description: "Booking created successfully! The provider will confirm your appointment.",
      });

      setBookingDialogOpen(false);
      setSelectedProvider(null);
      setSelectedService(null);
    } catch (error: any) {
      console.error("Error creating booking:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create booking. Please try again.",
        variant: "destructive",
      });
    } finally {
      setBookingLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Store className="h-8 w-8" />
              Marketplace
            </h1>
            <p className="text-muted-foreground">Find and book services near you</p>
          </div>
        </div>

        {/* Setup Error Message */}
        {setupError && (
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-full bg-destructive/10">
                  <Store className="h-5 w-5 text-destructive" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-destructive">Marketplace Not Available</h3>
                  <p className="text-sm text-muted-foreground mt-1">{setupError}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Please run the database migrations from <code className="bg-muted px-1 rounded">DEPLOY_MARKETPLACE_MIGRATIONS.sql</code> in Supabase SQL Editor.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <Label>Category</Label>
                <Select value={selectedCategory} onValueChange={setSelectedCategory} disabled={!!setupError}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button onClick={searchProviders} variant="outline" disabled={loading || !!setupError}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Navigation className="h-4 w-4 mr-2" />}
                  Refresh
                </Button>
              </div>
            </div>
            {locationError && (
              <div className="text-sm text-muted-foreground">{locationError}</div>
            )}
            {userLocation && (
              <div className="text-sm text-muted-foreground">
                Searching within 10km of your location
              </div>
            )}
          </CardContent>
        </Card>

        {/* Providers Grid */}
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2 mt-2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-20 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : providers.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Store className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No providers found in your area.</p>
              <p className="text-sm text-muted-foreground mt-2">
                Try expanding your search radius or check back later.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {providers.map((provider) => (
              <Card key={provider.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg">{provider.business_name}</CardTitle>
                      {provider.category_name && (
                        <Badge variant="secondary" className="mt-1">
                          {provider.category_name}
                        </Badge>
                      )}
                    </div>
                    {provider.logo_url && (
                      <img
                        src={provider.logo_url}
                        alt={provider.business_name}
                        className="h-12 w-12 rounded-lg object-cover"
                      />
                    )}
                  </div>
                  <CardDescription className="line-clamp-2">{provider.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    {provider.distance_km && (
                      <div className="flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        {provider.distance_km.toFixed(1)}km
                      </div>
                    )}
                    {provider.average_rating > 0 && (
                      <div className="flex items-center gap-1">
                        <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                        {provider.average_rating.toFixed(1)} ({provider.total_ratings})
                      </div>
                    )}
                  </div>

                  {provider.services.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-xs">Services:</Label>
                      {provider.services.slice(0, 3).map((service) => (
                        <div
                          key={service.id}
                          className="flex items-center justify-between p-2 bg-muted rounded-lg"
                        >
                          <div className="flex-1">
                            <p className="text-sm font-medium">{service.title}</p>
                            <p className="text-xs text-muted-foreground">
                              ₦{service.price.toLocaleString()}
                              {service.duration_minutes && ` • ${service.duration_minutes} min`}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => handleBookService(provider, service)}
                          >
                            Book
                          </Button>
                        </div>
                      ))}
                      {provider.services.length > 3 && (
                        <p className="text-xs text-muted-foreground text-center">
                          +{provider.services.length - 3} more services
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Booking Dialog */}
        <Dialog open={bookingDialogOpen} onOpenChange={setBookingDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Book Service</DialogTitle>
              <DialogDescription>
                {selectedProvider?.business_name} - {selectedService?.title}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !bookingDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {bookingDate ? format(bookingDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={bookingDate}
                      onSelect={setBookingDate}
                      disabled={(date) => date < new Date()}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label>Time</Label>
                <Input
                  type="time"
                  value={bookingTime}
                  onChange={(e) => setBookingTime(e.target.value)}
                />
              </div>
              <div>
                <Label>Notes (optional)</Label>
                <Input
                  placeholder="Any special requests..."
                  value={bookingNotes}
                  onChange={(e) => setBookingNotes(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setBookingDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={submitBooking} disabled={bookingLoading}>
                {bookingLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Confirm Booking
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
