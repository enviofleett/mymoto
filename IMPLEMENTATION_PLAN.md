# Implementation Plan - Intelligent Vehicle Companion Platform
**Based on**: AI/LLM Audit Report
**Timeline**: 10 weeks (5 phases)
**Priority**: Critical → High → Medium → Low

---

## 📋 PHASE 1: CRITICAL FIXES (Week 1-2)
**Goal**: Fix breaking issues that prevent scalability and reliability

### 1.1 Conversation Memory Management System
**Priority**: 🔴 CRITICAL
**Effort**: 3 days
**Impact**: Prevents token overflow, reduces costs by 60%

#### Problem
- Current: Fetches last 50 messages with no truncation → Will fail on long conversations
- System prompt already ~1500 tokens + 50 messages (~2000 tokens) = ~3500 tokens
- Gemini Flash has 1M token context, but expensive and slow with large contexts

#### Implementation

**Step 1: Create conversation summarization function**
```typescript
// File: supabase/functions/vehicle-chat/conversation-manager.ts

interface ConversationContext {
  recent_messages: ChatMessage[];        // Last 20 messages
  conversation_summary: string | null;   // Summary of older messages
  important_facts: string[];             // Extracted key facts
  total_message_count: number;
}

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

  // Get recent 20 messages
  const { data: recentMessages } = await supabase
    .from('vehicle_chat_history')
    .select('role, content')
    .eq('device_id', deviceId)
    .order('created_at', { ascending: false })
    .limit(20);

  // If more than 30 messages total, summarize older ones
  let summary = null;
  let facts: string[] = [];

  if (count && count > 30) {
    // Get older messages (31st to 100th)
    const { data: olderMessages } = await supabase
      .from('vehicle_chat_history')
      .select('role, content')
      .eq('device_id', deviceId)
      .order('created_at', { ascending: false })
      .range(30, 100);

    // Create summary using lightweight model
    summary = await summarizeConversation(olderMessages);
    facts = extractKeyFacts(olderMessages);
  }

  return {
    recent_messages: recentMessages?.reverse() || [],
    conversation_summary: summary,
    important_facts: facts,
    total_message_count: count || 0
  };
}

async function summarizeConversation(messages: any[]): Promise<string> {
  // Use Gemini Flash to create 2-3 sentence summary
  const conversationText = messages
    .map(m => `${m.role}: ${m.content}`)
    .join('\n');

  const summaryPrompt = `Summarize this conversation in 2-3 sentences, focusing on key topics discussed and any important decisions or information:

${conversationText}

Summary:`;

  // Call Lovable AI Gateway with minimal model
  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('LOVABLE_API_KEY')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'google/gemini-2.0-flash-lite',  // Lightweight model for summaries
      messages: [{ role: 'user', content: summaryPrompt }],
      max_tokens: 150
    })
  });

  const data = await response.json();
  return data.choices[0].message.content;
}

function extractKeyFacts(messages: any[]): string[] {
  // Extract important facts using regex patterns
  const facts: string[] = [];
  const patterns = [
    /set.*speed limit.*(\d+)/i,
    /enable.*geofence/i,
    /my.*(?:home|work|office).*is.*at/i,
    /remind.*me.*to/i
  ];

  for (const msg of messages) {
    if (msg.role === 'user') {
      for (const pattern of patterns) {
        if (pattern.test(msg.content)) {
          facts.push(msg.content);
        }
      }
    }
  }

  return facts.slice(0, 5);  // Top 5 facts
}
```

**Step 2: Update vehicle-chat Edge Function**
```typescript
// File: supabase/functions/vehicle-chat/index.ts

import { buildConversationContext } from './conversation-manager.ts';

// In main handler, replace current chat history fetch:
// OLD CODE (lines 170-177):
/*
const { data: chatHistory } = await supabase
  .from('vehicle_chat_history')
  .select('role, content')
  .eq('device_id', device_id)
  .order('created_at', { ascending: false })
  .limit(10)
*/

// NEW CODE:
const conversationContext = await buildConversationContext(
  supabase,
  device_id,
  user_id
);

// Update system prompt to include summary
let systemPrompt = `You are "${vehicleNickname}", an intelligent AI companion...

${conversationContext.conversation_summary ? `
PREVIOUS CONVERSATION SUMMARY:
${conversationContext.conversation_summary}

KEY FACTS FROM HISTORY:
${conversationContext.important_facts.map((f, i) => `${i + 1}. ${f}`).join('\n')}
` : ''}

RECENT ACTIVITY (last ${history?.length || 0} position updates):
...`;

// Update messages array
const messages = [
  { role: 'system', content: systemPrompt },
  ...conversationContext.recent_messages.map(msg => ({
    role: msg.role as 'user' | 'assistant',
    content: msg.content
  })),
  { role: 'user', content: message }
];
```

