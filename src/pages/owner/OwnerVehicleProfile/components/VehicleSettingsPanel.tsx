import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Progress } from "@/components/ui/progress";
import { Calendar } from "@/components/ui/calendar";
import { Switch } from "@/components/ui/switch";
import { GeofenceManager } from "@/components/fleet/GeofenceManager";
import { VehiclePersonaSettings } from "@/components/fleet/VehiclePersonaSettings";
import { ReportsSection } from "../components/ReportsSection";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { DateRange } from "react-day-picker";
import { Loader2, Upload, FileText, ShieldCheck, Gauge, MapPin, Save, XCircle } from "lucide-react";
import { useVehicleTrips, useVehicleEvents, useVehicleDailyStats } from "@/hooks/useVehicleProfile";
import { cn } from "@/lib/utils";
import { z } from "zod";
import myMotoLogo from "@/assets/mymoto-logo-new.png";
import { detailsValid, isPlateValid, isVinValid, plateSchemas, isYearValid } from "@/utils/vehicle-validation";

interface VehicleSettingsPanelProps {
  deviceId: string;
  vehicleName: string;
  onClose: () => void;
}

 

const BRAND_MODELS: Record<string, string[]> = {
  Toyota: ["Corolla", "Camry", "RAV4", "Hilux"],
  Honda: ["Civic", "Accord", "CR-V", "Pilot"],
  Mercedes: ["C-Class", "E-Class", "GLA", "GLC"],
  Ford: ["Focus", "Fusion", "Escape", "F-150"],
};

const COLOR_PALETTE = [
  "#000000", "#FFFFFF", "#FF6B00", "#1F2937", "#2563EB", "#10B981", "#F59E0B", "#EF4444", "#6B7280"
];

