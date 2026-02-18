import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import myMotoLogo from "@/assets/mymoto-logo-new.png";
import { detailsValid, isPlateValid, isVinValid, plateSchemas, isYearValid } from "@/utils/vehicle-validation";
import { useAuth } from "@/contexts/AuthContext";

interface VehicleSettingsPanelProps {
  deviceId: string;
  vehicleName: string;
  onClose: () => void;
}

 

const BRAND_MODELS: Record<string, string[]> = {
  Toyota: [
    "Corolla Cross",
    "RAV4",
    "Hilux 2.4 GD-6",
    "Hilux 2.8 GD-6",
    "Fortuner 2.4 GD-6",
    "Fortuner 2.8 GD-6",
    "Land Cruiser Prado 2.8 D-4D",
    "Land Cruiser 300 3.5 V6",
    "Land Cruiser 79 4.5 V8",
    "Corolla Quest",
    "Vitz",
    "Agya",
    "Avanza",
    "Rush",
    "Hiace 2.5 D-4D",
  ],
  Lexus: ["LX570", "RX350", "RX450h", "ES350", "GX460"],
  BMW: [
    "X3 20d",
    "X5 30d",
    "3 Series 320d",
    "5 Series 520d",
    "X1 sDrive18d",
    "7 Series 730Ld",
  ],
  Suzuki: [
    "Dzire 1.2",
    "Swift 1.2",
    "Celerio 1.0",
    "S-Presso 1.0",
    "Vitara 1.6",
    "Jimny 1.5",
    "Ertiga 1.5",
    "Baleno 1.5",
    "Ignis 1.2",
  ],
  "Mercedes-Benz": [
    "Vito 116 CDI",
    "C200",
    "E220d",
    "GLE 300d",
    "GLC 220d",
    "Sprinter 316 CDI",
    "A200",
    "S350d",
  ],
  GAC: ["GS3 Emzoom", "GS8", "GS5", "GN6", "GA4"],
  Geely: ["Emgrand 7", "Coolray", "Azkarra", "Tugella", "Okavango"],
  Peugeot: ["108", "208", "308", "3008", "5008", "Partner", "Landtrek"],
  Innoson: ["G5", "U5", "U3", "Ikenga", "Fox", "Caris"],
  Mazda: ["CX-5 2.0", "CX-3 2.0", "CX-9 2.5T", "Mazda 3 1.6", "Mazda 6 2.0", "BT-50 2.2", "MX-5 2.0"],
  Honda: ["Accord 2.0", "Civic 1.8", "CR-V 2.0", "HR-V 1.8", "Pilot 3.5", "Odyssey 2.4", "Fit 1.5"],
  Nissan: ["Navara 2.5D", "NP300 2.5", "Patrol 4.8", "X-Trail 2.0", "Qashqai 1.6", "Almera 1.5", "Sunny 1.6"],
  Ford: ["Ranger 2.2", "Ranger 3.2", "Everest 2.2", "F-150 3.5", "EcoSport 1.5", "Figo 1.5", "Transit 2.2"],
  Hyundai: ["Grand i10 1.2", "Accent 1.6", "Tucson 2.0", "Santa Fe 2.2D", "H-1 2.5D", "Elantra 1.6", "Creta 1.6"],
  Kia: ["Picanto", "Rio 1.4", "Sportage 2.0", "Sorento 2.2D", "Cerato 1.6", "Sonet 1.5", "Pegas 1.4"],
  Volkswagen: ["Polo Vivo 1.4", "Polo 1.0 TSI", "Golf 1.4 TSI", "Tiguan 1.4 TSI", "Amarok 2.0 BiTDI", "Passat 2.0 TDI", "Transporter 2.0 TDI"],
  Mitsubishi: ["Triton 2.4D", "Pajero Sport 2.4D", "Outlander 2.4", "ASX 2.0", "Xpander 1.5"],
  Haval: ["H6 1.5T Hybrid", "H7 2.0T", "Jolion 1.5T", "H2 1.5T", "H9 2.0T"],
  Mahindra: ["XUV700 2.0T", "Scorpio 2.2D", "Bolero 2.5D", "Pik Up 2.2D", "KUV100 1.2", "Thar 2.2D"],
  Isuzu: ["D-Max 1.9D", "KB 2.5D", "MU-X 1.9D", "MU-X 3.0D", "FRR 5.2D"],
  Proton: ["Saga 1.3", "Persona 1.6", "X70 1.8T", "X50 1.5T"],
  Chery: ["Tiggo 4 Pro 1.5", "Tiggo 7 Pro 1.5T", "Tiggo 8 Pro 1.6T", "Arrizo 5 1.5", "Arrizo 6 1.5T"],
  Jetour: ["T1 2.0T", "X70 1.5T", "X90 1.6T"],
  Changan: ["Alsvin 1.5", "CS35 Plus 1.6", "CS75 1.5T", "CS95 2.0T"],
  DFSK: ["Glory 580 1.5T", "C-Series 1.5", "Loadhopper 1.2", "Super Cab 1.2"],
  Bajaj: ["Boxer 150", "CT 100", "Pulsar 180", "RE 205", "RE 250", "Maxima Z"],
  TVS: ["Apache 160", "HLX 125", "King", "XL100", "NTORQ 125"],
};

