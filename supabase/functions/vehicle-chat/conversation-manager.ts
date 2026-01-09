// Conversation Memory Management System
// Handles conversation context with sliding window + summarization

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
  supabase: any,
  deviceId: string,
  userId: string
): Promise<ConversationContext> {
  // Fetch total message count
  const { count } = await supabase
    .from('vehicle_chat_history')
    .select('*', { count: 'exact', head: true })
    .eq('device_id', deviceId);

  console.log(`Total messages for device ${deviceId}: ${count}`);

  // Get recent 20 messages
  const { data: recentMessages, error: recentError } = await supabase
    .from('vehicle_chat_history')
    .select('role, content, created_at')
    .eq('device_id', deviceId)
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

  // If more than 30 messages total, summarize older ones
  let summary: string | null = null;
  let facts: string[] = [];

  if (count && count > 30) {
    console.log('Conversation exceeds 30 messages, creating summary...');

    // Get older messages (31st to 100th for context)
    const { data: olderMessages, error: olderError } = await supabase
      .from('vehicle_chat_history')
      .select('role, content')
      .eq('device_id', deviceId)
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
 * Summarize older conversation messages using lightweight LLM
 * Creates 2-3 sentence summary focusing on key topics
 */
async function summarizeConversation(messages: ChatMessage[]): Promise<string> {
  // Build conversation text
  const conversationText = messages
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n');

  // Create summary prompt
  const summaryPrompt = `Summarize this vehicle chat conversation in 2-3 sentences, focusing on:
- Key topics discussed (location, battery, speed, trips, etc.)
- Any important decisions or information
- Recurring questions or concerns

Conversation:
${conversationText}

Summary (2-3 sentences):`;

  try {
    // Call Lovable AI Gateway with lightweight model
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.warn('LOVABLE_API_KEY not set, skipping summarization');
      return 'Previous conversation covered vehicle status and location queries.';
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-lite',  // Lightweight model for summaries
        messages: [{ role: 'user', content: summaryPrompt }],
        max_tokens: 150,
        temperature: 0.3  // Low temperature for factual summaries
      })
    });

    if (!response.ok) {
      console.error('Summary API error:', response.status);
      return 'Previous conversation covered vehicle status and location queries.';
    }

    const data = await response.json();
    const summary = data.choices?.[0]?.message?.content?.trim() ||
                   'Previous conversation covered vehicle status and location queries.';

    return summary;
  } catch (error) {
    console.error('Error creating summary:', error);
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
