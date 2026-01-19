/**
 * Query Optimization & Caching
 * 
 * Implements query result caching for common date ranges to improve performance
 * and reduce database load.
 */

export interface CachedQueryResult<T> {
  data: T
  timestamp: number
  expiresAt: number
}

// In-memory cache (simple implementation)
// In production, consider using Redis or Supabase Edge Cache
const queryCache = new Map<string, CachedQueryResult<any>>()

// Cache TTLs (in milliseconds)
const CACHE_TTL = {
  'today': 60 * 1000, // 1 minute
  'yesterday': 5 * 60 * 1000, // 5 minutes
  'this_week': 2 * 60 * 1000, // 2 minutes
  'last_week': 10 * 60 * 1000, // 10 minutes
  'this_month': 5 * 60 * 1000, // 5 minutes
  'last_month': 30 * 60 * 1000, // 30 minutes
  'custom': 5 * 60 * 1000, // 5 minutes (default)
  'none': 30 * 1000 // 30 seconds (for realtime queries)
}

/**
 * Generate cache key from query parameters
 */
function generateCacheKey(
  deviceId: string,
  period: string,
  startDate: string,
  endDate: string,
  queryType: 'trips' | 'positions' | 'both'
): string {
  // Normalize dates to day precision for better cache hits
  const startDay = startDate.split('T')[0]
  const endDay = endDate.split('T')[0]
  return `${deviceId}:${period}:${startDay}:${endDay}:${queryType}`
}

/**
 * Get cached query result if available and not expired
 */
export function getCachedQuery<T>(
  deviceId: string,
  period: string,
  startDate: string,
  endDate: string,
  queryType: 'trips' | 'positions' | 'both'
): T | null {
  const cacheKey = generateCacheKey(deviceId, period, startDate, endDate, queryType)
  const cached = queryCache.get(cacheKey)
  
  if (!cached) {
    return null
  }
  
  // Check if expired
  if (Date.now() > cached.expiresAt) {
    queryCache.delete(cacheKey)
    return null
  }
  
  console.log(`[Query Cache] HIT for ${cacheKey} (age: ${Math.floor((Date.now() - cached.timestamp) / 1000)}s)`)
  return cached.data
}

/**
 * Store query result in cache
 */
export function setCachedQuery<T>(
  deviceId: string,
  period: string,
  startDate: string,
  endDate: string,
  queryType: 'trips' | 'positions' | 'both',
  data: T
): void {
  const cacheKey = generateCacheKey(deviceId, period, startDate, endDate, queryType)
  const ttl = CACHE_TTL[period as keyof typeof CACHE_TTL] || CACHE_TTL.custom
  
  queryCache.set(cacheKey, {
    data,
    timestamp: Date.now(),
    expiresAt: Date.now() + ttl
  })
  
  console.log(`[Query Cache] SET for ${cacheKey} (TTL: ${ttl / 1000}s)`)
  
  // Cleanup expired entries periodically (simple cleanup)
  if (queryCache.size > 100) {
    cleanupExpiredEntries()
  }
}

/**
 * Clean up expired cache entries
 */
function cleanupExpiredEntries(): void {
  const now = Date.now()
  let cleaned = 0
  
  for (const [key, value] of queryCache.entries()) {
    if (now > value.expiresAt) {
      queryCache.delete(key)
      cleaned++
    }
  }
  
  if (cleaned > 0) {
    console.log(`[Query Cache] Cleaned up ${cleaned} expired entries`)
  }
}

/**
 * Invalidate cache for a specific device and period
 */
export function invalidateCache(
  deviceId: string,
  period?: string
): void {
  if (period) {
    // Invalidate specific period
    const keysToDelete: string[] = []
    for (const key of queryCache.keys()) {
      if (key.startsWith(`${deviceId}:${period}:`)) {
        keysToDelete.push(key)
      }
    }
    keysToDelete.forEach(key => queryCache.delete(key))
    console.log(`[Query Cache] Invalidated ${keysToDelete.length} entries for ${deviceId}:${period}`)
  } else {
    // Invalidate all entries for device
    const keysToDelete: string[] = []
    for (const key of queryCache.keys()) {
      if (key.startsWith(`${deviceId}:`)) {
        keysToDelete.push(key)
      }
    }
    keysToDelete.forEach(key => queryCache.delete(key))
    console.log(`[Query Cache] Invalidated all ${keysToDelete.length} entries for ${deviceId}`)
  }
}

/**
 * Get cache statistics
 */
export function getCacheStats(): {
  size: number
  entries: number
  oldestEntry: number | null
  newestEntry: number | null
} {
  if (queryCache.size === 0) {
    return {
      size: 0,
      entries: 0,
      oldestEntry: null,
      newestEntry: null
    }
  }
  
  const timestamps = Array.from(queryCache.values()).map(v => v.timestamp)
  
  return {
    size: queryCache.size,
    entries: queryCache.size,
    oldestEntry: Math.min(...timestamps),
    newestEntry: Math.max(...timestamps)
  }
}

/**
 * Clear all cache (for testing/debugging)
 */
export function clearCache(): void {
  const size = queryCache.size
  queryCache.clear()
  console.log(`[Query Cache] Cleared ${size} entries`)
}


