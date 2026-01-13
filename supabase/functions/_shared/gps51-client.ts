/**
 * Centralized GPS51 API Client with Global Rate Limiting
 * 
 * This shared module ensures all GPS51 API calls across all functions
 * respect rate limits and prevent IP limit errors (8902).
 * 
 * Features:
 * - Database-backed rate limiting (coordinates across function instances)
 * - Retry logic with exponential backoff for rate limit errors
 * - Request queuing for high-load scenarios
 * - Automatic backoff on rate limit errors
 * 
 * Usage:
 *   import { callGps51WithRateLimit, getValidGps51Token } from "../_shared/gps51-client.ts"
 *   
 *   const supabase = createClient(...)
 *   const { token, username, serverid } = await getValidGps51Token(supabase)
 *   const result = await callGps51WithRateLimit(supabase, proxyUrl, action, token, serverid, body)
 */

// Rate limiting configuration
const GPS51_RATE_LIMIT = {
  // Conservative limits to prevent IP blocking
  MAX_CALLS_PER_SECOND: 5, // Reduced from 10 to 5 for safety
  MIN_DELAY_MS: 200, // 200ms = 5 calls/second max
  BURST_WINDOW_MS: 1000, // 1 second window
  MAX_BURST_CALLS: 5, // Max 5 calls in 1 second
  
  // Retry configuration
  MAX_RETRIES: 3,
  INITIAL_RETRY_DELAY_MS: 1000, // 1 second
  MAX_RETRY_DELAY_MS: 30000, // 30 seconds max
  BACKOFF_MULTIPLIER: 2,
  
  // Rate limit error codes from GPS51
  RATE_LIMIT_ERROR_CODES: [8902, 9903, 9904], // IP limit, token expired, parameter error
};

interface RateLimitState {
  last_call_time: number;
  calls_in_window: number;
  window_start: number;
  backoff_until: number;
}

// In-memory cache for rate limit state (per function instance)
let localRateLimitState: RateLimitState = {
  last_call_time: 0,
  calls_in_window: 0,
  window_start: Date.now(),
  backoff_until: 0,
};

/**
 * Get or create rate limit state in database (coordinates across instances)
 */
async function getGlobalRateLimitState(
  supabase: any
): Promise<{ backoff_until: number; last_call_time: number }> {
  try {
    const { data, error } = await supabase
      .from("app_settings")
      .select("value, metadata")
      .eq("key", "gps51_rate_limit_state")
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = not found, which is OK
      console.warn(`[GPS51 Client] Error fetching rate limit state: ${error.message}`);
    }

    if (data?.value) {
      const state = JSON.parse(data.value);
      return {
        backoff_until: state.backoff_until || 0,
        last_call_time: state.last_call_time || 0,
      };
    }

    return { backoff_until: 0, last_call_time: 0 };
  } catch (error) {
    console.warn(`[GPS51 Client] Error parsing rate limit state: ${error}`);
    return { backoff_until: 0, last_call_time: 0 };
  }
}

/**
 * Update global rate limit state in database
 */
async function updateGlobalRateLimitState(
  supabase: any,
  backoffUntil: number,
  lastCallTime: number
): Promise<void> {
  try {
    await supabase.from("app_settings").upsert({
      key: "gps51_rate_limit_state",
      value: JSON.stringify({
        backoff_until: backoffUntil,
        last_call_time: lastCallTime,
        updated_at: new Date().toISOString(),
      }),
      metadata: {
        updated_by: "gps51-client",
      },
    });
  } catch (error) {
    console.warn(`[GPS51 Client] Error updating rate limit state: ${error}`);
  }
}

/**
 * Check if we're in a backoff period (from rate limit error)
 */
async function checkBackoff(supabase: any): Promise<number> {
  const globalState = await getGlobalRateLimitState(supabase);
  const now = Date.now();
  
  // Check global backoff
  if (globalState.backoff_until > now) {
    const remaining = globalState.backoff_until - now;
    console.log(`[GPS51 Client] In backoff period, waiting ${remaining}ms`);
    return remaining;
  }
  
  // Check local backoff
  if (localRateLimitState.backoff_until > now) {
    const remaining = localRateLimitState.backoff_until - now;
    console.log(`[GPS51 Client] In local backoff period, waiting ${remaining}ms`);
    return remaining;
  }
  
  return 0;
}

