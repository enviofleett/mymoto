# Restore Admin: Directory Categories, Service Providers, Wallet Payments

This guide recommends the **smartest way** to restore only the logic that lets admins:
1. **Create directory categories**
2. **Add service providers**
3. **Manage wallet payments**

---

## What the repo already has (from last ~48h)

- **287064c** – Admin auth + edge functions: `AdminDirectory`, `AdminWallets`, `useAdminWallets`, `admin-register-provider`, `admin-wallet-topup`, `admin-update-bonus`, `send-provider-approval-email`
- **6a3e487** – Directory + resources: `directory_categories`, `service_providers`, migrations, `AdminResources`, `OwnerDirectory`
- **904d8ec** – Grant admin access: `20260123000000_grant_admin_access.sql`, admin vehicle access
- **b706b41** – System-wide: `GRANT_ADMIN_ACCESS.sql`, `DEPLOY_DIRECTORY_MIGRATIONS.sql`, wallet/admin wiring

The **3aa4ad4 revert** (vehicle profile baseline) did **not** touch AdminDirectory, AdminWallets, directory migrations, or grant_admin. So that logic is still in the codebase.

---

## Recommended approach: **fix-in-place** (no full revert)

Avoid reverting whole commits. Restore by ensuring **DB + RLS + frontend + edge functions** are correct.

### Step 1: Apply migrations (Supabase SQL Editor)

Run in this order:

| Migration | Purpose |
|-----------|---------|
| `20260122111555_create_directory_categories.sql` | `directory_categories` table |
| `20260122111556_create_service_providers.sql` | `service_providers` table |
| `20260122111557` … `20260122111601` | Bookings, ratings, provider roles, logos bucket |
| `20260122120000_fix_directory_categories_rls.sql` | RLS fix for categories |
| `20260123000000_grant_admin_access.sql` | toolbuxdev + admins, RLS for categories/providers |
| `20260111032352_4e3421cc-...` (or your wallet admin policies migration) | Admins manage `wallets` + `wallet_transactions` |

If your project uses **`app_settings`** (key/value) and you have an **admin_access_unified**-style migration that:

- Backfills `toolbuxdev` / `toolbux` in `user_roles`
- Fixes RLS for `directory_categories`, `service_providers`, `resource_*`, `email_templates` with `has_role(..., 'admin'::app_role)`

then run that too. Ensure **directory_categories** has a `slug` column if your schema uses it (or keep deriving slug in the frontend).

### Step 2: Frontend checks

- **AdminDirectory**
  - Create/update category: send `slug` (e.g. derive from `name` like `nameToSlug`) so DB never gets `NULL` slug.
  - Categories/providers fetch: on 404 or “relation does not exist”, return `[]` and optionally toast; no retries. Avoids crashes when tables are missing.
- **AdminWallets**
  - Uses `useAdminWallets` (wallets list, stats, adjust, new-user bonus). Keep as is.
- **Routes**
  - All admin routes (`/admin/directory`, `/admin/wallets`, etc.) behind `requireAdmin`.
- **AuthContext**
  - `isAdmin` = `user_roles.role = 'admin'` **or** `email` in `toolbuxdev@gmail.com` / `toolbux@gmail.com`.

### Step 3: Edge functions

Deploy and verify:

- `admin-register-provider` – create provider + user; verify admin via `has_role`.
- `admin-wallet-topup` – wallet top-up; admin-only.
- `admin-update-bonus` – update new-user bonus; admin-only.

Use **service role** server-side; pass **user JWT** only where you verify admin.

### Step 4: Verify

1. Log in as `toolbuxdev@gmail.com` (or another admin).
2. **Categories**: Create/edit/delete a directory category. No 400/403/23502.
3. **Providers**: Register a service provider from Admin Directory. No 403/404.
4. **Wallets**: Open Admin Wallets, adjust a balance, update new-user bonus. No 403/404.

---

## Optional: restore specific files from **b706b41** (only if still broken)

If something is still broken after Step 1–4, restore **only** these files from commit **b706b41**:

```bash
git checkout b706b41 -- \
  src/pages/AdminDirectory.tsx \
  src/pages/AdminWallets.tsx \
  src/hooks/useAdminWallets.ts \
  supabase/functions/admin-register-provider/index.ts \
  supabase/functions/admin-wallet-topup/index.ts \
  supabase/functions/admin-update-bonus/index.ts
```

Then **re-apply**:

- Slug derivation + `slug` in create/update category payloads.
- 404-resistant categories/providers fetch (return `[]`, no retries).
- `formatSupabaseError` / toast messages for create/update/delete errors.
- `requireAdmin` on all admin routes and AuthContext admin checks.

Otherwise you’ll lose those fixes.

---

## Summary

| What | Action |
|------|--------|
| **Categories** | Migrations + RLS applied; slug sent; 404 handling in fetch. |
| **Service providers** | `service_providers` + deps migrations; RLS; `admin-register-provider` deployed. |
| **Wallet payments** | `wallets` / `wallet_transactions` + admin RLS; `admin-wallet-topup` & `admin-update-bonus` deployed. |
| **Admin access** | `grant_admin_access` + optional admin_access_unified; `requireAdmin` + AuthContext. |

**Smartest path:** Fix-in-place (Steps 1–4). Use the targeted `git checkout` only if a specific feature still fails after that.
