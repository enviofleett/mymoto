# Vehicle Installation Request - Implementation Plan & Recommendations

## 🎯 **Recommended Architecture Overview**

### **Core Principle: Separation of Concerns**
- **Installation Requests** = Pre-installation workflow (separate tables)
- **Live Vehicles** = Post-installation tracking (existing `vehicles` table)
- **Admin Workflow** = Bridge between the two

---

## 📊 **1. Database Schema Design**

### **Recommended Schema (with improvements)**

```sql
-- 1. Installation Cities (Admin-managed)
CREATE TABLE public.installation_cities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Installation Centers (Linked to cities)
CREATE TABLE public.installation_centers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    city_id UUID NOT NULL REFERENCES public.installation_cities(id) ON DELETE CASCADE,
    contact_phone TEXT,
    contact_email TEXT,
    active BOOLEAN DEFAULT true,
    operating_hours JSONB DEFAULT '{}'::jsonb, -- { "monday": "9am-5pm", ... }
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(name, city_id) -- Prevent duplicate center names in same city
);

-- 3. Vehicle Installation Requests (The ticket system)
CREATE TABLE public.vehicle_installation_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    profile_id UUID REFERENCES public.profiles(id), -- Link to profile for easier admin lookup
    
    -- Vehicle details (JSON for flexibility)
    vehicle_details JSONB NOT NULL DEFAULT '{}'::jsonb, -- { brand, model, year, plate_number }
    
    -- Installation details
    center_id UUID NOT NULL REFERENCES public.installation_centers(id),
    preferred_date DATE NOT NULL,
    preferred_time_slot TEXT, -- "morning", "afternoon", "evening" (optional)
    
    -- Status workflow
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled', 'rescheduled')),
    
    -- Admin notes
    admin_notes TEXT,
    completed_by UUID REFERENCES auth.users(id), -- Admin who marked as completed
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Device assignment (filled when completed)
    device_id TEXT, -- Will be populated when admin creates vehicle record
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    
    -- Constraints
    CONSTRAINT valid_future_date CHECK (preferred_date >= CURRENT_DATE + INTERVAL '1 day')
);

-- Indexes for performance
CREATE INDEX idx_installation_requests_user ON public.vehicle_installation_requests(user_id);
CREATE INDEX idx_installation_requests_status ON public.vehicle_installation_requests(status);
CREATE INDEX idx_installation_requests_date ON public.vehicle_installation_requests(preferred_date);
CREATE INDEX idx_installation_requests_center ON public.installation_centers(city_id);
CREATE INDEX idx_installation_requests_plate ON public.vehicle_installation_requests USING GIN ((vehicle_details->>'plate_number'));

-- RLS Policies
ALTER TABLE public.installation_cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installation_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_installation_requests ENABLE ROW LEVEL SECURITY;

-- Users can view active cities/centers
CREATE POLICY "Users can view active cities"
ON public.installation_cities FOR SELECT
TO authenticated
USING (active = true);

CREATE POLICY "Users can view active centers"
ON public.installation_centers FOR SELECT
TO authenticated
USING (active = true);

-- Users can create their own requests
CREATE POLICY "Users can create installation requests"
ON public.vehicle_installation_requests FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can view their own requests
CREATE POLICY "Users can view own requests"
ON public.vehicle_installation_requests FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Admins can manage everything
CREATE POLICY "Admins can manage cities"
ON public.installation_cities FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage centers"
ON public.installation_centers FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage all requests"
ON public.vehicle_installation_requests FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Triggers for updated_at
CREATE TRIGGER update_installation_cities_updated_at
BEFORE UPDATE ON public.installation_cities
FOR EACH ROW
EXECUTE FUNCTION public.update_app_settings_updated_at();

CREATE TRIGGER update_installation_centers_updated_at
BEFORE UPDATE ON public.installation_centers
FOR EACH ROW
EXECUTE FUNCTION public.update_app_settings_updated_at();

CREATE TRIGGER update_installation_requests_updated_at
BEFORE UPDATE ON public.vehicle_installation_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_app_settings_updated_at();
```

