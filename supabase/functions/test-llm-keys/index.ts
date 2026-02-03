import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callLLM } from '../_shared/llm-client.ts';

declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const results: any = {};

  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');

  results.config = {
    lovable_key_exists: !!LOVABLE_API_KEY,
    gemini_key_exists: !!GEMINI_API_KEY,
  };

  try {
    const response = await callLLM(
      'You are a test bot.',
      'Hello, are you working?',
      { maxOutputTokens: 20 }
    );
    results.success = true;
    results.response = response;
  } catch (e: any) {
    results.success = false;
    results.error = e.message;
    results.stack = e.stack;
  }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