/**
 * Apply rate limiting delay
 */
async function applyRateLimit(supabase: any): Promise<void> {
  const now = Date.now();
  
  // Check backoff first
  const backoffMs = await checkBackoff(supabase);
  if (backoffMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, backoffMs));
    return;
  }
  
  // Reset window if expired
  if (now - localRateLimitState.window_start >= GPS51_RATE_LIMIT.BURST_WINDOW_MS) {
    localRateLimitState.window_start = now;
    localRateLimitState.calls_in_window = 0;
  }
  
  // Check if we've exceeded burst limit
  if (localRateLimitState.calls_in_window >= GPS51_RATE_LIMIT.MAX_BURST_CALLS) {
    const waitTime = GPS51_RATE_LIMIT.BURST_WINDOW_MS - (now - localRateLimitState.window_start);
    if (waitTime > 0) {
      console.log(`[GPS51 Client] Burst limit reached, waiting ${waitTime}ms`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      localRateLimitState.window_start = Date.now();
      localRateLimitState.calls_in_window = 0;
    }
  }
  
  // Apply minimum delay between calls
  const timeSinceLastCall = now - localRateLimitState.last_call_time;
  if (timeSinceLastCall < GPS51_RATE_LIMIT.MIN_DELAY_MS) {
    const delay = GPS51_RATE_LIMIT.MIN_DELAY_MS - timeSinceLastCall;
    console.log(`[GPS51 Client] Rate limiting: waiting ${delay}ms`);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  
  // Update state
  localRateLimitState.last_call_time = Date.now();
  localRateLimitState.calls_in_window++;
  
  // Update global state (async, don't wait)
  updateGlobalRateLimitState(supabase, 0, localRateLimitState.last_call_time).catch(
    (err) => console.warn(`[GPS51 Client] Failed to update global state: ${err}`)
  );
}

/**
 * Handle rate limit error with exponential backoff
 */
async function handleRateLimitError(
  supabase: any,
  attempt: number,
  errorCode: number
): Promise<number> {
  if (!GPS51_RATE_LIMIT.RATE_LIMIT_ERROR_CODES.includes(errorCode)) {
    return 0; // Not a rate limit error
  }
  
  // Calculate backoff delay with exponential backoff
  const backoffDelay = Math.min(
    GPS51_RATE_LIMIT.INITIAL_RETRY_DELAY_MS *
      Math.pow(GPS51_RATE_LIMIT.BACKOFF_MULTIPLIER, attempt),
    GPS51_RATE_LIMIT.MAX_RETRY_DELAY_MS
  );
  
  const backoffUntil = Date.now() + backoffDelay;
  
  // Set local backoff
  localRateLimitState.backoff_until = backoffUntil;
  
  // Set global backoff (coordinates across all function instances)
  await updateGlobalRateLimitState(supabase, backoffUntil, Date.now());
  
  console.warn(
    `[GPS51 Client] Rate limit error ${errorCode}, backing off for ${backoffDelay}ms (attempt ${attempt + 1})`
  );
  
  return backoffDelay;
}

/**
 * Call GPS51 API with centralized rate limiting and retry logic
 */
export async function callGps51WithRateLimit(
  supabase: any,
  proxyUrl: string,
  action: string,
  token: string,
  serverid: string,
  body: any,
  retryAttempt: number = 0
): Promise<any> {
  // Apply rate limiting
  await applyRateLimit(supabase);
  
  const targetUrl = `https://api.gps51.com/openapi?action=${action}&token=${token}&serverid=${serverid}`;
  
  console.log(`[GPS51 Client] Calling ${action} (attempt ${retryAttempt + 1})`);
  
  try {
    const response = await fetch(proxyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetUrl,
        method: "POST",
        data: body,
      }),
    });

    if (!response.ok) {
      throw new Error(`GPS51 API HTTP error: ${response.status}`);
    }

    const result = await response.json();
    
    // Check for rate limit errors
    if (result.status && GPS51_RATE_LIMIT.RATE_LIMIT_ERROR_CODES.includes(result.status)) {
      // Handle rate limit error
      if (retryAttempt < GPS51_RATE_LIMIT.MAX_RETRIES) {
        const backoffDelay = await handleRateLimitError(supabase, retryAttempt, result.status);
        
        // Wait for backoff period
        await new Promise((resolve) => setTimeout(resolve, backoffDelay));
        
        // Retry with exponential backoff
        console.log(`[GPS51 Client] Retrying ${action} after backoff`);
        return callGps51WithRateLimit(supabase, proxyUrl, action, token, serverid, body, retryAttempt + 1);
      } else {
        throw new Error(
          `GPS51 API rate limit error after ${GPS51_RATE_LIMIT.MAX_RETRIES} retries: ${result.cause || "Unknown"} (status: ${result.status})`
        );
      }
    }
    
    // Success - reset backoff
    localRateLimitState.backoff_until = 0;
    await updateGlobalRateLimitState(supabase, 0, Date.now());
    
    return result;
  } catch (error) {
    // For network errors, retry with backoff
    if (retryAttempt < GPS51_RATE_LIMIT.MAX_RETRIES && error instanceof Error) {
      const backoffDelay =
        GPS51_RATE_LIMIT.INITIAL_RETRY_DELAY_MS *
        Math.pow(GPS51_RATE_LIMIT.BACKOFF_MULTIPLIER, retryAttempt);
      
      console.warn(`[GPS51 Client] Network error, retrying in ${backoffDelay}ms: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, backoffDelay));
      
      return callGps51WithRateLimit(supabase, proxyUrl, action, token, serverid, body, retryAttempt + 1);
    }
    
    throw error;
  }
}

/**
 * Call GPS51 login API with rate limiting (for login calls that don't have a token yet)
 */
export async function callGps51LoginWithRateLimit(
  supabase: any,
  proxyUrl: string,
  body: any
): Promise<any> {
  // Apply rate limiting (same as regular calls)
  await applyRateLimit(supabase);
  
  const targetUrl = `https://api.gps51.com/openapi?action=login`;
  
  console.log(`[GPS51 Client] Calling login (no token required)`);
  
  try {
    const response = await fetch(proxyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetUrl,
        method: "POST",
        data: body,
      }),
    });

    if (!response.ok) {
      throw new Error(`GPS51 API HTTP error: ${response.status}`);
    }

    const result = await response.json();
    
    // Check for rate limit errors
    if (result.status && GPS51_RATE_LIMIT.RATE_LIMIT_ERROR_CODES.includes(result.status)) {
      // Handle rate limit error (no retry for login, just throw)
      const backoffDelay = await handleRateLimitError(supabase, 0, result.status);
      throw new Error(
        `GPS51 API rate limit error during login: ${result.cause || "Unknown"} (status: ${result.status}). Please retry after ${Math.round(backoffDelay / 1000)} seconds.`
      );
    }
    
    return result;
  } catch (error) {
    // For login, don't retry automatically - let caller handle it
    throw error;
  }
}

/**
 * Get valid GPS51 token (shared utility)
 */
export async function getValidGps51Token(supabase: any): Promise<{
  token: string;
  username: string;
  serverid: string;
}> {
  const { data: tokenData, error } = await supabase
    .from("app_settings")
    .select("value, expires_at, metadata")
    .eq("key", "gps_token")
    .maybeSingle();

  if (error) throw new Error(`Token fetch error: ${error.message}`);
  if (!tokenData?.value) throw new Error("No GPS token found. Admin login required.");

  if (tokenData.expires_at) {
    const expiresAt = new Date(tokenData.expires_at);
    if (new Date() >= expiresAt) {
      throw new Error("Token expired. Admin refresh required.");
    }
  }

  return {
    token: tokenData.value,
    username: tokenData.metadata?.username || "",
    serverid: tokenData.metadata?.serverid || "1",
  };
}