### **Key Design Decisions:**
1. ✅ **JSONB for vehicle_details** - Flexible, allows adding fields without migrations
2. ✅ **profile_id denormalization** - Faster admin queries (no join needed)
3. ✅ **device_id nullable** - Only populated after completion
4. ✅ **status enum with CHECK constraint** - Data integrity
5. ✅ **Future date constraint** - Enforced at DB level
6. ✅ **GIN index on plate_number** - Fast duplicate checking

---

## 🔧 **2. API/Edge Function Structure**

### **Recommended: Use Supabase Edge Functions**

**Option A: Single Edge Function (Recommended for MVP)**
```
supabase/functions/installation-requests/
├── index.ts (main handler)
├── create-request.ts (user creates request)
├── admin-operations.ts (admin CRUD)
└── validation.ts (shared validation logic)
```

**Option B: Separate Functions (Better for scale)**
- `create-installation-request` - User creates request
- `admin-installation-queue` - Admin manages queue
- `complete-installation` - Admin marks complete + creates vehicle

### **Recommended Edge Function Logic:**

```typescript
// supabase/functions/installation-requests/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const { method, pathname } = req
  const url = new URL(req.url)

  // Route handling
  if (method === 'POST' && pathname === '/create') {
    return handleCreateRequest(req, supabase)
  }
  
  if (method === 'GET' && pathname === '/cities') {
    return handleGetCities(supabase)
  }
  
  if (method === 'GET' && pathname === '/centers') {
    const cityId = url.searchParams.get('city_id')
    return handleGetCenters(supabase, cityId)
  }
  
  // Admin routes
  if (method === 'GET' && pathname === '/admin/queue') {
    return handleAdminQueue(req, supabase)
  }
  
  if (method === 'PATCH' && pathname.startsWith('/admin/update-status')) {
    return handleUpdateStatus(req, supabase)
  }
  
  if (method === 'POST' && pathname === '/admin/complete') {
    return handleCompleteInstallation(req, supabase)
  }
})

async function handleCreateRequest(req: Request, supabase: any) {
  const body = await req.json()
  const { user_id, vehicle_details, center_id, preferred_date } = body

  // Validation
  const minDate = new Date()
  minDate.setDate(minDate.getDate() + 1) // Must be > 24 hours
  
  if (new Date(preferred_date) < minDate) {
    return new Response(JSON.stringify({ error: 'Date must be at least 24 hours in the future' }), {
      status: 400
    })
  }

  // Check for duplicate plate number
  const { data: existing } = await supabase
    .from('vehicle_installation_requests')
    .select('id')
    .eq('status', 'pending')
    .or(`vehicle_details->>plate_number.eq.${vehicle_details.plate_number}`)
    .single()

  if (existing) {
    return new Response(JSON.stringify({ 
      error: 'A pending request already exists for this plate number' 
    }), {
      status: 409
    })
  }

  // Get user's profile_id
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_id', user_id)
    .single()

  // Create request
  const { data, error } = await supabase
    .from('vehicle_installation_requests')
    .insert({
      user_id,
      profile_id: profile?.id,
      vehicle_details,
      center_id,
      preferred_date,
      status: 'pending'
    })
    .select()
    .single()

  if (error) throw error

  return new Response(JSON.stringify({ success: true, data }), {
    headers: { 'Content-Type': 'application/json' }
  })
}

async function handleCompleteInstallation(req: Request, supabase: any) {
  const body = await req.json()
  const { request_id, device_id, admin_user_id } = body

  // Get request details
  const { data: request, error: fetchError } = await supabase
    .from('vehicle_installation_requests')
    .select('*, vehicle_details, user_id, profile_id')
    .eq('id', request_id)
    .single()

  if (fetchError || !request) {
    return new Response(JSON.stringify({ error: 'Request not found' }), {
      status: 404
    })
  }

  // Update request status
  await supabase
    .from('vehicle_installation_requests')
    .update({
      status: 'completed',
      device_id,
      completed_by: admin_user_id,
      completed_at: new Date().toISOString()
    })
    .eq('id', request_id)

  // Create vehicle assignment (link device to user)
  const { error: assignError } = await supabase
    .from('vehicle_assignments')
    .insert({
      device_id,
      profile_id: request.profile_id,
      assigned_by: admin_user_id
    })

  if (assignError) {
    console.error('Failed to create assignment:', assignError)
    // Don't fail - assignment can be done manually
  }

  return new Response(JSON.stringify({ 
    success: true,
    message: 'Installation completed. Vehicle is now live.',
    device_id 
  }), {
    headers: { 'Content-Type': 'application/json' }
  })
}
```