**Step 3: Add conversation cleanup job**
```sql
-- File: supabase/migrations/20260110_conversation_cleanup.sql

-- Function to archive old messages
CREATE OR REPLACE FUNCTION archive_old_chat_messages()
RETURNS void AS $$
BEGIN
  -- Delete messages older than 90 days
  DELETE FROM vehicle_chat_history
  WHERE created_at < NOW() - INTERVAL '90 days';

  -- Keep only last 100 messages per device
  DELETE FROM vehicle_chat_history
  WHERE id IN (
    SELECT id FROM (
      SELECT id,
             ROW_NUMBER() OVER (
               PARTITION BY device_id
               ORDER BY created_at DESC
             ) as rn
      FROM vehicle_chat_history
    ) t
    WHERE t.rn > 100
  );
END;
$$ LANGUAGE plpgsql;

-- Schedule via pg_cron (if available) or call from Edge Function
-- For now, create a manual cleanup Edge Function
```

**Testing**:
```bash
# Test with 50+ message conversation
# Verify token count stays < 2000
# Verify summary captures key information
```

**Success Criteria**:
- ✅ Conversations with 100+ messages work without errors
- ✅ Token usage reduced from ~3500 to ~1500 per query
- ✅ Summary accurately captures conversation context
- ✅ Old messages auto-archived after 90 days

---

### 1.2 Intelligent Query Routing System
**Priority**: 🔴 HIGH
**Effort**: 2 days
**Impact**: 40% faster responses, 30% cost reduction

#### Problem
- Simple keyword matching causes false positives/negatives
- All queries use expensive Gemini Flash model
- No multi-intent support

#### Implementation

**Step 1: Create intent classification system**
```typescript
// File: supabase/functions/vehicle-chat/intent-classifier.ts

export enum QueryIntent {
  LOCATION = 'location',
  STATUS = 'status',
  HISTORY = 'history',
  COMMAND = 'command',
  TRIP_PLANNING = 'trip_planning',
  MAINTENANCE = 'maintenance',
  GENERAL = 'general'
}

export interface ClassifiedQuery {
  intents: QueryIntent[];
  confidence: number;
  requires_fresh_data: boolean;
  can_use_cache: boolean;
  estimated_complexity: 'simple' | 'medium' | 'complex';
}

export function classifyQuery(message: string): ClassifiedQuery {
  const lowerMsg = message.toLowerCase();
  const intents: QueryIntent[] = [];
  let requiresFreshData = false;

  // Location keywords (high confidence)
  const locationPatterns = [
    /where\s+(are|am|is)/i,
    /location/i,
    /gps/i,
    /coordinates/i,
    /map/i,
    /show.*on.*map/i,
    /find.*me/i,
    /parked/i
  ];

  if (locationPatterns.some(p => p.test(message))) {
    intents.push(QueryIntent.LOCATION);
    requiresFreshData = true;
  }

  // Status keywords
  const statusPatterns = [
    /what.*(?:speed|battery|ignition)/i,
    /how.*(?:fast|charged)/i,
    /is.*(?:engine|ignition|online)/i,
    /status/i,
    /health/i
  ];

  if (statusPatterns.some(p => p.test(message))) {
    intents.push(QueryIntent.STATUS);
    requiresFreshData = true;
  }

  // History/temporal keywords
  const historyPatterns = [
    /yesterday/i,
    /last\s+(?:week|month|hour)/i,
    /history/i,
    /previous/i,
    /when\s+(?:did|was)/i,
    /how\s+many\s+(?:trips|miles)/i
  ];

  if (historyPatterns.some(p => p.test(message))) {
    intents.push(QueryIntent.HISTORY);
  }

  // Command keywords
  const commandPatterns = [
    /(?:lock|unlock)/i,
    /set.*(?:speed|limit|max)/i,
    /enable|disable/i,
    /turn\s+(?:on|off)/i,
    /send.*location/i,
    /start.*tracking/i,
    /create.*geofence/i,
    /remind.*me/i
  ];

  if (commandPatterns.some(p => p.test(message))) {
    intents.push(QueryIntent.COMMAND);
  }

  // Trip planning
  const tripPatterns = [
    /route\s+to/i,
    /how\s+(?:far|long)\s+to/i,
    /navigate/i,
    /directions/i,
    /traffic/i,
    /eta/i
  ];

  if (tripPatterns.some(p => p.test(message))) {
    intents.push(QueryIntent.TRIP_PLANNING);
  }

  // Maintenance
  const maintenancePatterns = [
    /maintenance/i,
    /service/i,
    /oil\s+change/i,
    /tire/i,
    /health\s+check/i,
    /diagnostic/i
  ];

  if (maintenancePatterns.some(p => p.test(message))) {
    intents.push(QueryIntent.MAINTENANCE);
  }

  // Default to general if no intents
  if (intents.length === 0) {
    intents.push(QueryIntent.GENERAL);
  }

  // Determine complexity
  const wordCount = message.split(/\s+/).length;
  let complexity: 'simple' | 'medium' | 'complex' = 'simple';

  if (wordCount > 20 || intents.length > 2) {
    complexity = 'complex';
  } else if (wordCount > 10 || intents.length > 1) {
    complexity = 'medium';
  }

  return {
    intents,
    confidence: intents.length > 0 ? 0.8 : 0.5,
    requires_fresh_data: requiresFreshData,
    can_use_cache: !requiresFreshData && complexity === 'simple',
    estimated_complexity: complexity
  };
}
```

