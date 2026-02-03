# LLM System Improvements - Detailed Rollout Plan

## Executive Summary

This document outlines a comprehensive plan to enhance the Fleet Flow LLM system with:
1. **Foundation improvements** - Memory management, analytics, error resilience
2. **Intelligence upgrades** - Semantic intent classification, multi-intent support
3. **Proactive Alarm System** - Real-time intelligent alerting with predictive capabilities
4. **Learning & Personalization** - User preference learning, contextual adaptation

---

## Current System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CURRENT ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  User Query                                                          │
│      │                                                               │
│      ▼                                                               │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐         │
│  │   Intent     │────▶│    Query     │────▶│    Data      │         │
│  │  Classifier  │     │   Router     │     │   Fetcher    │         │
│  │  (Regex)     │     │              │     │              │         │
│  └──────────────┘     └──────────────┘     └──────────────┘         │
│                                                   │                  │
│                                                   ▼                  │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐         │
│  │  Response    │◀────│   Lovable    │◀────│   Prompt     │         │
│  │  Streaming   │     │   Gateway    │     │   Builder    │         │
│  └──────────────┘     └──────────────┘     └──────────────┘         │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Current Limitations
| Issue | Impact | Priority |
|-------|--------|----------|
| Regex-based intent classification | Misses synonyms, context | Critical |
| Single intent per query | Cannot handle multi-intent queries | Critical |
| No memory cleanup | Database bloat, slower queries | High |
| No proactive notifications | Fully reactive system | High |
| No preference learning | No personalization across sessions | Medium |
| Basic embeddings | Not trained on domain data | Medium |

---

## Target Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ENHANCED ARCHITECTURE                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                    PROACTIVE ALARM ENGINE (NEW)                         │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │ │
│  │  │   Event      │  │   Rule       │  │  Condition   │  │   Alert     │ │ │
│  │  │   Detector   │──▶   Engine     │──▶   Evaluator  │──▶  Dispatcher │ │ │
│  │  │   (RT)       │  │              │  │              │  │             │ │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────┘ │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                    │                                         │
│                                    ▼                                         │
│  User Query ───────────────────────┼───────────────────────────────────────▶│
│      │                             │                                         │
│      ▼                             ▼                                         │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐                 │
│  │  Semantic    │────▶│ Multi-Intent │────▶│  Parallel    │                 │
│  │  Intent      │     │   Router     │     │   Data       │                 │
│  │  (Embedding) │     │              │     │   Fetcher    │                 │
│  └──────────────┘     └──────────────┘     └──────────────┘                 │
│         │                                          │                         │
│         ▼                                          ▼                         │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐                 │
│  │  Preference  │     │   Model      │◀────│  Enhanced    │                 │
│  │  Learning    │────▶│   Router     │     │  RAG         │                 │
│  │  Engine      │     │  (Fallback)  │     │  Pipeline    │                 │
│  └──────────────┘     └──────────────┘     └──────────────┘                 │
│         │                    │                                               │
│         ▼                    ▼                                               │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐                 │
│  │  Analytics   │     │  Response    │◀────│   LLM        │                 │
│  │  Collector   │     │  Streaming   │     │  (Primary)   │                 │
│  └──────────────┘     └──────────────┘     └──────────────┘                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Foundation Improvements

### 1.1 Memory Cleanup System

**Goal**: Prevent database bloat and maintain query performance

**Files to Create/Modify**:
- `supabase/functions/cleanup-chat-history/index.ts` (NEW)
- `supabase/migrations/YYYYMMDD_add_retention_policies.sql` (NEW)

**Database Schema**:
```sql
-- Add retention policy configuration
CREATE TABLE chat_retention_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT REFERENCES vehicles(device_id),
  retention_days INTEGER DEFAULT 90,
  max_messages INTEGER DEFAULT 1000,
  archive_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add archive table for old messages
CREATE TABLE vehicle_chat_archive (
  id UUID PRIMARY KEY,
  device_id TEXT NOT NULL,
  user_id UUID,
  messages_summary TEXT,
  message_count INTEGER,
  date_range_start TIMESTAMPTZ,
  date_range_end TIMESTAMPTZ,
  archived_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create cleanup function
CREATE OR REPLACE FUNCTION cleanup_old_chat_messages()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER := 0;
  config RECORD;
BEGIN
  FOR config IN
    SELECT c.device_id, c.retention_days, c.max_messages, c.archive_enabled
    FROM chat_retention_config c
  LOOP
    -- Archive if enabled
    IF config.archive_enabled THEN
      INSERT INTO vehicle_chat_archive (id, device_id, messages_summary, message_count, date_range_start, date_range_end)
      SELECT
        gen_random_uuid(),
        config.device_id,
        string_agg(role || ': ' || LEFT(content, 100), E'\n' ORDER BY created_at),
        COUNT(*),
        MIN(created_at),
        MAX(created_at)
      FROM vehicle_chat_history
      WHERE device_id = config.device_id
        AND created_at < NOW() - (config.retention_days || ' days')::INTERVAL;
    END IF;

    -- Delete old messages
    WITH deleted AS (
      DELETE FROM vehicle_chat_history
      WHERE device_id = config.device_id
        AND created_at < NOW() - (config.retention_days || ' days')::INTERVAL
      RETURNING 1
    )
    SELECT COUNT(*) INTO deleted_count FROM deleted;
  END LOOP;

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Schedule daily cleanup (using pg_cron if available)
-- SELECT cron.schedule('cleanup-chat-history', '0 3 * * *', 'SELECT cleanup_old_chat_messages()');
```

**Edge Function** (`cleanup-chat-history/index.ts`):
```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Run cleanup
  const { data, error } = await supabase.rpc('cleanup_old_chat_messages')

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  console.log(`Cleaned up ${data} old messages`)
  return new Response(JSON.stringify({ deleted: data }))
})
```

---

### 1.2 LLM Analytics System

**Goal**: Track LLM performance, costs, and usage patterns

**Files to Create**:
- `supabase/migrations/YYYYMMDD_add_llm_analytics.sql` (NEW)
- `supabase/functions/_shared/analytics-collector.ts` (NEW)

**Database Schema**:
```sql
-- LLM Analytics table
CREATE TABLE llm_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  user_id UUID,

  -- Request details
  query_text TEXT,
  intent_type TEXT,
  intent_confidence FLOAT,

  -- Performance metrics
  response_time_ms INTEGER,
  time_to_first_token_ms INTEGER,
  tokens_input INTEGER,
  tokens_output INTEGER,
  tokens_total INTEGER,

  -- Model info
  model_used TEXT,
  fallback_used BOOLEAN DEFAULT false,
  fallback_reason TEXT,

  -- Quality signals
  response_truncated BOOLEAN DEFAULT false,
  error_occurred BOOLEAN DEFAULT false,
  error_message TEXT,

  -- RAG metrics
  rag_memories_matched INTEGER DEFAULT 0,
  rag_trips_matched INTEGER DEFAULT 0,
  rag_avg_similarity FLOAT,

  -- Data freshness
  data_freshness TEXT, -- 'live', 'cached'
  cache_strategy TEXT, -- 'fresh', 'cached', 'hybrid'

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_llm_analytics_device ON llm_analytics(device_id, created_at DESC);
CREATE INDEX idx_llm_analytics_intent ON llm_analytics(intent_type, created_at DESC);
CREATE INDEX idx_llm_analytics_errors ON llm_analytics(error_occurred, created_at DESC) WHERE error_occurred = true;

-- Analytics aggregation view
CREATE VIEW llm_analytics_daily AS
SELECT
  DATE_TRUNC('day', created_at) as day,
  device_id,
  COUNT(*) as total_requests,
  AVG(response_time_ms) as avg_response_time,
  SUM(tokens_total) as total_tokens,
  COUNT(*) FILTER (WHERE error_occurred) as error_count,
  AVG(intent_confidence) as avg_confidence,
  MODE() WITHIN GROUP (ORDER BY intent_type) as top_intent
FROM llm_analytics
GROUP BY DATE_TRUNC('day', created_at), device_id;
```

