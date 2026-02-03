
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callLLM } from '../_shared/llm-client.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

declare const Deno: any;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { record } = await req.json();

    if (!record || !record.id || !record.user_id) {
      throw new Error('Invalid record provided');
    }

    const device_id = record.id;
    const user_id = record.user_id;
    const vehicle_name = record.name || 'Vehicle';

    console.log(`Processing welcome message for vehicle: ${device_id} (${vehicle_name})`);

    // 1. Check Wallet Balance
    const { data: wallet } = await supabase
      .from('wallets')
      .select('balance')
      .eq('user_id', user_id)
      .maybeSingle();

    const balance = wallet ? parseFloat(wallet.balance) : 0;
    
    if (balance <= 0) {
      console.log(`User ${user_id} has insufficient balance (${balance}). Skipping welcome message.`);
      return new Response(JSON.stringify({ message: 'Insufficient balance, skipped.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Check if welcome message already exists
    const { data: existing } = await supabase
      .from('vehicle_chat_history')
      .select('id')
      .eq('device_id', device_id)
      .eq('role', 'assistant')
      .order('created_at', { ascending: true })
      .limit(1);

    if (existing && existing.length > 0) {
      console.log('Welcome message already exists. Skipping.');
      return new Response(JSON.stringify({ message: 'Already exists.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Fetch Welcome Template
    const { data: settings } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'welcome_message_template')
      .maybeSingle();

    const template = settings?.value || `Welcome to your new {{vehicle_name}}! I am your AI companion.`;

    // 4. Generate Message via LLM
    
    let welcomeMessage = template
      .replace('{{vehicle_name}}', vehicle_name)
      .replace('{{owner_name}}', 'Owner');

    try {
      const systemPrompt = `You are the AI companion for a vehicle named "${vehicle_name}". 
Your personality is friendly, helpful, and professional.`;
      
      const userPrompt = `The admin has set a welcome template: "${template}".
Your task is to generate a warm, engaging welcome message based on this template.
Incorporate the vehicle name and the fact that you are ready to assist with trips, health, and security.
Keep it under 100 words.`;

      const response = await callLLM(systemPrompt, userPrompt, {
        model: 'google/gemini-2.5-flash',
        maxOutputTokens: 150
      });
      
      if (response.text) {
        welcomeMessage = response.text.trim();
      }
    } catch (e) {
      console.error('LLM Error:', e);
      // Fallback to template
    }

    // 5. Save to Chat History
    const { error: insertError } = await supabase
      .from('vehicle_chat_history')
      .insert({
        device_id,
        user_id,
        role: 'assistant',
        content: welcomeMessage,
        created_at: new Date().toISOString()
      });

    if (insertError) {
      throw insertError;
    }

    return new Response(JSON.stringify({ success: true, message: welcomeMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
