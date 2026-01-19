import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

interface RemoveInactiveVehiclesRequest {
  action: 'preview' | 'execute';
  days_inactive?: number;
  device_ids?: string[];  // Optional: specific devices to remove
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { 
      status: 200,
      headers: corsHeaders 
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get auth header to check admin status
    const authHeader = req.headers.get("Authorization");
    console.log("[remove-inactive-vehicles] Auth header present:", !!authHeader);
    
    if (!authHeader) {
      console.error("[remove-inactive-vehicles] Missing Authorization header");
      return new Response(
        JSON.stringify({ error: "Authorization header required" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Extract token and verify user (using service role client)
    const userToken = authHeader.replace("Bearer ", "");
    console.log("[remove-inactive-vehicles] Token extracted, length:", userToken.length);
    
    const { data: { user }, error: userError } = await supabase.auth.getUser(userToken);
    
    if (userError) {
      console.error("[remove-inactive-vehicles] Auth error:", userError);
      return new Response(
        JSON.stringify({ error: "Invalid authentication", details: userError.message }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    
    if (!user) {
      console.error("[remove-inactive-vehicles] User not found after token verification");
      return new Response(
        JSON.stringify({ error: "User not found" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    
    console.log("[remove-inactive-vehicles] User verified:", user.id);

    // Check admin role using RPC function (consistent with other edge functions)
    const { data: isAdmin, error: roleError } = await supabase.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin'
    });

    if (roleError) {
      console.error("[remove-inactive-vehicles] Role check error:", roleError);
      return new Response(
        JSON.stringify({ error: "Failed to verify admin status", details: roleError.message }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!isAdmin) {
      console.log("[remove-inactive-vehicles] User is not admin:", user.id);
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("[remove-inactive-vehicles] Admin verified, parsing request body");
    
    // Parse request body
    let requestBody: RemoveInactiveVehiclesRequest;
    try {
      requestBody = await req.json();
      console.log("[remove-inactive-vehicles] Request body parsed:", { action: requestBody.action, days_inactive: requestBody.days_inactive });
    } catch (error) {
      console.error("[remove-inactive-vehicles] JSON parse error:", error);
      return new Response(
        JSON.stringify({ error: "Invalid JSON in request body" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { action, days_inactive = 30, device_ids } = requestBody;

    if (!action || (action !== 'preview' && action !== 'execute')) {
      return new Response(
        JSON.stringify({ error: "action must be 'preview' or 'execute'" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (days_inactive < 1 || days_inactive > 365) {
      return new Response(
        JSON.stringify({ error: "days_inactive must be between 1 and 365" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Preview mode: identify inactive vehicles
    if (action === 'preview') {
      const { data: inactiveVehicles, error: previewError } = await supabase
        .rpc('identify_inactive_vehicles', { days_inactive });

      if (previewError) {
        console.error("[remove-inactive-vehicles] Preview error:", previewError);
        return new Response(
          JSON.stringify({ error: previewError.message }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          action: 'preview',
          days_inactive,
          count: inactiveVehicles?.length || 0,
          vehicles: inactiveVehicles || [],
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Execute mode: remove inactive vehicles
    if (action === 'execute') {
      // Rate limiting: Check if user has deleted vehicles recently
      const RATE_LIMIT_SECONDS = 10; // Minimum 10 seconds between deletions
      const { data: recentDeletions, error: rateLimitError } = await supabase
        .from('vehicle_deletion_log')
        .select('deleted_at')
        .eq('deleted_by', user.id)
        .eq('success', true)
        .order('deleted_at', { ascending: false })
        .limit(1);

      if (!rateLimitError && recentDeletions && recentDeletions.length > 0) {
        const lastDeletion = new Date(recentDeletions[0].deleted_at);
        const secondsSinceLastDeletion = (Date.now() - lastDeletion.getTime()) / 1000;
        
        if (secondsSinceLastDeletion < RATE_LIMIT_SECONDS) {
          const waitTime = Math.ceil(RATE_LIMIT_SECONDS - secondsSinceLastDeletion);
          console.log(`[remove-inactive-vehicles] Rate limit: User ${user.id} must wait ${waitTime} more seconds`);
          return new Response(
            JSON.stringify({ 
              error: "Rate limit exceeded",
              message: `Please wait ${waitTime} seconds between deletions to prevent accidental mass deletions.`,
              retry_after: waitTime
            }),
            { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }
      }

      const vehicleCount = device_ids ? device_ids.length : 'unknown';
      console.log(`[remove-inactive-vehicles] Executing removal for ${days_inactive} days inactive (${vehicleCount} vehicles) by user ${user.id}`);

      // Use smaller batch size for large deletions to avoid timeouts
      // For 1000+ vehicles, use 50 per batch; otherwise use 100
      let batchSize = 100;
      if (device_ids && device_ids.length > 500) {
        batchSize = 50;
      } else if (device_ids && device_ids.length > 1000) {
        batchSize = 25;  // Even smaller for very large deletions
      }
      
      console.log(`[remove-inactive-vehicles] Using batch size: ${batchSize}`);
      
      // Validate device_ids array size to prevent memory issues
      if (device_ids && device_ids.length > 10000) {
        return new Response(
          JSON.stringify({ 
            error: "Too many vehicles",
            message: "Cannot delete more than 10,000 vehicles at once. Please split into smaller batches."
          }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      
      const { data: deletionResults, error: deleteError } = await supabase
        .rpc('remove_inactive_vehicles', {
          days_inactive,
          device_ids_to_remove: device_ids || null,
          batch_size: batchSize,
          user_id: user.id,  // Pass user ID for audit logging
          deletion_method: 'manual',  // Manual deletion from admin UI
        });

      if (deleteError) {
        console.error("[remove-inactive-vehicles] Deletion error:", deleteError);
        return new Response(
          JSON.stringify({ 
            error: deleteError.message,
            details: "If deleting many vehicles, try reducing the number or the function may have timed out. Consider deleting in smaller batches."
          }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      const result = deletionResults?.[0] || {
        deleted_vehicles_count: 0,
        deleted_assignments_count: 0,
        deleted_trips_count: 0,
        deleted_device_ids: [],
        success: true,
        error_message: null,
      };

      // Check if deletion was successful
      if (!result.success) {
        console.error("[remove-inactive-vehicles] Deletion failed:", result.error_message);
        return new Response(
          JSON.stringify({ 
            success: false,
            error: result.error_message || "Deletion failed",
            results: {
              vehicles_deleted: result.deleted_vehicles_count || 0,
              assignments_deleted: result.deleted_assignments_count || 0,
              trips_deleted: result.deleted_trips_count || 0,
              device_ids: result.deleted_device_ids || [],
            },
            warning: "Some vehicles may have been deleted before the error occurred. Check the audit log for details."
          }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      console.log(`[remove-inactive-vehicles] Deletion complete:`, result);

      return new Response(
        JSON.stringify({
          success: true,
          action: 'execute',
          days_inactive,
          results: {
            vehicles_deleted: result.deleted_vehicles_count || 0,
            assignments_deleted: result.deleted_assignments_count || 0,
            trips_deleted: result.deleted_trips_count || 0,
            device_ids: result.deleted_device_ids || [],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Should never reach here
    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[remove-inactive-vehicles] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