---

## 🎨 **3. Frontend Component Structure**

### **Recommended Component Hierarchy:**

```
src/
├── pages/
│   ├── owner/
│   │   └── OwnerInstallationRequest.tsx (New - user form)
│   └── admin/
│       ├── AdminInstallationSettings.tsx (New - city/center config)
│       └── AdminInstallationQueue.tsx (New - request management)
│
├── components/
│   ├── installation/
│   │   ├── InstallationRequestForm.tsx (Reusable form)
│   │   ├── CityCenterSelector.tsx (City → Center dropdown)
│   │   ├── VehicleDetailsForm.tsx (Brand/Model/Year/Plate)
│   │   └── InstallationRequestCard.tsx (Display request)
│   └── admin/
│       ├── InstallationQueueTable.tsx (Admin table view)
│       └── CompleteInstallationDialog.tsx (Modal for completion)
│
└── hooks/
    ├── useInstallationRequests.ts (User's requests)
    ├── useInstallationCities.ts (Cities list)
    ├── useInstallationCenters.ts (Centers by city)
    └── useAdminInstallationQueue.ts (Admin queue)
```

### **Key Component: InstallationRequestForm.tsx**

```typescript
// Recommended structure
export function InstallationRequestForm() {
  const [step, setStep] = useState(1) // Multi-step form
  const [formData, setFormData] = useState({
    brand: '',
    model: '',
    year: '',
    plateNumber: '',
    cityId: '',
    centerId: '',
    preferredDate: ''
  })

  const { data: cities } = useInstallationCities()
  const { data: centers } = useInstallationCenters(formData.cityId)
  
  // Validation
  const isValid = useMemo(() => {
    return formData.brand && formData.model && 
           formData.year && formData.plateNumber &&
           formData.cityId && formData.centerId &&
           formData.preferredDate
  }, [formData])

  // Submit handler
  const handleSubmit = async () => {
    // Call edge function
    // Show success toast
    // Navigate back
  }

  return (
    <MultiStepForm>
      <Step1: VehicleDetails />
      <Step2: LocationSelection />
      <Step3: DateSelection />
      <Step4: Confirmation />
    </MultiStepForm>
  )
}
```

---

## 🔄 **4. State Management Strategy**

### **Recommended: React Query (TanStack Query)**

```typescript
// hooks/useInstallationRequests.ts
export function useInstallationRequests() {
  const { user } = useAuth()
  
  return useQuery({
    queryKey: ['installation-requests', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vehicle_installation_requests')
        .select('*, installation_centers(*, installation_cities(*))')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      
      if (error) throw error
      return data
    },
    enabled: !!user?.id
  })
}

// hooks/useInstallationCenters.ts
export function useInstallationCenters(cityId: string | null) {
  return useQuery({
    queryKey: ['installation-centers', cityId],
    queryFn: async () => {
      if (!cityId) return []
      
      const { data, error } = await supabase
        .from('installation_centers')
        .select('*')
        .eq('city_id', cityId)
        .eq('active', true)
        .order('name')
      
      if (error) throw error
      return data
    },
    enabled: !!cityId
  })
}
```

---

## ✅ **5. Validation Logic Recommendations**

### **Client-Side Validation:**

