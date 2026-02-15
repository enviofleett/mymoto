import { useQuery } from "@tanstack/react-query";
import { getAddressFromCoordinates } from "@/utils/geocoding";

interface UseAddressResult {
  address: string | undefined;
  isLoading: boolean;
  error: Error | null;
}

export function useAddress(
  lat: number | null | undefined,
  lon: number | null | undefined,
  enabledOverride?: boolean
): UseAddressResult {
  const isValidCoords = typeof lat === 'number' && typeof lon === 'number' && lat !== 0 && lon !== 0;

  const { data: address, isLoading, error } = useQuery({
    queryKey: ['address', lat, lon],
    queryFn: () => getAddressFromCoordinates(lat!, lon!),
    enabled: isValidCoords && (enabledOverride ?? true),
    staleTime: 10 * 60 * 1000, // Avoid caching a transient failure "forever" in PWA.
    gcTime: 1000 * 60 * 60 * 24,
    refetchOnReconnect: true,
    retry: 2,
  });

  return {
    address: !isValidCoords
      ? undefined
      : address ?? (error ? `${lat!.toFixed(4)}, ${lon!.toFixed(4)}` : undefined),
    isLoading: isValidCoords ? isLoading : false,
    error: error as Error | null,
  };
}
