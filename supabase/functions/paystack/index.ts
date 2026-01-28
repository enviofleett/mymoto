import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const paystackSecretKey = Deno.env.get("PAYSTACK_SECRET_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // Handle webhook from Paystack
    if (action === "webhook") {
      const payload = await req.json();
      console.log("Paystack webhook received:", payload.event);

      if (payload.event === "charge.success") {
        const { reference, amount, metadata } = payload.data;
        const userId = metadata?.user_id;

        if (!userId) {
          console.error("No user_id in webhook metadata");
          return new Response(JSON.stringify({ received: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Amount from Paystack is in kobo (NGN * 100)
        const amountNgn = amount / 100;

        // Get user's wallet
        const { data: wallet, error: walletError } = await supabase
          .from("wallets")
          .select("id, balance")
          .eq("user_id", userId)
          .single();

        if (walletError || !wallet) {
          console.error("Wallet not found for user:", userId);
          return new Response(JSON.stringify({ received: true, error: "Wallet not found" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Check if this reference has already been processed
        const { data: existingTx } = await supabase
          .from("wallet_transactions")
          .select("id")
          .eq("reference", reference)
          .single();

        if (existingTx) {
          console.log("Transaction already processed:", reference);
          return new Response(JSON.stringify({ received: true, message: "Already processed" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Credit the wallet
        const newBalance = parseFloat(wallet.balance) + amountNgn;
        const { error: updateError } = await supabase
          .from("wallets")
          .update({ balance: newBalance })
          .eq("id", wallet.id);

        if (updateError) {
          console.error("Failed to update wallet balance:", updateError);
          return new Response(
            JSON.stringify({ received: false, error: "Failed to update wallet" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Record the transaction
        const { error: insertError } = await supabase.from("wallet_transactions").insert({
          wallet_id: wallet.id,
          amount: amountNgn,
          type: "credit",
          description: "Wallet top-up via Paystack",
          reference,
          metadata: { paystack_data: payload.data },
        });

        if (insertError) {
          console.error("Failed to insert transaction record:", insertError);
          // Note: Wallet was already updated - this is a critical inconsistency
          return new Response(
            JSON.stringify({ received: false, error: "Failed to record transaction" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Re-enable LLM for user's vehicles if they were disabled
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id")
          .eq("user_id", userId);

        if (profiles && profiles.length > 0) {
          const { data: assignments } = await supabase
            .from("vehicle_assignments")
            .select("device_id")
            .in("profile_id", profiles.map((p) => p.id));

          if (assignments && assignments.length > 0) {
            const { error: llmUpdateError } = await supabase
              .from("vehicle_llm_settings")
              .update({ llm_enabled: true })
              .in("device_id", assignments.map((a) => a.device_id));

            if (llmUpdateError) {
              console.error("Failed to re-enable LLM settings:", llmUpdateError);
              // Non-critical error - continue processing
            }
          }
        }

        console.log(`Credited NGN ${amountNgn} to user ${userId}`);
      }

      return new Response(JSON.stringify({ received: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Initialize payment
    if (action === "initialize") {
      const { email, amount, user_id, callback_url } = await req.json();

      if (!email || !amount || !user_id) {
        return new Response(
          JSON.stringify({ success: false, error: "Missing required fields" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Amount should be in kobo (NGN * 100)
      const amountKobo = Math.round(amount * 100);

      const response = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${paystackSecretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          amount: amountKobo,
          callback_url: callback_url || `${url.origin}/paystack?action=callback`,
          metadata: {
            user_id,
            custom_fields: [
              {
                display_name: "User ID",
                variable_name: "user_id",
                value: user_id,
              },
            ],
          },
        }),
      });

      const result = await response.json();

      if (!result.status) {
        console.error("Paystack initialization failed:", result);
        return new Response(
          JSON.stringify({ success: false, error: result.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          authorization_url: result.data.authorization_url,
          access_code: result.data.access_code,
          reference: result.data.reference,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify payment
    if (action === "verify") {
      const { reference } = await req.json();

      if (!reference) {
        return new Response(
          JSON.stringify({ success: false, error: "Missing reference" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
        headers: {
          Authorization: `Bearer ${paystackSecretKey}`,
        },
      });

      const result = await response.json();

      if (!result.status || result.data.status !== "success") {
        return new Response(
          JSON.stringify({ success: false, error: "Payment not successful" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { amount, metadata } = result.data;
      const userId = metadata?.user_id;
      const amountNgn = amount / 100;

      // Use atomic RPC function
      const { data: rpcResult, error: rpcError } = await supabase.rpc("credit_wallet_atomic", {
        p_user_id: userId,
        p_amount: amountNgn,
        p_reference: reference,
        p_description: "Wallet top-up via Paystack",
        p_metadata: { paystack_data: result.data }
      });

      if (rpcError) {
        console.error("RPC Error verifying payment:", rpcError);
        return new Response(
          JSON.stringify({ success: false, error: rpcError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!rpcResult.success) {
        if (rpcResult.already_processed) {
           return new Response(
            JSON.stringify({ success: true, message: "Already credited", amount: amountNgn }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({ success: false, error: rpcResult.error }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, amount: amountNgn, new_balance: rpcResult.new_balance }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Paystack function error:", error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
