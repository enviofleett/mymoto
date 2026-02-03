
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
 * Call Lovable AI Gateway with Fallback to Gemini
 * 
 * Primary: Lovable AI Gateway (requires LOVABLE_API_KEY)
 * Fallback: Google Gemini via OpenAI-compatible endpoint (requires GEMINI_API_KEY)
 */
export async function callLLM(
  systemPromptOrMessages: string | any[],
  userPrompt?: string,
  config: LLMConfig = {}
): Promise<LLMResponse> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');

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

  // Attempt Lovable First
  if (LOVABLE_API_KEY) {
    try {
      if (!LOVABLE_API_KEY.startsWith('sk_')) {
        console.warn('[LLM Client] Warning: LOVABLE_API_KEY does not start with "sk_". This may be an invalid key format.');
      }

      console.log('[LLM Client] Calling Lovable AI Gateway...');
      const result = await callProvider(
        'https://ai.gateway.lovable.dev/v1/chat/completions',
        LOVABLE_API_KEY,
        body
      );
      return result;

    } catch (e: any) {
      console.error(`[LLM Client] Lovable API failed: ${e.message}`);
      
      // If auth error (401) or explicit Lovable error, try fallback immediately
      if (e.message.includes('401') || e.message.includes('Lovable API error')) {
        console.warn('[LLM Client] Lovable auth failed. Attempting fallback to Gemini...');
      } else {
        // For other errors, maybe we should also fallback?
        // Let's fallback for any error to be safe and "restore functionality"
        console.warn('[LLM Client] Lovable failed. Attempting fallback to Gemini...');
      }
    }
  } else {
    console.warn('[LLM Client] LOVABLE_API_KEY not found. Attempting fallback to Gemini...');
  }

  // Fallback to Gemini
  if (GEMINI_API_KEY) {
    try {
      console.log('[LLM Client] Using Gemini Fallback (OpenAI Compatible Endpoint)...');
      
      // Adjust model for Gemini direct usage if needed
      // The OpenAI endpoint usually accepts standard model names like 'gemini-1.5-flash'
      // If 'google/gemini-2.5-flash' is passed, we might need to strip 'google/'
      // or use a known working model for Gemini API.
      // Safe bet: 'gemini-1.5-flash'
      const fallbackBody = { ...body };
      if (fallbackBody.model.includes('google/')) {
        fallbackBody.model = 'gemini-1.5-flash'; // Fallback to stable model
      }

      const result = await callProvider(
        'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        GEMINI_API_KEY,
        fallbackBody
      );
      return result;

    } catch (e: any) {
      console.error(`[LLM Client] Gemini Fallback failed: ${e.message}`);
      throw new Error(`All LLM providers failed. Lovable: ${!LOVABLE_API_KEY ? 'Missing Key' : 'Error'}, Gemini: ${e.message}`);
    }
  }

  throw new Error('LLM Error: No working provider found. Check LOVABLE_API_KEY or GEMINI_API_KEY.');
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
