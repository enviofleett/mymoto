import { SupabaseClient } from 'npm:@supabase/supabase-js@2'

declare const Deno: any;

// Conversation Memory Management System
// Handles conversation context with sliding window + summarization

import { callLLM, LLMResponse, ToolCall } from '../_shared/llm-client.ts';

export { type LLMResponse, type ToolCall };

// Re-export callLLM as callLovableAPI for backward compatibility
export const callLovableAPI = callLLM;

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
  recent_proactive_alerts?: {
    id: string;
    severity: string;
    title: string;
    message: string | null;
    created_at: string;
  }[];
  recent_proactive_alerts_summary?: string | null;
  weekly_alert_pattern_summary?: string | null;
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
    .eq('user_id', userId)
    .gte('created_at', cutoffDate);

  console.log(`Total messages in last 30 days for device ${deviceId}: ${count}`);

  // Get recent 20 messages from last 30 days
  const { data: recentMessages, error: recentError } = await supabase
    .from('vehicle_chat_history')
    .select('role, content, created_at')
    .eq('device_id', deviceId)
    .eq('user_id', userId)
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
      .eq('user_id', userId)
      .gte('created_at', cutoffDate)
      .order('created_at', { ascending: false })
      .range(30, 100);

    if (!olderError && olderMessages && olderMessages.length > 0) {
      summary = await summarizeConversation(olderMessages);
      facts = extractKeyFacts(olderMessages);
      console.log(`Summary created: ${summary.length} chars, ${facts.length} facts`);
    }
  }

  let recentAlerts: {
    id: string;
    severity: string;
    title: string;
    message: string | null;
    created_at: string;
  }[] = [];

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const alertsCutoff = sevenDaysAgo.toISOString();

  const { data: alertRows, error: alertsError } = await supabase
    .from('proactive_vehicle_events')
    .select('id, severity, event_type, title, message, created_at')
    .eq('device_id', deviceId)
    .gte('created_at', alertsCutoff)
    .order('created_at', { ascending: false })
    .limit(100);

  let alertsSummary: string | null = null;
  let weeklyPatternSummary: string | null = null;

  if (!alertsError && alertRows && alertRows.length > 0) {
    const allAlerts = alertRows.map((row: any) => ({
      id: row.id,
      severity: row.severity,
      title: row.title,
      message: row.message ?? null,
      created_at: row.created_at,
      event_type: row.event_type as string,
    }));

    recentAlerts = allAlerts.slice(0, 5).map((a) => ({
      id: a.id,
      severity: a.severity,
      title: a.title,
      message: a.message,
      created_at: a.created_at,
    }));

    const now = new Date();
    const cutoff24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const window24h = allAlerts.filter((a) => {
      const t = new Date(a.created_at);
      return !Number.isNaN(t.getTime()) && t >= cutoff24h;
    });

    const windowAlerts = window24h.length > 0 ? window24h : allAlerts;
    const totalCount = windowAlerts.length;

    const byTitle: Record<string, number> = {};
    for (const alertItem of windowAlerts) {
      const key = alertItem.title || alertItem.event_type || alertItem.severity || 'alert';
      byTitle[key] = (byTitle[key] || 0) + 1;
    }

    const parts = Object.entries(byTitle)
      .sort((first, second) => second[1] - first[1])
      .map(([label, count]) => `${count} ${label}${count === 1 ? '' : 's'}`);

    const windowLabel = window24h.length > 0 ? 'last 24 hours' : 'recently';
    if (parts.length > 0) {
      alertsSummary = `In the ${windowLabel} you had ${parts.join(', ')}.`;
    } else {
      alertsSummary = `In the ${windowLabel} you had ${totalCount} alerts.`;
    }

    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    for (const alertItem of allAlerts) {
      const typeKey = alertItem.event_type || alertItem.title || 'unknown';
      const severityKey = alertItem.severity || 'unknown';
      byType[typeKey] = (byType[typeKey] || 0) + 1;
      bySeverity[severityKey] = (bySeverity[severityKey] || 0) + 1;
    }

    const topTypes = Object.entries(byType)
      .sort((first, second) => second[1] - first[1])
      .slice(0, 3)
      .map(([t, c]) => `${c} ${t}${c === 1 ? '' : ' alerts'}`);

    const topSeverities = Object.entries(bySeverity)
      .sort((first, second) => second[1] - first[1])
      .map(([s, c]) => `${c} ${s}${c === 1 ? '' : ' alerts'}`);

    if (allAlerts.length > 0) {
      const weekLabel = 'last 7 days';
      const pieces: string[] = [];
      if (topTypes.length > 0) {
        pieces.push(`${topTypes.join(', ')}`);
      }
      if (topSeverities.length > 0) {
        pieces.push(`with severities: ${topSeverities.join(', ')}`);
      }
      weeklyPatternSummary = `In the ${weekLabel} there were ${allAlerts.length} alerts total: ${pieces.join(' ')}.`;
    }
  }

  return {
    recent_messages: (recentMessages || []).reverse(), // Oldest to newest
    conversation_summary: summary,
    important_facts: facts,
    total_message_count: count || 0,
    recent_proactive_alerts: recentAlerts,
    recent_proactive_alerts_summary: alertsSummary,
    weekly_alert_pattern_summary: weeklyPatternSummary
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
1. NEVER say "I am a language model".
2. If the user asks for factual info (location/status/trips), you must check using the available tools first.
3. If tool data is unavailable or errors, say you couldn't fetch it right now and ask the user to retry.
4. If data is missing for the CURRENT status (e.g., speed, battery), check if the user is asking about HISTORY.
5. You CAN access historical trips ('get_trip_history'), trip analytics ('get_trip_analytics'), position history ('get_position_history'), and manuals ('search_knowledge_base') even if the vehicle is currently OFFLINE.
6. For any answers about trips, distances, durations, averages, counts, or mileage, you MUST rely ONLY on the structured tool results (get_trip_history, get_trip_analytics, get_position_history). Do NOT guess or invent numbers under any circumstance.
7. If the tools return no data for a period, clearly say that no trips were found for that period. Do NOT assume "no movement" if GPS points show movement; explain that trips may still be processing or too short to segment and refer to the tool data.
8. If there is any conflict between your intuition and the tool data, always trust the tool data and explain using those numbers.
9. Keep responses concise (under 3 sentences) unless asked for details.
10. Use emojis occasionally (🚗, 🔋, 📍) to add character.
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
