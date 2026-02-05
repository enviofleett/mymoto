/**
 * Test OpenRouter API Connection
 *
 * This function tests the OpenRouter API integration.
 * Call it to verify your OPENROUTER_API_KEY is correctly configured.
 */
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

  const results: any = {
    provider: 'OpenRouter',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
  };

  // Check configuration
  const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
  const LLM_MODEL = Deno.env.get('LLM_MODEL');

  results.config = {
    api_key_exists: !!OPENROUTER_API_KEY,
    api_key_prefix: OPENROUTER_API_KEY ? OPENROUTER_API_KEY.substring(0, 8) + '...' : null,
    model_exists: !!LLM_MODEL,
    model: LLM_MODEL || '(NOT SET - required)',
  };

  // Test API call
  try {
    const startTime = Date.now();

    const response = await callLLM(
      'You are a test bot. Respond with exactly: "OpenRouter connection successful!"',
      'Test the connection.',
      { maxOutputTokens: 30, temperature: 0.1 }
    );

    const latency = Date.now() - startTime;

    results.test = {
      success: true,
      latency_ms: latency,
      response: response.text,
    };
  } catch (e: any) {
    results.test = {
      success: false,
      error: e.message,
    };
  }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: results.test?.success ? 200 : 500,
  });
});
