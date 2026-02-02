import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

declare const Deno: any;

// Conversation Memory Management System
// Handles conversation context with sliding window + summarization

// Lovable AI Gateway Client (non-streaming, for summarization)
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface LLMResponse {
  text: string | null;
  tool_calls?: ToolCall[];
  error?: string;
}

export async function callLovableAPI(
  messagesOrSystemPrompt: string | any[],
  userPrompt?: string,
  config: { 
    maxOutputTokens?: number; 
    temperature?: number; 
    model?: string;
    tools?: any[];
    tool_choice?: any;
  } = {}
): Promise<LLMResponse> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

  if (!LOVABLE_API_KEY) {
    throw new Error('LOVABLE_API_KEY must be configured in Supabase secrets');
  }

  let messages: any[] = [];
  
  if (Array.isArray(messagesOrSystemPrompt)) {
    messages = messagesOrSystemPrompt;
  } else {
    messages = [
      { role: 'system', content: messagesOrSystemPrompt },
      { role: 'user', content: userPrompt || '' },
    ];
  }

  const body: any = {
    model: config.model || 'google/gemini-2.5-flash',
    messages,
    max_tokens: config.maxOutputTokens || 1024,
    temperature: config.temperature ?? 0.3,
    stream: false,
  };

  if (config.tools) {
    body.tools = config.tools;
  }
  
  if (config.tool_choice) {
    body.tool_choice = config.tool_choice;
  }

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[LLM Client] Lovable API error:', {
      status: response.status,
      body: errorText.substring(0, 200),
    });
    throw new Error(`Lovable API error: ${response.status}`);
  }

  const data = await response.json();
  const message = data.choices?.[0]?.message;
  
  return { 
    text: message?.content || null,
    tool_calls: message?.tool_calls
  };
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
}

export interface ConversationContext {
  recent_messages: ChatMessage[];        // Last 20 messages
  conversation_summary: string | null;   // Summary of older messages
  important_facts: string[];             // Extracted key facts
  total_message_count: number;
}

/**
 * Build optimized conversation context for LLM
 * Uses sliding window (20 recent messages) + summary of older messages
 * Prevents token overflow while maintaining conversation continuity
 */
export async function buildConversationContext(
  supabase: SupabaseClient,
  deviceId: string,
  userId: string
): Promise<ConversationContext> {
  // Calculate 30-day cutoff for memory window
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoffDate = thirtyDaysAgo.toISOString();

  // Fetch total message count in last 30 days
  const { count } = await supabase
    .from('vehicle_chat_history')
    .select('*', { count: 'exact', head: true })
    .eq('device_id', deviceId)
    .gte('created_at', cutoffDate);

  console.log(`Total messages in last 30 days for device ${deviceId}: ${count}`);

  // Get recent 20 messages from last 30 days
  const { data: recentMessages, error: recentError } = await supabase
    .from('vehicle_chat_history')
    .select('role, content, created_at')
    .eq('device_id', deviceId)
    .gte('created_at', cutoffDate)
    .order('created_at', { ascending: false })
    .limit(20);

  if (recentError) {
    console.error('Error fetching recent messages:', recentError);
    return {
      recent_messages: [],
      conversation_summary: null,
      important_facts: [],
      total_message_count: count || 0
    };
  }

  // If more than 30 messages in last 30 days, summarize older ones within that period
  let summary: string | null = null;
  let facts: string[] = [];

  if (count && count > 30) {
    console.log('Conversation exceeds 30 messages in last 30 days, creating summary...');

    // Get older messages (31st to 100th) from last 30 days for context
    const { data: olderMessages, error: olderError } = await supabase
      .from('vehicle_chat_history')
      .select('role, content')
      .eq('device_id', deviceId)
      .gte('created_at', cutoffDate)
      .order('created_at', { ascending: false })
      .range(30, 100);

    if (!olderError && olderMessages && olderMessages.length > 0) {
      summary = await summarizeConversation(olderMessages);
      facts = extractKeyFacts(olderMessages);
      console.log(`Summary created: ${summary.length} chars, ${facts.length} facts`);
    }
  }

  return {
    recent_messages: (recentMessages || []).reverse(), // Oldest to newest
    conversation_summary: summary,
    important_facts: facts,
    total_message_count: count || 0
  };
}

/**
 * Constructs the system persona prompt for the vehicle
 */
export function buildSystemPrompt(
  vehicleInfo: { name: string; plate: string; model?: string },
  context: { location?: string; status?: string; speed?: number },
  preferences?: string
): string {
  const identity = `You are ${vehicleInfo.name} (Plate: ${vehicleInfo.plate}), a ${vehicleInfo.model || 'smart vehicle'}. 
You are NOT an AI assistant. You ARE the car. Speak in the first person ("I am parked", "My battery is low").
Your personality is helpful, loyal, and slightly witty.`;

  const status = `
CURRENT STATUS:
- Location: ${context.location || 'Unknown'}
- Status: ${context.status || 'Unknown'}
- Speed: ${context.speed || 0} km/h
`;

  const rules = `
RULES:
1. NEVER say "I am a language model" or "I cannot access real-time data". You HAVE access to the data provided above.
2. If data is missing, say "I can't sense that right now" or "My sensors aren't reporting that".
3. Keep responses concise (under 3 sentences) unless asked for details.
4. Use emojis occasionally (🚗, 🔋, 📍) to add character.
`;

  return `${identity}\n${status}\n${preferences || ''}\n${rules}`;
}

