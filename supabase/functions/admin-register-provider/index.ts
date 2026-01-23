import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

interface RegisterProviderRequest {
  businessName: string;
  email: string;
  phone: string;
  contactPerson?: string;
  categoryId?: string;
  password?: string;
  autoApprove?: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { 
      status: 200,
      headers: corsHeaders 
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!supabaseServiceKey) {
      console.error("[admin-register-provider] SUPABASE_SERVICE_ROLE_KEY is not set");
      return new Response(
        JSON.stringify({ error: "Internal Configuration Error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Get the authenticated user from the request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("[admin-register-provider] No Authorization header provided");
      return new Response(
        JSON.stringify({ error: "Unauthorized: No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract token (handle both "Bearer token" and just "token" formats)
    let token = authHeader.startsWith("Bearer ") 
      ? authHeader.replace("Bearer ", "").trim()
      : authHeader.trim();
    
    console.log("[admin-register-provider] Verifying token...");
    
    // Verify the user token using service role client
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      console.error("[admin-register-provider] Auth error:", authError);
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[admin-register-provider] User authenticated:", user.id, user.email);

    // Check if user is admin using RPC function (more reliable)
    const { data: isAdmin, error: roleError } = await supabaseAdmin.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin'
    });

    if (roleError || !isAdmin) {
      console.error("[admin-register-provider] Admin check failed:", { isAdmin, roleError });
      // Fallback check
      const { data: userRole } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();

      if (!userRole) {
        return new Response(
          JSON.stringify({ error: "Only admins can register providers" }),
          { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    console.log("[admin-register-provider] Admin role verified for user:", user.id);

    const {
      businessName,
      email,
      phone,
      contactPerson,
      categoryId,
      password,
      autoApprove = false,
    }: RegisterProviderRequest = await req.json();

    console.log(`[admin-register-provider] Registration request:`, { businessName, email, phone, categoryId, autoApprove });

    // Validate required fields
    if (!businessName || !email || !phone) {
      console.error("[admin-register-provider] Missing required fields");
      return new Response(
        JSON.stringify({ error: "Business name, email, and phone are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check if user already exists
    const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    if (listError) {
      console.error("[admin-register-provider] Error checking existing users:", listError);
    } else {
      const userExists = existingUsers.users.some(u => u.email?.toLowerCase() === email.toLowerCase());
      if (userExists) {
        console.error(`[admin-register-provider] User already exists: ${email}`);
        return new Response(
          JSON.stringify({ error: `A user with the email ${email} already exists.` }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    // Generate random password if auto-approve is enabled and no password provided
    let finalPassword = password;
    if (autoApprove && !password) {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
      finalPassword = Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    }

    if (!finalPassword) {
      console.error("[admin-register-provider] Password missing");
      return new Response(
        JSON.stringify({ error: "Password is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`[admin-register-provider] Creating auth user...`);
    // Step 1: Create user account via Supabase Admin API
    const { data: authData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: finalPassword,
      email_confirm: true, // Auto-confirm email
    });

    if (createError) {
      console.error("[admin-register-provider] Create user error:", createError);
      return new Response(
        JSON.stringify({ error: `Failed to create user: ${createError.message}` }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!authData.user) {
      console.error("[admin-register-provider] User creation failed - no user returned");
      throw new Error("User creation failed");
    }

    console.log(`[admin-register-provider] User created: ${authData.user.id}. Creating profile...`);

    // Step 2: Create provider profile
    const { data: providerData, error: providerError } = await supabaseAdmin
      .from("service_providers")
      .insert({
        user_id: authData.user.id,
        business_name: businessName,
        contact_person: contactPerson || null,
        phone,
        email,
        category_id: categoryId || null,
        approval_status: autoApprove ? "approved" : "pending",
        approved_at: autoApprove ? new Date().toISOString() : null,
      })
      .select()
      .single();

    if (providerError) {
      console.error("[admin-register-provider] Create provider error:", providerError);
      // If provider creation fails, try to delete the user
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return new Response(
        JSON.stringify({ error: `Failed to create provider profile: ${providerError.message}` }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`[admin-register-provider] Profile created: ${providerData.id}`);

    // Step 3: If auto-approve, assign service_provider role and send email
    if (autoApprove && providerData) {
      console.log(`[admin-register-provider] Auto-approving...`);
      // Role assignment happens via trigger, but we can also do it explicitly
      await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: authData.user.id, role: "service_provider" });

      // Send approval email with password if auto-generated
      try {
        console.log(`[admin-register-provider] Sending approval email...`);
        // We need to pass the current admin's token to the email function since it now requires auth
        await supabaseAdmin.functions.invoke("send-provider-approval-email", {
          body: {
            providerId: providerData.id,
            providerEmail: email,
            businessName,
            password: !password ? finalPassword : undefined,
          },
          headers: {
            Authorization: authHeader, // Forward the admin's token
          }
        });
      } catch (emailError) {
        console.error("[admin-register-provider] Failed to send approval email:", emailError);
        // Don't fail the registration if email fails
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        providerId: providerData.id,
        userId: authData.user.id,
        message: autoApprove
          ? "Provider registered and approved successfully"
          : "Provider registered successfully (pending approval)",
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error registering provider:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to register provider" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
