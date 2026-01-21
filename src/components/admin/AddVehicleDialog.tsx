import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Car } from "lucide-react";

const vehicleFormSchema = z.object({
  device_id: z.string().min(1, "Device ID is required"),
  device_name: z.string().min(1, "Device name is required"),
  group_id: z.string().optional(),
  group_name: z.string().optional(),
  device_type: z.string().optional(),
  sim_number: z.string().optional(),
});

type VehicleFormValues = z.infer<typeof vehicleFormSchema>;

interface AddVehicleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddVehicleDialog({ open, onOpenChange }: AddVehicleDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const queryClient = useQueryClient();

  const form = useForm<VehicleFormValues>({
    resolver: zodResolver(vehicleFormSchema),
    defaultValues: {
      device_id: "",
      device_name: "",
      group_id: "",
      group_name: "",
      device_type: "",
      sim_number: "",
    },
  });

  const onSubmit = async (values: VehicleFormValues) => {
    setIsSubmitting(true);
    try {
      // Check if vehicle already exists
      const { data: existing, error: checkError } = await (supabase as any)
        .from("vehicles")
        .select("device_id")
        .eq("device_id", values.device_id)
        .maybeSingle();

      if (checkError && checkError.code !== 'PGRST116') {
        throw checkError;
      }

      if (existing) {
        toast.error("Vehicle already exists", {
          description: `Device ID ${values.device_id} is already registered.`,
        });
        setIsSubmitting(false);
        return;
      }

      // Insert new vehicle
      const vehicleData = {
        device_id: values.device_id.trim(),
        device_name: values.device_name.trim(),
        group_id: values.group_id?.trim() || null,
        group_name: values.group_name?.trim() || null,
        device_type: values.device_type?.trim() || null,
        sim_number: values.sim_number?.trim() || null,
        last_synced_at: new Date().toISOString(),
      };

      const { error: insertError } = await (supabase as any)
        .from("vehicles")
        .insert(vehicleData);

      if (insertError) {
        // Check for permission errors
        if (insertError.code === '42501') {
          throw new Error("Permission denied. Only admins can add vehicles.");
        }
        throw insertError;
      }

      toast.success("Vehicle added successfully", {
        description: `${values.device_name} (${values.device_id}) has been registered.`,
      });

      // Reset form and close
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["vehicles-with-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["fleet-data"] });
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error adding vehicle:", error);
      toast.error("Failed to add vehicle", {
        description: error.message || "An error occurred while adding the vehicle.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Car className="h-5 w-5" />
            Add New Vehicle
          </DialogTitle>
          <DialogDescription>
            Register a new vehicle in the system. The vehicle must exist in GPS51 before it can be tracked.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="device_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Device ID *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., 13612332432"
                      {...field}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="device_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Vehicle Name *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Toyota Camry"
                      {...field}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="group_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Group ID</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Optional"
                        {...field}
                        disabled={isSubmitting}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="group_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Group Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Optional"
                        {...field}
                        disabled={isSubmitting}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="device_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Device Type</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., GPS Tracker"
                        {...field}
                        disabled={isSubmitting}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="sim_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SIM Number</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Optional"
                        {...field}
                        disabled={isSubmitting}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Car className="mr-2 h-4 w-4" />
                    Add Vehicle
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
