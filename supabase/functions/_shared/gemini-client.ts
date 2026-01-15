/**
 * Shared Gemini API Client
 * Provides direct integration with Google Gemini API
 * Supports both streaming and non-streaming responses
 * Falls back to Lovable AI Gateway if GEMINI_API_KEY is not set
 */

interface GeminiConfig {
  maxOutputTokens?: number;
  temperature?: number;
  model?: string;
}

interface GeminiResponse {
  text: string;
  error?: string;
}

/**
 * Call Gemini API directly (non-streaming)
 */
export async function callGeminiAPI(
  systemPrompt: string,
  userPrompt: string,
  config: GeminiConfig = {}
): Promise<GeminiResponse> {
  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  const useDirectGemini = !!GEMINI_API_KEY;

  if (!GEMINI_API_KEY && !LOVABLE_API_KEY) {
    throw new Error('Either GEMINI_API_KEY or LOVABLE_API_KEY must be configured');
  }

  if (useDirectGemini) {
    // Direct Gemini API integration
    // Use stable model first, fallback to experimental if needed
    const model = config.model || 'gemini-1.5-flash';
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

    // Build request body - systemInstruction can be string or object depending on model
    const requestBody: any = {
      contents: [
        {
          parts: [
            { text: userPrompt }
          ]
        }
      ],
      generationConfig: {
        maxOutputTokens: config.maxOutputTokens || 1024,
        temperature: config.temperature ?? 0.7,
      }
    };

    // Add system instruction - try object format first (for newer models)
    // If that fails, we'll fall back to including it in contents
    if (systemPrompt) {
      // For gemini-1.5-flash and newer, use systemInstruction as object
      if (model.includes('1.5') || model.includes('2.0')) {
        requestBody.systemInstruction = {
          parts: [
            { text: systemPrompt }
          ]
        };
      } else {
        // For older models, include system prompt in contents
        requestBody.contents.unshift({
          role: 'user',
          parts: [{ text: systemPrompt }]
        });
      }
    }

    try {
      console.log('[Gemini Client] Calling Gemini API directly', {
        model,
        url: apiUrl.replace(GEMINI_API_KEY, '***'),
        hasSystemPrompt: !!systemPrompt,
        userPromptLength: userPrompt.length,
      });

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorDetails;
        try {
          errorDetails = JSON.parse(errorText);
        } catch {
          errorDetails = errorText;
        }
        
        // Log FULL error details for debugging
        console.error('[Gemini Client] API error response:', JSON.stringify({
          status: response.status,
          statusText: response.statusText,
          error: errorDetails,
          url: apiUrl.replace(GEMINI_API_KEY, '***'),
          model: model,
          hasSystemPrompt: !!systemPrompt,
          systemPromptLength: systemPrompt?.length || 0,
          userPromptLength: userPrompt.length,
          requestBodyKeys: Object.keys(requestBody),
          systemInstructionFormat: requestBody.systemInstruction ? 'object' : 'none',
        }, null, 2));
        
        // Also log the actual error message from Gemini
        if (errorDetails && typeof errorDetails === 'object') {
          console.error('[Gemini Client] Gemini error details:', JSON.stringify(errorDetails, null, 2));
        } else {
          console.error('[Gemini Client] Gemini error text:', errorText);
        }
        
        // If 400 error, try with system prompt in contents instead
        if (response.status === 400 && requestBody.systemInstruction) {
          console.log('[Gemini Client] Retrying with system prompt in contents...');
          const retryBody = {
            contents: [
              {
                role: 'user',
                parts: [{ text: systemPrompt }]
              },
              {
                parts: [{ text: userPrompt }]
              }
            ],
            generationConfig: requestBody.generationConfig
          };
          
          const retryResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(retryBody),
          });
          
          if (retryResponse.ok) {
            const retryData = await retryResponse.json();
            const text = retryData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
            if (text) {
              console.log('[Gemini Client] Retry successful');
              return { text };
            }
          }
        }
        
        throw new Error(`Gemini API error: ${response.status} - ${JSON.stringify(errorDetails).substring(0, 300)}`);
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

      if (!text) {
        console.warn('[Gemini Client] Empty response from Gemini API', { data });
        throw new Error('Empty response from Gemini API');
      }

      console.log('[Gemini Client] Successfully received response', { textLength: text.length });
      return { text };
    } catch (error) {
      console.error('[Gemini Client] Error:', error);
      throw error;
    }
  } else {
    // Fallback to Lovable AI Gateway
    console.log('[Gemini Client] Using Lovable AI Gateway (fallback)');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model || 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: config.maxOutputTokens || 1024,
        temperature: config.temperature ?? 0.7,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Gemini Client] Lovable API error:', {
        status: response.status,
        body: errorText,
      });
      throw new Error(`Lovable API error: ${response.status} - ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content?.trim() || '';

    if (!text) {
      throw new Error('Empty response from Lovable API');
    }

    return { text };
  }
}

/**
 * Call Gemini API with streaming support
 * Returns a ReadableStream for streaming responses
 */
export async function callGeminiAPIStream(
  systemPrompt: string,
  userPrompt: string,
  config: GeminiConfig = {}
): Promise<ReadableStream<Uint8Array>> {
  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  const useDirectGemini = !!GEMINI_API_KEY;

  if (!GEMINI_API_KEY && !LOVABLE_API_KEY) {
    throw new Error('Either GEMINI_API_KEY or LOVABLE_API_KEY must be configured');
  }

  if (useDirectGemini) {
    // Direct Gemini API with streaming
    const model = config.model || 'gemini-1.5-flash';
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${GEMINI_API_KEY}`;

    // Build request body with proper format
    const requestBody: any = {
      contents: [
        {
          parts: [
            { text: userPrompt }
          ]
        }
      ],
      generationConfig: {
        maxOutputTokens: config.maxOutputTokens || 2048,
        temperature: config.temperature ?? 0.7,
      }
    };

    // Add system instruction
    if (systemPrompt) {
      if (model.includes('1.5') || model.includes('2.0')) {
        requestBody.systemInstruction = {
          parts: [
            { text: systemPrompt }
          ]
        };
      } else {
        requestBody.contents.unshift({
          role: 'user',
          parts: [{ text: systemPrompt }]
        });
      }
    }

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Gemini Client] Streaming API error:', {
          status: response.status,
          body: errorText,
        });
        throw new Error(`Gemini API error: ${response.status}`);
      }

      // Gemini streaming returns Server-Sent Events (SSE) format
      // Convert to a format compatible with OpenAI-style streaming
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      return new ReadableStream({
        async start(controller) {
          if (!reader) {
            controller.close();
            return;
          }

          try {
            let buffer = '';
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const jsonStr = line.slice(6);
                  if (jsonStr === '[DONE]') {
                    controller.close();
                    return;
                  }

                  try {
                    const data = JSON.parse(jsonStr);
                    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
                    
                    if (text) {
                      // Format as OpenAI-style SSE
                      const chunk = `data: ${JSON.stringify({
                        choices: [{
                          delta: { content: text },
                          finish_reason: null
                        }]
                      })}\n\n`;
                      controller.enqueue(new TextEncoder().encode(chunk));
                    }
                  } catch (e) {
                    // Skip invalid JSON
                  }
                }
              }
            }

            // Send final chunk
            controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
            controller.close();
          } catch (error) {
            controller.error(error);
          }
        }
      });
    } catch (error) {
      console.error('[Gemini Client] Streaming error:', error);
      throw error;
    }
  } else {
    // Fallback to Lovable AI Gateway (supports streaming)
    console.log('[Gemini Client] Using Lovable AI Gateway streaming (fallback)');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model || 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: config.maxOutputTokens || 2048,
        temperature: config.temperature ?? 0.7,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Gemini Client] Lovable streaming error:', {
        status: response.status,
        body: errorText,
      });
      throw new Error(`Lovable API error: ${response.status}`);
    }

    // Return the response stream directly (Lovable uses OpenAI format)
    return response.body!;
  }
}