```typescript
// utils/installationValidation.ts
export function validateInstallationRequest(data: {
  brand: string
  model: string
  year: string
  plateNumber: string
  preferredDate: string
}): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  // Plate number format (Nigerian format: ABC-123-DE)
  const plateRegex = /^[A-Z]{2,3}-?\d{1,4}-?[A-Z]{1,2}$/i
  if (!plateRegex.test(data.plateNumber)) {
    errors.push('Invalid plate number format')
  }

  // Year validation (1900 - current year + 1)
  const year = parseInt(data.year)
  const currentYear = new Date().getFullYear()
  if (year < 1900 || year > currentYear + 1) {
    errors.push('Invalid year')
  }

  // Date validation (must be > 24 hours)
  const selectedDate = new Date(data.preferredDate)
  const minDate = new Date()
  minDate.setDate(minDate.getDate() + 1)
  minDate.setHours(0, 0, 0, 0)
  
  if (selectedDate < minDate) {
    errors.push('Date must be at least 24 hours in the future')
  }

  // Check for duplicate plate (async - call API)
  // This should be done server-side

  return {
    valid: errors.length === 0,
    errors
  }
}
```

### **Server-Side Validation (Edge Function):**

```typescript
// Always validate on server - never trust client
async function validateRequest(data: any, supabase: any) {
  // 1. Check duplicate plate (pending requests only)
  // 2. Validate date constraint
  // 3. Validate center exists and is active
  // 4. Validate user exists
  // 5. Sanitize inputs
}
```

---

## 🚀 **6. Workflow Automation Recommendations**

### **Option A: Manual Workflow (Recommended for MVP)**
- Admin marks as "Completed" → Redirects to "Add Vehicle" page with pre-filled data
- Admin manually scans IMEI and creates vehicle record
- **Pros:** Simple, no edge cases
- **Cons:** Two-step process

### **Option B: Semi-Automated (Recommended for Production)**
- Admin marks as "Completed" → Dialog opens
- Dialog has IMEI input field
- On submit: Creates vehicle record + assignment automatically
- **Pros:** One-step, faster
- **Cons:** Requires IMEI validation logic

### **Option C: Fully Automated (Advanced)**
- Center staff marks complete via mobile app
- System auto-creates vehicle when IMEI is scanned
- **Pros:** Zero admin overhead
- **Cons:** Complex, requires center app

### **Recommended Implementation (Option B):**

```typescript
// components/admin/CompleteInstallationDialog.tsx
export function CompleteInstallationDialog({ 
  request, 
  onComplete 
}: { 
  request: InstallationRequest
  onComplete: (deviceId: string) => void 
}) {
  const [deviceId, setDeviceId] = useState('')
  const [isValidating, setIsValidating] = useState(false)

  const handleComplete = async () => {
    // 1. Validate IMEI format
    // 2. Check if device exists in GPS51
    // 3. Create vehicle record
    // 4. Create assignment
    // 5. Update request status
    // 6. Show success
  }

  return (
    <Dialog>
      <DialogContent>
        <h2>Complete Installation</h2>
        <p>Vehicle: {request.vehicle_details.brand} {request.vehicle_details.model}</p>
        <p>Plate: {request.vehicle_details.plate_number}</p>
        
        <Input
          label="Device IMEI"
          value={deviceId}
          onChange={(e) => setDeviceId(e.target.value)}
          placeholder="Scan or enter IMEI"
        />
        
        <Button onClick={handleComplete} disabled={!deviceId || isValidating}>
          {isValidating ? 'Validating...' : 'Complete Installation'}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
```

---

## 📱 **7. UI/UX Recommendations**

### **Owner Flow (PWA):**

1. **Entry Point:** Plus button in `OwnerVehicles.tsx` header
   ```tsx
   <button onClick={() => navigate('/owner/installation-request')}>
     <Plus className="h-5 w-5" />
   </button>
   ```

2. **Form Design:**
   - Use **multi-step wizard** (better UX than long form)
   - Show progress indicator (Step 1 of 3)
   - Use **neumorphic design** (matches your app style)
   - Add **real-time validation** (show errors as user types)

3. **Success State:**
   - Show success card with request ID
   - Display "What happens next?" info
   - Add link to view request status

### **Admin Flow:**

1. **Settings Page:** `AdminInstallationSettings.tsx`
   - Tab 1: Manage Cities (simple list with add/remove)
   - Tab 2: Manage Centers (table with city filter)
   - Use same neumorphic cards as other admin pages