**Step 2: Create query router**
```typescript
// File: supabase/functions/vehicle-chat/query-router.ts

import { classifyQuery, QueryIntent, ClassifiedQuery } from './intent-classifier.ts';

export async function routeQuery(
  message: string,
  deviceId: string,
  supabase: any
): Promise<any> {
  const classification = classifyQuery(message);

  console.log('Query classification:', classification);

  // Fast path for simple cached queries
  if (classification.can_use_cache) {
    const cached = await checkResponseCache(deviceId, message);
    if (cached) {
      console.log('Returning cached response');
      return { fromCache: true, response: cached };
    }
  }

  // Fetch data based on intents
  const dataContext: any = {};

  if (classification.requires_fresh_data) {
    // Fetch fresh GPS data
    dataContext.freshGPS = await fetchFreshGpsData(supabase, deviceId);
  }

  if (classification.intents.includes(QueryIntent.HISTORY)) {
    // Fetch trip history
    dataContext.trips = await supabase.rpc('get_recent_trips', {
      p_device_id: deviceId,
      p_limit: 10
    });
  }

  if (classification.intents.includes(QueryIntent.COMMAND)) {
    // Check user permissions
    dataContext.canExecuteCommands = await checkCommandPermissions(supabase, deviceId);
  }

  return {
    fromCache: false,
    classification,
    dataContext
  };
}

async function checkResponseCache(
  deviceId: string,
  message: string
): Promise<string | null> {
  // Implement simple cache for common queries
  const cacheKey = `${deviceId}:${message.toLowerCase()}`;
  // Use Supabase or Redis for caching with 30s TTL
  return null;  // Placeholder
}
```

**Step 3: Update main handler**
```typescript
// File: supabase/functions/vehicle-chat/index.ts

import { routeQuery } from './query-router.ts';

// In main handler, before building system prompt:
const routingResult = await routeQuery(message, device_id, supabase);

if (routingResult.fromCache) {
  // Return cached response immediately
  return new Response(routingResult.response, {
    headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
  });
}

// Use classification to optimize data fetching
const classification = routingResult.classification;
console.log(`Query classified as: ${classification.intents.join(', ')}`);

// Only fetch fresh data if needed
if (classification.requires_fresh_data) {
  const freshData = await fetchFreshGpsData(supabase, device_id);
  // ... use fresh data
}
```

**Testing**:
```typescript
// Test cases
const testQueries = [
  { query: "Where are you?", expectedIntents: ['location'] },
  { query: "What's your battery?", expectedIntents: ['status'] },
  { query: "Lock the doors", expectedIntents: ['command'] },
  { query: "How many trips yesterday?", expectedIntents: ['history'] },
  { query: "Where did I put my keys?", expectedIntents: ['general'] },  // Should NOT be location
];
```

**Success Criteria**:
- ✅ 95%+ accuracy on intent classification
- ✅ Response time < 500ms for cached queries
- ✅ Fresh data only fetched when needed
- ✅ No false positives for location queries

---

### 1.3 Proactive Notification System
**Priority**: 🟠 HIGH
**Effort**: 3 days
**Impact**: 3x user engagement, prevents critical issues

#### Problem
- AI is purely reactive
- User must actively check for problems
- No automatic alerts for battery low, overspeeding, etc.

#### Implementation

**Step 1: Create events table**
```sql
-- File: supabase/migrations/20260110_proactive_events.sql

-- Events table
CREATE TABLE vehicle_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'battery_critical',
    'battery_low',
    'overspeeding_sustained',
    'idle_too_long',
    'geofence_violation',
    'unusual_activity',
    'maintenance_due',
    'trip_milestone'
  )),
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB,
  acknowledged BOOLEAN DEFAULT false,
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexes
CREATE INDEX idx_vehicle_events_device_unack
ON vehicle_events(device_id, acknowledged, created_at DESC)
WHERE acknowledged = false;

CREATE INDEX idx_vehicle_events_created
ON vehicle_events(created_at DESC);

-- RLS
ALTER TABLE vehicle_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view events"
ON vehicle_events FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Service role can manage events"
ON vehicle_events FOR ALL
USING (true);

-- Auto-delete old acknowledged events (keep 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_events()
RETURNS void AS $$
BEGIN
  DELETE FROM vehicle_events
  WHERE acknowledged = true
  AND acknowledged_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;
```