**Analytics Collector** (`_shared/analytics-collector.ts`):
```typescript
export interface LLMAnalyticsEvent {
  device_id: string
  user_id?: string
  query_text: string
  intent_type: string
  intent_confidence: number
  response_time_ms: number
  time_to_first_token_ms?: number
  tokens_input?: number
  tokens_output?: number
  model_used: string
  fallback_used?: boolean
  fallback_reason?: string
  error_occurred?: boolean
  error_message?: string
  rag_memories_matched?: number
  rag_trips_matched?: number
  rag_avg_similarity?: number
  data_freshness: string
  cache_strategy: string
}

export async function trackLLMAnalytics(
  supabase: any,
  event: LLMAnalyticsEvent
): Promise<void> {
  try {
    await supabase.from('llm_analytics').insert({
      ...event,
      tokens_total: (event.tokens_input || 0) + (event.tokens_output || 0)
    })
  } catch (error) {
    console.error('Failed to track analytics:', error)
    // Non-blocking - don't fail the request
  }
}

export async function getAnalyticsSummary(
  supabase: any,
  deviceId: string,
  days: number = 7
): Promise<any> {
  const { data } = await supabase
    .from('llm_analytics_daily')
    .select('*')
    .eq('device_id', deviceId)
    .gte('day', new Date(Date.now() - days * 86400000).toISOString())
    .order('day', { ascending: false })

  return data
}
```

---

### 1.3 Model Fallback Chain

**Goal**: Ensure reliability when primary model fails

**Files to Modify**:
- `supabase/functions/vehicle-chat/index.ts`
- `supabase/functions/_shared/llm-client.ts` (NEW)

**LLM Client** (`_shared/llm-client.ts`):
```typescript
export interface LLMResponse {
  content: string
  model_used: string
  fallback_used: boolean
  fallback_reason?: string
  tokens?: { input: number; output: number }
}

export interface ModelConfig {
  name: string
  priority: number
  maxRetries: number
  timeout: number
  supportsStreaming: boolean
}

const MODEL_CHAIN: ModelConfig[] = [
  {
    name: 'google/gemini-2.5-flash',
    priority: 1,
    maxRetries: 2,
    timeout: 30000,
    supportsStreaming: true
  },
  {
    name: 'google/gemini-2.0-flash',
    priority: 2,
    maxRetries: 2,
    timeout: 30000,
    supportsStreaming: true
  },
  {
    name: 'google/gemini-2.0-flash-lite',
    priority: 3,
    maxRetries: 1,
    timeout: 20000,
    supportsStreaming: true
  }
]

const RETRYABLE_ERRORS = [429, 500, 502, 503, 504]

export async function callLLMWithFallback(
  apiKey: string,
  messages: any[],
  options: { stream?: boolean; temperature?: number } = {}
): Promise<{ response: Response; model: string; fallback: boolean; reason?: string }> {
  let lastError: Error | null = null
  let fallbackReason: string | undefined

  for (const model of MODEL_CHAIN) {
    console.log(`Attempting model: ${model.name}`)

    for (let attempt = 1; attempt <= model.maxRetries; attempt++) {
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), model.timeout)

        const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: model.name,
            messages,
            stream: options.stream ?? true,
            temperature: options.temperature ?? 0.7
          }),
          signal: controller.signal
        })

        clearTimeout(timeout)

        if (response.ok) {
          return {
            response,
            model: model.name,
            fallback: model.priority > 1,
            reason: model.priority > 1 ? fallbackReason : undefined
          }
        }

        // Check if retryable
        if (RETRYABLE_ERRORS.includes(response.status)) {
          fallbackReason = `${model.name} returned ${response.status}`
          console.warn(`Model ${model.name} returned ${response.status}, attempt ${attempt}/${model.maxRetries}`)

          // Exponential backoff
          if (attempt < model.maxRetries) {
            await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000))
          }
          continue
        }

        // Non-retryable error, try next model
        fallbackReason = `${model.name} returned ${response.status}`
        break

      } catch (error) {
        lastError = error as Error
        fallbackReason = `${model.name}: ${lastError.message}`
        console.error(`Model ${model.name} error:`, error)

        if (attempt < model.maxRetries) {
          await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000))
        }
      }
    }
  }

  throw new Error(`All models failed. Last error: ${lastError?.message}`)
}
```

---

## Phase 2: Intelligence Improvements

### 2.1 Semantic Intent Classification

**Goal**: Replace regex-based classification with embedding-based semantic matching

**Files to Modify**:
- `supabase/functions/vehicle-chat/intent-classifier.ts`
- `supabase/functions/_shared/embedding-generator.ts`

**New Intent Classifier**:
```typescript
// intent-classifier.ts - Enhanced version

import { generateTextEmbedding, cosineSimilarity } from '../_shared/embedding-generator.ts'

// Pre-computed intent embeddings (generated once and cached)
const INTENT_EMBEDDINGS: Record<IntentType, number[]> = {
  location: [], // Generated from: "where is the vehicle, current position, GPS location, find my car"
  trip: [],     // Generated from: "trip history, journey details, route taken, distance traveled"
  stats: [],    // Generated from: "statistics, analytics, performance metrics, fuel consumption"
  maintenance: [], // Generated from: "vehicle health, battery status, engine diagnostics, alerts"
  control: [],  // Generated from: "lock doors, set speed limit, enable geofence, send command"
  history: [],  // Generated from: "past events, yesterday, last week, historical data"
  driver: [],   // Generated from: "driver information, who is driving, operator details"
  general: []   // Generated from: "hello, help, thank you, how are you"
}

// Initialize intent embeddings (call once at startup)
export async function initializeIntentEmbeddings(): Promise<void> {
  const intentDescriptions: Record<IntentType, string> = {
    location: 'where is the vehicle located current GPS position find my car address map coordinates',
    trip: 'trip history journey details route traveled distance mileage last drive recent travel',
    stats: 'statistics analytics performance metrics fuel consumption efficiency report data summary',
    maintenance: 'vehicle health battery status engine diagnostics maintenance alerts service warnings',
    control: 'lock unlock doors set speed limit enable disable geofence send command start stop',
    history: 'past events yesterday last week historical data previous records archive logs',
    driver: 'driver information who is driving operator details assigned person contact license',
    general: 'hello hi help thank you how are you greetings assist support explain'
  }

  for (const [intent, description] of Object.entries(intentDescriptions)) {
    INTENT_EMBEDDINGS[intent as IntentType] = generateTextEmbedding(description)
  }

  console.log('Intent embeddings initialized')
}

/**
 * Semantic intent classification using embeddings
 */
export function classifyIntentSemantic(query: string): Intent {
  const queryEmbedding = generateTextEmbedding(query)

  let bestIntent: IntentType = 'general'
  let bestScore = 0
  const scores: Map<IntentType, number> = new Map()

  for (const [intent, embedding] of Object.entries(INTENT_EMBEDDINGS)) {
    if (embedding.length === 0) continue

    const similarity = cosineSimilarity(queryEmbedding, embedding)
    scores.set(intent as IntentType, similarity)

    if (similarity > bestScore) {
      bestScore = similarity
      bestIntent = intent as IntentType
    }
  }

  // Confidence thresholds
  const confidence = bestScore > 0.7 ? bestScore : bestScore * 0.8

  // If similarity too low, default to general
  if (bestScore < 0.3) {
    bestIntent = 'general'
  }

  return {
    type: bestIntent,
    confidence: parseFloat(confidence.toFixed(2)),
    requires_fresh_data: ['location', 'maintenance'].includes(bestIntent) && confidence > 0.5,
    requires_history: ['trip', 'stats', 'history'].includes(bestIntent),
    keywords_matched: [], // Not applicable for semantic
    semantic_scores: Object.fromEntries(scores) // NEW: Include all scores
  }
}

/**
 * Hybrid classification: combines regex speed with semantic accuracy
 */
export function classifyIntentHybrid(query: string): Intent {
  // Fast regex check first
  const regexIntent = classifyIntent(query) // Original function

  // If regex is confident, use it
  if (regexIntent.confidence > 0.7) {
    return regexIntent
  }

  // Otherwise, use semantic classification
  const semanticIntent = classifyIntentSemantic(query)

  // If semantic is more confident, prefer it
  if (semanticIntent.confidence > regexIntent.confidence) {
    return semanticIntent
  }

  return regexIntent
}
```

