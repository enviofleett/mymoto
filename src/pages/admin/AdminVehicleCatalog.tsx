import { useMemo, useState } from "react";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface CatalogRow {
  id: string;
  brand: string;
  model: string;
  fuel_type: string | null;
  year_start: number | null;
  year_end: number | null;
  city_consumption_rate: number | null;
  highway_consumption_rate: number | null;
  idle_consumption_rate: number | null;
  is_active: boolean;
}

const EMPTY_FORM = {
  brand: "",
  model: "",
  fuel_type: "",
  year_start: "",
  year_end: "",
  city_consumption_rate: "",
  highway_consumption_rate: "",
  idle_consumption_rate: "",
};

export default function AdminVehicleCatalog() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogRow | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin-vehicle-catalog"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vehicle_fuel_specs_catalog")
        .select(
          "id, brand, model, fuel_type, year_start, year_end, city_consumption_rate, highway_consumption_rate, idle_consumption_rate, is_active",
        )
        .order("brand", { ascending: true })
        .order("model", { ascending: true });
      if (error) throw error;
      return (data || []) as CatalogRow[];
    },
  });

  const filtered = useMemo(
    () =>
      rows.filter((r) =>
        `${r.brand} ${r.model}`.toLowerCase().includes(search.toLowerCase()),
      ),
    [rows, search],
  );

  const createOrUpdate = useMutation({
    mutationFn: async () => {
      const payload = {
        brand: form.brand.trim(),
        model: form.model.trim(),
        fuel_type: form.fuel_type.trim() || null,
        year_start: form.year_start ? Number(form.year_start) : null,
        year_end: form.year_end ? Number(form.year_end) : null,
        city_consumption_rate: form.city_consumption_rate
          ? Number(form.city_consumption_rate)
          : null,
        highway_consumption_rate: form.highway_consumption_rate
          ? Number(form.highway_consumption_rate)
          : null,
        idle_consumption_rate: form.idle_consumption_rate
          ? Number(form.idle_consumption_rate)
          : null,
        normalized_key: `${form.brand.trim().toLowerCase()}|${form.model.trim().toLowerCase()}`,
      };

      if (editing) {
        const { error } = await (supabase as any)
          .from("vehicle_fuel_specs_catalog")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("vehicle_fuel_specs_catalog")
          .insert({
            ...payload,
            official_fuel_efficiency_l_100km:
              payload.highway_consumption_rate ??
              payload.city_consumption_rate ??
              8,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-vehicle-catalog"] });
      setIsOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
      toast.success("Catalog saved");
    },
    onError: (error: any) => toast.error(error.message || "Failed to save"),
  });

  const removeRow = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("vehicle_fuel_specs_catalog")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-vehicle-catalog"] });
      toast.success("Catalog entry deleted");
    },
  });

  const resyncVehicles = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc(
        "resync_all_vehicle_fuel_profiles",
        { p_limit: null },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(
        `Re-sync complete: ${data?.matched ?? 0} matched / ${data?.unmatched ?? 0} unmatched`,
      );
    },
    onError: (error: any) =>
      toast.error(error.message || "Failed to re-sync vehicles"),
  });

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setIsOpen(true);
  };

  const openEdit = (row: CatalogRow) => {
    setEditing(row);
    setForm({
      brand: row.brand,
      model: row.model,
      fuel_type: row.fuel_type || "",
      year_start: row.year_start?.toString() || "",
      year_end: row.year_end?.toString() || "",
      city_consumption_rate: row.city_consumption_rate?.toString() || "",
      highway_consumption_rate: row.highway_consumption_rate?.toString() || "",
      idle_consumption_rate: row.idle_consumption_rate?.toString() || "",
    });
    setIsOpen(true);
  };

  return (
    <DashboardLayout
      title="Vehicle Fuel Catalog"
      subtitle="Admin-managed fuel intelligence profiles"
    >
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Vehicle Fuel Catalog</CardTitle>
              <CardDescription>
                Manage city/highway/idle profiles and re-sync all vehicles.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => resyncVehicles.mutate()}
                disabled={resyncVehicles.isPending}
              >
                {resyncVehicles.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Re-sync All Vehicles
              </Button>
              <Button onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" /> Add Vehicle Profile
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search brand/model"
          />

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Brand / Model</TableHead>
                  <TableHead>Year Range</TableHead>
                  <TableHead>Fuel Type</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Highway</TableHead>
                  <TableHead>Idle</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      {row.brand} {row.model}
                    </TableCell>
                    <TableCell>
                      {row.year_start ?? "-"} - {row.year_end ?? "-"}
                    </TableCell>
                    <TableCell>{row.fuel_type || "-"}</TableCell>
                    <TableCell>{row.city_consumption_rate ?? "-"}</TableCell>
                    <TableCell>{row.highway_consumption_rate ?? "-"}</TableCell>
                    <TableCell>{row.idle_consumption_rate ?? "-"}</TableCell>
                    <TableCell>
                      <Badge variant={row.is_active ? "default" : "outline"}>
                        {row.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="space-x-2 text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openEdit(row)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removeRow.mutate(row.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit Vehicle Profile" : "Add Vehicle Profile"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4">
            {Object.entries(form).map(([key, value]) => (
              <div className="space-y-2" key={key}>
                <Label htmlFor={key}>{key.replaceAll("_", " ")}</Label>
                <Input
                  id={key}
                  value={value}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                />
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createOrUpdate.mutate()}
              disabled={createOrUpdate.isPending}
            >
              {createOrUpdate.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
