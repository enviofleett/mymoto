import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Car, AlertTriangle } from "lucide-react";

interface VehicleSpecificationsFormProps {
  deviceId: string;
  onSaved?: () => void;
}

interface VehicleSpecs {
  id?: string;
  device_id: string;
  brand: string;
  model: string | null;
  year_of_manufacture: number | null;
  vehicle_age_years: number | null;
  engine_type: string | null;
  engine_size_cc: number | null;
  transmission_type: string | null;
  fuel_tank_capacity_liters: number | null;
  manufacturer_fuel_consumption_city: number | null;
  manufacturer_fuel_consumption_highway: number | null;
  manufacturer_fuel_consumption_combined: number | null;
  fuel_consumption_degradation_per_year: number;
  estimated_current_fuel_consumption: number | null;
  notes: string | null;
  is_verified: boolean;
}

const ENGINE_TYPES = [
  { value: "petrol", label: "Petrol" },
  { value: "diesel", label: "Diesel" },
  { value: "hybrid", label: "Hybrid" },
  { value: "electric", label: "Electric" },
];

const TRANSMISSION_TYPES = [
  { value: "manual", label: "Manual" },
  { value: "automatic", label: "Automatic" },
  { value: "CVT", label: "CVT (Continuously Variable Transmission)" },
];

// Common vehicle brands (can be expanded)
const VEHICLE_BRANDS = [
  "Toyota", "Honda", "Ford", "Chevrolet", "Nissan", "BMW", "Mercedes-Benz",
  "Audi", "Volkswagen", "Hyundai", "Kia", "Mazda", "Subaru", "Lexus",
  "Volvo", "Jeep", "Ram", "GMC", "Cadillac", "Lincoln", "Acura", "Infiniti",
  "Buick", "Chrysler", "Dodge", "Mitsubishi", "Suzuki", "Isuzu", "Other"
];

