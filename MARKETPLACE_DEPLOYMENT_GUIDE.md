# Marketplace Feature - Deployment Guide

## 🚨 IMPORTANT: Run Database Migrations First

The Marketplace feature requires database tables that don't exist yet. You must run the migrations before using the feature.

## Step 1: Run Database Migrations

### Option A: Using Supabase SQL Editor (Recommended)

1. **Open Supabase Dashboard**
   - Go to: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/sql/new

2. **Run the Migration File**
   - Open the file: `DEPLOY_MARKETPLACE_MIGRATIONS.sql`
   - **Copy the ENTIRE contents** of the file
   - Paste into the Supabase SQL Editor
   - Click **Run** (or press Ctrl+Enter)

3. **Verify Success**
   - You should see "Success. No rows returned" or similar success message
   - Check that tables were created:
     ```sql
     SELECT table_name 
     FROM information_schema.tables 
     WHERE table_schema = 'public' 
     AND table_name IN (
       'service_categories',
       'service_providers',
       'marketplace_services',
       'marketplace_appointments',
       'ad_campaigns',
       'ad_message_log'
     );
     ```

### Option B: Using Supabase CLI

```bash
# Link your project (if not already linked)
supabase link --project-ref cmvpnsqiefbsqkwnraka

# Push migrations
supabase db push
```

## Step 2: Deploy Edge Functions

You need to deploy three new edge functions:

### 2.1 Deploy marketplace-search

1. Go to: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/functions
2. Click **"Create a new function"** or find `marketplace-search`
3. Copy code from: `supabase/functions/marketplace-search/index.ts`
4. Paste and deploy

### 2.2 Deploy match-ads

1. Go to: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/functions
2. Click **"Create a new function"** or find `match-ads`
3. Copy code from: `supabase/functions/match-ads/index.ts`
4. Paste and deploy

### 2.3 Deploy booking-handler

1. Go to: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/functions
2. Click **"Create a new function"** or find `booking-handler`
3. Copy code from: `supabase/functions/booking-handler/index.ts`
4. Paste and deploy

### 2.4 Update billing-cron

The `billing-cron` function has been updated to include ad campaign billing. If you haven't updated it recently:

1. Go to: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/functions/billing-cron
2. Copy code from: `supabase/functions/billing-cron/index.ts`
3. Paste and deploy

## Step 3: Verify Environment Variables

Make sure these are set in your Supabase project:

- `SUPABASE_URL` (should already be set)
- `SUPABASE_SERVICE_ROLE_KEY` (should already be set)

Check in: Supabase Dashboard → Edge Functions → [Function Name] → Settings

## Step 4: Test the Feature

1. **Test Marketplace Page**
   - Navigate to `/marketplace` in your app
   - Should see empty state (no providers yet)
   - Should NOT see the error about `service_categories` table

2. **Test Provider Registration** (as admin)
   - Assign 'provider' role to a test user
   - Navigate to `/provider/register`
   - Fill out registration form
   - Submit and verify it appears in admin approval queue

3. **Test Admin Approval**
   - Go to `/admin/marketplace/providers`
   - Approve a test provider
   - Verify provider appears in marketplace search

## Troubleshooting

### Error: "Could not find the table 'public.service_categories'"
- **Solution**: Run `DEPLOY_MARKETPLACE_MIGRATIONS.sql` in Supabase SQL Editor

### Error: "function search_providers_nearby does not exist"
- **Solution**: The migration didn't complete. Re-run `DEPLOY_MARKETPLACE_MIGRATIONS.sql`

### Error: "permission denied for table service_categories"
- **Solution**: RLS policies may not have been created. Re-run the RLS policy sections of the migration

### Edge Function Errors
- Check function logs in Supabase Dashboard → Edge Functions → [Function] → Logs
- Verify environment variables are set correctly
- Ensure the function code matches the file in the repository

## What Was Created

### Database Tables
- ✅ `service_categories` - Admin-managed service categories
- ✅ `service_providers` - Provider profiles with location data
- ✅ `marketplace_services` - Services/products offered
- ✅ `marketplace_appointments` - Customer bookings
- ✅ `ad_campaigns` - Location-based ad campaigns
- ✅ `ad_message_log` - Ad deduplication tracking

### Edge Functions
- ✅ `marketplace-search` - Location-based provider search
- ✅ `match-ads` - Cron function for ad matching
- ✅ `booking-handler` - Appointment creation handler
- ✅ `billing-cron` - Updated to include ad billing

### Frontend Pages
- ✅ `/marketplace` - Browse and book services
- ✅ `/provider/register` - Provider registration
- ✅ `/provider/dashboard` - Provider management
- ✅ `/admin/marketplace/providers` - Admin approval queue

## Next Steps

1. ✅ Run migrations (Step 1)
2. ✅ Deploy edge functions (Step 2)
3. ✅ Test basic functionality (Step 4)
4. Create test providers and services
5. Test booking flow end-to-end
6. Set up ad campaigns and test ad matching