export function VehicleSettingsPanel({ deviceId, vehicleName, onClose }: VehicleSettingsPanelProps) {
  const { toast } = useToast();
  const { session } = useAuth();
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [region, setRegion] = useState<keyof typeof plateSchemas>("Nigeria");
  const [plate, setPlate] = useState("");
  const [vin, setVin] = useState("");
  const [color, setColor] = useState<string>("");
  const [brand, setBrand] = useState<string>("");
  const [model, setModel] = useState<string>("");
  const [year, setYear] = useState<number | "">("");

  const [fuelType, setFuelType] = useState<string>("");
  const [engineDisplacement, setEngineDisplacement] = useState<string>("");
  const [officialFuelEfficiency, setOfficialFuelEfficiency] = useState<number | "">("");
  const [vehicleType, setVehicleType] = useState<string>("");
  const [drivingRegion, setDrivingRegion] = useState<string>("");
  const [usageWeight, setUsageWeight] = useState<string>("");

  const [speedUnit, setSpeedUnit] = useState<"kmh" | "mph">("kmh");
  const [speedLimit, setSpeedLimit] = useState<number | "">("");
  const [lastSpecKey, setLastSpecKey] = useState<string | null>(null);
  const specEnrichmentUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/vehicle-spec-enrichment`;
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  useEffect(() => {
    const load = async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("vehicles")
          .select("plate_number, vin, color, brand, model, year, speed_limit, speed_unit, insurance_exp, license_exp, roadworthy_exp, fuel_type, engine_displacement, official_fuel_efficiency_l_100km, vehicle_type, driving_region_or_country, usage_weight")
          .eq("device_id", deviceId)
          .maybeSingle();
        if (error || !data) return;
        if (data.plate_number) setPlate(data.plate_number);
        if (data.vin) setVin(data.vin);
        if (data.color) setColor(data.color);
        if (data.brand) setBrand(data.brand);
        if (data.model) setModel(data.model);
        if (typeof data.year === "number") setYear(data.year);
        if (typeof data.speed_limit === "number") setSpeedLimit(data.speed_limit);
        if (data.speed_unit === "kmh" || data.speed_unit === "mph") setSpeedUnit(data.speed_unit);
        if (data.fuel_type) setFuelType(data.fuel_type);
        if (data.engine_displacement) setEngineDisplacement(data.engine_displacement);
        if (typeof data.official_fuel_efficiency_l_100km === "number") {
          setOfficialFuelEfficiency(data.official_fuel_efficiency_l_100km);
        }
        if (data.vehicle_type) setVehicleType(data.vehicle_type);
        if (data.driving_region_or_country) setDrivingRegion(data.driving_region_or_country);
        if (data.usage_weight) setUsageWeight(data.usage_weight);
      } catch {
      }
    };
    load();
  }, [deviceId]);

  useEffect(() => {
    if (!session?.access_token) return;
    if (!brand || !model || typeof year !== "number") return;
    const key = `${brand}|${model}|${year}`;
    if (lastSpecKey === key) return;
    if (fuelType && engineDisplacement && typeof officialFuelEfficiency === "number" && usageWeight) return;

    let cancelled = false;

    const run = async () => {
      try {
        const res = await fetch(specEnrichmentUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            device_id: deviceId,
            brand,
            model,
            year,
            fuel_type: fuelType || null,
            vehicle_type: vehicleType || null,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json || (json as any).error) {
          return;
        }
        const data = (json as any).data || {};
        if (cancelled) return;
        if (data.fuel_type && !fuelType) setFuelType(data.fuel_type);
        if (data.engine_displacement && !engineDisplacement) setEngineDisplacement(data.engine_displacement);
        if (
          typeof data.official_fuel_efficiency_l_100km === "number" &&
          officialFuelEfficiency === ""
        ) {
          setOfficialFuelEfficiency(data.official_fuel_efficiency_l_100km);
        }
        if (data.usage_weight && !usageWeight) setUsageWeight(data.usage_weight);
        if (data.vehicle_type && !vehicleType) setVehicleType(data.vehicle_type);
        setLastSpecKey(key);
        setDirty(true);
      } catch {
      } finally {
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [
    session?.access_token,
    brand,
    model,
    year,
    fuelType,
    engineDisplacement,
    officialFuelEfficiency,
    usageWeight,
    vehicleType,
    specEnrichmentUrl,
    deviceId,
    lastSpecKey,
  ]);

  const saveAll = async () => {
    setSaving(true);
    try {
      // Persist details (best-effort, fallback to localStorage)
      const payload = {
        device_id: deviceId,
        plate_number: plate.trim(),
        vin: vin.trim(),
        color,
        brand,
        model,
        year: typeof year === "number" ? year : null,
        fuel_type: fuelType || null,
        engine_displacement: engineDisplacement || null,
        official_fuel_efficiency_l_100km: typeof officialFuelEfficiency === "number" ? officialFuelEfficiency : null,
        vehicle_type: vehicleType || null,
        driving_region_or_country: drivingRegion || null,
        usage_weight: usageWeight || null,
        speed_limit: typeof speedLimit === "number" ? speedLimit : null,
        speed_unit: speedUnit,
        updated_at: new Date().toISOString(),
      };
      let storedLocally = false;
      try {
        const { error } = await (supabase as any)
          .from("vehicles")
          .upsert(payload, { onConflict: "device_id" });
        if (error) throw error;
      } catch (e) {
        storedLocally = true;
        localStorage.setItem(`vehicle-settings:${deviceId}`, JSON.stringify(payload));
      }
      toast({
        title: "Saved",
        description: storedLocally ? "Saved locally (backend fields pending)" : "Settings saved successfully",
      });
      setDirty(false);
    } catch (e: any) {
      toast({ title: "Save failed", description: e?.message || "Could not save settings", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <img src={myMotoLogo} alt="MyMoto" className="w-6 h-6" />
        <div>
          <p className="font-semibold">Vehicle Profile Settings</p>
          <p className="text-xs text-muted-foreground">Configure core vehicle details for live tracking and fuel analytics</p>
        </div>
      </div>

      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="details">
          <AccordionTrigger>Vehicle Details</AccordionTrigger>
          <AccordionContent>
            <Card className="border">
              <CardContent className="pt-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Region</Label>
                    <Select value={region} onValueChange={(v) => { setRegion(v as any); setDirty(true); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Nigeria">Nigeria</SelectItem>
                        <SelectItem value="Generic">Generic</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Plate Number</Label>
                    <Input value={plate} onChange={(e) => { setPlate(e.target.value); setDirty(true); }} placeholder="ABC-123DE" />
                    <p className={cn("text-xs", isPlateValid(region, plate) ? "text-muted-foreground" : "text-destructive")}>
                      {region === "Nigeria" ? "Format: ABC-123DE" : "Alphanumeric, 3-20 chars"}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>VIN (Chassis Number)</Label>
                    <Input value={vin} onChange={(e) => { setVin(e.target.value.toUpperCase()); setDirty(true); }} placeholder="17 characters" />
                    <p className={cn("text-xs", (!vin || isVinValid(vin)) ? "text-muted-foreground" : "text-destructive")}>
                      Optional, but if provided must be 17 characters with a valid checksum
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Vehicle Brand</Label>
                    <Select value={brand} onValueChange={(v) => { setBrand(v); setModel(""); setDirty(true); }}>
                      <SelectTrigger><SelectValue placeholder="Select brand" /></SelectTrigger>
                      <SelectContent>
                        {Object.keys(BRAND_MODELS).map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Model</Label>
                    <Select value={model} onValueChange={(v) => { setModel(v); setDirty(true); }} disabled={!brand}>
                      <SelectTrigger><SelectValue placeholder={brand ? "Select model" : "Select brand first"} /></SelectTrigger>
                      <SelectContent>
                        {(BRAND_MODELS[brand] || []).map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Year of Manufacture</Label>
                    <Input type="number" value={year} onChange={(e) => { const v = Number(e.target.value); setYear(Number.isNaN(v) ? "" : v); setDirty(true); }} placeholder="e.g., 2018" />
                    <p className={cn("text-xs", typeof year === "number" && isYearValid(year) ? "text-muted-foreground" : "text-destructive")}>
                      1900 - {new Date().getFullYear()}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Fuel Type</Label>
                    <Select value={fuelType} onValueChange={(v) => { setFuelType(v); setDirty(true); }}>
                      <SelectTrigger><SelectValue placeholder="Select fuel type" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="petrol">Petrol</SelectItem>
                        <SelectItem value="diesel">Diesel</SelectItem>
                        <SelectItem value="hybrid">Hybrid</SelectItem>
                        <SelectItem value="electric">Electric</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Driving Region or Country</Label>
                    <Input value={drivingRegion} onChange={(e) => { setDrivingRegion(e.target.value); setDirty(true); }} placeholder="e.g., Lagos, Nigeria or EU city" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={() => { if (dirty) { const ok = window.confirm("Discard unsaved changes?"); if (!ok) return; } onClose(); }}>
          <XCircle className="h-4 w-4 mr-2" />
          Cancel
        </Button>
        <Button onClick={saveAll} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Save All
        </Button>
      </div>
    </div>
  );
}