**Step 2: Create event detection triggers**
```sql
-- File: supabase/migrations/20260110_event_triggers.sql

-- Function to detect and create events
CREATE OR REPLACE FUNCTION detect_vehicle_events()
RETURNS TRIGGER AS $$
DECLARE
  prev_battery INTEGER;
  overspeeding_duration INTERVAL;
BEGIN
  -- 1. Battery Critical (<10%)
  IF NEW.battery_percent IS NOT NULL AND NEW.battery_percent < 10 THEN
    SELECT battery_percent INTO prev_battery
    FROM vehicle_positions
    WHERE device_id = NEW.device_id
    ORDER BY cached_at DESC
    LIMIT 1 OFFSET 1;

    IF prev_battery IS NULL OR prev_battery >= 10 THEN
      INSERT INTO vehicle_events (
        device_id, event_type, severity, title, message, metadata
      ) VALUES (
        NEW.device_id,
        'battery_critical',
        'critical',
        '🔋 Battery Critically Low',
        'Battery at ' || NEW.battery_percent || '%. Vehicle may shut down soon. Charge immediately!',
        jsonb_build_object('battery_percent', NEW.battery_percent, 'latitude', NEW.latitude, 'longitude', NEW.longitude)
      );
    END IF;

  -- 2. Battery Low (10-20%)
  ELSIF NEW.battery_percent IS NOT NULL AND NEW.battery_percent < 20 THEN
    SELECT battery_percent INTO prev_battery
    FROM vehicle_positions
    WHERE device_id = NEW.device_id
    ORDER BY cached_at DESC
    LIMIT 1 OFFSET 1;

    IF prev_battery IS NULL OR prev_battery >= 20 THEN
      INSERT INTO vehicle_events (
        device_id, event_type, severity, title, message, metadata
      ) VALUES (
        NEW.device_id,
        'battery_low',
        'warning',
        '🔋 Low Battery Warning',
        'Battery at ' || NEW.battery_percent || '%. Consider charging soon.',
        jsonb_build_object('battery_percent', NEW.battery_percent)
      );
    END IF;
  END IF;

  -- 3. Sustained Overspeeding (>100 km/h for 10+ minutes)
  IF NEW.speed > 100 THEN
    SELECT COALESCE(SUM(CASE WHEN speed > 100 THEN EXTRACT(EPOCH FROM (gps_time - LAG(gps_time) OVER (ORDER BY gps_time))) ELSE 0 END), 0)
    INTO overspeeding_duration
    FROM (
      SELECT speed, gps_time
      FROM position_history
      WHERE device_id = NEW.device_id
      AND gps_time > NOW() - INTERVAL '15 minutes'
      ORDER BY gps_time DESC
      LIMIT 10
    ) recent;

    IF overspeeding_duration > INTERVAL '10 minutes' THEN
      -- Check if event already exists in last 30 minutes
      IF NOT EXISTS (
        SELECT 1 FROM vehicle_events
        WHERE device_id = NEW.device_id
        AND event_type = 'overspeeding_sustained'
        AND created_at > NOW() - INTERVAL '30 minutes'
      ) THEN
        INSERT INTO vehicle_events (
          device_id, event_type, severity, title, message, metadata
        ) VALUES (
          NEW.device_id,
          'overspeeding_sustained',
          'warning',
          '⚠️ Sustained Overspeeding',
          'Vehicle has been overspeeding for 10+ minutes at ' || NEW.speed || ' km/h. Please slow down for safety.',
          jsonb_build_object('speed', NEW.speed, 'duration_minutes', EXTRACT(EPOCH FROM overspeeding_duration) / 60)
        );
      END IF;
    END IF;
  END IF;

  -- 4. Idle with engine on (>15 minutes)
  IF NEW.ignition_on = true AND NEW.speed = 0 THEN
    -- Check if been idle for 15+ minutes
    IF EXISTS (
      SELECT 1
      FROM position_history
      WHERE device_id = NEW.device_id
      AND gps_time > NOW() - INTERVAL '15 minutes'
      AND ignition_on = true
      AND speed = 0
      HAVING COUNT(*) >= 5  -- At least 5 data points
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM vehicle_events
        WHERE device_id = NEW.device_id
        AND event_type = 'idle_too_long'
        AND created_at > NOW() - INTERVAL '30 minutes'
      ) THEN
        INSERT INTO vehicle_events (
          device_id, event_type, severity, title, message, metadata
        ) VALUES (
          NEW.device_id,
          'idle_too_long',
          'info',
          '⏱️ Extended Idling Detected',
          'Vehicle has been idling with engine on for 15+ minutes. Consider turning off engine to save fuel.',
          jsonb_build_object('idle_duration_minutes', 15)
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to vehicle_positions
CREATE TRIGGER trigger_detect_vehicle_events
AFTER INSERT OR UPDATE ON vehicle_positions
FOR EACH ROW
EXECUTE FUNCTION detect_vehicle_events();
```

