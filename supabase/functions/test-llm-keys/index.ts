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

  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
  const OPENAI_BASE_URL = Deno.env.get('OPENAI_BASE_URL');
  const LLM_MODEL = Deno.env.get('LLM_MODEL');

  results.config = {
    openai_key_exists: !!OPENAI_API_KEY,
    openai_base_url_exists: !!OPENAI_BASE_URL,
    openai_base_url: OPENAI_BASE_URL ? OPENAI_BASE_URL.replace(/\/+$/, '') : null,
    llm_model: LLM_MODEL || 'google/gemini-2.0-flash-exp (default)',
  };

  try {
    const response = await callLLM(
      'You are a test bot. Respond with exactly: "LLM connection successful"',
      'Test connection',
      { maxOutputTokens: 30 }
    );
    results.success = true;
    results.response = response;
  } catch (e: any) {
    results.success = false;
    results.error = e.message;
  }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