export function VehicleSpecificationsForm({ deviceId, onSaved }: VehicleSpecificationsFormProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [specs, setSpecs] = useState<Partial<VehicleSpecs>>({
    device_id: deviceId,
    brand: "",
    model: "",
    year_of_manufacture: null,
    engine_type: null,
    engine_size_cc: null,
    transmission_type: null,
    fuel_tank_capacity_liters: null,
    manufacturer_fuel_consumption_city: null,
    manufacturer_fuel_consumption_highway: null,
    manufacturer_fuel_consumption_combined: null,
    fuel_consumption_degradation_per_year: 0.02,
    notes: "",
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchSpecs();
  }, [deviceId]);

  const fetchSpecs = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('vehicle_specifications')
        .select('*')
        .eq('device_id', deviceId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSpecs(data as unknown as VehicleSpecs);
      }
    } catch (err) {
      console.error('Error fetching vehicle specs:', err);
      toast({
        title: "Error",
        description: "Failed to load vehicle specifications",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!specs.brand || !specs.year_of_manufacture) {
      toast({
        title: "Validation Error",
        description: "Brand and year of manufacture are required",
        variant: "destructive"
      });
      return;
    }

    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from('vehicle_specifications')
        .upsert({
          ...specs,
          device_id: deviceId,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'device_id'
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Vehicle specifications saved successfully",
      });

      // Refetch to get calculated fields (age, estimated consumption)
      await fetchSpecs();
      onSaved?.();
    } catch (err: any) {
      console.error('Error saving vehicle specs:', err);
      toast({
        title: "Error",
        description: err.message || "Failed to save vehicle specifications",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 30 }, (_, i) => currentYear - i);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Car className="h-5 w-5 text-primary" />
          <CardTitle>Vehicle Specifications</CardTitle>
        </div>
        <CardDescription>
          Provide vehicle details for intelligent fuel consumption analysis
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Fuel consumption estimates are assumptions based on manufacturer data and vehicle age. 
            Actual consumption may vary based on driving conditions, vehicle condition, and other factors.
          </AlertDescription>
        </Alert>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Brand - Required */}
          <div className="space-y-2">
            <Label htmlFor="brand">
              Vehicle Brand <span className="text-destructive">*</span>
            </Label>
            <Select
              value={specs.brand || ""}
              onValueChange={(value) => setSpecs({ ...specs, brand: value })}
            >
              <SelectTrigger id="brand">
                <SelectValue placeholder="Select brand" />
              </SelectTrigger>
              <SelectContent>
                {VEHICLE_BRANDS.map((brand) => (
                  <SelectItem key={brand} value={brand}>
                    {brand}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Model */}
          <div className="space-y-2">
            <Label htmlFor="model">Model</Label>
            <Input
              id="model"
              value={specs.model || ""}
              onChange={(e) => setSpecs({ ...specs, model: e.target.value })}
              placeholder="e.g., Camry, Civic, F-150"
            />
          </div>

          {/* Year of Manufacture - Required */}
          <div className="space-y-2">
            <Label htmlFor="year">
              Year of Manufacture <span className="text-destructive">*</span>
            </Label>
            <Select
              value={specs.year_of_manufacture?.toString() || ""}
              onValueChange={(value) => setSpecs({ ...specs, year_of_manufacture: parseInt(value) })}
            >
              <SelectTrigger id="year">
                <SelectValue placeholder="Select year" />
              </SelectTrigger>
              <SelectContent>
                {years.map((year) => (
                  <SelectItem key={year} value={year.toString()}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Engine Type */}
          <div className="space-y-2">
            <Label htmlFor="engine_type">Engine Type</Label>
            <Select
              value={specs.engine_type || ""}
              onValueChange={(value) => setSpecs({ ...specs, engine_type: value })}
            >
              <SelectTrigger id="engine_type">
                <SelectValue placeholder="Select engine type" />
              </SelectTrigger>
              <SelectContent>
                {ENGINE_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Engine Size */}
          <div className="space-y-2">
            <Label htmlFor="engine_size">Engine Size (cc)</Label>
            <Input
              id="engine_size"
              type="number"
              value={specs.engine_size_cc || ""}
              onChange={(e) => setSpecs({ ...specs, engine_size_cc: e.target.value ? parseInt(e.target.value) : null })}
              placeholder="e.g., 2000"
            />
          </div>

          {/* Transmission Type */}
          <div className="space-y-2">
            <Label htmlFor="transmission">Transmission Type</Label>
            <Select
              value={specs.transmission_type || ""}
              onValueChange={(value) => setSpecs({ ...specs, transmission_type: value })}
            >
              <SelectTrigger id="transmission">
                <SelectValue placeholder="Select transmission" />
              </SelectTrigger>
              <SelectContent>
                {TRANSMISSION_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Fuel Tank Capacity */}
          <div className="space-y-2">
            <Label htmlFor="fuel_tank">Fuel Tank Capacity (Liters)</Label>
            <Input
              id="fuel_tank"
              type="number"
              value={specs.fuel_tank_capacity_liters || ""}
              onChange={(e) => setSpecs({ ...specs, fuel_tank_capacity_liters: e.target.value ? parseInt(e.target.value) : null })}
              placeholder="e.g., 60"
            />
          </div>
        </div>

        {/* Manufacturer Fuel Consumption */}
        <div className="space-y-3 pt-2 border-t">
          <Label className="text-sm font-semibold">Manufacturer Fuel Consumption (L/100km)</Label>
          <p className="text-xs text-muted-foreground">
            Optional: Enter manufacturer fuel consumption data for more accurate estimates
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fuel_city">City Driving</Label>
              <Input
                id="fuel_city"
                type="number"
                step="0.1"
                value={specs.manufacturer_fuel_consumption_city || ""}
                onChange={(e) => setSpecs({ ...specs, manufacturer_fuel_consumption_city: e.target.value ? parseFloat(e.target.value) : null })}
                placeholder="e.g., 8.5"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fuel_highway">Highway Driving</Label>
              <Input
                id="fuel_highway"
                type="number"
                step="0.1"
                value={specs.manufacturer_fuel_consumption_highway || ""}
                onChange={(e) => setSpecs({ ...specs, manufacturer_fuel_consumption_highway: e.target.value ? parseFloat(e.target.value) : null })}
                placeholder="e.g., 6.5"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fuel_combined">Combined</Label>
              <Input
                id="fuel_combined"
                type="number"
                step="0.1"
                value={specs.manufacturer_fuel_consumption_combined || ""}
                onChange={(e) => setSpecs({ ...specs, manufacturer_fuel_consumption_combined: e.target.value ? parseFloat(e.target.value) : null })}
                placeholder="e.g., 7.2"
              />
            </div>
          </div>
        </div>

        {/* Age Degradation Factor */}
        <div className="space-y-2">
          <Label htmlFor="degradation">Fuel Consumption Degradation per Year (%)</Label>
          <Input
            id="degradation"
            type="number"
            step="0.01"
            value={((specs.fuel_consumption_degradation_per_year || 0.02) * 100).toString()}
            onChange={(e) => setSpecs({ ...specs, fuel_consumption_degradation_per_year: e.target.value ? parseFloat(e.target.value) / 100 : 0.02 })}
            placeholder="2.0"
          />
          <p className="text-xs text-muted-foreground">
            Default: 2% per year. This accounts for engine wear and reduced efficiency over time.
          </p>
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <Label htmlFor="notes">Notes (Optional)</Label>
          <Textarea
            id="notes"
            value={specs.notes || ""}
            onChange={(e) => setSpecs({ ...specs, notes: e.target.value })}
            placeholder="Any additional information about your vehicle (modifications, condition, etc.)"
            rows={3}
          />
        </div>

        {/* Calculated Fields Display */}
        {specs.vehicle_age_years !== null && specs.vehicle_age_years !== undefined && (
          <div className="p-3 bg-muted rounded-lg space-y-1">
            <div className="text-sm font-medium">Calculated Values</div>
            <div className="text-xs text-muted-foreground">
              Vehicle Age: {specs.vehicle_age_years} years
            </div>
            {specs.estimated_current_fuel_consumption && (
              <div className="text-xs text-muted-foreground">
                Estimated Current Consumption: {specs.estimated_current_fuel_consumption.toFixed(2)} L/100km
              </div>
            )}
          </div>
        )}

        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save Specifications
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
