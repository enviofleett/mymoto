import { useState, useMemo } from "react";
import { OwnerLayout } from "@/components/layouts/OwnerLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MapPin,
  Star,
  Calendar,
  Search,
  Filter,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { extractCity, getStaticMapUrl } from "@/utils/mapbox-geocoding";
import BookingModal from "@/components/directory/BookingModal";

interface ServiceProvider {
  id: string;
  category_id: string | null;
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
    id: string;
    name: string;
    icon: string | null;
  };
}

export default function OwnerDirectory() {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedCity, setSelectedCity] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<ServiceProvider | null>(null);
  const [bookingModalOpen, setBookingModalOpen] = useState(false);

  // Fetch categories
  const { data: categories = [] } = useQuery({
    queryKey: ['directory-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('directory_categories')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch approved providers
  const { data: providers = [], isLoading } = useQuery({
    queryKey: ['approved-providers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_providers')
        .select(`
          *,
          category:directory_categories(*)
        `)
        .eq('approval_status', 'approved')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as ServiceProvider[];
    },
  });

  // Extract unique cities from providers
  const cities = useMemo(() => {
    const citySet = new Set<string>();
    providers.forEach(p => {
      if (p.profile_data?.location?.address) {
        const city = extractCity(p.profile_data.location.address);
        if (city) citySet.add(city);
      }
    });
    return Array.from(citySet).sort();
  }, [providers]);

  // Filter providers
  const filteredProviders = useMemo(() => {
    return providers.filter(p => {
      const matchesCategory = selectedCategory === "all" || p.category_id === selectedCategory;
      const matchesCity = selectedCity === "all" || 
        (p.profile_data?.location?.address && 
         extractCity(p.profile_data.location.address) === selectedCity);
      const matchesSearch = searchQuery === "" ||
        p.business_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.profile_data?.description && 
         p.profile_data.description.toLowerCase().includes(searchQuery.toLowerCase()));
      
      return matchesCategory && matchesCity && matchesSearch;
    });
  }, [providers, selectedCategory, selectedCity, searchQuery]);

  const handleBookVisit = (provider: ServiceProvider) => {
    setSelectedProvider(provider);
    setBookingModalOpen(true);
  };

  return (
    <OwnerLayout>
      <div className="space-y-4 p-4">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Service Directory</h1>
          <p className="text-muted-foreground">
            Find trusted service providers for your fleet
          </p>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search providers..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Category Filter - Horizontal Scroll */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Category</span>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                  <Button
                    variant={selectedCategory === "all" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedCategory("all")}
                    className="shrink-0"
                  >
                    All
                  </Button>
                  {categories.map((cat) => (
                    <Button
                      key={cat.id}
                      variant={selectedCategory === cat.id ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedCategory(cat.id)}
                      className="shrink-0"
                    >
                      {cat.icon && <span className="mr-1">{cat.icon}</span>}
                      {cat.name}
                    </Button>
                  ))}
                </div>
              </div>

              {/* City Filter */}
              <div>
                <Select value={selectedCity} onValueChange={setSelectedCity}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filter by city" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Cities</SelectItem>
                    {cities.map((city) => (
                      <SelectItem key={city} value={city}>
                        {city}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results Count */}
        <div className="text-sm text-muted-foreground">
          {filteredProviders.length} provider{filteredProviders.length !== 1 ? 's' : ''} found
        </div>

        {/* Provider Cards */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="pt-6">
                  <Skeleton className="h-48 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredProviders.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center py-12">
              <p className="text-muted-foreground">No providers found</p>
              <p className="text-sm text-muted-foreground mt-2">
                Try adjusting your filters
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredProviders.map((provider) => (
              <Card key={provider.id} className="overflow-hidden">
                <CardContent className="p-0">
                  {/* Logo/Image Header */}
                  {provider.profile_data?.logo_url && (
                    <div className="w-full h-48 bg-muted relative overflow-hidden">
                      <img
                        src={provider.profile_data.logo_url}
                        alt={provider.business_name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}

                  <div className="p-4 space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-bold text-lg">{provider.business_name}</h3>
                        {provider.category && (
                          <Badge variant="secondary" className="mt-1">
                            {provider.category.icon && (
                              <span className="mr-1">{provider.category.icon}</span>
                            )}
                            {provider.category.name}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Description */}
                    {provider.profile_data?.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {provider.profile_data.description}
                      </p>
                    )}

                    {/* Location */}
                    {provider.profile_data?.location && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <MapPin className="h-4 w-4 shrink-0" />
                        <span className="truncate">
                          {provider.profile_data.location.address}
                        </span>
                      </div>
                    )}

                    {/* Perks */}
                    {provider.profile_data?.perks && provider.profile_data.perks.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {provider.profile_data.perks.slice(0, 3).map((perk, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {perk}
                          </Badge>
                        ))}
                        {provider.profile_data.perks.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{provider.profile_data.perks.length - 3} more
                          </Badge>
                        )}
                      </div>
                    )}

                    {/* Action Button */}
                    <Button
                      className="w-full"
                      onClick={() => handleBookVisit(provider)}
                    >
                      <Calendar className="h-4 w-4 mr-2" />
                      Book Visit
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Booking Modal */}
      {selectedProvider && (
        <BookingModal
          open={bookingModalOpen}
          onOpenChange={setBookingModalOpen}
          provider={selectedProvider}
          onSuccess={() => {
            setBookingModalOpen(false);
            setSelectedProvider(null);
          }}
        />
      )}
    </OwnerLayout>
  );
}