**Step 3: Create frontend notification component**
```typescript
// File: src/components/fleet/ProactiveNotifications.tsx

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { X, AlertTriangle, Info, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface VehicleEvent {
  id: string;
  device_id: string;
  event_type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  metadata: any;
  acknowledged: boolean;
  created_at: string;
}

interface ProactiveNotificationsProps {
  deviceId?: string;  // If provided, show for specific vehicle
}

export function ProactiveNotifications({ deviceId }: ProactiveNotificationsProps) {
  const [events, setEvents] = useState<VehicleEvent[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    fetchUnacknowledgedEvents();

    // Subscribe to new events
    const channel = supabase
      .channel('vehicle-events')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'vehicle_events',
        filter: deviceId ? `device_id=eq.${deviceId}` : undefined
      }, (payload) => {
        const newEvent = payload.new as VehicleEvent;
        setEvents(prev => [newEvent, ...prev]);

        // Show toast for critical events
        if (newEvent.severity === 'critical') {
          toast({
            title: newEvent.title,
            description: newEvent.message,
            variant: 'destructive'
          });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [deviceId]);

  const fetchUnacknowledgedEvents = async () => {
    let query = supabase
      .from('vehicle_events')
      .select('*')
      .eq('acknowledged', false)
      .order('created_at', { ascending: false })
      .limit(10);

    if (deviceId) {
      query = query.eq('device_id', deviceId);
    }

    const { data, error } = await query;
    if (!error && data) {
      setEvents(data as VehicleEvent[]);
    }
  };

  const acknowledgeEvent = async (eventId: string) => {
    const { error } = await supabase
      .from('vehicle_events')
      .update({
        acknowledged: true,
        acknowledged_at: new Date().toISOString()
      })
      .eq('id', eventId);

    if (!error) {
      setEvents(prev => prev.filter(e => e.id !== eventId));
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <AlertCircle className="h-4 w-4" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4" />;
      case 'info':
        return <Info className="h-4 w-4" />;
    }
  };

  const getSeverityVariant = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'destructive';
      case 'warning':
        return 'default';
      case 'info':
        return 'default';
    }
  };

  if (events.length === 0) return null;

  return (
    <div className="space-y-3">
      {events.map((event) => (
        <Alert key={event.id} variant={getSeverityVariant(event.severity)}>
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-2 flex-1">
              {getSeverityIcon(event.severity)}
              <div className="flex-1">
                <AlertTitle>{event.title}</AlertTitle>
                <AlertDescription className="mt-1">
                  {event.message}
                </AlertDescription>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={() => acknowledgeEvent(event.id)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </Alert>
      ))}
    </div>
  );
}
```

**Step 4: Integrate into VehicleDetailsModal**
```typescript
// File: src/components/fleet/VehicleDetailsModal.tsx

import { ProactiveNotifications } from './ProactiveNotifications';

// Add at top of modal, before tabs:
<ProactiveNotifications deviceId={vehicle.id} />
```

**Testing**:
```sql
-- Simulate events for testing
INSERT INTO vehicle_positions (device_id, battery_percent, speed, ignition_on)
VALUES ('TEST_DEVICE', 8, 0, true);  -- Should trigger battery critical

UPDATE vehicle_positions
SET speed = 120
WHERE device_id = 'TEST_DEVICE';  -- Should trigger overspeeding
```

**Success Criteria**:
- ✅ Events detected within 5 seconds of trigger condition
- ✅ User receives notification (toast + alert)
- ✅ Events appear in modal immediately
- ✅ Acknowledged events are hidden
- ✅ No duplicate events within 30-minute window

---

### 1.4 Conversation History Auto-Pruning
**Priority**: 🟡 MEDIUM
**Effort**: 1 day
**Impact**: Prevents database bloat, maintains performance

#### Implementation

**Step 1: Create pruning function**
```sql
-- File: supabase/migrations/20260110_chat_pruning.sql

-- Function to prune old chat history
CREATE OR REPLACE FUNCTION prune_chat_history()
RETURNS TABLE(deleted_count INTEGER) AS $$
DECLARE
  total_deleted INTEGER := 0;
  device_deleted INTEGER;
BEGIN
  -- For each device, keep only last 100 messages
  FOR device_id_val IN
    SELECT DISTINCT device_id FROM vehicle_chat_history
  LOOP
    WITH ranked_messages AS (
      SELECT id,
             ROW_NUMBER() OVER (ORDER BY created_at DESC) as rn
      FROM vehicle_chat_history
      WHERE device_id = device_id_val
    )
    DELETE FROM vehicle_chat_history
    WHERE id IN (
      SELECT id FROM ranked_messages WHERE rn > 100
    );

    GET DIAGNOSTICS device_deleted = ROW_COUNT;
    total_deleted := total_deleted + device_deleted;
  END LOOP;

  -- Also delete messages older than 90 days
  DELETE FROM vehicle_chat_history
  WHERE created_at < NOW() - INTERVAL '90 days';

  GET DIAGNOSTICS device_deleted = ROW_COUNT;
  total_deleted := total_deleted + device_deleted;

  RETURN QUERY SELECT total_deleted;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION prune_chat_history() TO authenticated;
```

**Step 2: Create Edge Function to schedule pruning**
```typescript
// File: supabase/functions/chat-maintenance/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Run pruning
    const { data, error } = await supabase.rpc('prune_chat_history');

    if (error) throw error;

    console.log(`Pruned ${data[0].deleted_count} old chat messages`);

    return new Response(JSON.stringify({
      success: true,
      deleted_count: data[0].deleted_count
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Chat maintenance error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
```

**Step 3: Schedule via cron (GitHub Actions or external service)**
```yaml
# File: .github/workflows/chat-maintenance.yml

name: Chat History Maintenance
on:
  schedule:
    - cron: '0 2 * * *'  # Run daily at 2 AM UTC
  workflow_dispatch:  # Allow manual trigger

jobs:
  prune-chat-history:
    runs-on: ubuntu-latest
    steps:
      - name: Call maintenance endpoint
        run: |
          curl -X POST \
            "${{ secrets.SUPABASE_URL }}/functions/v1/chat-maintenance" \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}"
```

**Success Criteria**:
- ✅ Old messages deleted daily
- ✅ Database size stays < 100MB for chat history
- ✅ Performance maintained over time
- ✅ No impact on user experience

---

## 📋 PHASE 2: INTELLIGENCE LAYER (Week 3-4)
**Goal**: Add learning and predictive capabilities