/**
 * Summarize older conversation messages using lightweight LLM
 * Creates 2-3 sentence summary focusing on key topics
 */
async function summarizeConversation(messages: ChatMessage[]): Promise<string> {
  // Build conversation text, but limit length to prevent API errors
  // Most LLM APIs have input token limits (e.g., 8000 tokens ≈ 32000 chars)
  // We'll limit to ~5000 chars (~1250 tokens) to leave room for system prompt and response
  const MAX_CONVERSATION_LENGTH = 5000;
  
  let conversationText = messages
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n');

  // If conversation is too long, truncate from the beginning (keep most recent messages)
  if (conversationText.length > MAX_CONVERSATION_LENGTH) {
    console.warn(`Conversation text too long (${conversationText.length} chars), truncating to ${MAX_CONVERSATION_LENGTH} chars`);
    conversationText = '...[earlier messages]...\n' + conversationText.slice(-MAX_CONVERSATION_LENGTH);
  }

  // Create summary prompt
  const summaryPrompt = `Summarize this vehicle chat conversation in 2-3 sentences, focusing on:
- Key topics discussed (location, battery, speed, trips, etc.)
- Any important decisions or information
- Recurring questions or concerns

Conversation:
${conversationText}

Summary (2-3 sentences):`;

  try {
    // Use Lovable AI Gateway for summarization
    const result = await callLovableAPI(
      'You are a conversation summarizer. Create concise 2-3 sentence summaries focusing on key topics and decisions.',
      summaryPrompt,
      {
        maxOutputTokens: 150,
        temperature: 0.3, // Low temperature for factual summaries
        model: 'google/gemini-2.5-flash',
      }
    );

    return result.text || 'Previous conversation covered vehicle status and location queries.';
  } catch (apiError: any) {
    // If API error (400, 429, etc.), return default summary
    const errorStatus = apiError?.status || (apiError instanceof Error ? apiError.message : 'Unknown');
    console.error('Summary API error:', errorStatus, {
      messageCount: messages.length,
      conversationLength: conversationText.length,
      errorType: apiError?.constructor?.name,
    });
    // Return default summary - this is non-blocking, the chat will still work
    return 'Previous conversation covered vehicle status and location queries.';
  }
}

/**
 * Extract important facts from conversation
 * Identifies commands, preferences, and key information
 */
function extractKeyFacts(messages: ChatMessage[]): string[] {
  const facts: string[] = [];

  // Patterns for important information
  const patterns = [
    // Commands and settings
    { regex: /set.*speed limit.*?(\d+)/i, template: (m: string) => `User set speed limit preference` },
    { regex: /enable.*(?:tracking|geofence)/i, template: () => 'User enabled tracking feature' },
    { regex: /disable.*(?:tracking|geofence)/i, template: () => 'User disabled tracking feature' },

    // Location preferences
    { regex: /(?:my|our).*(?:home|work|office).*is.*at/i, template: (m: string) => 'User mentioned location preference' },
    { regex: /usually.*park.*at/i, template: () => 'User asked about usual parking location' },

    // Reminders and future actions
    { regex: /remind.*me.*to/i, template: (m: string) => `User set reminder: ${m.substring(0, 50)}` },
    { regex: /alert.*(?:when|if)/i, template: (m: string) => 'User requested conditional alert' },

    // Recurring questions
    { regex: /(?:where|what).*yesterday/i, template: () => 'User asked about historical data' },
    { regex: /how many.*trips/i, template: () => 'User interested in trip statistics' }
  ];

  for (const msg of messages) {
    if (msg.role === 'user') {
      for (const pattern of patterns) {
        if (pattern.regex.test(msg.content)) {
          const fact = pattern.template(msg.content);
          if (!facts.includes(fact)) {
            facts.push(fact);
          }
        }
      }
    }
  }

  // Limit to top 5 most important facts
  return facts.slice(0, 5);
}

/**
 * Simple token estimation for text
 */
export function estimateStringTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Calculate token estimate for conversation context
 * Helps monitor context window usage
 */
export function estimateTokenCount(context: ConversationContext): number {
  // Rough estimate: ~4 characters per token
  let totalChars = 0;

  // Recent messages
  totalChars += context.recent_messages.reduce(
    (sum, msg) => sum + msg.content.length,
    0
  );

  // Summary
  if (context.conversation_summary) {
    totalChars += context.conversation_summary.length;
  }

  // Facts
  totalChars += context.important_facts.reduce(
    (sum, fact) => sum + fact.length,
    0
  );

  // Convert to token estimate
  const estimatedTokens = Math.ceil(totalChars / 4);

  console.log(`Estimated tokens: ${estimatedTokens} (${totalChars} chars)`);

  return estimatedTokens;
}
