import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const ProviderProfile = () => {
  const { user, providerProfile, refreshProviderProfile } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  
  const [categories, setCategories] = useState<any[]>([]);
  
  const [formData, setFormData] = useState({
    businessName: '',
    contactPerson: '',
    phone: '',
    address: '',
    city: '',
    categoryId: '',
  });

  useEffect(() => {
    const fetchCategories = async () => {
      const { data } = await supabase
        .from('directory_categories')
        .select('id, name')
        .eq('is_active', true)
        .order('name');
      
      if (data) {
        setCategories(data);
      }
    };
    
    fetchCategories();
  }, []);

  useEffect(() => {
    if (providerProfile) {
      setFormData({
        businessName: providerProfile.business_name || '',
        contactPerson: providerProfile.contact_person || '',
        phone: providerProfile.phone || '',
        address: providerProfile.address || '',
        city: providerProfile.city || '',
        categoryId: providerProfile.category_id || '',
      });
    }
  }, [providerProfile]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setIsSaving(true);
    setMessage(null);
    
    try {
      const { error } = await supabase
        .from('service_providers')
        .update({
          business_name: formData.businessName,
          contact_person: formData.contactPerson,
          phone: formData.phone,
          address: formData.address,
          city: formData.city,
          category_id: formData.categoryId || null,
        })
        .eq('user_id', user.id);
        
      if (error) throw error;
      
      await refreshProviderProfile();
      setMessage({ type: 'success', text: 'Profile updated successfully' });
    } catch (error: any) {
      console.error('Error updating profile:', error);
      setMessage({ type: 'error', text: error.message || 'Failed to update profile' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-blue-900">Provider Profile</h1>
          <Button variant="outline" onClick={() => window.history.back()}>
            Back to Dashboard
          </Button>
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle>Business Information</CardTitle>
            <CardDescription>Update your business details and contact information</CardDescription>
          </CardHeader>
          <CardContent>
            {message && (
              <Alert className={`mb-6 ${message.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                <AlertDescription>{message.text}</AlertDescription>
              </Alert>
            )}
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="businessName">Business Name</Label>
                  <Input
                    id="businessName"
                    name="businessName"
                    value={formData.businessName}
                    onChange={handleChange}
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="contactPerson">Contact Person</Label>
                  <Input
                    id="contactPerson"
                    name="contactPerson"
                    value={formData.contactPerson}
                    onChange={handleChange}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="categoryId">Business Category</Label>
                  <select
                    id="categoryId"
                    name="categoryId"
                    value={formData.categoryId}
                    onChange={handleChange}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">Select a category</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    name="city"
                    value={formData.city}
                    onChange={handleChange}
                  />
                </div>
                
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="address">Address</Label>
                  <Input
                    id="address"
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                  />
                </div>
              </div>
              
              <div className="flex justify-end pt-4">
                <Button type="submit" disabled={isSaving} className="bg-blue-600 hover:bg-blue-700">
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Save Changes
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ProviderProfile;
