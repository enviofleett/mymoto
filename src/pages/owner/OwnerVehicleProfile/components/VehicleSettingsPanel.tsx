import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/integrations/supabase/edge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import myMotoLogo from "@/assets/mymoto-logo-new.png";
import { isPlateValid, isVinValid, normalizePlate, plateSchemas } from "@/utils/vehicle-validation";

interface VehicleSettingsPanelProps {
  deviceId: string;
  vehicleName: string;
  onClose: () => void;
}

type SpeedUnit = "kmh" | "mph";

export function VehicleSettingsPanel({ deviceId, vehicleName, onClose }: VehicleSettingsPanelProps) {
  const { toast } = useToast();

  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [region, setRegion] = useState<keyof typeof plateSchemas>("Nigeria");
  const [plate, setPlate] = useState("");
  const [vin, setVin] = useState("");
  const [color, setColor] = useState("");

  const [speedUnit, setSpeedUnit] = useState<SpeedUnit>("kmh");
  const [speedLimit, setSpeedLimit] = useState<number | "">("");

  const plateValid = isPlateValid(region, plate);
  const vinLooksValid = !vin || isVinValid(vin);
  const speedLimitValid =
    speedLimit === "" || (typeof speedLimit === "number" && Number.isFinite(speedLimit) && speedLimit > 0 && speedLimit <= 300);
  // VIN is optional and should not block saving profile details.
  const retainedFieldsValid = plateValid && speedLimitValid;
  const canSave = dirty && retainedFieldsValid && !saving;

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  useEffect(() => {
    const load = async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("vehicles")
          .select("plate_number, vin, color, speed_limit, speed_unit")
          .eq("device_id", deviceId)
          .maybeSingle();

        if (error || !data) return;

        if (data.plate_number) setPlate(normalizePlate(data.plate_number));
        if (data.vin) setVin(data.vin);
        if (data.color) setColor(data.color);
        if (typeof data.speed_limit === "number") setSpeedLimit(data.speed_limit);
        if (data.speed_unit === "kmh" || data.speed_unit === "mph") setSpeedUnit(data.speed_unit);
      } catch (_error) {
        // Non-blocking: form can still be edited and saved manually.
      }
    };

    load();
  }, [deviceId]);

  const saveAll = async () => {
    if (!canSave) return;

    setSaving(true);
    try {
      const payload = {
        device_id: deviceId,
        plate_number: normalizePlate(plate),
        // Only persist VIN when it passes validation; otherwise treat as omitted.
        vin: vinLooksValid && vin.trim() ? vin.trim() : null,
        color: color.trim() || null,
        speed_limit: typeof speedLimit === "number" ? speedLimit : null,
        speed_unit: speedUnit,
      };

      const data = await invokeEdgeFunction<{ error?: string }>("save-vehicle-settings", payload);
      const invokeResult = data as { error?: string } | null;
      if (invokeResult?.error) throw new Error(invokeResult.error);

      toast({
        title: "Saved",
        description: "Settings saved successfully",
      });
      setDirty(false);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Could not save settings";
      toast({
        title: "Save failed",
        description: message,
        variant: "destructive",
      });
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
          <p className="text-xs text-muted-foreground">Configure plate, identity, and speed settings ({vehicleName})</p>
        </div>
      </div>

      <Accordion type="single" collapsible className="w-full" defaultValue="details">
        <AccordionItem value="details">
          <AccordionTrigger>Vehicle Details</AccordionTrigger>
          <AccordionContent>
            <Card className="border">
              <CardContent className="pt-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Region</Label>
                    <Select
                      value={region}
                      onValueChange={(v) => {
                        setRegion(v as keyof typeof plateSchemas);
                        setDirty(true);
                      }}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Nigeria">Nigeria</SelectItem>
                        <SelectItem value="Generic">Generic</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Plate Number</Label>
                    <Input
                      value={plate}
                      onChange={(e) => { setPlate(e.target.value.toUpperCase()); setDirty(true); }}
                      placeholder="RBC784CX"
                    />
                    <p className={cn("text-xs", isPlateValid(region, plate) ? "text-muted-foreground" : "text-destructive")}>
                      {region === "Nigeria" ? "Format: ABC123DE (hyphen/space accepted)" : "Alphanumeric, 3-20 chars"}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>VIN (Chassis Number)</Label>
                    <Input value={vin} onChange={(e) => { setVin(e.target.value.toUpperCase()); setDirty(true); }} placeholder="17 characters" />
                    <p className={cn("text-xs", vinLooksValid ? "text-muted-foreground" : "text-amber-500")}>
                      Optional. Invalid VIN values are ignored when saving.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Color</Label>
                    <Input
                      value={color}
                      onChange={(e) => { setColor(e.target.value); setDirty(true); }}
                      placeholder="e.g., White"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Speed Unit</Label>
                    <Select value={speedUnit} onValueChange={(v) => { setSpeedUnit(v as SpeedUnit); setDirty(true); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="kmh">km/h</SelectItem>
                        <SelectItem value="mph">mph</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Speed Limit ({speedUnit})</Label>
                    <Input
                      type="number"
                      value={speedLimit}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === "") {
                          setSpeedLimit("");
                        } else {
                          const parsed = Number(value);
                          setSpeedLimit(Number.isNaN(parsed) ? "" : parsed);
                        }
                        setDirty(true);
                      }}
                      placeholder={speedUnit === "kmh" ? "e.g., 120" : "e.g., 75"}
                    />
                  </div>
                </div>

                {!retainedFieldsValid && (
                  <p className="text-xs text-destructive">
                    Settings are invalid. Fix plate or speed limit before saving.
                  </p>
                )}
              </CardContent>
            </Card>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="flex justify-end gap-2 pt-2">
        <Button
          variant="outline"
          onClick={() => {
            if (dirty) {
              const ok = window.confirm("Discard unsaved changes?");
              if (!ok) return;
            }
            onClose();
          }}
        >
          <XCircle className="h-4 w-4 mr-2" />
          Cancel
        </Button>
        <Button onClick={saveAll} disabled={!canSave}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Save All
        </Button>
      </div>
    </div>
  );
}
