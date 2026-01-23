import { useState, useMemo } from "react";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Plus,
  Edit,
  Trash2,
  CheckCircle2,
  XCircle,
  Eye,
  Loader2,
  FolderPlus,
  Building2,
  Search,
  Filter,
  UserPlus,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface DirectoryCategory {
  id: string;
  name: string;
  icon: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface ServiceProvider {
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
  approved_at: string | null;
  approved_by: string | null;
  rejection_reason: string | null;
  pending_changes: any;
  last_edit_at: string | null;
  created_at: string;
  updated_at: string;
  category?: DirectoryCategory;
}

export default function AdminDirectory() {
  const queryClient = useQueryClient();
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [providerDialogOpen, setProviderDialogOpen] = useState(false);
  const [providerRegisterDialogOpen, setProviderRegisterDialogOpen] = useState(false);
  const [providerEditDialogOpen, setProviderEditDialogOpen] = useState(false);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<ServiceProvider | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Category form state
  const [categoryName, setCategoryName] = useState("");
  const [categoryIcon, setCategoryIcon] = useState("");
  const [categoryOrder, setCategoryOrder] = useState(0);
  const [editingCategory, setEditingCategory] = useState<DirectoryCategory | null>(null);

  // Provider registration/edit form state
  const [providerFormData, setProviderFormData] = useState({
    businessName: "",
    email: "",
    phone: "",
    contactPerson: "",
    categoryId: "none",
    password: "",
    autoApprove: false,
  });

  // Fetch categories
  const { data: categories = [], isLoading: categoriesLoading } = useQuery({
    queryKey: ['directory-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('directory_categories')
        .select('*')
        .order('display_order', { ascending: true });
      
      if (error) throw error;
      return data as DirectoryCategory[];
    },
  });

  // Fetch providers
  const { data: providers = [], isLoading: providersLoading } = useQuery({
    queryKey: ['service-providers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_providers')
        .select(`
          *,
          category:directory_categories(*)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as ServiceProvider[];
    },
  });

  // Filter providers
  const filteredProviders = useMemo(() => {
    return providers.filter(p => {
      const matchesSearch = searchQuery === "" || 
        p.business_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.phone.includes(searchQuery) ||
        (p.email && p.email.toLowerCase().includes(searchQuery.toLowerCase()));
      
      const matchesStatus = statusFilter === "all" || p.approval_status === statusFilter;
      const matchesCategory = categoryFilter === "all" || p.category_id === categoryFilter;
      
      return matchesSearch && matchesStatus && matchesCategory;
    });
  }, [providers, searchQuery, statusFilter, categoryFilter]);

  // Create category mutation
  const createCategory = useMutation({
    mutationFn: async (data: { name: string; icon: string | null; display_order: number }) => {
      const { error } = await supabase
        .from('directory_categories')
        .insert(data);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['directory-categories'] });
      setCategoryDialogOpen(false);
      resetCategoryForm();
      toast.success('Category created successfully');
    },
    onError: (error: any) => {
      console.error('Create category error:', error);
      const errorMessage = error.message || error.error_description || 'Unknown error occurred';
      toast.error('Failed to create category', { 
        description: errorMessage,
        duration: 5000,
      });
    },
  });

  // Update category mutation
  const updateCategory = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; name: string; icon: string | null; display_order: number }) => {
      const { error } = await supabase
        .from('directory_categories')
        .update(data)
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['directory-categories'] });
      setCategoryDialogOpen(false);
      resetCategoryForm();
      toast.success('Category updated successfully');
    },
    onError: (error: any) => {
      console.error('Update category error:', error);
      const errorMessage = error.message || error.error_description || 'Unknown error occurred';
      toast.error('Failed to update category', { 
        description: errorMessage,
        duration: 5000,
      });
    },
  });

  // Delete category mutation
  const deleteCategory = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('directory_categories')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['directory-categories'] });
      toast.success('Category deleted successfully');
    },
    onError: (error: any) => {
      console.error('Delete category error:', error);
      const errorMessage = error.message || error.error_description || 'Unknown error occurred';
      toast.error('Failed to delete category', { 
        description: errorMessage,
        duration: 5000,
      });
    },
  });

  // Register provider (admin creates user account + provider profile)
  const registerProvider = useMutation({
    mutationFn: async (data: typeof providerFormData) => {
      // ✅ FIX: Ensure session is fresh before invocation
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!currentSession) {
        throw new Error('Authentication required. Please sign in again.');
      }

      // Use edge function for admin provider registration (requires service role key)
      const { data: result, error } = await supabase.functions.invoke('admin-register-provider', {
        body: {
          businessName: data.businessName,
          email: data.email,
          phone: data.phone,
          contactPerson: data.contactPerson || undefined,
          categoryId: data.categoryId === "none" ? undefined : (data.categoryId || undefined),
          password: data.password || undefined,
          autoApprove: data.autoApprove,
        },
        headers: {
          Authorization: `Bearer ${currentSession.access_token}`,
        },
      });

      if (error) {
        console.error('Edge function invocation error:', error);
        // Extract more detailed error information if available
        let message = 'Failed to register provider. Please try again.';
        if (error.message?.includes('400')) message = 'Invalid data or user already exists.';
        if (error.message?.includes('401')) message = 'Authentication session expired. Please sign in again.';
        if (error.message?.includes('403')) message = 'Access denied. Admin role required.';
        if (error.message?.includes('500')) message = 'Internal server error in registration service.';
        
        throw new Error(message);
      }
      
      if (result?.error) {
        console.error('Edge function returned error:', result.error);
        throw new Error(result.error);
      }

      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['service-providers'] });
      setProviderRegisterDialogOpen(false);
      resetProviderForm();
      toast.success(
        providerFormData.autoApprove
          ? 'Provider registered and approved successfully! Email sent with login credentials.'
          : 'Provider registered successfully! Pending approval.',
        { duration: 5000 }
      );
    },
    onError: (error: any) => {
      console.error('Register provider error:', error);
      const errorMessage = error.message || error.error_description || 'Unknown error occurred';
      toast.error('Failed to register provider', { 
        description: errorMessage,
        duration: 5000,
      });
    },
  });

  // Update provider mutation
  const updateProvider = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; businessName: string; phone: string; email: string; contactPerson: string; categoryId: string | null }) => {
      const { error } = await supabase
        .from('service_providers')
        .update({
          business_name: data.businessName,
          contact_person: data.contactPerson || null,
          phone: data.phone,
          email: data.email,
          category_id: data.categoryId === "none" ? null : (data.categoryId || null),
        })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-providers'] });
      setProviderEditDialogOpen(false);
      setSelectedProvider(null);
      resetProviderForm();
      toast.success('Provider updated successfully');
    },
    onError: (error: any) => {
      console.error('Update provider error:', error);
      const errorMessage = error.message || error.error_description || 'Unknown error occurred';
      toast.error('Failed to update provider', { 
        description: errorMessage,
        duration: 5000,
      });
    },
  });

  // Delete provider mutation
  const deleteProvider = useMutation({
    mutationFn: async (providerId: string) => {
      // Get user_id first
      const { data: provider } = await supabase
        .from('service_providers')
        .select('user_id')
        .eq('id', providerId)
        .single();

      if (!provider) throw new Error('Provider not found');

      // Delete provider profile (cascades to bookings, ratings)
      const { error: providerError } = await supabase
        .from('service_providers')
        .delete()
        .eq('id', providerId);

      if (providerError) throw providerError;

      // Optionally delete user account (uncomment if you want to delete the user too)
      // await supabase.auth.admin.deleteUser(provider.user_id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-providers'] });
      toast.success('Provider deleted successfully');
    },
    onError: (error: any) => {
      console.error('Delete provider error:', error);
      const errorMessage = error.message || error.error_description || 'Unknown error occurred';
      toast.error('Failed to delete provider', { 
        description: errorMessage,
        duration: 5000,
      });
    },
  });

  // Approve provider mutation
  const approveProvider = useMutation({
    mutationFn: async (providerId: string) => {
      // ✅ FIX: Ensure session is fresh before invocation
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!currentSession) {
        throw new Error('Authentication required. Please sign in again.');
      }

      const { error } = await supabase
        .from('service_providers')
        .update({ 
          approval_status: 'approved',
          approved_at: new Date().toISOString(),
        })
        .eq('id', providerId);
      
      if (error) throw error;

      // Send approval email
      const provider = providers.find(p => p.id === providerId);
      if (provider?.email) {
        const { error: emailError } = await supabase.functions.invoke('send-provider-approval-email', {
          body: {
            providerId: providerId,
            providerEmail: provider.email,
            businessName: provider.business_name,
          },
          headers: {
            Authorization: `Bearer ${currentSession.access_token}`,
          },
        });

        if (emailError) {
          console.error('Email sending error:', emailError);
          // Don't throw here, the provider was already approved in DB
          toast.error('Provider approved, but failed to send email');
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-providers'] });
      setApprovalDialogOpen(false);
      setSelectedProvider(null);
      toast.success('Provider approved and email sent');
    },
    onError: (error: any) => {
      toast.error('Failed to approve provider', { description: error.message });
    },
  });

  // Reject provider mutation
  const rejectProvider = useMutation({
    mutationFn: async ({ providerId, reason }: { providerId: string; reason: string }) => {
      const { error } = await supabase
        .from('service_providers')
        .update({ 
          approval_status: 'rejected',
          rejection_reason: reason,
        })
        .eq('id', providerId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-providers'] });
      setApprovalDialogOpen(false);
      setSelectedProvider(null);
      toast.success('Provider rejected');
    },
    onError: (error: any) => {
      toast.error('Failed to reject provider', { description: error.message });
    },
  });

  const handleOpenCategoryDialog = (category?: DirectoryCategory) => {
    if (category) {
      setEditingCategory(category);
      setCategoryName(category.name);
      setCategoryIcon(category.icon || "");
      setCategoryOrder(category.display_order);
    } else {
      setEditingCategory(null);
      resetCategoryForm();
    }
    setCategoryDialogOpen(true);
  };

  const handleSaveCategory = async () => {
    if (!categoryName.trim()) {
      toast.error("Category name is required");
      return;
    }

    const data = {
      name: categoryName.trim(),
      icon: categoryIcon.trim() || null,
      display_order: categoryOrder,
    };

    try {
      if (editingCategory) {
        await updateCategory.mutateAsync({ id: editingCategory.id, ...data });
      } else {
        await createCategory.mutateAsync(data);
      }
    } catch (error: any) {
      console.error('Category save error:', error);
      // Error is already handled by mutation onError
    }
  };

  const resetCategoryForm = () => {
    setEditingCategory(null);
    setCategoryName("");
    setCategoryIcon("");
    setCategoryOrder(0);
  };

  const resetProviderForm = () => {
    setProviderFormData({
      businessName: "",
      email: "",
      phone: "",
      contactPerson: "",
      categoryId: "none",
      password: "",
      autoApprove: false,
    });
  };

  const handleOpenRegisterProvider = () => {
    resetProviderForm();
    setProviderRegisterDialogOpen(true);
  };

  const handleOpenEditProvider = (provider: ServiceProvider) => {
    setSelectedProvider(provider);
    setProviderFormData({
      businessName: provider.business_name,
      email: provider.email || "",
      phone: provider.phone,
      contactPerson: provider.contact_person || "",
      categoryId: provider.category_id || "none",
      password: "", // Don't show password for editing
      autoApprove: false,
    });
    setProviderEditDialogOpen(true);
  };

  const handleRegisterProvider = async () => {
    if (!providerFormData.businessName || !providerFormData.email || !providerFormData.phone) {
      toast.error('Please fill in all required fields (Business Name, Email, Phone)');
      return;
    }

    if (!providerFormData.password && !providerFormData.autoApprove) {
      toast.error('Please provide a password or enable auto-approve to generate one');
      return;
    }

    await registerProvider.mutateAsync(providerFormData);
  };

  const handleUpdateProvider = async () => {
    if (!selectedProvider) return;
    
    if (!providerFormData.businessName || !providerFormData.email || !providerFormData.phone) {
      toast.error('Please fill in all required fields');
      return;
    }

    await updateProvider.mutateAsync({
      id: selectedProvider.id,
      businessName: providerFormData.businessName,
      email: providerFormData.email,
      phone: providerFormData.phone,
      contactPerson: providerFormData.contactPerson,
      categoryId: providerFormData.categoryId || null,
    });
  };

  const handleDeleteProvider = async (provider: ServiceProvider) => {
    if (!confirm(`Are you sure you want to delete "${provider.business_name}"? This action cannot be undone.`)) {
      return;
    }
    await deleteProvider.mutateAsync(provider.id);
  };

  const handleApprove = (provider: ServiceProvider) => {
    setSelectedProvider(provider);
    setApprovalDialogOpen(true);
  };

  const handleReject = (provider: ServiceProvider) => {
    setSelectedProvider(provider);
    const reason = prompt('Enter rejection reason:');
    if (reason) {
      rejectProvider.mutate({ providerId: provider.id, reason });
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      pending: "secondary",
      approved: "default",
      rejected: "destructive",
      needs_reapproval: "outline",
    };
    
    return (
      <Badge variant={variants[status] || "secondary"}>
        {status.replace('_', ' ')}
      </Badge>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Directory Management</h1>
          <p className="text-muted-foreground">
            Manage service provider categories and approve provider registrations
          </p>
        </div>

        <Tabs defaultValue="providers" className="space-y-4">
          <TabsList>
            <TabsTrigger value="providers">
              <Building2 className="h-4 w-4 mr-2" />
              Providers ({filteredProviders.length})
            </TabsTrigger>
            <TabsTrigger value="categories">
              <FolderPlus className="h-4 w-4 mr-2" />
              Categories ({categories.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="providers" className="space-y-4">
            {/* Filters */}
            <Card>
              <CardHeader>
                <CardTitle>Filters</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search providers..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                      <SelectItem value="needs_reapproval">Needs Re-approval</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Filter by category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {categories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Providers Table */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Service Providers</CardTitle>
                    <CardDescription>
                      Register new providers and manage existing ones
                    </CardDescription>
                  </div>
                  <Button onClick={handleOpenRegisterProvider}>
                    <Plus className="h-4 w-4 mr-2" />
                    Register Provider
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {providersLoading ? (
                  <div className="text-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                  </div>
                ) : filteredProviders.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No providers found
                  </div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Business Name</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Contact</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredProviders.map((provider) => (
                          <TableRow key={provider.id}>
                            <TableCell className="font-medium">
                              {provider.business_name}
                            </TableCell>
                            <TableCell>
                              {provider.category?.name || 'Uncategorized'}
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">
                                <div>{provider.phone}</div>
                                {provider.email && (
                                  <div className="text-muted-foreground">{provider.email}</div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              {getStatusBadge(provider.approval_status)}
                            </TableCell>
                            <TableCell>
                              {new Date(provider.created_at).toLocaleDateString('en-US', {
                                timeZone: 'Africa/Lagos'
                              })}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                {provider.approval_status === 'pending' && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="default"
                                      onClick={() => handleApprove(provider)}
                                    >
                                      <CheckCircle2 className="h-4 w-4 mr-1" />
                                      Approve
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      onClick={() => handleReject(provider)}
                                    >
                                      <XCircle className="h-4 w-4 mr-1" />
                                      Reject
                                    </Button>
                                  </>
                                )}
                                {provider.approval_status === 'needs_reapproval' && (
                                  <Button
                                    size="sm"
                                    variant="default"
                                    onClick={() => handleApprove(provider)}
                                  >
                                    <CheckCircle2 className="h-4 w-4 mr-1" />
                                    Re-approve
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleOpenEditProvider(provider)}
                                >
                                  <Edit className="h-4 w-4 mr-1" />
                                  Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setSelectedProvider(provider);
                                    setProviderDialogOpen(true);
                                  }}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleDeleteProvider(provider)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="categories" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Categories</CardTitle>
                    <CardDescription>Manage service provider categories</CardDescription>
                  </div>
                  <Button onClick={() => handleOpenCategoryDialog()}>
                    <Plus className="h-4 w-4 mr-2" />
                    New Category
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {categoriesLoading ? (
                  <div className="text-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                  </div>
                ) : categories.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No categories yet. Create one to get started.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {categories.map((category) => (
                      <div
                        key={category.id}
                        className="flex items-center justify-between p-3 rounded-lg border bg-card"
                      >
                        <div>
                          <div className="font-medium">{category.name}</div>
                          {category.icon && (
                            <div className="text-sm text-muted-foreground">{category.icon}</div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenCategoryDialog(category)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (confirm('Are you sure you want to delete this category?')) {
                                deleteCategory.mutate(category.id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Category Dialog */}
        <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingCategory ? "Edit Category" : "Create Category"}
              </DialogTitle>
              <DialogDescription>
                {editingCategory
                  ? "Update the category details"
                  : "Create a new category for service providers"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="category-name">Name *</Label>
                <Input
                  id="category-name"
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  placeholder="e.g., Mechanic, Car Wash"
                />
              </div>
              <div>
                <Label htmlFor="category-icon">Icon (optional)</Label>
                <Input
                  id="category-icon"
                  value={categoryIcon}
                  onChange={(e) => setCategoryIcon(e.target.value)}
                  placeholder="Icon name or emoji"
                />
              </div>
              <div>
                <Label htmlFor="category-order">Display Order</Label>
                <Input
                  id="category-order"
                  type="number"
                  value={categoryOrder}
                  onChange={(e) => setCategoryOrder(parseInt(e.target.value) || 0)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCategoryDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSaveCategory}
                disabled={createCategory.isPending || updateCategory.isPending}
              >
                {(createCategory.isPending || updateCategory.isPending) && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Approval Dialog */}
        <Dialog open={approvalDialogOpen} onOpenChange={setApprovalDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Approve Provider</DialogTitle>
              <DialogDescription>
                Approve {selectedProvider?.business_name}? An email will be sent with login credentials.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setApprovalDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => selectedProvider && approveProvider.mutate(selectedProvider.id)}
                disabled={approveProvider.isPending}
              >
                {approveProvider.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Approve & Send Email
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Register Provider Dialog */}
        <Dialog open={providerRegisterDialogOpen} onOpenChange={setProviderRegisterDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Register New Service Provider</DialogTitle>
              <DialogDescription>
                Create a new provider account and profile
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="provider-business-name">Business Name *</Label>
                <Input
                  id="provider-business-name"
                  value={providerFormData.businessName}
                  onChange={(e) => setProviderFormData({ ...providerFormData, businessName: e.target.value })}
                  placeholder="e.g., ABC Auto Services"
                  required
                />
              </div>

              <div>
                <Label htmlFor="provider-category">Category</Label>
                <Select 
                  value={providerFormData.categoryId} 
                  onValueChange={(value) => setProviderFormData({ ...providerFormData, categoryId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Uncategorized</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="provider-contact-person">Contact Person Name</Label>
                <Input
                  id="provider-contact-person"
                  value={providerFormData.contactPerson}
                  onChange={(e) => setProviderFormData({ ...providerFormData, contactPerson: e.target.value })}
                  placeholder="e.g., John Doe"
                />
              </div>

              <div>
                <Label htmlFor="provider-phone">Phone Number *</Label>
                <Input
                  id="provider-phone"
                  type="tel"
                  value={providerFormData.phone}
                  onChange={(e) => setProviderFormData({ ...providerFormData, phone: e.target.value })}
                  placeholder="+234 800 000 0000"
                  required
                />
              </div>

              <div>
                <Label htmlFor="provider-email">Email Address *</Label>
                <Input
                  id="provider-email"
                  type="email"
                  value={providerFormData.email}
                  onChange={(e) => setProviderFormData({ ...providerFormData, email: e.target.value })}
                  placeholder="provider@example.com"
                  required
                />
              </div>

              <div>
                <Label htmlFor="provider-password">Password {providerFormData.autoApprove ? '(Auto-generated)' : '*'}</Label>
                <Input
                  id="provider-password"
                  type="password"
                  value={providerFormData.password}
                  onChange={(e) => setProviderFormData({ ...providerFormData, password: e.target.value })}
                  placeholder={providerFormData.autoApprove ? "Will be auto-generated" : "At least 6 characters"}
                  disabled={providerFormData.autoApprove}
                  required={!providerFormData.autoApprove}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {providerFormData.autoApprove 
                    ? "Password will be generated and sent via email"
                    : "Provider will use this password to log in"}
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="auto-approve"
                  checked={providerFormData.autoApprove}
                  onCheckedChange={(checked) => setProviderFormData({ ...providerFormData, autoApprove: !!checked, password: checked ? "" : providerFormData.password })}
                />
                <Label htmlFor="auto-approve" className="cursor-pointer font-normal">
                  Auto-approve and send login credentials via email
                </Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setProviderRegisterDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleRegisterProvider}
                disabled={registerProvider.isPending}
              >
                {registerProvider.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Registering...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Register Provider
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Provider Dialog */}
        <Dialog open={providerEditDialogOpen} onOpenChange={setProviderEditDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Provider</DialogTitle>
              <DialogDescription>
                Update provider information
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-business-name">Business Name *</Label>
                <Input
                  id="edit-business-name"
                  value={providerFormData.businessName}
                  onChange={(e) => setProviderFormData({ ...providerFormData, businessName: e.target.value })}
                  required
                />
              </div>

              <div>
                <Label htmlFor="edit-category">Category</Label>
                <Select 
                  value={providerFormData.categoryId} 
                  onValueChange={(value) => setProviderFormData({ ...providerFormData, categoryId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Uncategorized</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="edit-contact-person">Contact Person Name</Label>
                <Input
                  id="edit-contact-person"
                  value={providerFormData.contactPerson}
                  onChange={(e) => setProviderFormData({ ...providerFormData, contactPerson: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="edit-phone">Phone Number *</Label>
                <Input
                  id="edit-phone"
                  type="tel"
                  value={providerFormData.phone}
                  onChange={(e) => setProviderFormData({ ...providerFormData, phone: e.target.value })}
                  required
                />
              </div>

              <div>
                <Label htmlFor="edit-email">Email Address *</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={providerFormData.email}
                  onChange={(e) => setProviderFormData({ ...providerFormData, email: e.target.value })}
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setProviderEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleUpdateProvider}
                disabled={updateProvider.isPending}
              >
                {updateProvider.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <Edit className="h-4 w-4 mr-2" />
                    Update Provider
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Provider Details Dialog */}
        <Dialog open={providerDialogOpen} onOpenChange={setProviderDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedProvider?.business_name}</DialogTitle>
              <DialogDescription>Provider details and profile information</DialogDescription>
            </DialogHeader>
            {selectedProvider && (
              <div className="space-y-4">
                <div>
                  <Label>Business Information</Label>
                  <div className="mt-2 space-y-2">
                    <div><strong>Name:</strong> {selectedProvider.business_name}</div>
                    <div><strong>Contact Person:</strong> {selectedProvider.contact_person || 'N/A'}</div>
                    <div><strong>Phone:</strong> {selectedProvider.phone}</div>
                    <div><strong>Email:</strong> {selectedProvider.email || 'N/A'}</div>
                    <div><strong>Category:</strong> {selectedProvider.category?.name || 'Uncategorized'}</div>
                    <div><strong>Status:</strong> {getStatusBadge(selectedProvider.approval_status)}</div>
                  </div>
                </div>
                {selectedProvider.profile_data && (
                  <div>
                    <Label>Profile Data</Label>
                    <div className="mt-2 space-y-2">
                      {selectedProvider.profile_data.description && (
                        <div><strong>Description:</strong> {selectedProvider.profile_data.description}</div>
                      )}
                      {selectedProvider.profile_data.location && (
                        <div>
                          <strong>Location:</strong> {selectedProvider.profile_data.location.address}
                        </div>
                      )}
                      {selectedProvider.profile_data.perks && selectedProvider.profile_data.perks.length > 0 && (
                        <div>
                          <strong>Perks:</strong>
                          <ul className="list-disc list-inside">
                            {selectedProvider.profile_data.perks.map((perk, idx) => (
                              <li key={idx}>{perk}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {selectedProvider.pending_changes && (
                  <div>
                    <Label>Pending Changes (Awaiting Re-approval)</Label>
                    <div className="mt-2 p-3 bg-muted rounded-lg">
                      <pre className="text-sm overflow-auto">
                        {JSON.stringify(selectedProvider.pending_changes, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setProviderDialogOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
