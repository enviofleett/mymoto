
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
 * Call Lovable AI Gateway (LOVABLE_API_KEY only)
 *
 * All LLM calls are routed exclusively through the Lovable AI Gateway.
 * No fallback providers are supported.
 */
export async function callLLM(
  systemPromptOrMessages: string | any[],
  userPrompt?: string,
  config: LLMConfig = {}
): Promise<LLMResponse> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

  if (!LOVABLE_API_KEY) {
    throw new Error('LLM Error: LOVABLE_API_KEY is required but not set. Please configure the secret in Supabase.');
  }

  if (!LOVABLE_API_KEY.startsWith('sk_')) {
    console.warn('[LLM Client] Warning: LOVABLE_API_KEY does not start with "sk_". This may be an invalid key format.');
  }

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

  // Construct body
  const body: any = {
    model: config.model || 'google/gemini-2.5-flash',
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

  console.log('[LLM Client] Calling Lovable AI Gateway...');

  const result = await callProvider(
    'https://ai.gateway.lovable.dev/v1/chat/completions',
    LOVABLE_API_KEY,
    body
  );

  return result;
}

async function callProvider(url: string, apiKey: string, body: any): Promise<LLMResponse> {
  const maxRetries = 3;
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = Math.pow(2, attempt) * 500;
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
        throw new Error(`API Error ${response.status}: ${errorText.substring(0, 200)}`);
      }

      const data = await response.json();
      const message = data.choices?.[0]?.message;
      
      return { 
        text: message?.content || null,
        tool_calls: message?.tool_calls
      };

    } catch (e: any) {
      lastError = e;
      // Don't retry 401/403/404/400
      if (e.message.includes('401') || e.message.includes('403') || e.message.includes('404') || e.message.includes('400')) {
        throw e;
      }
      console.warn(`[LLM Client] Attempt ${attempt} failed: ${e.message}`);
    }
  }
  throw lastError;
}