### 2.1 Learned Locations System
**Priority**: 🟠 HIGH
**Effort**: 3 days
**Impact**: Enables "Where do I usually park?" queries

#### Implementation

**Database Schema**:
```sql
-- File: supabase/migrations/20260111_learned_locations.sql

CREATE TABLE learned_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  location_type TEXT NOT NULL CHECK (location_type IN (
    'home',
    'work',
    'frequent_parking',
    'charging_station',
    'custom'
  )),
  name TEXT,
  address TEXT,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  radius_meters INTEGER DEFAULT 100,
  visit_count INTEGER DEFAULT 1,
  total_duration_hours DOUBLE PRECISION DEFAULT 0,
  last_visited_at TIMESTAMP WITH TIME ZONE,
  confidence_score DOUBLE PRECISION DEFAULT 0.5,  -- 0-1
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexes
CREATE INDEX idx_learned_locations_user_device
ON learned_locations(user_id, device_id);

CREATE INDEX idx_learned_locations_type
ON learned_locations(location_type);

-- Spatial index for nearby location queries
CREATE INDEX idx_learned_locations_coords
ON learned_locations USING GIST (
  point(longitude, latitude)
);

-- RLS
ALTER TABLE learned_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their locations"
ON learned_locations FOR ALL
TO authenticated
USING (auth.uid() = user_id);

-- Function to detect frequent locations
CREATE OR REPLACE FUNCTION detect_frequent_locations(
  p_device_id TEXT,
  p_user_id UUID
)
RETURNS void AS $$
BEGIN
  -- Find locations where vehicle spends >30 minutes, >5 times
  WITH clustered_positions AS (
    SELECT
      latitude,
      longitude,
      gps_time,
      LAG(gps_time) OVER (ORDER BY gps_time) as prev_time,
      ignition_on
    FROM position_history
    WHERE device_id = p_device_id
    AND gps_time > NOW() - INTERVAL '30 days'
    AND ignition_on = false  -- Only when parked
  ),
  stay_events AS (
    SELECT
      latitude,
      longitude,
      EXTRACT(EPOCH FROM (gps_time - prev_time)) / 3600 as duration_hours
    FROM clustered_positions
    WHERE EXTRACT(EPOCH FROM (gps_time - prev_time)) > 1800  -- >30 min
  ),
  location_clusters AS (
    SELECT
      AVG(latitude) as avg_lat,
      AVG(longitude) as avg_lon,
      COUNT(*) as visit_count,
      SUM(duration_hours) as total_duration
    FROM stay_events
    GROUP BY
      FLOOR(latitude * 100) / 100,  -- Cluster by ~1km grid
      FLOOR(longitude * 100) / 100
    HAVING COUNT(*) >= 5
  )
  INSERT INTO learned_locations (
    user_id,
    device_id,
    location_type,
    latitude,
    longitude,
    visit_count,
    total_duration_hours,
    confidence_score,
    last_visited_at
  )
  SELECT
    p_user_id,
    p_device_id,
    'frequent_parking',
    avg_lat,
    avg_lon,
    visit_count,
    total_duration,
    LEAST(visit_count / 20.0, 1.0),  -- Confidence based on visits
    NOW()
  FROM location_clusters
  ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql;
```

**Frontend Component**:
```typescript
// File: src/components/fleet/LearnedLocations.tsx

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { MapPin, Home, Briefcase, Clock } from 'lucide-react';

interface LearnedLocation {
  id: string;
  location_type: string;
  name: string | null;
  address: string | null;
  visit_count: number;
  confidence_score: number;
}

export function LearnedLocations({ deviceId }: { deviceId: string }) {
  const { data: locations } = useQuery({
    queryKey: ['learned-locations', deviceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('learned_locations')
        .select('*')
        .eq('device_id', deviceId)
        .order('confidence_score', { ascending: false });

      if (error) throw error;
      return data as LearnedLocation[];
    }
  });

  const getIcon = (type: string) => {
    switch (type) {
      case 'home': return <Home className="h-4 w-4" />;
      case 'work': return <Briefcase className="h-4 w-4" />;
      default: return <MapPin className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="font-medium">Learned Locations</h3>
      {locations?.map((loc) => (
        <div key={loc.id} className="p-3 rounded-lg border">
          <div className="flex items-center gap-2 mb-1">
            {getIcon(loc.location_type)}
            <span className="font-medium capitalize">
              {loc.name || loc.location_type}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            <Clock className="h-3 w-3 inline mr-1" />
            {loc.visit_count} visits • {(loc.confidence_score * 100).toFixed(0)}% confidence
          </div>
        </div>
      ))}
    </div>
  );
}
```

**Integration with Chat**:
```typescript
// Update system prompt in vehicle-chat/index.ts

// Fetch learned locations
const { data: learnedLocations } = await supabase
  .from('learned_locations')
  .select('*')
  .eq('device_id', device_id)
  .limit(5);

// Add to system prompt
systemPrompt += `

LEARNED LOCATIONS:
${learnedLocations?.map(loc =>
  `- ${loc.location_type}: ${loc.address || 'coordinates'} (visited ${loc.visit_count} times)`
).join('\n') || 'No learned locations yet'}

