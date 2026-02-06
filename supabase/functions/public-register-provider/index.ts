/// <reference lib="deno.ns" />
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sendEmail, getEmailConfig, EmailTemplates } from "../_shared/email-service.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Use Service Role to bypass RLS and ensure metadata is set correctly
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { 
        email, 
        password, 
        businessName, 
        contactPerson, 
        phone, 
        categoryId,
        address,
        city,
        location
    } = await req.json();

    // Basic Validation
    if (!email || !password || !businessName || !phone) {
         return new Response(
            JSON.stringify({ error: "Missing required fields" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
         );
    }

    console.log(`Attempting to register provider: ${businessName} (${email})`);

    // Prepare metadata
    const metadata = {
        business_name: businessName,
        contact_person: contactPerson,
        phone: phone,
        category_id: categoryId,
        role: 'service_provider',
        profile_data: {
            address,
            city,
            location
        }
    };

    // Create user with metadata
    // supabaseAdmin.auth.signUp sends confirmation email if enabled
    const { data: authData, error: authError } = await supabaseAdmin.auth.signUp({
        email,
        password,
        options: {
            data: metadata
        }
    });

    if (authError) {
        console.error("Signup error:", authError);
        return new Response(
            JSON.stringify({ error: authError.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    if (!authData.user) {
         return new Response(
            JSON.stringify({ error: "Failed to create user" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    // Ensure metadata is up to date (in case user existed or signUp didn't set it)
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(authData.user.id, {
        user_metadata: metadata
    });

    if (updateError) {
        console.warn("Failed to update user metadata:", updateError);
    }
    
    console.log(`User created/found: ${authData.user.id}. Verifying provider record...`);

    // Verify provider record existence (Trigger should have created it)
    // We use a small delay or just check immediately (triggers are sync usually)
    const { data: provider, error: providerError } = await supabaseAdmin
        .from('service_providers')
        .select('id')
        .eq('user_id', authData.user.id)
        .single();
        
    if (!provider) {
        console.warn("Provider record not found after signup. Creating manually as fallback...");
        // Manual fallback if trigger failed or didn't fire
        const { error: insertError } = await supabaseAdmin
            .from('service_providers')
            .insert({
                user_id: authData.user.id,
                business_name: businessName,
                contact_person: contactPerson,
                phone: phone,
                email: email,
                category_id: categoryId,
                approval_status: 'pending',
                profile_data: {
                    address,
                    city,
                    location
                }
            });
            
        if (insertError) {
             console.error("Manual provider insert failed:", insertError);
             // We don't fail the request because the user is created, but we log it.
             // Admin might need to intervene.
        } else {
            console.log("Manual provider insert successful.");
        }
    } else {
        console.log("Provider record verified (created by trigger).");
    }

    // Send Emails
    const emailConfig = getEmailConfig();
    if (emailConfig) {
        const adminEmail = emailConfig.gmailUser;
        
        // 1. Send confirmation to Provider
        const providerTemplate = EmailTemplates.providerRegistration({
            businessName: businessName
        });

        try {
            await sendEmail({
                to: email,
                subject: providerTemplate.subject,
                html: providerTemplate.html,
            });
        } catch (e) {
            console.error("Failed to send provider email:", e);
        }

        // 2. Send notification to Admin
        const dashboardUrl = `${Deno.env.get("PUBLIC_APP_URL") || "https://mymotofleet.com"}/admin/directory`;
        const adminTemplate = EmailTemplates.providerRegistrationAdmin({
            businessName: businessName,
            email: email,
            phone: phone,
            category: categoryId,
            address: address,
            location: location,
            dashboardUrl: dashboardUrl
        });

        try {
            await sendEmail({
                to: adminEmail,
                subject: adminTemplate.subject,
                html: adminTemplate.html,
            });
        } catch (e) {
            console.error("Failed to send admin email:", e);
        }
    }

    return new Response(
        JSON.stringify({ 
            user: authData.user, 
            message: "Registration successful",
            session: authData.session // Might be null if email confirm is on
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