2. **Queue Page:** `AdminInstallationQueue.tsx`
   - **Filters:** Status, Date range, City
   - **Table columns:** User, Vehicle, Center, Date, Status, Actions
   - **Status badges:** Color-coded (pending=yellow, confirmed=blue, completed=green)
   - **Quick actions:** Confirm, Complete, Cancel buttons

---

## 🔒 **8. Security & Best Practices**

### **RLS Policies (Already in schema above)**
✅ Users can only create/view their own requests
✅ Admins can manage everything
✅ Service role for edge functions

### **Additional Security:**
1. **Rate Limiting:** Max 3 requests per user per day
2. **Input Sanitization:** Sanitize all text inputs
3. **Date Validation:** Server-side validation (never trust client)
4. **Duplicate Prevention:** Check plate number at DB level

### **Data Integrity:**
1. **Foreign Keys:** All FKs with CASCADE where appropriate
2. **Constraints:** CHECK constraints for status, dates
3. **Indexes:** On frequently queried columns
4. **Triggers:** Auto-update `updated_at` timestamps

---

## 📋 **9. Implementation Phases**

### **Phase 1: Database & Admin Setup (Week 1)**
- [ ] Create migration files
- [ ] Create admin settings page (cities/centers)
- [ ] Test admin CRUD operations

### **Phase 2: User Request Flow (Week 2)**
- [ ] Create installation request form
- [ ] Implement city/center dropdown logic
- [ ] Add validation
- [ ] Create edge function for submission

### **Phase 3: Admin Queue (Week 3)**
- [ ] Create admin queue page
- [ ] Implement status updates
- [ ] Add filters and search

### **Phase 4: Completion Workflow (Week 4)**
- [ ] Create completion dialog
- [ ] Link to vehicle creation
- [ ] Test end-to-end flow

---

## 🎯 **10. Success Metrics**

### **User Metrics:**
- ✅ Request submission time < 60 seconds
- ✅ Form completion rate > 80%
- ✅ Zero duplicate requests (same plate)

### **Admin Metrics:**
- ✅ Queue visibility (all pending requests visible)
- ✅ Status update time < 30 seconds
- ✅ Completion-to-vehicle time < 5 minutes

### **Data Quality:**
- ✅ Zero "ghost vehicles" (vehicles without trackers)
- ✅ 100% requests have valid vehicle details
- ✅ All completed requests have device_id

---

## 💡 **11. Future Enhancements (Post-MVP)**

1. **Email Notifications:**
   - Send confirmation email to user
   - Send reminder 24h before appointment
   - Notify admin of new requests

2. **Calendar Integration:**
   - Show center availability
   - Block booked time slots
   - Auto-suggest available dates

3. **Mobile App for Centers:**
   - Centers can mark requests complete
   - Scan IMEI via camera
   - Upload installation photos

4. **Analytics Dashboard:**
   - Request volume by city
   - Average completion time
   - Popular vehicle brands/models

---

## 🚨 **12. Common Pitfalls to Avoid**

1. ❌ **Don't create vehicle records until installation is complete**
2. ❌ **Don't allow duplicate plate numbers in pending requests**
3. ❌ **Don't skip server-side validation**
4. ❌ **Don't forget to link profile_id for faster admin queries**
5. ❌ **Don't hardcode cities/centers - use database**
6. ❌ **Don't forget timezone handling for dates**

---

## 📝 **Summary: Recommended Approach**

**For MVP:**
- ✅ Use single edge function (`installation-requests`)
- ✅ Manual completion workflow (admin redirects to add vehicle)
- ✅ Simple multi-step form for users
- ✅ Basic admin queue table

**For Production:**
- ✅ Separate edge functions for better scaling
- ✅ Semi-automated completion (IMEI input in dialog)
- ✅ Enhanced form with real-time validation
- ✅ Advanced admin queue with filters/analytics

This architecture keeps installation requests completely separate from live vehicles, prevents database clutter, and provides a clear workflow for both users and admins.
