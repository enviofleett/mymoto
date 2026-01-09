/**
 * Query Routing System for Vehicle Chat
 *
 * Uses intent classification to determine optimal data fetching strategy.
 * Reduces unnecessary API calls and improves response time.
 */

import { classifyIntent, requiresFreshGpsData, type Intent, type IntentType } from './intent-classifier.ts'

export interface RoutingDecision {
  intent: Intent
  data_sources: DataSource[]
  cache_strategy: 'fresh' | 'cached' | 'hybrid'
  priority: 'high' | 'normal' | 'low'
  estimated_latency_ms: number
}

export interface DataSource {
  source: 'gps' | 'position_history' | 'trips' | 'driver' | 'vehicle_info' | 'chat_history' | 'llm_settings' | 'alarms'
  required: boolean  // If true, query fails if this data is unavailable
  limit?: number     // For queries that return multiple records
  use_cache: boolean // Whether to use cached data
}

/**
 * Routes a query to determine optimal data fetching strategy
 *
 * @param query - User's message
 * @param deviceId - Vehicle device ID
 * @returns Routing decision with data sources and caching strategy
 */
export function routeQuery(query: string, deviceId: string): RoutingDecision {
  const intent = classifyIntent(query)
  const needsFreshData = requiresFreshGpsData(query)

  // Base data sources needed for all queries
  const baseSources: DataSource[] = [
    {
      source: 'vehicle_info',
      required: true,
      use_cache: true
    },
    {
      source: 'llm_settings',
      required: false,
      use_cache: true
    }
  ]

  // Intent-specific data sources
  const intentSources = getDataSourcesForIntent(intent.type, needsFreshData)

  // Combine all data sources
  const allSources = [...baseSources, ...intentSources]

  // Determine cache strategy
  const cacheStrategy = determineCacheStrategy(intent, needsFreshData)

  // Estimate latency based on data sources
  const estimatedLatency = estimateLatency(allSources, cacheStrategy)

  // Priority based on intent and real-time requirements
  const priority = determinePriority(intent, needsFreshData)

  return {
    intent,
    data_sources: allSources,
    cache_strategy: cacheStrategy,
    priority,
    estimated_latency_ms: estimatedLatency
  }
}

/**
 * Gets data sources needed for a specific intent type
 */
function getDataSourcesForIntent(intentType: IntentType, needsFreshData: boolean): DataSource[] {
  const sourceMap: Record<IntentType, DataSource[]> = {
    location: [
      {
        source: 'gps',
        required: true,
        use_cache: !needsFreshData
      },
      {
        source: 'position_history',
        required: false,
        limit: 5,
        use_cache: true
      }
    ],

    trip: [
      {
        source: 'trips',
        required: true,
        limit: 20,
        use_cache: true
      },
      {
        source: 'gps',
        required: false,
        use_cache: true
      }
    ],

    stats: [
      {
        source: 'trips',
        required: true,
        limit: 50,
        use_cache: true
      },
      {
        source: 'position_history',
        required: true,
        limit: 100,
        use_cache: true
      },
      {
        source: 'gps',
        required: false,
        use_cache: true
      }
    ],

    maintenance: [
      {
        source: 'gps',
        required: true,
        use_cache: !needsFreshData
      },
      {
        source: 'position_history',
        required: true,
        limit: 50,
        use_cache: true
      },
      {
        source: 'alarms',
        required: false,
        limit: 20,
        use_cache: true
      }
    ],

    control: [
      {
        source: 'gps',
        required: false,
        use_cache: true
      },
      {
        source: 'llm_settings',
        required: true,
        use_cache: false  // Settings changes need fresh data
      }
    ],

    history: [
      {
        source: 'position_history',
        required: true,
        limit: 100,
        use_cache: true
      },
      {
        source: 'trips',
        required: false,
        limit: 50,
        use_cache: true
      },
      {
        source: 'chat_history',
        required: false,
        limit: 50,
        use_cache: true
      }
    ],

    driver: [
      {
        source: 'driver',
        required: true,
        use_cache: true
      },
      {
        source: 'gps',
        required: false,
        use_cache: true
      }
    ],

    general: [
      {
        source: 'gps',
        required: false,
        use_cache: true
      }
    ]
  }

  return sourceMap[intentType] || sourceMap.general
}

/**
 * Determines optimal cache strategy based on intent and freshness requirements
 */
