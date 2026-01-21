# User Registration and Vehicle Addition Fixes

## Issues Diagnosed

### 1. User Registration Error
**Problem**: `useCreateUserWithVehicles` hook was trying to use `supabase.auth.admin.createUser()` which requires admin privileges and doesn't work from the client side.

**Root Cause**: Client-side code cannot use admin API methods directly.

**Fix Applied**:
- Updated `useCreateUserWithVehicles` to use the `create-test-user` Edge Function instead
- Updated Edge Function to support optional password (for profile-only creation)
- Edge Function now properly returns `userId`, `profileId`, and `assignedVehicles`

### 2. Vehicle Addition Error
**Problem**: No UI component to manually add vehicles to the `vehicles` table. Vehicles must exist before they can be assigned.

**Root Cause**: Vehicles are only synced from GPS51, but there's no manual entry option.

**Fix Applied**:
- Created `AddVehicleDialog` component for admins to manually register vehicles
- Added "Add Vehicle" button to `AssignmentManagerDialog` (in vehicle selection section)
- Added "Add Vehicle" button to `UserVehicleGrid` (in vehicle search/filter section)
- Vehicle creation includes validation to prevent duplicates

### 3. Missing Sign-Up Form
**Problem**: Auth page only had sign-in, no public sign-up option.

**Fix Applied**:
- Added sign-up functionality to `Auth.tsx` page
- Toggle between sign-in and sign-up modes
- Uses existing `signUp` function from `AuthContext`

## Files Modified

1. **`src/hooks/useCreateUserWithVehicles.ts`**
   - Changed from direct admin API call to Edge Function invocation
   - Fixed response parsing to handle Edge Function return structure

2. **`supabase/functions/create-test-user/index.ts`**
   - Made password optional (can create profile-only users)
   - Made email optional when password not provided
   - Added proper CORS headers with status 200 for OPTIONS
   - Improved error handling and validation
   - Returns proper structure: `{ userId, profileId, assignedVehicles }`

3. **`src/components/admin/AddVehicleDialog.tsx`** (NEW)
   - New component for manually adding vehicles
   - Form validation
   - Duplicate checking
   - Error handling with permission checks

4. **`src/components/admin/AssignmentManagerDialog.tsx`**
   - Added "Add Vehicle" button in vehicle selection section
   - Integrated `AddVehicleDialog` component
   - Refreshes vehicle list after adding

5. **`src/components/admin/UserVehicleGrid.tsx`**
   - Added "Add Vehicle" button in vehicle search/filter section
   - Integrated `AddVehicleDialog` component
   - Refreshes vehicle list after adding

6. **`src/pages/Auth.tsx`**
   - Added sign-up mode toggle
   - Added `handleSignUp` function
   - UI updates to support both sign-in and sign-up

## Testing Checklist

### User Registration
- [ ] Test creating user with email + password (should create auth account)
- [ ] Test creating user with email only (should create profile only)
- [ ] Test creating user with name only (should create profile only)
- [ ] Test assigning vehicles during user creation
- [ ] Verify email notifications are sent (if enabled)

### Vehicle Addition
- [ ] Test adding a new vehicle via AssignmentManagerDialog
- [ ] Test adding a new vehicle via UserVehicleGrid
- [ ] Test duplicate vehicle ID prevention
- [ ] Verify vehicle appears in list after creation
- [ ] Test assigning newly created vehicle to user

### Sign-Up
- [ ] Test public sign-up from Auth page
- [ ] Verify email confirmation flow
- [ ] Test error handling for invalid inputs

## Common Errors and Solutions

### Error: "Failed to create auth user: ..."
**Solution**: Check Edge Function is deployed and has proper permissions. Verify `SUPABASE_SERVICE_ROLE_KEY` is set.

### Error: "Permission denied. Only admins can add vehicles."
**Solution**: Ensure user has admin role. Check RLS policies on `vehicles` table.

### Error: "Vehicle already exists"
**Solution**: Vehicle with that device_id is already registered. Use existing vehicle or choose different ID.

### Error: "Email is required when password is provided"
**Solution**: When creating auth account, email is mandatory. Provide email or skip password for profile-only creation.

## Next Steps

1. **Deploy Edge Function**: Make sure `create-test-user` is deployed with latest changes
2. **Test User Creation**: Try creating users with different combinations
3. **Test Vehicle Addition**: Add a test vehicle and verify it appears
4. **Verify RLS Policies**: Ensure admins can create vehicles and profiles
