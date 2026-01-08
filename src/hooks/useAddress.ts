import { useQuery } from "@tanstack/react-query";
import { getAddressFromCoordinates } from "@/utils/geocoding";

interface UseAddressResult {
  address: string | undefined;
  isLoading: boolean;
  error: Error | null;
}

export function useAddress(lat: number | null | undefined, lon: number | null | undefined): UseAddressResult {
  const isValidCoords = typeof lat === 'number' && typeof lon === 'number' && lat !== 0 && lon !== 0;

  const { data: address, isLoading, error } = useQuery({
    queryKey: ['address', lat, lon],
    queryFn: () => getAddressFromCoordinates(lat!, lon!),
    enabled: isValidCoords,
    staleTime: Infinity, // Locations don't change, cache forever
    gcTime: 1000 * 60 * 60 * 24, // Keep in cache for 24 hours
  });

  return {
    address: isValidCoords ? address : undefined,
    isLoading: isValidCoords ? isLoading : false,
    error: error as Error | null,
  };
}
