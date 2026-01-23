import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { OwnerLayout } from "@/components/layouts/OwnerLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Loader2,
  Upload,
  MapPin,
  Plus,
  X,
  AlertTriangle,
  Save,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { searchAddresses, getStaticMapUrl, type MapboxFeature } from "@/utils/mapbox-geocoding";

interface ProviderProfile {
  id: string;
  user_id: string;
  category_id: string | null;
  business_name: string;
  contact_person: string | null;
  phone: string;
  email: string | null;
  profile_data: {
    logo_url?: string;
    description?: string;
    location?: {
      lat: number;
      lng: number;
      address: string;
      mapbox_place_id?: string;
    };
    perks?: string[];
  };
  approval_status: 'pending' | 'approved' | 'rejected' | 'needs_reapproval';
}

export default function PartnerProfile() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [description, setDescription] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [locationSearch, setLocationSearch] = useState("");
  const [selectedLocation, setSelectedLocation] = useState<MapboxFeature | null>(null);
  const [locationResults, setLocationResults] = useState<MapboxFeature[]>([]);
  const [perks, setPerks] = useState<string[]>([]);
  const [newPerk, setNewPerk] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Fetch provider profile
  const { data: provider, isLoading } = useQuery({
    queryKey: ['provider-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      
      const { data, error } = await supabase
        .from('service_providers')
        .select('*')
        .eq('user_id', user.id)
        .single();
      
      if (error) throw error;
      return data as ProviderProfile;
    },
    enabled: !!user?.id,
    onSuccess: (data) => {
      if (data) {
        setDescription(data.profile_data?.description || "");
        setContactPerson(data.contact_person || "");
        if (data.profile_data?.location) {
          setLocationSearch(data.profile_data.location.address);
          // Reconstruct location from stored data
          setSelectedLocation({
            id: data.profile_data.location.mapbox_place_id || '',
            type: 'Feature',
            place_type: ['place'],
            relevance: 1,
            properties: {},
            text: '',
            place_name: data.profile_data.location.address,
            center: [data.profile_data.location.lng, data.profile_data.location.lat],
            geometry: {
              type: 'Point',
              coordinates: [data.profile_data.location.lng, data.profile_data.location.lat],
            },
          });
        }
        setPerks(data.profile_data?.perks || []);
        setLogoPreview(data.profile_data?.logo_url || null);
      }
    },
  });

  // Search locations
  useEffect(() => {
    if (locationSearch.length > 3) {
      const timeoutId = setTimeout(async () => {
        const results = await searchAddresses(locationSearch);
        setLocationResults(results);
      }, 300);
      return () => clearTimeout(timeoutId);
    } else {
      setLocationResults([]);
    }
  }, [locationSearch]);

  // Update profile mutation
  const updateProfile = useMutation({
    mutationFn: async (profileData: any) => {
      if (!provider?.id) throw new Error('Provider not found');

      const { error } = await supabase
        .from('service_providers')
        .update({
          contact_person: contactPerson || null,
          profile_data: profileData,
        })
        .eq('id', provider.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['provider-profile'] });
      toast.success(
        provider?.approval_status === 'approved'
          ? 'Profile updated. Changes require admin re-approval.'
          : 'Profile updated successfully'
      );
    },
    onError: (error: any) => {
      toast.error('Failed to update profile', { description: error.message });
    },
  });

  const handleLogoUpload = async (file: File) => {
    if (!provider?.id) return;

    setUploadingLogo(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${provider.id}/logo.${fileExt}`;
      const filePath = `provider-logos/${fileName}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('provider-logos')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('provider-logos')
        .getPublicUrl(filePath);

      setLogoPreview(urlData.publicUrl);
      toast.success('Logo uploaded successfully');
    } catch (error: any) {
      console.error('Error uploading logo:', error);
      toast.error('Failed to upload logo', { description: error.message });
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSubmit = async () => {
    if (description.length > 200) {
      toast.error('Description must be 200 characters or less');
      return;
    }

    if (!selectedLocation) {
      toast.error('Please select a location');
      return;
    }

    const profileData = {
      logo_url: logoPreview || provider?.profile_data?.logo_url,
      description: description.trim(),
      location: {
        lat: selectedLocation.geometry.coordinates[1],
        lng: selectedLocation.geometry.coordinates[0],
        address: selectedLocation.place_name,
        mapbox_place_id: selectedLocation.id,
      },
      perks: perks.filter(p => p.trim().length > 0),
    };

    updateProfile.mutate(profileData);
  };

  const addPerk = () => {
    if (newPerk.trim()) {
      setPerks([...perks, newPerk.trim()]);
      setNewPerk("");
    }
  };

  const removePerk = (index: number) => {
    setPerks(perks.filter((_, i) => i !== index));
  };

  if (isLoading) {
    return (
      <OwnerLayout>
        <div className="space-y-4 p-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      </OwnerLayout>
    );
  }

  if (!provider) {
    return (
      <OwnerLayout>
        <div className="space-y-4 p-4">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Provider profile not found. Please contact support.
            </AlertDescription>
          </Alert>
        </div>
      </OwnerLayout>
    );
  }

  const needsReapproval = provider.approval_status === 'approved';

  return (
    <OwnerLayout>
      <div className="space-y-4 p-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Edit Profile</h1>
          <p className="text-muted-foreground">{provider.business_name}</p>
        </div>

        {needsReapproval && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Your profile is approved. Any changes will require admin re-approval before going live.
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Business Information</CardTitle>
            <CardDescription>
              Update your business profile details
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Logo Upload */}
            <div>
              <Label>Business Logo</Label>
              <div className="mt-2 space-y-2">
                {logoPreview && (
                  <div className="relative w-32 h-32 rounded-lg overflow-hidden border">
                    <img
                      src={logoPreview}
                      alt="Logo preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setLogoFile(file);
                      handleLogoUpload(file);
                    }
                  }}
                  disabled={uploadingLogo}
                  className="cursor-pointer"
                />
                {uploadingLogo && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Uploading...
                  </div>
                )}
              </div>
            </div>

            {/* Contact Person */}
            <div>
              <Label htmlFor="contact-person">Contact Person Name</Label>
              <Input
                id="contact-person"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                placeholder="e.g., John Doe"
              />
            </div>

            {/* Description */}
            <div>
              <Label htmlFor="description">
                Description <span className="text-muted-foreground">({description.length}/200)</span>
              </Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => {
                  if (e.target.value.length <= 200) {
                    setDescription(e.target.value);
                  }
                }}
                placeholder="Brief description of your business (max 200 characters)"
                rows={4}
              />
            </div>

            {/* Location */}
            <div>
              <Label htmlFor="location">Business Location</Label>
              <div className="mt-2 space-y-2">
                <Input
                  id="location"
                  value={locationSearch}
                  onChange={(e) => setLocationSearch(e.target.value)}
                  placeholder="Search for an address..."
                />
                {locationResults.length > 0 && (
                  <div className="border rounded-lg max-h-48 overflow-y-auto">
                    {locationResults.map((feature) => (
                      <button
                        key={feature.id}
                        onClick={() => {
                          setSelectedLocation(feature);
                          setLocationSearch(feature.place_name);
                          setLocationResults([]);
                        }}
                        className="w-full text-left p-3 hover:bg-muted transition-colors"
                      >
                        <div className="font-medium">{feature.text}</div>
                        <div className="text-sm text-muted-foreground">
                          {feature.place_name}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {selectedLocation && (
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="h-4 w-4" />
                      <span>{selectedLocation.place_name}</span>
                    </div>
                    {selectedLocation.geometry.coordinates && (
                      <img
                        src={getStaticMapUrl(
                          selectedLocation.geometry.coordinates[0],
                          selectedLocation.geometry.coordinates[1],
                          400,
                          200
                        )}
                        alt="Location map"
                        className="w-full h-32 object-cover rounded-lg border"
                      />
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Perks */}
            <div>
              <Label>Perks & Offers</Label>
              <div className="mt-2 space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={newPerk}
                    onChange={(e) => setNewPerk(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addPerk();
                      }
                    }}
                    placeholder="e.g., 10% off for Fleet Users"
                  />
                  <Button type="button" onClick={addPerk} size="sm">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {perks.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {perks.map((perk, index) => (
                      <Badge key={index} variant="secondary" className="flex items-center gap-1">
                        {perk}
                        <button
                          onClick={() => removePerk(index)}
                          className="ml-1 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => navigate('/partner/dashboard')}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={updateProfile.isPending || uploadingLogo}
            className="flex-1"
          >
            {updateProfile.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </div>
    </OwnerLayout>
  );
}