---

### 2.2 Multi-Intent Support

**Goal**: Handle queries that span multiple intents

**Files to Modify**:
- `supabase/functions/vehicle-chat/query-router.ts`
- `supabase/functions/vehicle-chat/index.ts`

**Enhanced Query Router**:
```typescript
// query-router.ts - Multi-intent version

export interface MultiIntentResult {
  primary: Intent
  secondary: Intent[]
  combined_data_sources: DataSource[]
  cache_strategy: 'fresh' | 'cached' | 'hybrid'
  priority: 'high' | 'normal' | 'low'
  estimated_latency_ms: number
}

/**
 * Route query with multi-intent support
 */
export function routeQueryMultiIntent(query: string, deviceId: string): MultiIntentResult {
  // Split query into segments (by conjunctions, punctuation)
  const segments = splitQuerySegments(query)

  // Classify each segment
  const intents = segments.map(seg => classifyIntentHybrid(seg))

  // Sort by confidence
  intents.sort((a, b) => b.confidence - a.confidence)

  const primary = intents[0]
  const secondary = intents.slice(1).filter(i => i.confidence > 0.3 && i.type !== primary.type)

  // Combine data sources from all intents
  const allSources = new Set<DataSource>()

  for (const intent of [primary, ...secondary]) {
    const sources = getDataSourcesForIntent(intent)
    sources.forEach(s => allSources.add(s))
  }

  // Determine cache strategy
  const needsFresh = [primary, ...secondary].some(i => i.requires_fresh_data)
  const needsHistory = [primary, ...secondary].some(i => i.requires_history)

  let cacheStrategy: 'fresh' | 'cached' | 'hybrid' = 'cached'
  if (needsFresh && needsHistory) {
    cacheStrategy = 'hybrid'
  } else if (needsFresh) {
    cacheStrategy = 'fresh'
  }

  return {
    primary,
    secondary,
    combined_data_sources: Array.from(allSources),
    cache_strategy: cacheStrategy,
    priority: primary.type === 'control' ? 'high' : 'normal',
    estimated_latency_ms: estimateLatency(allSources, cacheStrategy)
  }
}

function splitQuerySegments(query: string): string[] {
  // Split by common conjunctions and punctuation
  const segments = query
    .split(/\s+(and|also|plus|as well as|,|;|\?)\s+/i)
    .filter(s => s.length > 3 && !/^(and|also|plus|as well as)$/i.test(s))

  return segments.length > 0 ? segments : [query]
}

function getDataSourcesForIntent(intent: Intent): DataSource[] {
  const sourceMap: Record<IntentType, DataSource[]> = {
    location: ['gps', 'geocoding', 'learned_locations'],
    trip: ['trips', 'position_history'],
    stats: ['trip_analytics', 'position_history'],
    maintenance: ['vehicle_health', 'maintenance_recs', 'gps'],
    control: ['vehicle_info', 'command_logs'],
    history: ['position_history', 'trips', 'chat_history'],
    driver: ['driver_info', 'assignments'],
    general: ['vehicle_info', 'llm_settings']
  }

  return sourceMap[intent.type] || []
}
```

---

### 2.3 Enhanced Embeddings

**Goal**: Use proper embedding model instead of heuristic-based

**Files to Modify**:
- `supabase/functions/_shared/embedding-generator.ts`

**Enhanced Embedding Generator**:
```typescript
// embedding-generator.ts - Enhanced version with API fallback

const EMBEDDING_CACHE = new Map<string, number[]>()
const CACHE_MAX_SIZE = 1000

/**
 * Generate embeddings using API (with fallback to heuristic)
 */
export async function generateTextEmbeddingAPI(
  text: string,
  apiKey?: string
): Promise<number[]> {
  // Check cache first
  const cacheKey = text.slice(0, 100)
  if (EMBEDDING_CACHE.has(cacheKey)) {
    return EMBEDDING_CACHE.get(cacheKey)!
  }

  // Try API first
  if (apiKey) {
    try {
      const response = await fetch('https://ai.gateway.lovable.dev/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: text
        })
      })

      if (response.ok) {
        const data = await response.json()
        const embedding = data.data?.[0]?.embedding

        if (embedding) {
          // Cache result
          if (EMBEDDING_CACHE.size >= CACHE_MAX_SIZE) {
            // Remove oldest entry
            const firstKey = EMBEDDING_CACHE.keys().next().value
            EMBEDDING_CACHE.delete(firstKey)
          }
          EMBEDDING_CACHE.set(cacheKey, embedding)

          return embedding
        }
      }
    } catch (error) {
      console.warn('Embedding API failed, using heuristic:', error)
    }
  }

  // Fallback to heuristic
  return generateTextEmbedding(text) // Original function
}
```

---

## Phase 3: Proactive Alarm System

### 3.1 System Overview