You can reference these locations when user asks "where do I usually park?" or similar.
`;
```

**Success Criteria**:
- ✅ Locations auto-detected after 5+ visits
- ✅ Confidence scores accurate (80%+ for home/work)
- ✅ AI correctly answers "Where do I usually park?"
- ✅ User can manually label locations

---

### 2.2 Predictive Maintenance System
**Priority**: 🟠 HIGH
**Effort**: 4 days
**Impact**: Prevents breakdowns, saves money

#### Implementation

**Database Schema**:
```sql
-- File: supabase/migrations/20260112_predictive_maintenance.sql

CREATE TABLE maintenance_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  component TEXT NOT NULL CHECK (component IN (
    'battery',
    'oil',
    'tires',
    'brakes',
    'engine'
  )),
  health_score INTEGER NOT NULL CHECK (health_score BETWEEN 0 AND 100),
  predicted_failure_date DATE,
  confidence DOUBLE PRECISION,
  recommended_action TEXT,
  urgency TEXT CHECK (urgency IN ('low', 'medium', 'high', 'critical')),
  last_maintenance_date DATE,
  next_maintenance_due DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Vehicle maintenance history
CREATE TABLE maintenance_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  maintenance_type TEXT NOT NULL,
  component TEXT,
  cost DECIMAL(10,2),
  mileage_at_service INTEGER,
  notes TEXT,
  performed_at DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexes
CREATE INDEX idx_maintenance_predictions_device
ON maintenance_predictions(device_id, component);

CREATE INDEX idx_maintenance_history_device
ON maintenance_history(device_id, performed_at DESC);

-- RLS
ALTER TABLE maintenance_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view maintenance data"
ON maintenance_predictions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can view maintenance history"
ON maintenance_history FOR SELECT TO authenticated USING (true);

-- Function to calculate battery health
CREATE OR REPLACE FUNCTION calculate_battery_health(p_device_id TEXT)
RETURNS INTEGER AS $$
DECLARE
  avg_voltage DOUBLE PRECISION;
  voltage_trend DOUBLE PRECISION;
  health_score INTEGER;
BEGIN
  -- Get average battery percentage over last 30 days
  SELECT AVG(battery_percent) INTO avg_voltage
  FROM position_history
  WHERE device_id = p_device_id
  AND gps_time > NOW() - INTERVAL '30 days'
  AND battery_percent IS NOT NULL;

  -- Calculate trend (comparing first week vs last week)
  WITH first_week AS (
    SELECT AVG(battery_percent) as avg
    FROM position_history
    WHERE device_id = p_device_id
    AND gps_time BETWEEN NOW() - INTERVAL '30 days' AND NOW() - INTERVAL '23 days'
    AND battery_percent IS NOT NULL
  ),
  last_week AS (
    SELECT AVG(battery_percent) as avg
    FROM position_history
    WHERE device_id = p_device_id
    AND gps_time > NOW() - INTERVAL '7 days'
    AND battery_percent IS NOT NULL
  )
  SELECT (last_week.avg - first_week.avg) INTO voltage_trend
  FROM first_week, last_week;

  -- Calculate health score
  health_score := CASE
    WHEN avg_voltage > 90 AND voltage_trend >= 0 THEN 95
    WHEN avg_voltage > 80 AND voltage_trend >= -5 THEN 85
    WHEN avg_voltage > 70 AND voltage_trend >= -10 THEN 70
    WHEN avg_voltage > 60 OR voltage_trend < -15 THEN 50
    ELSE 30
  END;

  RETURN health_score;
END;
$$ LANGUAGE plpgsql;

-- Function to update all predictions
CREATE OR REPLACE FUNCTION update_maintenance_predictions()
RETURNS void AS $$
DECLARE
  vehicle RECORD;
  battery_health INTEGER;
  total_mileage INTEGER;
  last_oil_change DATE;
BEGIN
  -- For each active vehicle
  FOR vehicle IN
    SELECT DISTINCT device_id FROM vehicle_positions WHERE is_online = true
  LOOP
    -- Battery health
    battery_health := calculate_battery_health(vehicle.device_id);

    INSERT INTO maintenance_predictions (
      device_id, component, health_score, urgency, recommended_action,
      predicted_failure_date, confidence
    ) VALUES (
      vehicle.device_id,
      'battery',
      battery_health,
      CASE
        WHEN battery_health < 30 THEN 'critical'
        WHEN battery_health < 50 THEN 'high'
        WHEN battery_health < 70 THEN 'medium'
        ELSE 'low'
      END,
      CASE
        WHEN battery_health < 30 THEN 'Replace battery immediately'
        WHEN battery_health < 50 THEN 'Schedule battery replacement within 2 weeks'
        WHEN battery_health < 70 THEN 'Monitor battery, replacement may be needed'
        ELSE 'Battery is healthy'
      END,
      NOW() + INTERVAL '30 days' * (battery_health / 100.0),
      0.75
    )
    ON CONFLICT (device_id, component)
    DO UPDATE SET
      health_score = EXCLUDED.health_score,
      urgency = EXCLUDED.urgency,
      recommended_action = EXCLUDED.recommended_action,
      predicted_failure_date = EXCLUDED.predicted_failure_date,
      updated_at = NOW();

    -- Oil change predictions based on mileage
    SELECT total_mileage INTO total_mileage
    FROM vehicle_positions
    WHERE device_id = vehicle.device_id
    ORDER BY cached_at DESC
    LIMIT 1;

    SELECT MAX(performed_at) INTO last_oil_change
    FROM maintenance_history
    WHERE device_id = vehicle.device_id
    AND maintenance_type = 'oil_change';

    IF total_mileage IS NOT NULL THEN
      -- Assume oil change needed every 5000 km
      -- This is simplified; real logic would track mileage since last service
      INSERT INTO maintenance_predictions (
        device_id, component, health_score, urgency, recommended_action,
        next_maintenance_due, confidence
      ) VALUES (
        vehicle.device_id,
        'oil',
        CASE
          WHEN (total_mileage % 5000) < 500 THEN 100
          WHEN (total_mileage % 5000) < 4500 THEN 60
          ELSE 30
        END,
        CASE
          WHEN (total_mileage % 5000) > 4800 THEN 'high'
          WHEN (total_mileage % 5000) > 4500 THEN 'medium'
          ELSE 'low'
        END,
        CASE
          WHEN (total_mileage % 5000) > 4800 THEN 'Oil change overdue! Schedule immediately'
          WHEN (total_mileage % 5000) > 4500 THEN 'Oil change due soon'
          ELSE 'Oil change not needed yet'
        END,
        CURRENT_DATE + INTERVAL '30 days',
        0.85
      )
      ON CONFLICT (device_id, component)
      DO UPDATE SET
        health_score = EXCLUDED.health_score,
        urgency = EXCLUDED.urgency,
        recommended_action = EXCLUDED.recommended_action,
        updated_at = NOW();
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;
```

