/**
 * OpenRouter LLM Client
 *
 * All LLM calls are routed exclusively through OpenRouter.
 * No fallback providers - 100% OpenRouter dependency.
 *
 * Required Supabase Secrets:
 * - OPENROUTER_API_KEY: Your OpenRouter API key (get from https://openrouter.ai/keys)
 * - LLM_MODEL: The model to use (e.g., google/gemini-2.0-flash-exp:free, openai/gpt-4o-mini)
 *
 * Browse available models: https://openrouter.ai/models
 * OpenRouter API Reference: https://openrouter.ai/docs/quickstart
 */

declare const Deno: any;

// OpenRouter API Configuration
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

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
 * Call OpenRouter API for LLM completions
 *
 * @param systemPromptOrMessages - Either a system prompt string or an array of messages
 * @param userPrompt - User message (only used if systemPromptOrMessages is a string)
 * @param config - Configuration options (model, temperature, tools, etc.)
 * @returns LLM response with text and optional tool calls
 */
export async function callLLM(
  systemPromptOrMessages: string | any[],
  userPrompt?: string,
  config: LLMConfig = {}
): Promise<LLMResponse> {
  const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');

  // Strict validation - no fallbacks
  if (!OPENROUTER_API_KEY) {
    throw new Error(
      'OPENROUTER_API_KEY is required but not set. ' +
      'Get your API key from https://openrouter.ai/keys and add it to Supabase secrets.'
    );
  }

  // Get model from config or environment (no default - fully configurable)
  const LLM_MODEL = Deno.env.get('LLM_MODEL');
  const model = config.model || LLM_MODEL;

  if (!model) {
    throw new Error(
      'LLM_MODEL is required but not set. ' +
      'Set it in Supabase secrets. Browse models at https://openrouter.ai/models'
    );
  }

  // Construct messages array
  let messages: any[];
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

  // Add tools if provided (for function calling)
  if (config.tools && config.tools.length > 0) {
    body.tools = config.tools;
  }

  if (config.tool_choice) {
    body.tool_choice = config.tool_choice;
  }

  console.log(`[OpenRouter] Calling model: ${model}`);

  // Make API request with retry logic
  const result = await callOpenRouter(OPENROUTER_API_KEY, body);

  return result;
}

/**
 * Internal function to call OpenRouter API with retry logic
 */
async function callOpenRouter(apiKey: string, body: any): Promise<LLMResponse> {
  const MAX_RETRIES = 3;
  const url = `${OPENROUTER_BASE_URL}/chat/completions`;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Exponential backoff for retries
      if (attempt > 0) {
        const delay = Math.pow(2, attempt) * 500; // 1s, 2s, 4s
        console.log(`[OpenRouter] Retry ${attempt}/${MAX_RETRIES}, waiting ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://mymoto.app', // Required by OpenRouter
          'X-Title': 'MyMoto Vehicle AI', // App identification
        },
        body: JSON.stringify(body),
      });

      // Handle non-OK responses
      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `OpenRouter API error ${response.status}`;

        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error?.message || errorJson.message || errorText;
        } catch {
          errorMessage = errorText.substring(0, 200);
        }

        console.error(`[OpenRouter] Error: ${errorMessage}`);

        // Don't retry auth errors or bad requests
        if (response.status === 401 || response.status === 403 || response.status === 400) {
          throw new Error(`OpenRouter auth error: ${errorMessage}`);
        }

        // Rate limit - retry with backoff
        if (response.status === 429) {
          lastError = new Error(`OpenRouter rate limit: ${errorMessage}`);
          continue;
        }

        throw new Error(errorMessage);
      }

      // Parse successful response
      const data = await response.json();

      // Validate response structure
      const choice = data.choices?.[0];
      if (!choice) {
        console.error('[OpenRouter] Invalid response:', JSON.stringify(data).substring(0, 200));
        throw new Error('Invalid response from OpenRouter: no choices returned');
      }

      const message = choice.message;
      if (!message) {
        throw new Error('Invalid response from OpenRouter: no message in choice');
      }

      console.log('[OpenRouter] Success');

      // Return standardized response
      return {
        text: message.content || null,
        tool_calls: message.tool_calls || undefined,
      };

    } catch (error: any) {
      lastError = error;

      // Don't retry certain errors
      if (
        error.message.includes('auth error') ||
        error.message.includes('401') ||
        error.message.includes('403') ||
        error.message.includes('400')
      ) {
        throw error;
      }

      console.warn(`[OpenRouter] Attempt ${attempt + 1} failed: ${error.message}`);
    }
  }

  // All retries exhausted
  console.error(`[OpenRouter] All ${MAX_RETRIES + 1} attempts failed`);
  throw lastError || new Error('OpenRouter request failed after all retries');
}

// Legacy export for backward compatibility
export const callLovableAPI = callLLM;
export const callGeminiAPI = callLLM;