The Proactive Alarm System monitors vehicle telemetry in real-time and generates intelligent alerts based on configurable rules, patterns, and predictions.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      PROACTIVE ALARM SYSTEM ARCHITECTURE                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                         EVENT SOURCES                                   │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │ │
│  │  │ GPS      │  │ Vehicle  │  │ Trip     │  │ Geofence │  │ Command  │ │ │
│  │  │ Updates  │  │ Health   │  │ Events   │  │ Triggers │  │ Results  │ │ │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘ │ │
│  │       │             │             │             │             │        │ │
│  └───────┼─────────────┼─────────────┼─────────────┼─────────────┼────────┘ │
│          │             │             │             │             │          │
│          ▼             ▼             ▼             ▼             ▼          │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                        EVENT AGGREGATOR                                 ││
│  │  • Deduplication     • Rate limiting      • Priority queuing            ││
│  └───────────────────────────────────┬─────────────────────────────────────┘│
│                                      │                                       │
│                                      ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                          RULE ENGINE                                    ││
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    ││
│  │  │  Threshold  │  │  Pattern    │  │  Composite  │  │  ML-Based   │    ││
│  │  │  Rules      │  │  Rules      │  │  Rules      │  │  Rules      │    ││
│  │  │             │  │             │  │             │  │             │    ││
│  │  │ • Battery   │  │ • Time of   │  │ • AND/OR    │  │ • Anomaly   │    ││
│  │  │ • Speed     │  │   day       │  │   combos    │  │   detection │    ││
│  │  │ • Location  │  │ • Sequence  │  │ • Escalate  │  │ • Predict   │    ││
│  │  │ • Ignition  │  │ • Frequency │  │ • Suppress  │  │   issues    │    ││
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    ││
│  └───────────────────────────────────┬─────────────────────────────────────┘│
│                                      │                                       │
│                                      ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                       CONDITION EVALUATOR                               ││
│  │  • Context-aware evaluation    • Cooldown management                    ││
│  │  • User preference checks      • Severity calculation                   ││
│  └───────────────────────────────────┬─────────────────────────────────────┘│
│                                      │                                       │
│                                      ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                        ALERT DISPATCHER                                 ││
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    ││
│  │  │   Chat      │  │   Push      │  │   SMS       │  │   Webhook   │    ││
│  │  │   Message   │  │   Notif     │  │   Alert     │  │   Callback  │    ││
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 3.2 Database Schema

```sql
-- Alarm rule definitions
CREATE TABLE alarm_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,

  -- Rule scope
  device_id TEXT REFERENCES vehicles(device_id), -- NULL = all vehicles
  user_id UUID REFERENCES auth.users,

  -- Rule type
  rule_type TEXT NOT NULL CHECK (rule_type IN (
    'threshold',     -- Simple value comparison
    'pattern',       -- Time/sequence based
    'composite',     -- Combination of rules
    'anomaly',       -- ML-based anomaly detection
    'geofence',      -- Location-based
    'predictive'     -- Predicted future events
  )),

  -- Rule configuration (JSON)
  config JSONB NOT NULL,

  -- Severity & priority
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical', 'emergency')),
  priority INTEGER DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),

  -- Cooldown & suppression
  cooldown_minutes INTEGER DEFAULT 30,
  max_alerts_per_day INTEGER DEFAULT 10,
  suppress_if_rule_id UUID REFERENCES alarm_rules(id),

  -- Notification channels
  channels JSONB DEFAULT '["chat"]'::jsonb,

  -- Status
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Example rule configs:
COMMENT ON TABLE alarm_rules IS '
Example configs:

Threshold rule:
{
  "metric": "battery_percent",
  "operator": "<",
  "value": 20,
  "sustained_seconds": 60
}

Pattern rule:
{
  "pattern_type": "time_of_day",
  "active_hours": [22, 23, 0, 1, 2, 3, 4, 5],
  "trigger_on": "ignition_on"
}

Composite rule:
{
  "operator": "AND",
  "rules": [
    {"rule_id": "uuid-1"},
    {"rule_id": "uuid-2"}
  ]
}

Anomaly rule:
{
  "metric": "speed",
  "baseline_days": 30,
  "threshold_stddev": 2.5
}

Predictive rule:
{
  "prediction_type": "battery_depletion",
  "horizon_hours": 24,
  "threshold_percent": 10
}
';

-- Triggered alerts log
CREATE TABLE alarm_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID REFERENCES alarm_rules(id),
  device_id TEXT NOT NULL,

  -- Event details
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,

  -- Context snapshot
  trigger_data JSONB,
  vehicle_state JSONB,

  -- Status
  status TEXT DEFAULT 'triggered' CHECK (status IN (
    'triggered',    -- Just fired
    'acknowledged', -- User saw it
    'resolved',     -- Issue fixed
    'dismissed',    -- User ignored
    'escalated'     -- Sent to higher priority
  )),

  -- Delivery tracking
  delivered_channels JSONB DEFAULT '[]'::jsonb,
  delivery_attempts INTEGER DEFAULT 0,

  -- Timing
  triggered_at TIMESTAMPTZ DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast querying
CREATE INDEX idx_alarm_events_device ON alarm_events(device_id, triggered_at DESC);
CREATE INDEX idx_alarm_events_status ON alarm_events(status, triggered_at DESC);
CREATE INDEX idx_alarm_events_severity ON alarm_events(severity, triggered_at DESC);

-- Cooldown tracking
CREATE TABLE alarm_cooldowns (
  rule_id UUID REFERENCES alarm_rules(id),
  device_id TEXT NOT NULL,
  last_triggered_at TIMESTAMPTZ NOT NULL,
  trigger_count_today INTEGER DEFAULT 1,
  PRIMARY KEY (rule_id, device_id)
);

-- User notification preferences
CREATE TABLE alarm_preferences (
  user_id UUID REFERENCES auth.users PRIMARY KEY,

  -- Channel preferences
  enable_chat BOOLEAN DEFAULT true,
  enable_push BOOLEAN DEFAULT true,
  enable_sms BOOLEAN DEFAULT false,
  enable_email BOOLEAN DEFAULT false,

  -- Quiet hours
  quiet_hours_enabled BOOLEAN DEFAULT false,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  quiet_hours_exceptions TEXT[] DEFAULT '{"emergency"}', -- Severities that bypass quiet hours

  -- Aggregation
  aggregate_similar BOOLEAN DEFAULT true,
  aggregation_window_minutes INTEGER DEFAULT 5,

  phone_number TEXT,
  email TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Built-in default rules (inserted on setup)
INSERT INTO alarm_rules (name, description, rule_type, config, severity, priority, channels) VALUES
-- Battery alerts
('Low Battery Warning', 'Alert when battery drops below 20%', 'threshold',
 '{"metric": "battery_percent", "operator": "<", "value": 20}',
 'warning', 6, '["chat", "push"]'),

('Critical Battery', 'Alert when battery drops below 10%', 'threshold',
 '{"metric": "battery_percent", "operator": "<", "value": 10}',
 'critical', 8, '["chat", "push", "sms"]'),

-- Speed alerts
('Overspeeding', 'Alert when speed exceeds limit', 'threshold',
 '{"metric": "speed", "operator": ">", "value": 120}',
 'warning', 7, '["chat", "push"]'),

-- Offline detection
('Vehicle Offline', 'Alert when vehicle goes offline for 30+ minutes', 'threshold',
 '{"metric": "offline_minutes", "operator": ">", "value": 30}',
 'warning', 5, '["chat"]'),

-- Night movement
('Unauthorized Night Movement', 'Alert when vehicle moves during night hours', 'pattern',
 '{"pattern_type": "time_of_day", "active_hours": [23, 0, 1, 2, 3, 4], "trigger_on": "movement"}',
 'critical', 9, '["chat", "push", "sms"]'),

-- Harsh driving
('Harsh Driving Detected', 'Alert on repeated harsh events', 'pattern',
 '{"pattern_type": "frequency", "event": "harsh_event", "threshold": 3, "window_minutes": 10}',
 'warning', 6, '["chat"]'),

-- Geofence exit
('Left Safe Zone', 'Alert when vehicle exits home/work geofence', 'geofence',
 '{"trigger_on": "exit", "zone_types": ["home", "work"]}',
 'info', 4, '["chat"]'),

-- Predictive maintenance
('Maintenance Prediction', 'Alert for predicted maintenance needs', 'predictive',
 '{"prediction_type": "maintenance", "confidence_threshold": 0.8}',
 'info', 3, '["chat"]');
```

