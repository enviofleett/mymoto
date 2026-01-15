# How to Deploy sync-trips-incremental Function

## File Location
The function code is located at:
```
supabase/functions/sync-trips-incremental/index.ts
```

## Deployment Command

### Option 1: Deploy from Project Root (Recommended)
Run this command from the **project root directory** (`/Users/alli/mymoto/fleet-heartbeat-dashboard-6f37655e`):

```bash
supabase functions deploy sync-trips-incremental
```

The CLI automatically finds the function in `supabase/functions/sync-trips-incremental/`

### Option 2: Deploy All Functions
To deploy all functions at once:

```bash
supabase functions deploy
```

### Option 3: Deploy via Supabase Dashboard
1. Go to Supabase Dashboard → Edge Functions
2. Find `sync-trips-incremental`
3. Click "Deploy" or edit the code directly in the dashboard

## Prerequisites

1. **Install Supabase CLI** (if not already installed):
   ```bash
   npm install -g supabase
   ```

2. **Login to Supabase**:
   ```bash
   supabase login
   ```

3. **Link your project** (if not already linked):
   ```bash
   supabase link --project-ref cmvpnsqiefbsqkwnraka
   ```

## Verify Deployment

After deployment, check the function logs:
```bash
supabase functions logs sync-trips-incremental
```

Or check in the Supabase Dashboard → Edge Functions → sync-trips-incremental → Logs

## What Gets Deployed

The deployment includes:
- `supabase/functions/sync-trips-incremental/index.ts` (main function)
- `supabase/functions/_shared/gps51-client.ts` (shared rate limiting client)
- All dependencies from imports

## Troubleshooting

### Error: "Function not found"
- Make sure you're in the project root directory
- Verify the function exists at `supabase/functions/sync-trips-incremental/index.ts`

### Error: "Authentication failed"
- Run `supabase login` again
- Check your Supabase project link: `supabase link --project-ref cmvpnsqiefbsqkwnraka`

### Error: "Module not found"
- The shared modules in `_shared/` should be automatically included
- If issues persist, check that `gps51-client.ts` exists in `supabase/functions/_shared/`
