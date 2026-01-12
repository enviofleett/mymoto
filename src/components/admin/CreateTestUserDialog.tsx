import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Search, X, Check, User, Car } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useVehiclesWithAssignments } from "@/hooks/useAssignmentManagement";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const formSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  name: z.string().min(1, "Name is required"),
  phone: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface CreateTestUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateTestUserDialog({ open, onOpenChange }: CreateTestUserDialogProps) {
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const queryClient = useQueryClient();

  const { data: vehicles, isLoading: vehiclesLoading } = useVehiclesWithAssignments(vehicleSearch, "all");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
      name: "",
      phone: "",
    },
  });

  const toggleVehicle = (deviceId: string) => {
    setSelectedDeviceIds(prev =>
      prev.includes(deviceId)
        ? prev.filter(id => id !== deviceId)
        : [...prev, deviceId]
    );
  };

  const removeVehicle = (deviceId: string) => {
    setSelectedDeviceIds(prev => prev.filter(id => id !== deviceId));
  };

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-test-user', {
        body: {
          email: values.email,
          password: values.password,
          name: values.name,
          phone: values.phone || null,
          deviceIds: selectedDeviceIds,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast.success(`Test user created: ${values.email}`, {
        description: `${selectedDeviceIds.length} vehicle(s) assigned. User can now login.`,
      });

      // Reset form and close
      form.reset();
      setSelectedDeviceIds([]);
      setVehicleSearch("");
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      queryClient.invalidateQueries({ queryKey: ['vehicles-with-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['assignment-stats'] });
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error creating test user:', error);
      toast.error('Failed to create test user', {
        description: error.message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedVehicleDetails = vehicles?.filter(v => selectedDeviceIds.includes(v.device_id)) || [];
  const searchResults = vehicles?.slice(0, 50) || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Create Test User
          </DialogTitle>
          <DialogDescription>
            Create a new user account with profile and optional vehicle assignments
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 flex-1 overflow-hidden flex flex-col">
            {/* User Details */}
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input placeholder="user@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="John Doe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone (optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="+234..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Selected Vehicles */}
            {selectedDeviceIds.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium flex items-center gap-2">
                  <Car className="h-4 w-4" />
                  Selected Vehicles ({selectedDeviceIds.length})
                </p>
                <div className="flex flex-wrap gap-1">
                  {selectedVehicleDetails.map(v => (
                    <Badge key={v.device_id} variant="secondary" className="gap-1">
                      {v.device_name || v.device_id}
                      <button
                        type="button"
                        onClick={() => removeVehicle(v.device_id)}
                        className="hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Vehicle Search */}
            <div className="space-y-2 flex-1 min-h-0 flex flex-col">
              <p className="text-sm font-medium">Assign Vehicles (optional)</p>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by plate or device ID..."
                  className="pl-8"
                  value={vehicleSearch}
                  onChange={(e) => setVehicleSearch(e.target.value)}
                />
              </div>
              <ScrollArea className="flex-1 border rounded-md max-h-40">
                {vehiclesLoading ? (
                  <div className="p-4 text-center">
                    <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                  </div>
                ) : searchResults.length === 0 ? (
                  <p className="p-4 text-center text-sm text-muted-foreground">
                    No vehicles found
                  </p>
                ) : (
                  <div className="p-1">
                    {searchResults.map(vehicle => {
                      const isSelected = selectedDeviceIds.includes(vehicle.device_id);
                      return (
                        <button
                          key={vehicle.device_id}
                          type="button"
                          onClick={() => toggleVehicle(vehicle.device_id)}
                          className={`w-full text-left p-2 rounded text-sm flex items-center justify-between hover:bg-muted ${
                            isSelected ? 'bg-primary/10' : ''
                          }`}
                        >
                        <div className="min-w-0">
                            <p className="font-medium truncate">{vehicle.device_name || 'No name'}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {vehicle.device_id} • {vehicle.gps_owner}
                            </p>
                          </div>
                          {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </div>

            {/* Submit */}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create User
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