---

### 3.3 Core Functions

**Files to Create**:
- `supabase/functions/proactive-alarm-engine/index.ts`
- `supabase/functions/proactive-alarm-engine/rule-evaluator.ts`
- `supabase/functions/proactive-alarm-engine/alert-dispatcher.ts`
- `supabase/functions/proactive-alarm-engine/event-aggregator.ts`

**Main Engine** (`proactive-alarm-engine/index.ts`):
```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { evaluateRules } from './rule-evaluator.ts'
import { dispatchAlerts } from './alert-dispatcher.ts'
import { aggregateEvents } from './event-aggregator.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface VehicleEvent {
  type: 'position_update' | 'health_update' | 'trip_event' | 'geofence_trigger' | 'command_result'
  device_id: string
  data: any
  timestamp: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const event: VehicleEvent = await req.json()
    console.log(`Processing event: ${event.type} for device ${event.device_id}`)

    // 1. Aggregate similar events
    const aggregatedEvent = await aggregateEvents(supabase, event)
    if (!aggregatedEvent) {
      // Event was aggregated into existing batch
      return new Response(JSON.stringify({ status: 'aggregated' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 2. Fetch applicable rules
    const { data: rules } = await supabase
      .from('alarm_rules')
      .select('*')
      .eq('is_active', true)
      .or(`device_id.is.null,device_id.eq.${event.device_id}`)

    if (!rules || rules.length === 0) {
      return new Response(JSON.stringify({ status: 'no_rules' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 3. Get current vehicle state
    const { data: vehicleState } = await supabase
      .from('vehicle_positions')
      .select('*')
      .eq('device_id', event.device_id)
      .single()

    // 4. Evaluate rules
    const triggeredAlerts = await evaluateRules(supabase, rules, event, vehicleState)

    if (triggeredAlerts.length === 0) {
      return new Response(JSON.stringify({ status: 'no_alerts' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log(`${triggeredAlerts.length} alerts triggered`)

    // 5. Dispatch alerts
    const dispatchResults = await dispatchAlerts(supabase, triggeredAlerts, event.device_id)

    return new Response(JSON.stringify({
      status: 'alerts_dispatched',
      alerts: dispatchResults
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Alarm engine error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
```

**Rule Evaluator** (`proactive-alarm-engine/rule-evaluator.ts`):
```typescript
interface AlarmRule {
  id: string
  name: string
  rule_type: string
  config: any
  severity: string
  priority: number
  cooldown_minutes: number
  max_alerts_per_day: number
  channels: string[]
}

interface TriggeredAlert {
  rule: AlarmRule
  title: string
  message: string
  trigger_data: any
}

export async function evaluateRules(
  supabase: any,
  rules: AlarmRule[],
  event: any,
  vehicleState: any
): Promise<TriggeredAlert[]> {
  const triggeredAlerts: TriggeredAlert[] = []

  for (const rule of rules) {
    // Check cooldown
    if (await isInCooldown(supabase, rule.id, event.device_id, rule.cooldown_minutes)) {
      continue
    }

    // Check daily limit
    if (await exceedsDailyLimit(supabase, rule.id, event.device_id, rule.max_alerts_per_day)) {
      continue
    }

    // Evaluate based on rule type
    let result: { triggered: boolean; message: string; data: any } | null = null

    switch (rule.rule_type) {
      case 'threshold':
        result = evaluateThresholdRule(rule.config, event, vehicleState)
        break
      case 'pattern':
        result = await evaluatePatternRule(supabase, rule.config, event, vehicleState)
        break
      case 'composite':
        result = await evaluateCompositeRule(supabase, rule.config, event, vehicleState, rules)
        break
      case 'geofence':
        result = evaluateGeofenceRule(rule.config, event, vehicleState)
        break
      case 'predictive':
        result = await evaluatePredictiveRule(supabase, rule.config, event, vehicleState)
        break
      case 'anomaly':
        result = await evaluateAnomalyRule(supabase, rule.config, event, vehicleState)
        break
    }

    if (result?.triggered) {
      triggeredAlerts.push({
        rule,
        title: rule.name,
        message: result.message,
        trigger_data: result.data
      })
    }
  }

  return triggeredAlerts
}

function evaluateThresholdRule(config: any, event: any, state: any): { triggered: boolean; message: string; data: any } {
  const { metric, operator, value } = config

  // Get current value from state or event
  const currentValue = state?.[metric] ?? event?.data?.[metric]

  if (currentValue === undefined || currentValue === null) {
    return { triggered: false, message: '', data: null }
  }

  let triggered = false
  switch (operator) {
    case '<': triggered = currentValue < value; break
    case '<=': triggered = currentValue <= value; break
    case '>': triggered = currentValue > value; break
    case '>=': triggered = currentValue >= value; break
    case '==': triggered = currentValue === value; break
    case '!=': triggered = currentValue !== value; break
  }

  if (triggered) {
    return {
      triggered: true,
      message: `${metric} is ${currentValue} (threshold: ${operator} ${value})`,
      data: { metric, currentValue, threshold: value, operator }
    }
  }

  return { triggered: false, message: '', data: null }
}

async function evaluatePatternRule(
  supabase: any,
  config: any,
  event: any,
  state: any
): Promise<{ triggered: boolean; message: string; data: any }> {
  const { pattern_type } = config

  switch (pattern_type) {
    case 'time_of_day': {
      const { active_hours, trigger_on } = config
      const currentHour = new Date().getHours()

      if (!active_hours.includes(currentHour)) {
        return { triggered: false, message: '', data: null }
      }

      // Check trigger condition
      if (trigger_on === 'movement' && state?.speed > 0) {
        return {
          triggered: true,
          message: `Vehicle moving during restricted hours (${currentHour}:00)`,
          data: { hour: currentHour, speed: state.speed }
        }
      }
      if (trigger_on === 'ignition_on' && state?.ignition_on) {
        return {
          triggered: true,
          message: `Ignition turned on during restricted hours (${currentHour}:00)`,
          data: { hour: currentHour }
        }
      }
      break
    }

    case 'frequency': {
      const { event: eventType, threshold, window_minutes } = config

      // Count recent events
      const windowStart = new Date(Date.now() - window_minutes * 60 * 1000)
      const { count } = await supabase
        .from('alarm_events')
        .select('*', { count: 'exact', head: true })
        .eq('device_id', event.device_id)
        .gte('triggered_at', windowStart.toISOString())
        .like('title', `%${eventType}%`)

      if (count >= threshold) {
        return {
          triggered: true,
          message: `${count} ${eventType} events in last ${window_minutes} minutes`,
          data: { count, threshold, window_minutes }
        }
      }
      break
    }
  }

  return { triggered: false, message: '', data: null }
}

async function evaluatePredictiveRule(
  supabase: any,
  config: any,
  event: any,
  state: any
): Promise<{ triggered: boolean; message: string; data: any }> {
  const { prediction_type, horizon_hours, threshold_percent, confidence_threshold } = config

  switch (prediction_type) {
    case 'battery_depletion': {
      // Get battery history
      const hoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000)
      const { data: history } = await supabase
        .from('position_history')
        .select('battery_percent, gps_time')
        .eq('device_id', event.device_id)
        .gte('gps_time', hoursAgo.toISOString())
        .order('gps_time', { ascending: true })

      if (!history || history.length < 2) {
        return { triggered: false, message: '', data: null }
      }

      // Calculate depletion rate (% per hour)
      const firstReading = history[0]
      const lastReading = history[history.length - 1]
      const timeDiffHours = (new Date(lastReading.gps_time).getTime() - new Date(firstReading.gps_time).getTime()) / (1000 * 60 * 60)
      const batteryDrop = firstReading.battery_percent - lastReading.battery_percent

      if (timeDiffHours > 0 && batteryDrop > 0) {
        const depletionRate = batteryDrop / timeDiffHours
        const predictedLevel = lastReading.battery_percent - (depletionRate * horizon_hours)

        if (predictedLevel < threshold_percent) {
          return {
            triggered: true,
            message: `Battery predicted to reach ${predictedLevel.toFixed(0)}% in ${horizon_hours} hours`,
            data: {
              currentLevel: lastReading.battery_percent,
              predictedLevel: predictedLevel.toFixed(0),
              depletionRate: depletionRate.toFixed(1),
              horizon_hours
            }
          }
        }
      }
      break
    }

    case 'maintenance': {
      // Check maintenance predictions
      const { data: predictions } = await supabase
        .from('maintenance_recommendations')
        .select('*')
        .eq('device_id', event.device_id)
        .eq('status', 'active')
        .gte('confidence', confidence_threshold || 0.8)
        .order('priority', { ascending: false })
        .limit(1)

      if (predictions && predictions.length > 0) {
        const pred = predictions[0]
        return {
          triggered: true,
          message: `Maintenance predicted: ${pred.title || pred.predicted_issue}`,
          data: { prediction: pred }
        }
      }
      break
    }
  }

  return { triggered: false, message: '', data: null }
}

// Helper functions
async function isInCooldown(supabase: any, ruleId: string, deviceId: string, cooldownMinutes: number): Promise<boolean> {
  const { data } = await supabase
    .from('alarm_cooldowns')
    .select('last_triggered_at')
    .eq('rule_id', ruleId)
    .eq('device_id', deviceId)
    .single()

  if (!data) return false

  const cooldownEnd = new Date(data.last_triggered_at)
  cooldownEnd.setMinutes(cooldownEnd.getMinutes() + cooldownMinutes)

  return new Date() < cooldownEnd
}

async function exceedsDailyLimit(supabase: any, ruleId: string, deviceId: string, limit: number): Promise<boolean> {
  const { data } = await supabase
    .from('alarm_cooldowns')
    .select('trigger_count_today, last_triggered_at')
    .eq('rule_id', ruleId)
    .eq('device_id', deviceId)
    .single()

  if (!data) return false

  // Check if last trigger was today
  const lastTrigger = new Date(data.last_triggered_at)
  const today = new Date()

  if (lastTrigger.toDateString() !== today.toDateString()) {
    return false // Reset for new day
  }

  return data.trigger_count_today >= limit
}
```