**Edge Function to run predictions**:
```typescript
// File: supabase/functions/maintenance-predictor/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Run prediction updates
    const { error } = await supabase.rpc('update_maintenance_predictions');

    if (error) throw error;

    console.log('Maintenance predictions updated');

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Maintenance prediction error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
```

**Integration with Chat**:
```typescript
// In vehicle-chat system prompt, add:

// Fetch maintenance predictions
const { data: maintenancePreds } = await supabase
  .from('maintenance_predictions')
  .select('*')
  .eq('device_id', device_id)
  .order('urgency', { ascending: false });

systemPrompt += `

MAINTENANCE STATUS:
${maintenancePreds?.map(pred =>
  `- ${pred.component}: Health ${pred.health_score}% (${pred.urgency} urgency)
   Action: ${pred.recommended_action}`
).join('\n\n') || 'No maintenance predictions available'}

When user asks "how is my car?" or similar, proactively mention any maintenance concerns.
`;
```

**Frontend Component**:
```typescript
// File: src/components/fleet/MaintenanceStatus.tsx

import { useQuery } from '@tantml:react-query';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, CheckCircle, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface MaintenancePrediction {
  component: string;
  health_score: number;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  recommended_action: string;
  predicted_failure_date: string | null;
}

export function MaintenanceStatus({ deviceId }: { deviceId: string }) {
  const { data: predictions } = useQuery({
    queryKey: ['maintenance-predictions', deviceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('maintenance_predictions')
        .select('*')
        .eq('device_id', deviceId)
        .order('urgency', { ascending: false });

      if (error) throw error;
      return data as MaintenancePrediction[];
    }
  });

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'critical': return 'text-red-500';
      case 'high': return 'text-orange-500';
      case 'medium': return 'text-yellow-500';
      default: return 'text-green-500';
    }
  };

  const getHealthColor = (score: number) => {
    if (score >= 80) return 'text-green-500';
    if (score >= 60) return 'text-yellow-500';
    return 'text-red-500';
  };

  return (
    <div className="space-y-3">
      <h3 className="font-medium flex items-center gap-2">
        <Wrench className="h-4 w-4" />
        Maintenance Status
      </h3>
      {predictions?.map((pred) => (
        <div key={pred.component} className="p-3 rounded-lg border">
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium capitalize">{pred.component}</span>
            <Badge variant={pred.urgency === 'critical' || pred.urgency === 'high' ? 'destructive' : 'default'}>
              {pred.urgency}
            </Badge>
          </div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm text-muted-foreground">Health:</span>
            <span className={`font-semibold ${getHealthColor(pred.health_score)}`}>
              {pred.health_score}%
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {pred.recommended_action}
          </p>
          {pred.predicted_failure_date && (
            <p className="text-xs text-muted-foreground mt-1">
              Estimated service date: {new Date(pred.predicted_failure_date).toLocaleDateString()}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
```

**Success Criteria**:
- ✅ Battery health calculated accurately (±10%)
- ✅ Oil change predictions based on mileage
- ✅ User receives proactive warnings
- ✅ AI mentions maintenance in "how's my car?" queries

---

[CONTINUED IN NEXT SECTION DUE TO LENGTH...]

This implementation plan is comprehensive and detailed. Would you like me to:
1. Continue with Phases 3-5 (Commands, Advanced Features, Fleet Intelligence)?
2. Start implementing Phase 1 critical fixes right away?
3. Create a GitHub project board to track all tasks?

Let me know how you'd like to proceed!
