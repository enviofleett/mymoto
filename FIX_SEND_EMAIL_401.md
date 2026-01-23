# Fix send-email 401 (Unauthorized)

## Changes made

### 1. **AdminEmailTemplates.tsx**
- **Always refresh session** before invoking send-email (`refreshSession()` then `getSession()`).
- **Pass `Authorization` explicitly** in `invoke` options: `headers: { Authorization: \`Bearer ${currentSession.access_token}\` }`.
- Use the session after refresh so the token is up to date.

### 2. **send-email Edge Function**
- More robust parsing of `Authorization`: require `Bearer ` prefix, trim token, handle empty token.
- Logging when auth fails: missing/invalid header vs `getUser` error.
- Clearer 401 message: "Invalid or expired token. Please sign in again."

---

## If you still get 401

### A. **Gateway JWT verification (`verify_jwt`)**

The **Supabase gateway** can reject requests with 401 **before** the function runs if JWT verification is on. `verify_jwt` can reset to `true` on redeploy.

**Fix:**

1. **CLI deploy** (uses `config.toml`):
   ```bash
   supabase functions deploy send-email
   ```
   `supabase/config.toml` has `[functions.send-email]` with `verify_jwt = false`.

2. **Dashboard** (overrides config):
   - Supabase Dashboard → **Edge Functions** → **send-email**
   - Turn **off** “Enforce JWT verification” / “Verify JWT”

The function still checks auth (JWT + admin) itself, so disabling gateway JWT for this function is safe.

### B. **Admin role**

Send-email requires an admin user. Confirm the signed-in user has the `admin` role in `user_roles`.

### C. **Sign out and back in**

Try signing out, then signing in again as an admin, and send a test email. This refreshes the session and can clear stale-token 401s.

---

## Quick checks

1. Redeploy: `supabase functions deploy send-email`
2. Dashboard: send-email → JWT verification **off**
3. User has `admin` in `user_roles`
4. Sign out → sign in as admin → send test email again