**Alert Dispatcher** (`proactive-alarm-engine/alert-dispatcher.ts`):
```typescript
interface TriggeredAlert {
  rule: any
  title: string
  message: string
  trigger_data: any
}

interface DispatchResult {
  alert_id: string
  channels_delivered: string[]
  errors: string[]
}

export async function dispatchAlerts(
  supabase: any,
  alerts: TriggeredAlert[],
  deviceId: string
): Promise<DispatchResult[]> {
  const results: DispatchResult[] = []

  for (const alert of alerts) {
    // 1. Get vehicle info for context
    const { data: vehicle } = await supabase
      .from('vehicles')
      .select('device_name')
      .eq('device_id', deviceId)
      .single()

    const vehicleName = vehicle?.device_name || deviceId

    // 2. Create alarm event record
    const { data: alarmEvent, error: insertError } = await supabase
      .from('alarm_events')
      .insert({
        rule_id: alert.rule.id,
        device_id: deviceId,
        severity: alert.rule.severity,
        title: alert.title,
        message: alert.message,
        trigger_data: alert.trigger_data,
        vehicle_state: await getVehicleSnapshot(supabase, deviceId)
      })
      .select()
      .single()

    if (insertError) {
      console.error('Failed to create alarm event:', insertError)
      continue
    }

    // 3. Dispatch to each channel
    const channels = alert.rule.channels || ['chat']
    const deliveredChannels: string[] = []
    const errors: string[] = []

    for (const channel of channels) {
      try {
        switch (channel) {
          case 'chat':
            await dispatchToChatLLM(supabase, deviceId, alert, vehicleName)
            deliveredChannels.push('chat')
            break

          case 'push':
            await dispatchToPushNotification(supabase, deviceId, alert)
            deliveredChannels.push('push')
            break

          case 'sms':
            await dispatchToSMS(supabase, deviceId, alert)
            deliveredChannels.push('sms')
            break

          case 'webhook':
            await dispatchToWebhook(supabase, deviceId, alert)
            deliveredChannels.push('webhook')
            break
        }
      } catch (error) {
        errors.push(`${channel}: ${error.message}`)
      }
    }

    // 4. Update alarm event with delivery status
    await supabase
      .from('alarm_events')
      .update({
        delivered_channels: deliveredChannels,
        delivery_attempts: 1
      })
      .eq('id', alarmEvent.id)

    // 5. Update cooldown
    await supabase
      .from('alarm_cooldowns')
      .upsert({
        rule_id: alert.rule.id,
        device_id: deviceId,
        last_triggered_at: new Date().toISOString(),
        trigger_count_today: 1 // Will be incremented by trigger
      }, {
        onConflict: 'rule_id,device_id',
        ignoreDuplicates: false
      })

    results.push({
      alert_id: alarmEvent.id,
      channels_delivered: deliveredChannels,
      errors
    })
  }

  return results
}

/**
 * Dispatch alert as a proactive chat message from the vehicle
 */
async function dispatchToChatLLM(
  supabase: any,
  deviceId: string,
  alert: TriggeredAlert,
  vehicleName: string
): Promise<void> {
  // Get LLM settings for personality
  const { data: llmSettings } = await supabase
    .from('vehicle_llm_settings')
    .select('personality_mode, language_preference')
    .eq('device_id', deviceId)
    .single()

  const personality = llmSettings?.personality_mode || 'casual'
  const language = llmSettings?.language_preference || 'english'

  // Generate proactive message using LLM
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')

  const systemPrompt = `You are "${vehicleName}", a vehicle with a ${personality} personality.
You need to proactively alert your owner about an issue.
Speak in first person as the vehicle. Be ${personality}. Use ${language} language.
Keep the message under 40 words. Be direct and helpful.
Do NOT say "I noticed" or "I detected". Just state the issue naturally.

FORBIDDEN: "As an AI", "I noticed", "I detected", "I want to inform you"
REQUIRED: First person, natural, ${personality} tone`

  const userPrompt = `Generate a proactive alert message for this situation:
Alert: ${alert.title}
Details: ${alert.message}
Severity: ${alert.rule.severity}
Data: ${JSON.stringify(alert.trigger_data)}

