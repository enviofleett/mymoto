# Fix Email 401 Unauthorized Error

## Error Message
```
POST https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/send-email 401 (Unauthorized)
FunctionsHttpError: Edge Function returned a non-2xx status code
```

## Root Cause
The Edge Function now requires authentication and admin role verification. The 401 error occurs when:
1. User is not logged in
2. User session has expired
3. User is not an admin

## Fix Applied
Updated `supabase/functions/send-email/index.ts` to:
1. Verify user is authenticated (check Authorization header)
2. Verify user has admin role using `has_role` RPC function
3. Return proper error messages for unauthorized/forbidden access

## Deployment Steps

### Deploy the Updated Function
```bash
cd /Users/alli/mymoto/fleet-heartbeat-dashboard-6f37655e
supabase functions deploy send-email
```

## Verification Steps

1. **Check if you're logged in as admin:**
   - Go to the Admin Email Templates page
   - Make sure you're logged in
   - Verify you have admin role

2. **Test the function:**
   - Click "Send Test Email" on any template
   - The function should now work if you're authenticated as admin

3. **If still getting 401:**
   - Log out and log back in
   - Check browser console for authentication errors
   - Verify your user has admin role in the database

## Code Changes

### Added Authentication Check
```typescript
// Verify user is authenticated and is admin
const authHeader = req.headers.get("Authorization");
if (!authHeader) {
  return new Response(
    JSON.stringify({ 
      error: "Unauthorized",
      message: "Authentication required"
    }),
    { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
  );
}

// Initialize Supabase client to verify user
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Get user from token
const token = authHeader.replace("Bearer ", "");
const { data: { user }, error: userError } = await supabase.auth.getUser(token);

if (userError || !user) {
  return new Response(
    JSON.stringify({ 
      error: "Unauthorized",
      message: "Invalid authentication token"
    }),
    { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
  );
}

// Check if user is admin
const { data: isAdmin, error: roleError } = await supabase.rpc("has_role", {
  _user_id: user.id,
  _role: "admin"
});

if (roleError || !isAdmin) {
  return new Response(
    JSON.stringify({ 
      error: "Forbidden",
      message: "Admin access required"
    }),
    { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
  );
}
```

## Troubleshooting

### Error: "Authentication required"
- **Solution**: Make sure you're logged in. The Supabase client should automatically include your auth token when calling `supabase.functions.invoke()`.

### Error: "Invalid authentication token"
- **Solution**: Your session may have expired. Log out and log back in.

### Error: "Admin access required"
- **Solution**: Verify your user has the admin role:
  ```sql
  SELECT * FROM user_roles WHERE user_id = '<your-user-id>' AND role = 'admin';
  ```
  If no row exists, add admin role:
  ```sql
  INSERT INTO user_roles (user_id, role) 
  VALUES ('<your-user-id>', 'admin');
  ```

## Notes

- The function now requires admin authentication for security
- The Supabase client automatically includes the Authorization header when calling `supabase.functions.invoke()` if the user is logged in
- If you're testing from the admin page, make sure you're logged in as an admin user
