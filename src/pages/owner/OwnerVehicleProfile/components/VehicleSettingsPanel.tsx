import { useEffect, useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/integrations/supabase/edge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, XCircle, Images, Upload, Trash2, ArrowLeftRight } from "lucide-react";
import { cn } from "@/lib/utils";
import myMotoLogo from "@/assets/mymoto-logo-new.png";
import { isPlateValid, isVinValid, normalizePlate, plateSchemas } from "@/utils/vehicle-validation";
import { VehicleSpecificationsForm } from "./VehicleSpecificationsForm";

interface VehicleSettingsPanelProps {
  deviceId: string;
  vehicleName: string;
  onClose: () => void;
}

type SpeedUnit = "kmh" | "mph";

interface GalleryPhoto {
  id: string;
  device_id: string;
  url: string;
  sort_order: number | null;
  created_at: string;
}

const friendlyGalleryError = (raw?: string | null) => {
  if (!raw) return "Vehicle photo gallery is temporarily unavailable.";
  const msg = raw.toLowerCase();
  if (msg.includes("vehicle_photos") && msg.includes("schema cache")) {
    return "Vehicle photo gallery is not yet configured. Please contact support if this persists.";
  }
  return "Failed to load vehicle photos. Please try again.";
};

export function VehicleSettingsPanel({ deviceId, vehicleName, onClose }: VehicleSettingsPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryError, setGalleryError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);

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

  useEffect(() => {
    const loadPhotos = async () => {
      setGalleryLoading(true);
      setGalleryError(null);
      try {
        const { data, error } = await (supabase as any)
          .from("vehicle_photos")
          .select("id, device_id, url, sort_order, created_at")
          .eq("device_id", deviceId)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true });
        if (error) throw error;
        setPhotos((data as GalleryPhoto[]) || []);
      } catch (e: any) {
        const raw = e?.message || (typeof e === "string" ? e : undefined);
        setGalleryError(friendlyGalleryError(raw));
      } finally {
        setGalleryLoading(false);
      }
    };
    loadPhotos();
  }, [deviceId]);

  const notifyGalleryUpdated = () => {
    const event = new CustomEvent("vehicle-photos-updated", {
      detail: { deviceId },
    });
    window.dispatchEvent(event);
  };

  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadError(null);
    setUploading(true);
    try {
      const fileArray = Array.from(files);
      for (const file of fileArray) {
        if (!file.type.startsWith("image/")) {
          setUploadError("Only image files are allowed");
          continue;
        }
        if (file.size > 5 * 1024 * 1024) {
          setUploadError("Images must be under 5MB");
          continue;
        }

        const ext = file.name.split(".").pop() || "jpg";
        const fileName = `${deviceId}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const filePath = `vehicle-photos/${deviceId}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(filePath, file, { upsert: true });

        if (uploadError) {
          const rawUpload = uploadError.message;
          setUploadError(friendlyGalleryError(rawUpload));
          continue;
        }

        const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(filePath);
        const nextOrder =
          photos.length > 0
            ? Math.max(
                ...photos
                  .map((p) => (typeof p.sort_order === "number" ? p.sort_order : 0))
              ) + 1
            : 0;

        const { data: inserted, error: insertError } = await (supabase as any)
          .from("vehicle_photos")
          .insert({
            device_id: deviceId,
            url: urlData.publicUrl,
            sort_order: nextOrder,
          })
          .select("id, device_id, url, sort_order, created_at")
          .single();

        if (insertError) {
          const rawInsert = insertError.message;
          setUploadError(friendlyGalleryError(rawInsert));
          continue;
        }

        setPhotos((prev) => [...prev, inserted as GalleryPhoto]);
      }
      notifyGalleryUpdated();
    } catch (e: any) {
      const raw = e?.message || (typeof e === "string" ? e : undefined);
      setUploadError(friendlyGalleryError(raw));
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    handleFilesSelected(event.dataTransfer.files);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!dragActive) setDragActive(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.contains(event.relatedTarget as Node)) return;
    setDragActive(false);
  };

  const movePhoto = async (index: number, direction: "left" | "right") => {
    if (index < 0 || index >= photos.length) return;
    const targetIndex = direction === "left" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= photos.length) return;
    const next = [...photos];
    const temp = next[index];
    next[index] = next[targetIndex];
    next[targetIndex] = temp;
    setPhotos(next);
    try {
      const updates = next.map((photo, idx) => ({
        id: photo.id,
        sort_order: idx,
      }));
      for (const item of updates) {
        await (supabase as any)
          .from("vehicle_photos")
          .update({ sort_order: item.sort_order })
          .eq("id", item.id);
      }
      notifyGalleryUpdated();
    } catch (_e) {
      setGalleryError("Failed to update photo order");
    }
  };

  const deletePhoto = async (photoId: string) => {
    const photo = photos.find((p) => p.id === photoId);
    if (!photo) return;
    const ok = window.confirm("Delete this photo from the gallery?");
    if (!ok) return;
    try {
      const { error } = await (supabase as any)
        .from("vehicle_photos")
        .delete()
        .eq("id", photoId);
      if (error) throw error;
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
      notifyGalleryUpdated();
    } catch (e: any) {
      setGalleryError(e?.message || "Failed to delete photo");
    }
  };

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

        <AccordionItem value="fuel-specs">
          <AccordionTrigger>Fuel & Specifications</AccordionTrigger>
          <AccordionContent>
            <VehicleSpecificationsForm
              deviceId={deviceId}
              onSaved={() => {
                // Invalidate fuel-related queries so StatusMetricsRow refreshes
                queryClient.invalidateQueries({ queryKey: ["vehicle-mileage-details", deviceId] });
                queryClient.invalidateQueries({ queryKey: ["vehicle-specifications", deviceId] });
              }}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="photos">
          <AccordionTrigger>Photos & Gallery</AccordionTrigger>
          <AccordionContent>
            <Card className="border">
              <CardContent className="pt-6 space-y-4">
                <div
                  className={cn(
                    "flex flex-col items-center justify-center rounded-2xl border border-dashed px-4 py-6 text-center cursor-pointer transition-all duration-200",
                    "bg-card/80 hover:bg-secondary/30",
                    dragActive && "border-accent bg-secondary/40 shadow-neumorphic-sm"
                  )}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-10 h-10 rounded-full shadow-neumorphic-sm bg-card flex items-center justify-center">
                      <Images className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium text-foreground">
                      Drag and drop vehicle photos
                    </p>
                    <p className="text-xs text-muted-foreground max-w-sm">
                      Add multiple photos at once to build a social-style gallery. PNG or JPG up to 5MB each.
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      className="mt-2 gap-2"
                      disabled={uploading}
                    >
                      {uploading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Uploading
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4" />
                          Browse files
                        </>
                      )}
                    </Button>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(event) => handleFilesSelected(event.target.files)}
                    disabled={uploading}
                  />
                </div>

                {(galleryError || uploadError) && (
                  <p className="text-xs text-destructive">
                    {uploadError || galleryError}
                  </p>
                )}

                {galleryLoading && (
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Loading gallery photos
                  </div>
                )}

                {photos.length === 0 && !galleryLoading && (
                  <p className="text-xs text-muted-foreground">
                    No gallery photos yet. Start by uploading a few images of this vehicle.
                  </p>
                )}

                {photos.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{photos.length} photo{photos.length === 1 ? "" : "s"} in gallery</span>
                      <span>Reorder with arrows or remove unused photos.</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {photos.map((photo, index) => (
                        <div
                          key={photo.id}
                          className="group relative rounded-xl overflow-hidden border border-border/60 bg-muted/40 shadow-neumorphic-sm"
                        >
                          <img
                            src={photo.url}
                            alt="Vehicle gallery"
                            loading="lazy"
                            className="w-full h-32 sm:h-36 object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                          />
                          <div className="absolute inset-x-1 bottom-1 flex items-center justify-between gap-1">
                            <div className="inline-flex items-center gap-1 rounded-full bg-black/50 px-1.5 py-0.5 text-[10px] text-white/90">
                              <span>{index + 1}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 rounded-full bg-black/40 text-white hover:bg-black/70"
                                onClick={() => movePhoto(index, "left")}
                                disabled={index === 0}
                                aria-label="Move photo earlier"
                              >
                                <ArrowLeftRight className="h-3 w-3 rotate-180" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 rounded-full bg-black/40 text-white hover:bg-black/70"
                                onClick={() => movePhoto(index, "right")}
                                disabled={index === photos.length - 1}
                                aria-label="Move photo later"
                              >
                                <ArrowLeftRight className="h-3 w-3" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 rounded-full bg-destructive/80 text-destructive-foreground hover:bg-destructive"
                                onClick={() => deletePhoto(photo.id)}
                                aria-label="Delete photo"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
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
