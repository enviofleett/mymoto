# Admin Runbook - MyMoto Fleet

This runbook documents operational procedures, deployment commands, and troubleshooting steps for the MyMoto Fleet platform, specifically focusing on the Service Directory and Trip Search features.

## 1. Deployment Operations

### Database Migrations
To apply local database changes (SQL files in `supabase/migrations/`) to the remote Supabase project:
```bash
npx supabase db push
```
*Note: This command is idempotent and safe to run repeatedly. It tracks applied migrations.*

### Edge Functions
The platform uses Supabase Edge Functions for backend logic.

**Deploying `notify-fulfillment` (Service Directory Emails):**
This function handles completion emails and rating prompts.
```bash
supabase functions deploy notify-fulfillment --no-verify-jwt
```

**Deploying `vehicle-chat` (Smart Trip Search):**
This function powers the AI chat and trip search.
```bash
supabase functions deploy vehicle-chat --no-verify-jwt
```

**Deploying `send-provider-approval-email`:**
```bash
supabase functions deploy send-provider-approval-email --no-verify-jwt
```

## 2. Service Directory Management

### Provider Approval Workflow
1. **Registration**: Providers sign up via `/partner/signup`. Status -> `pending`.
2. **Review**: Admins go to **Directory** tab in Admin Dashboard.
   - View `pending` providers.
   - Click **Approve** to authorize.
   - System automatically:
     - Assigns `service_provider` role.
     - Sends approval email (via `send-provider-approval-email`).
     - Updates status to `approved`.
3. **Re-Approval**: If a provider edits their profile, status changes to `needs_reapproval`. Admin must review changes and approve again.

### Bookings & Fulfillment
1. **Booking**: Users book services via **Directory**. Status -> `pending`.
2. **Fulfillment**: Provider marks booking as "Delivered" in Partner Dashboard.
3. **Notification**:
   - `notify-fulfillment` function is triggered.
   - Sends email to user with a link to rate the service.
   - In-app notification prompts for rating.

### Provider Ratings
- **Aggregation**: Ratings are aggregated via `provider_stats_view`.
- **Display**: Average rating and review count appear on Provider Cards in the Directory.
- **Feedback**: Users can rate 1-5 stars after service completion.

## 3. Smart Trip Search (Vehicle Chat)

### Features
- **Natural Language Search**: "Show trips to Ikeja" or "Did I go to the bank?"
- **Fuzzy Matching**: Uses `pg_trgm` to match location names even with typos.
- **Clarification**: If multiple matches found, AI asks for clarification.

### Maintenance
- **Data Source**: Queries `vehicle_trips` view (aggregated from `position_history`).
- **Performance**: Uses Trigram indexes for fast text search.

## 4. Troubleshooting

### Email Delivery Failures
- **Check Logs**: Go to Supabase Dashboard -> Edge Functions -> `notify-fulfillment` -> Logs.
- **Common Causes**:
  - Invalid SMTP credentials in `SUPABASE_SECRETS`.
  - Recipient email bounced.
  - User has no email in `auth.users`.

### Missing Provider Stats
- **Symptom**: Ratings not showing on Directory.
- **Fix**:
  - Ensure `provider_stats_view` exists.
  - Run: `REFRESH MATERIALIZED VIEW` (if changed to materialized view later; currently it's a standard view so it updates real-time).
  - Verify `provider_ratings` table has data.

## 5. Key File Locations
- **Migrations**: `supabase/migrations/`
- **Edge Functions**: `supabase/functions/`
- **Admin Directory UI**: `src/pages/AdminDirectory.tsx`
- **Provider Directory UI**: `src/pages/owner/OwnerDirectory.tsx`
