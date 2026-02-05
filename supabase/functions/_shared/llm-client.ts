
declare const Deno: any;

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface LLMConfig {
  maxOutputTokens?: number;
  temperature?: number;
  model?: string;
  tools?: any[];
  tool_choice?: any;
}

export interface LLMResponse {
  text: string | null;
  tool_calls?: ToolCall[];
  error?: string;
}

/**
 * Call LLM via OpenAI-compatible API
 *
 * Uses OPENAI_API_KEY for authentication and OPENAI_BASE_URL for the endpoint.
 * Compatible with OpenRouter, OpenAI, Azure OpenAI, and any OpenAI-compatible provider.
 *
 * Required secrets:
 * - OPENAI_API_KEY: Your API key for the provider
 * - OPENAI_BASE_URL: The base URL for the API (e.g., https://openrouter.ai/api/v1)
 *
 * Optional secrets:
 * - LLM_MODEL: Override the default model (defaults to google/gemini-2.0-flash-exp)
 */
export async function callLLM(
  systemPromptOrMessages: string | any[],
  userPrompt?: string,
  config: LLMConfig = {}
): Promise<LLMResponse> {
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
  const OPENAI_BASE_URL = Deno.env.get('OPENAI_BASE_URL');
  const LLM_MODEL = Deno.env.get('LLM_MODEL');

  // Validate required configuration
  if (!OPENAI_API_KEY) {
    throw new Error('LLM Error: OPENAI_API_KEY is required but not set. Please configure the secret in Supabase.');
  }

  if (!OPENAI_BASE_URL) {
    throw new Error('LLM Error: OPENAI_BASE_URL is required but not set. Please configure the secret in Supabase.');
  }

  // Construct the full API endpoint URL
  // Handle both cases: URL with or without trailing slash
  const baseUrl = OPENAI_BASE_URL.replace(/\/+$/, ''); // Remove trailing slashes
  const apiUrl = `${baseUrl}/chat/completions`;

  // Determine model to use (priority: config > env > default)
  const model = config.model || LLM_MODEL || 'google/gemini-2.0-flash-exp';

  // Construct messages
  let messages: any[] = [];
  if (Array.isArray(systemPromptOrMessages)) {
    messages = systemPromptOrMessages;
  } else {
    messages = [
      { role: 'system', content: systemPromptOrMessages },
      { role: 'user', content: userPrompt || '' },
    ];
  }

  // Construct request body (OpenAI-compatible format)
  const body: any = {
    model,
    messages,
    max_tokens: config.maxOutputTokens || 1024,
    temperature: config.temperature ?? 0.7,
    stream: false,
  };

  if (config.tools) {
    body.tools = config.tools;
  }

  if (config.tool_choice) {
    body.tool_choice = config.tool_choice;
  }

  console.log(`[LLM Client] Calling ${baseUrl} with model ${model}...`);

  const result = await callProvider(apiUrl, OPENAI_API_KEY, body);

  return result;
}

async function callProvider(url: string, apiKey: string, body: any): Promise<LLMResponse> {
  const maxRetries = 3;
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = Math.pow(2, attempt) * 500;
        console.log(`[LLM Client] Retry attempt ${attempt}, waiting ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const errorMsg = `API Error ${response.status}: ${errorText.substring(0, 200)}`;
        console.error(`[LLM Client] ${errorMsg}`);
        throw new Error(errorMsg);
      }

      const data = await response.json();
      const message = data.choices?.[0]?.message;

      if (!message) {
        console.error('[LLM Client] Unexpected response format:', JSON.stringify(data).substring(0, 200));
        throw new Error('Invalid response format: no message in response');
      }

      console.log('[LLM Client] Success');
      return {
        text: message?.content || null,
        tool_calls: message?.tool_calls
      };

    } catch (e: any) {
      lastError = e;
      // Don't retry auth errors or bad requests - these won't succeed on retry
      if (e.message.includes('401') || e.message.includes('403') || e.message.includes('404') || e.message.includes('400')) {
        throw e;
      }
      console.warn(`[LLM Client] Attempt ${attempt} failed: ${e.message}`);
    }
  }

  console.error(`[LLM Client] All ${maxRetries + 1} attempts failed`);
  throw lastError;
}