Write a short, natural message from the vehicle's perspective.`

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-lite',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 100,
        temperature: 0.7
      })
    })

    if (!response.ok) {
      throw new Error(`LLM API error: ${response.status}`)
    }

    const data = await response.json()
    const message = data.choices?.[0]?.message?.content?.trim() || alert.message

    // Insert as proactive assistant message
    await supabase.from('vehicle_chat_history').insert({
      device_id: deviceId,
      role: 'assistant',
      content: `⚠️ ${message}`,
      is_proactive: true,
      alert_id: alert.rule.id
    })

    console.log(`Chat alert dispatched for ${deviceId}: ${message}`)
  } catch (error) {
    console.error('Failed to dispatch chat alert:', error)

    // Fallback to simple message
    await supabase.from('vehicle_chat_history').insert({
      device_id: deviceId,
      role: 'assistant',
      content: `⚠️ ${alert.title}: ${alert.message}`,
      is_proactive: true,
      alert_id: alert.rule.id
    })
  }
}

async function dispatchToPushNotification(supabase: any, deviceId: string, alert: TriggeredAlert): Promise<void> {
  // Get user tokens for this device
  const { data: assignments } = await supabase
    .from('vehicle_assignments')
    .select('user_id')
    .eq('device_id', deviceId)

  if (!assignments || assignments.length === 0) return

  const userIds = assignments.map((a: any) => a.user_id)

  // Get push tokens
  const { data: tokens } = await supabase
    .from('push_tokens')
    .select('token, platform')
    .in('user_id', userIds)

  // Send via your push notification service
  // This is a placeholder - implement with your actual push service
  console.log(`Would send push to ${tokens?.length || 0} devices:`, alert.title)
}

async function dispatchToSMS(supabase: any, deviceId: string, alert: TriggeredAlert): Promise<void> {
  // Get user phone numbers
  const { data: assignments } = await supabase
    .from('vehicle_assignments')
    .select('profiles(phone)')
    .eq('device_id', deviceId)

  // Send via SMS service (Twilio, etc.)
  console.log(`Would send SMS for ${deviceId}:`, alert.title)
}

async function dispatchToWebhook(supabase: any, deviceId: string, alert: TriggeredAlert): Promise<void> {
  // Get webhook config for device
  const { data: config } = await supabase
    .from('webhook_configs')
    .select('url, headers')
    .eq('device_id', deviceId)
    .single()

  if (!config) return

  await fetch(config.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...config.headers
    },
    body: JSON.stringify({
      device_id: deviceId,
      alert: {
        title: alert.title,
        message: alert.message,
        severity: alert.rule.severity,
        data: alert.trigger_data
      },
      timestamp: new Date().toISOString()
    })
  })
}

async function getVehicleSnapshot(supabase: any, deviceId: string): Promise<any> {
  const { data } = await supabase
    .from('vehicle_positions')
    .select('*')
    .eq('device_id', deviceId)
    .single()

  return data
}
```

---

### 3.4 Integration with Existing System

**Modify** `supabase/functions/vehicle-chat/index.ts` to handle proactive messages:

```typescript
// Add to the system prompt (around line 959)

// Add proactive alert context
${proactiveAlerts.length > 0 ? `
RECENT PROACTIVE ALERTS (You sent these recently):
${proactiveAlerts.map((a, i) => `${i + 1}. [${a.severity}] ${a.title} - ${a.message} (${a.time_ago})`).join('\n')}
⚠️ IMPORTANT: If the user asks about these alerts, provide context and recommendations.
` : ''}
```

**Create Database Trigger** for real-time event processing:

```sql
-- Trigger function to call alarm engine on position updates
CREATE OR REPLACE FUNCTION notify_alarm_engine()
RETURNS TRIGGER AS $$
BEGIN
  -- Call the alarm engine edge function asynchronously
  PERFORM net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/proactive-alarm-engine',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body := jsonb_build_object(
      'type', TG_TABLE_NAME || '_update',
      'device_id', NEW.device_id,
      'data', to_jsonb(NEW),
      'timestamp', NOW()
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Don't fail the original operation
  RAISE WARNING 'Alarm engine notification failed: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for key tables
CREATE TRIGGER vehicle_position_alarm_trigger
  AFTER INSERT OR UPDATE ON vehicle_positions
  FOR EACH ROW
  EXECUTE FUNCTION notify_alarm_engine();

CREATE TRIGGER vehicle_health_alarm_trigger
  AFTER INSERT OR UPDATE ON vehicle_health
  FOR EACH ROW
  EXECUTE FUNCTION notify_alarm_engine();
```

---

## Phase 4: Learning & Personalization

### 4.1 User Preference Learning

**Database Schema**:
```sql
CREATE TABLE learned_user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users,
  device_id TEXT REFERENCES vehicles(device_id),

  -- Preference data
  preference_key TEXT NOT NULL,
  preference_value JSONB NOT NULL,

  -- Learning metadata
  confidence FLOAT DEFAULT 0.5 CHECK (confidence BETWEEN 0 AND 1),
  learned_from TEXT, -- 'explicit', 'implicit', 'inferred'
  evidence_count INTEGER DEFAULT 1,

  -- Timestamps
  first_observed_at TIMESTAMPTZ DEFAULT NOW(),
  last_observed_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, device_id, preference_key)
);

-- Examples of preference keys:
-- 'preferred_departure_time' -> { "weekday": "08:00", "weekend": "10:00" }
-- 'common_destinations' -> [{ "name": "Office", "coords": {...}, "frequency": 0.8 }]
-- 'alert_preferences' -> { "battery_threshold": 25, "speed_limit": 100 }
-- 'communication_style' -> { "verbosity": "concise", "tone": "casual" }
```

**Preference Learning Module** (`_shared/preference-learner.ts`):
```typescript
export interface LearnedPreference {
  key: string
  value: any
  confidence: number
  learned_from: 'explicit' | 'implicit' | 'inferred'
}

export async function learnFromConversation(
  supabase: any,
  userId: string,
  deviceId: string,
  userMessage: string,
  assistantResponse: string
): Promise<void> {
  const preferences: LearnedPreference[] = []

  // Explicit preferences (user directly states something)
  const explicitPatterns = [
    {
      pattern: /(?:my|the)\s+(?:speed limit|max speed)\s+(?:is|should be)\s+(\d+)/i,
      key: 'preferred_speed_limit',
      extractor: (m: RegExpMatchArray) => ({ value: parseInt(m[1]) })
    },
    {
      pattern: /alert me (?:when|if)\s+battery\s+(?:drops|goes|falls)\s+(?:below|under)\s+(\d+)/i,
      key: 'battery_alert_threshold',
      extractor: (m: RegExpMatchArray) => ({ threshold: parseInt(m[1]) })
    },
    {
      pattern: /(?:i|we)\s+(?:usually|normally|typically)\s+(?:leave|depart)\s+(?:at|around)\s+(\d{1,2}(?::\d{2})?(?:\s*[ap]m)?)/i,
      key: 'preferred_departure_time',
      extractor: (m: RegExpMatchArray) => ({ time: m[1] })
    }
  ]

  for (const { pattern, key, extractor } of explicitPatterns) {
    const match = userMessage.match(pattern)
    if (match) {
      preferences.push({
        key,
        value: extractor(match),
        confidence: 0.9,
        learned_from: 'explicit'
      })
    }
  }

  // Implicit preferences (inferred from behavior)
  // These are learned over time from usage patterns

  // Save learned preferences
  for (const pref of preferences) {
    await upsertPreference(supabase, userId, deviceId, pref)
  }
}

