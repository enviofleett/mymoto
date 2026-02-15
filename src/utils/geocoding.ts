import pLimit from "p-limit";
import { invokeEdgeFunction } from "@/integrations/supabase/edge";

// Limit concurrent requests to reduce 429s and general PWA network pressure.
const limit = pLimit(2);

function getMapboxToken(): string | undefined {
  // Allow tests to override without mutating import.meta.env (which can be readonly).
  const override = (globalThis as any).__VITE_MAPBOX_ACCESS_TOKEN__;
  return override ?? import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
}

function isValidCoord(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n !== 0;
}

async function fetchMapboxAddress(lat: number, lon: number, token: string): Promise<string> {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lon},${lat}.json?access_token=${token}&types=address,poi,place`;
  const response = await fetch(url);
  if (!response.ok) {
    const err = new Error(`Mapbox API error: ${response.status}`) as Error & {
      status?: number;
      headers?: Headers;
    };
    err.status = response.status;
    err.headers = response.headers;
    throw err;
  }

  const data: any = await response.json();
  if (data?.features?.length > 0) {
    return data.features[0].place_name as string;
  }
  throw new Error("Mapbox returned no results");
}

async function fetchEdgeAddress(lat: number, lon: number): Promise<string> {
  const data = await invokeEdgeFunction<{ address: string }>("reverse-geocode", {
    lat,
    lng: lon,
  });
  if (!data?.address) throw new Error("Edge reverse-geocode returned no address");
  return data.address;
}

/**
 * Reverse geocode (lat, lon) to a human-readable address.
 *
 * Behavior:
 * - Prefer Mapbox directly when a client token is available.
 * - If Mapbox is missing/unauthorized/fails after retries, fall back to the Edge Function.
 * - If the Edge Function fails, throw (caller decides fallback UI).
 */
export async function getAddressFromCoordinates(lat: number, lon: number): Promise<string> {
  if (!isValidCoord(lat) || !isValidCoord(lon)) {
    throw new Error("Invalid coordinates");
  }

  return limit(async () => {
    const token = getMapboxToken();

    // Try Mapbox first when configured.
    if (token) {
      const MAX_RETRIES = 3;
      let lastError: unknown = null;

      for (let i = 0; i < MAX_RETRIES; i++) {
        try {
          return await fetchMapboxAddress(lat, lon, token);
        } catch (e: any) {
          lastError = e;

          const status = typeof e?.status === "number" ? e.status : null;
          if (status === 401 || status === 403) {
            // Token invalid/restricted in prod; edge function can use server token.
            break;
          }

          if (status === 429) {
            const retryAfter = e?.headers?.get?.("Retry-After");
            const waitMs = retryAfter ? Number.parseInt(retryAfter, 10) * 1000 : 1500 * (i + 1);
            await new Promise((r) => setTimeout(r, waitMs));
            continue;
          }

          // Simple backoff for transient failures.
          if (i < MAX_RETRIES - 1) {
            await new Promise((r) => setTimeout(r, 600 * (i + 1)));
          }
        }
      }

      // Fall back to edge when Mapbox fails.
      try {
        return await fetchEdgeAddress(lat, lon);
      } catch (edgeErr) {
        // Preserve the original error as additional context.
        const msg = lastError instanceof Error ? lastError.message : String(lastError);
        const emsg = edgeErr instanceof Error ? edgeErr.message : String(edgeErr);
        throw new Error(`Reverse geocoding failed (mapbox: ${msg}; edge: ${emsg})`);
      }
    }

    // No Mapbox token configured: edge-only.
    return await fetchEdgeAddress(lat, lon);
  });
}
