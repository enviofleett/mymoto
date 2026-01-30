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
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { extractCity } from "@/utils/mapbox-geocoding";
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
  avg_rating?: number;
  review_count?: number;
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
      // @ts-ignore
      const { data, error } = await (supabase as any)
        .from('directory_categories')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      
      if (error) throw error;
      return data as any[];
    },
  });

  // Fetch provider stats
  const { data: stats = [] } = useQuery({
    queryKey: ['provider-stats'],
    queryFn: async () => {
      // @ts-ignore
      const { data, error } = await (supabase as any)
        .from('provider_stats_view')
        .select('*');
      
      if (error) {
        console.warn('Failed to fetch provider stats (view might not exist yet):', error);
        return [];
      }
      return data as any[];
    },
  });

  // Fetch approved providers
  const { data: providers = [], isLoading } = useQuery({
    queryKey: ['approved-providers'],
    queryFn: async () => {
      // @ts-ignore
      const { data, error } = await (supabase as any)
        .from('service_providers')
        .select(`
          *,
          category:directory_categories(*)
        `)
        .eq('approval_status', 'approved')
        .eq('is_active', true);
      
      if (error) throw error;
      
      // Transform data to match ServiceProvider interface
      return (data as any[]).map(provider => ({
        ...provider,
        category: provider.category
      })) as ServiceProvider[];
    },
  });

  // Merge stats into providers
  const providersWithStats = useMemo(() => {
    return providers.map(p => {
      const stat = stats.find((s: any) => s.provider_id === p.id);
      return {
        ...p,
        avg_rating: stat?.avg_rating || 0,
        review_count: stat?.review_count || 0
      };
    });
  }, [providers, stats]);

  // Extract unique cities from providers
  const cities = useMemo(() => {
    const citySet = new Set<string>();
    providersWithStats.forEach(p => {
      if (p.profile_data?.location?.address) {
        const city = extractCity(p.profile_data.location.address);
        if (city) citySet.add(city);
      }
    });
    return Array.from(citySet).sort();
  }, [providersWithStats]);

  // Filter providers
  const filteredProviders = useMemo(() => {
    return providersWithStats.filter(p => {
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
  }, [providersWithStats, selectedCategory, selectedCity, searchQuery]);

  const handleBookVisit = (provider: ServiceProvider) => {
    setSelectedProvider(provider);
    setBookingModalOpen(true);
  };

  return (
    <OwnerLayout>
      <div className="space-y-4 px-4 pb-32 pt-4">
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
                        <div className="flex items-center gap-1 text-sm mt-1">
                          <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                          <span className="font-medium">{provider.avg_rating || "New"}</span>
                          {provider.review_count ? (
                            <span className="text-muted-foreground">({provider.review_count})</span>
                          ) : null}
                        </div>
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
