/**
 * Shared Streaming Response Handler
 * Extracts duplicate streaming logic from chat components
 */

export interface StreamingOptions {
  onDelta: (delta: string, fullResponse: string) => void;
  onComplete?: (fullResponse: string) => void;
  onError?: (error: Error) => void;
}

/**
 * Handles streaming response from edge function
 * Parses Server-Sent Events (SSE) format
 */
export async function handleStreamingResponse(
  response: Response,
  options: StreamingOptions
): Promise<string> {
  const { onDelta, onComplete, onError } = options;

  if (!response.body) {
    throw new Error('Response body is null');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullResponse = '';
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          
          try {
            const parsed = JSON.parse(data);
            if (parsed.delta) {
              fullResponse += parsed.delta;
              onDelta(parsed.delta, fullResponse);
            }
          } catch (parseError) {
            // Ignore parse errors for malformed JSON
            console.warn('Failed to parse streaming data:', parseError);
          }
        }
      }
    }

    if (onComplete) {
      onComplete(fullResponse);
    }

    return fullResponse;
  } catch (error) {
    const err = error instanceof Error ? error : new Error('Unknown streaming error');
    if (onError) {
      onError(err);
    }
    throw err;
  }
}