async function upsertPreference(
  supabase: any,
  userId: string,
  deviceId: string,
  preference: LearnedPreference
): Promise<void> {
  const { data: existing } = await supabase
    .from('learned_user_preferences')
    .select('*')
    .eq('user_id', userId)
    .eq('device_id', deviceId)
    .eq('preference_key', preference.key)
    .single()

  if (existing) {
    // Update existing with increased confidence
    const newConfidence = Math.min(0.99, existing.confidence + 0.1)
    await supabase
      .from('learned_user_preferences')
      .update({
        preference_value: preference.value,
        confidence: newConfidence,
        evidence_count: existing.evidence_count + 1,
        last_observed_at: new Date().toISOString()
      })
      .eq('id', existing.id)
  } else {
    // Insert new preference
    await supabase
      .from('learned_user_preferences')
      .insert({
        user_id: userId,
        device_id: deviceId,
        preference_key: preference.key,
        preference_value: preference.value,
        confidence: preference.confidence,
        learned_from: preference.learned_from
      })
  }
}

export async function getPreferencesForContext(
  supabase: any,
  userId: string,
  deviceId: string
): Promise<Record<string, any>> {
  const { data: preferences } = await supabase
    .from('learned_user_preferences')
    .select('preference_key, preference_value, confidence')
    .eq('user_id', userId)
    .eq('device_id', deviceId)
    .gte('confidence', 0.6) // Only use high-confidence preferences
    .order('confidence', { ascending: false })

  const result: Record<string, any> = {}
  for (const pref of preferences || []) {
    result[pref.preference_key] = pref.preference_value
  }

  return result
}
```

---

## Implementation Timeline & Dependencies

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         IMPLEMENTATION PHASES                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PHASE 1: Foundation                                                         │
│  ├── 1.1 Memory Cleanup System                                               │
│  │   └── Dependencies: None                                                  │
│  │   └── Deliverables: cleanup-chat-history function, retention tables       │
│  │                                                                           │
│  ├── 1.2 LLM Analytics System                                                │
│  │   └── Dependencies: None                                                  │
│  │   └── Deliverables: llm_analytics table, analytics-collector.ts           │
│  │                                                                           │
│  └── 1.3 Model Fallback Chain                                                │
│      └── Dependencies: 1.2 (for error tracking)                              │
│      └── Deliverables: llm-client.ts, updated vehicle-chat                   │
│                                                                              │
│  PHASE 2: Intelligence                                                       │
│  ├── 2.1 Semantic Intent Classification                                      │
│  │   └── Dependencies: None                                                  │
│  │   └── Deliverables: Updated intent-classifier.ts                          │
│  │                                                                           │
│  ├── 2.2 Multi-Intent Support                                                │
│  │   └── Dependencies: 2.1                                                   │
│  │   └── Deliverables: Updated query-router.ts                               │
│  │                                                                           │
│  └── 2.3 Enhanced Embeddings                                                 │
│      └── Dependencies: None                                                  │
│      └── Deliverables: Updated embedding-generator.ts                        │
│                                                                              │
│  PHASE 3: Proactive Alarms                                                   │
│  ├── 3.1 Database Schema                                                     │
│  │   └── Dependencies: None                                                  │
│  │   └── Deliverables: alarm_rules, alarm_events, cooldowns tables           │
│  │                                                                           │
│  ├── 3.2 Rule Engine Core                                                    │
│  │   └── Dependencies: 3.1                                                   │
│  │   └── Deliverables: proactive-alarm-engine function                       │
│  │                                                                           │
│  ├── 3.3 Alert Dispatcher                                                    │
│  │   └── Dependencies: 3.2, 1.2 (analytics)                                  │
│  │   └── Deliverables: alert-dispatcher.ts, chat integration                 │
│  │                                                                           │
│  └── 3.4 Event Triggers                                                      │
│      └── Dependencies: 3.2                                                   │
│      └── Deliverables: Database triggers, real-time processing               │
│                                                                              │
│  PHASE 4: Learning                                                           │
│  ├── 4.1 Preference Learning                                                 │
│  │   └── Dependencies: 2.1 (intent classification)                           │
│  │   └── Deliverables: preference-learner.ts, preferences table              │
│  │                                                                           │
│  └── 4.2 Context Integration                                                 │
│      └── Dependencies: 4.1, 3.3                                              │
│      └── Deliverables: Updated system prompt, preference injection           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Files to Create/Modify Summary

### New Files
| File | Description |
|------|-------------|
| `supabase/functions/cleanup-chat-history/index.ts` | Memory cleanup function |
| `supabase/functions/_shared/analytics-collector.ts` | LLM analytics tracking |
| `supabase/functions/_shared/llm-client.ts` | Model fallback chain |
| `supabase/functions/proactive-alarm-engine/index.ts` | Main alarm engine |
| `supabase/functions/proactive-alarm-engine/rule-evaluator.ts` | Rule evaluation |
| `supabase/functions/proactive-alarm-engine/alert-dispatcher.ts` | Alert delivery |
| `supabase/functions/proactive-alarm-engine/event-aggregator.ts` | Event deduplication |
| `supabase/functions/_shared/preference-learner.ts` | User preference learning |
| `supabase/migrations/YYYYMMDD_llm_improvements.sql` | All database changes |

### Modified Files
| File | Changes |
|------|---------|
| `supabase/functions/vehicle-chat/index.ts` | Analytics, fallback, proactive context |
| `supabase/functions/vehicle-chat/intent-classifier.ts` | Semantic + hybrid classification |
| `supabase/functions/vehicle-chat/query-router.ts` | Multi-intent support |
| `supabase/functions/_shared/embedding-generator.ts` | API embeddings with fallback |

---

## Testing Strategy

### Unit Tests
- Intent classifier accuracy (target: 90%+ on test set)
- Rule evaluator correctness for each rule type
- Preference extraction accuracy

### Integration Tests
- End-to-end alarm triggering and delivery
- Multi-intent query handling
- Fallback chain behavior under failure

### Load Tests
- Alarm engine under high event volume
- Analytics collection at scale
- Memory cleanup performance

---

## Rollback Plan

Each phase can be rolled back independently:

1. **Phase 1**: Disable cleanup cron, remove analytics tracking calls
2. **Phase 2**: Revert to regex-only classification via feature flag
3. **Phase 3**: Disable alarm triggers, alerts continue but no new ones
4. **Phase 4**: Disable preference learning, use defaults

---

## Success Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Intent Classification Accuracy | ~70% (estimated) | 95% | Test set evaluation |
| Alert Delivery Latency | N/A | < 5 seconds | P95 from event to delivery |
| False Positive Rate | N/A | < 5% | User dismissal rate |
| User Engagement | Baseline | +20% | Messages per session |
| Response Time | ~2s | < 1.5s | P95 TTFT |
| Database Size Growth | Unbounded | Controlled | Monthly growth rate |

---

## Next Steps

1. Review and approve this plan
2. Create feature branch for Phase 1
3. Implement database migrations
4. Build and test each component
5. Deploy to staging environment
6. Run integration tests
7. Gradual rollout to production

---

*Document Version: 1.0*
*Created: 2026-01-11*
*Author: Claude (Fleet Flow LLM Improvements)*
