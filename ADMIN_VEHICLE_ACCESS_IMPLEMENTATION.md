# Admin Vehicle Access & Primary Owner Implementation

## 🎯 **Requirements Implemented**

1. ✅ **Admins (including toolbuxdev@gmail.com) have access to ALL vehicles**
2. ✅ **All vehicles MUST have a primary owner (admin or toolbuxdev@gmail.com)**
3. ✅ **Vehicle registration automatically assigns primary owner**

---

## 📋 **What Was Implemented**

### **1. Database Schema Changes**

**Migration:** `supabase/migrations/20260124000002_admin_vehicle_access_and_primary_owner.sql`

#### **New Column:**
- `vehicles.primary_owner_profile_id` - UUID reference to profiles table
- **NOT NULL constraint** - Ensures all vehicles have a primary owner
- **Index** - For fast lookups

#### **New Functions:**
- `get_admin_profile_ids()` - Returns all admin profile IDs (toolbuxdev@gmail.com + any admin users)
- `ensure_primary_admin_profile()` - Creates profile for toolbuxdev@gmail.com if missing
- `ensure_vehicle_primary_owner()` - Trigger function to auto-assign primary owner
- `auto_assign_primary_owner()` - Auto-creates vehicle_assignments for primary owner

#### **New Triggers:**
- `ensure_vehicle_has_primary_owner_insert` - BEFORE INSERT - ensures primary owner is set
- `ensure_vehicle_has_primary_owner_update` - BEFORE UPDATE - prevents NULL primary owner
- `auto_assign_primary_owner_trigger` - AFTER INSERT - creates assignment for primary owner

#### **RLS Policy Updates:**
- **vehicles table:** Admins see all vehicles, users see assigned vehicles
- **vehicle_assignments table:** Admins see all assignments, users see their own

---

### **2. Edge Function Updates**

#### **gps-data/index.ts:**
- Updated `syncVehicles()` to set `primary_owner_profile_id` when syncing vehicles
- Calls `get_admin_profile_ids()` RPC to get primary admin profile

#### **gps51-user-auth/index.ts:**
- Updated vehicle creation to set `primary_owner_profile_id`
- Ensures all vehicles registered via GPS51 have primary owner

---

### **3. Frontend Hook Updates**

#### **useOwnerVehicles.ts:**
- **Admin users:** Fetches ALL vehicles from `vehicles` table (not filtered by assignments)
- **Regular users:** Fetches only assigned vehicles (existing behavior)
- Query key includes `isAdmin` for proper cache invalidation

---

## 🚀 **Deployment Steps**

### **Step 1: Run Migration**
```sql
-- File: supabase/migrations/20260124000002_admin_vehicle_access_and_primary_owner.sql
-- Run in Supabase SQL Editor
```

This migration will:
1. Add `primary_owner_profile_id` column
2. Create helper functions
3. Create triggers
4. Update all existing vehicles with primary owner
5. Add NOT NULL constraint
6. Update RLS policies

### **Step 2: Deploy Updated Edge Functions**

#### **gps-data function:**
- Already updated to set primary_owner_profile_id
- Deploy: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/functions/gps-data

#### **gps51-user-auth function:**
- Already updated to set primary_owner_profile_id
- Deploy: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/functions/gps51-user-auth

### **Step 3: Verify**

Run these SQL queries:

```sql
-- Check all vehicles have primary owner (should be 0 NULLs)
SELECT COUNT(*) as vehicles_without_primary_owner
FROM public.vehicles
WHERE primary_owner_profile_id IS NULL;

-- Check primary owner assignments
SELECT 
  v.device_id, 
  v.device_name, 
  p.name as primary_owner_name, 
  p.email as primary_owner_email
FROM public.vehicles v
JOIN public.profiles p ON p.id = v.primary_owner_profile_id
ORDER BY v.device_id
LIMIT 10;

-- Check admin profile IDs
SELECT * FROM public.get_admin_profile_ids();
```

---

## ✅ **How It Works**

### **For Admins:**
1. Admin logs in → `useOwnerVehicles` detects admin role
2. Hook fetches ALL vehicles (not filtered by assignments)
3. Admin sees entire fleet
4. Admin can set privileges for any vehicle

### **For Regular Users:**
1. User logs in → Hook checks assignments
2. Hook fetches only assigned vehicles
3. User sees only their vehicles

### **Vehicle Registration:**
1. Vehicle synced from GPS51 → `gps-data` function sets `primary_owner_profile_id`
2. Trigger ensures primary owner is set (fallback if function doesn't set it)
3. Trigger auto-creates `vehicle_assignments` entry for primary owner
4. Vehicle is immediately accessible to admins

### **Primary Owner Requirement:**
- **BEFORE INSERT trigger** - Auto-assigns primary owner if NULL
- **BEFORE UPDATE trigger** - Prevents setting primary owner to NULL
- **NOT NULL constraint** - Database-level enforcement
- **All existing vehicles** - Updated in migration

---

## 🔒 **Security**

- ✅ Admins can see all vehicles (RLS policy)
- ✅ Regular users only see assigned vehicles
- ✅ Primary owner is always an admin (enforced by triggers)
- ✅ Cannot remove primary owner (UPDATE trigger prevents NULL)

---

## 📝 **Notes**

- The primary owner is typically `toolbuxdev@gmail.com` profile
- If toolbuxdev@gmail.com doesn't exist, the trigger will create the profile
- All future vehicles will automatically get primary owner assigned
- Admins can reassign primary owner if needed (via admin panel)

---

## 🎯 **Result**

After deployment:
- ✅ toolbuxdev@gmail.com sees ALL vehicles
- ✅ Any admin user sees ALL vehicles  
- ✅ All vehicles have a primary owner
- ✅ Vehicle registration enforces primary owner requirement
- ✅ Regular users see only their assigned vehicles