export function VehicleSettingsPanel({ deviceId, vehicleName, onClose }: VehicleSettingsPanelProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Details state
  const [region, setRegion] = useState<keyof typeof PLATE_SCHEMAS>("Nigeria");
  const [plate, setPlate] = useState("");
  const [vin, setVin] = useState("");
  const [color, setColor] = useState<string>("");
  const [brand, setBrand] = useState<string>("");
  const [model, setModel] = useState<string>("");
  const [year, setYear] = useState<number | "">("");

  // Documentation state
  const [insuranceExp, setInsuranceExp] = useState<Date | undefined>(undefined);
  const [licenseExp, setLicenseExp] = useState<Date | undefined>(undefined);
  const [roadworthyExp, setRoadworthyExp] = useState<Date | undefined>(undefined);
  const [uploadingDoc, setUploadingDoc] = useState<null | "insurance" | "license" | "roadworthy">(null);

  // Operations state
  const [speedUnit, setSpeedUnit] = useState<"kmh" | "mph">("kmh");
  const [speedLimit, setSpeedLimit] = useState<number | "">("");
  const [reportsDateRange, setReportsDateRange] = useState<DateRange | undefined>(() => {
    const to = new Date(); const from = new Date(); from.setDate(from.getDate() - 30); return { from, to };
  });

  // Reports data using existing hooks
  const { data: trips, isLoading: tripsLoading } = useVehicleTrips(deviceId, { dateRange: reportsDateRange, live: false, limit: 2000 }, true);
  const { data: events, isLoading: eventsLoading } = useVehicleEvents(deviceId, { dateRange: reportsDateRange, limit: 50 }, true);
  const { data: dailyStats, isLoading: statsLoading } = useVehicleDailyStats(deviceId, reportsDateRange || 30, true);

  // Unsaved changes warning
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

  const detailsOk = useMemo(() => {
    if (typeof year !== "number") return false;
    return detailsValid({ region, plate, vin, brand, model, year });
  }, [year, region, plate, vin, brand, model]);

  const daysUntil = (d?: Date) => {
    if (!d) return null;
    const ms = d.getTime() - Date.now();
    return Math.ceil(ms / (1000 * 60 * 60 * 24));
  };

  const docSeverity = (d?: Date) => {
    const days = daysUntil(d);
    if (days == null) return "none";
    if (days <= 30) return "critical";
    if (days <= 60) return "warning";
    if (days <= 90) return "notice";
    return "ok";
  };

  const completion = useMemo(() => {
    let total = 0, done = 0;
    // Personality completion proxied by LLM settings fetch/save handled internally
    total += 1; done += 1; // Assume persona section completion by interaction
    // Details
    total += 1; if (detailsOk) done += 1;
    // Documentation
    total += 1; if (insuranceExp || licenseExp || roadworthyExp) done += 1;
    // Operations
    total += 1; if (typeof speedLimit === "number" && speedLimit > 0) done += 1;
    return Math.round((done / total) * 100);
  }, [insuranceExp, licenseExp, roadworthyExp, speedLimit, detailsOk]);

  const handleUploadDoc = async (file: File, category: "insurance" | "license" | "roadworthy") => {
    setUploadingDoc(category);
    try {
      const allowed = ["application/pdf", "image/png", "image/jpeg"];
      if (!allowed.includes(file.type)) {
        toast({ title: "Invalid file", description: "Only PDF, PNG, or JPG allowed", variant: "destructive" });
        return;
      }
      const ext = file.name.split(".").pop();
      const path = `vehicle-docs/${deviceId}/${category}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("documents").upload(path, file, { upsert: true });
      if (error) throw error;
      toast({ title: "Uploaded", description: `Document uploaded for ${category}` });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e?.message || "Could not upload", variant: "destructive" });
    } finally {
      setUploadingDoc(null);
    }
  };

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
        speed_limit: typeof speedLimit === "number" ? speedLimit : null,
        speed_unit: speedUnit,
        insurance_exp: insuranceExp?.toISOString() ?? null,
        license_exp: licenseExp?.toISOString() ?? null,
        roadworthy_exp: roadworthyExp?.toISOString() ?? null,
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
          <p className="text-xs text-muted-foreground">Configure personality, details, and documentation</p>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Completion</Label>
        <Progress value={completion} />
      </div>

      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="personality">
          <AccordionTrigger>Personality</AccordionTrigger>
          <AccordionContent>
            <Card className="border">
              <CardContent className="pt-6">
                <VehiclePersonaSettings deviceId={deviceId} vehicleName={vehicleName} />
              </CardContent>
            </Card>
          </AccordionContent>
        </AccordionItem>

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
                    <p className={cn("text-xs", isVinValid(vin) ? "text-muted-foreground" : "text-destructive")}>
                      Must be 17 characters with a valid checksum
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
                    <Label>Vehicle Color</Label>
                    <div className="flex flex-wrap gap-2">
                      {COLOR_PALETTE.map((c) => (
                        <button key={c} type="button" className={cn("w-6 h-6 rounded-full border", color === c ? "ring-2 ring-primary" : "")} style={{ backgroundColor: c }} onClick={() => { setColor(c); setDirty(true); }} aria-label={`Select ${c}`} />
                      ))}
                      <Input type="color" value={color || "#000000"} onChange={(e) => { setColor(e.target.value); setDirty(true); }} className="w-10 h-10 p-1 rounded" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="documentation">
          <AccordionTrigger>Documentation</AccordionTrigger>
          <AccordionContent>
            <Card className="border">
              <CardContent className="pt-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {[
                    { key: "insurance", label: "Insurance", date: insuranceExp, set: setInsuranceExp },
                    { key: "license", label: "Vehicle License", date: licenseExp, set: setLicenseExp },
                    { key: "roadworthy", label: "Roadworthiness", date: roadworthyExp, set: setRoadworthyExp },
                  ].map(({ key, label, date, set }) => {
                    const severity = docSeverity(date);
                    const border =
                      severity === "critical"
                        ? "border-destructive"
                        : severity === "warning"
                          ? "border-yellow-500"
                          : severity === "notice"
                            ? "border-blue-500"
                            : "border-border";
                    const hint =
                      severity === "critical"
                        ? "Expiring ≤30d"
                        : severity === "warning"
                          ? "Expiring ≤60d"
                          : severity === "notice"
                            ? "Expiring ≤90d"
                            : "Up to date";
                    return (
                      <div key={key} className={cn("p-4 rounded-lg border", border)}>
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <p className="font-medium">{label} Expiration</p>
                            <p className="text-xs text-muted-foreground">{hint}</p>
                          </div>
                          <div>
                            <Label className="text-xs">Upload</Label>
                            <input
                              type="file"
                              accept="application/pdf,image/png,image/jpeg"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleUploadDoc(file, key as any);
                              }}
                              className="text-xs"
                              aria-label={`Upload ${label} document`}
                            />
                          </div>
                        </div>
                        <Calendar
                          mode="single"
                          selected={date}
                          onSelect={(d) => {
                            set(d);
                            setDirty(true);
                          }}
                        />
                      </div>
                    );
                  })}
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