function determineCacheStrategy(intent: Intent, needsFreshData: boolean): 'fresh' | 'cached' | 'hybrid' {
  // High-confidence location/maintenance queries need fresh data
  if (needsFreshData && intent.confidence > 0.6) {
    return 'fresh'
  }

  // Control commands should use fresh data for safety
  if (intent.type === 'control') {
    return 'fresh'
  }

  // Historical queries can use cached data
  if (intent.type === 'trip' || intent.type === 'stats' || intent.type === 'history') {
    return 'cached'
  }

  // Hybrid: fetch some fresh, some cached
  if (intent.type === 'location' || intent.type === 'maintenance') {
    return 'hybrid'
  }

  return 'cached'
}

/**
 * Estimates query latency based on data sources and cache strategy
 */
function estimateLatency(sources: DataSource[], cacheStrategy: string): number {
  let totalLatency = 0

  // Base latency for LLM call
  totalLatency += 500  // ~500ms for LLM response

  // Add latency for each data source
  for (const source of sources) {
    if (!source.required && Math.random() > 0.8) {
      // Optional sources might be skipped
      continue
    }

    const latencies = {
      gps: source.use_cache ? 50 : 300,           // GPS fetch: 50ms cached, 300ms fresh
      position_history: 100,                       // DB query: ~100ms
      trips: 150,                                  // Complex DB query: ~150ms
      driver: 50,                                  // Simple DB query: ~50ms
      vehicle_info: 50,                            // Simple DB query: ~50ms
      chat_history: 80,                            // DB query: ~80ms
      llm_settings: 30,                            // Simple DB query: ~30ms
      alarms: 100,                                 // DB query: ~100ms
    }

    totalLatency += latencies[source.source] || 100
  }

  // Fresh strategy adds overhead for cache bypass
  if (cacheStrategy === 'fresh') {
    totalLatency += 200
  }

  return Math.round(totalLatency)
}

/**
 * Determines query priority based on intent and requirements
 */
function determinePriority(intent: Intent, needsFreshData: boolean): 'high' | 'normal' | 'low' {
  // Control commands are high priority
  if (intent.type === 'control') {
    return 'high'
  }

  // Maintenance with high confidence is high priority (safety concern)
  if (intent.type === 'maintenance' && intent.confidence > 0.7) {
    return 'high'
  }

  // Fresh data requests are higher priority
  if (needsFreshData && intent.confidence > 0.6) {
    return 'high'
  }

  // Historical/stats queries are lower priority
  if (intent.type === 'stats' || intent.type === 'history') {
    return 'low'
  }

  return 'normal'
}

/**
 * Optimizes data source fetching order for parallel execution
 * Returns sources grouped by dependency level
 */
export function optimizeFetchOrder(sources: DataSource[]): DataSource[][] {
  // Group 1: Independent sources that can be fetched in parallel
  const independent = sources.filter(s =>
    s.source === 'vehicle_info' ||
    s.source === 'llm_settings' ||
    s.source === 'driver'
  )

  // Group 2: GPS and position data (may depend on vehicle_info)
  const positionData = sources.filter(s =>
    s.source === 'gps' ||
    s.source === 'position_history'
  )

  // Group 3: Complex queries (may depend on position data)
  const complex = sources.filter(s =>
    s.source === 'trips' ||
    s.source === 'alarms' ||
    s.source === 'chat_history'
  )

  return [independent, positionData, complex].filter(group => group.length > 0)
}

/**
 * Validates if required data sources are available
 * Returns missing required sources
 */
export function validateDataSources(
  routing: RoutingDecision,
  availableData: Record<string, any>
): { valid: boolean; missing: string[] } {
  const requiredSources = routing.data_sources
    .filter(s => s.required)
    .map(s => s.source)

  const missing = requiredSources.filter(source => {
    const data = availableData[source]
    return !data || (Array.isArray(data) && data.length === 0)
  })

  return {
    valid: missing.length === 0,
    missing
  }
}

/**
 * Generates cache key for routing decision
 * Used for caching routing decisions for similar queries
 */
export function generateRoutingCacheKey(query: string, deviceId: string): string {
  const intent = classifyIntent(query)
  // Normalize query to cache similar questions together
  const normalizedQuery = query.toLowerCase()
    .replace(/[?.!,]/g, '')
    .trim()
    .slice(0, 50)

  return `routing:${deviceId}:${intent.type}:${normalizedQuery}`
}
