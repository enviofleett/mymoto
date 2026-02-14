import { useEffect, useRef, useState } from "react";
import { useAddress } from "@/hooks/useAddress";
import { MapPin } from "lucide-react";

interface LocationCellProps {
  lat: number | null;
  lon: number | null;
  className?: string;
}

export function LocationCell({ lat, lon, className = "" }: LocationCellProps) {
  const [enabled, setEnabled] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const { address } = useAddress(lat, lon, enabled);

  const isValidLocation = lat !== null && lon !== null && lat !== 0 && lon !== 0;

  useEffect(() => {
    if (!isValidLocation || enabled) return;
    
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    let timeoutId: NodeJS.Timeout;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting) {
          // Delay enablement to prevent spamming geocoding on fast scroll
          timeoutId = setTimeout(() => {
            setEnabled(true);
            observer.unobserve(entry.target);
          }, 500); // 500ms delay
        } else {
          // Clear timeout if user scrolls away quickly
          if (timeoutId) clearTimeout(timeoutId);
        }
      },
      { rootMargin: "100px", threshold: 0.1 }
    );

    observer.observe(el);
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      try {
        observer.disconnect();
      } catch {
        /* ignore */
      }
    };
  }, [enabled, isValidLocation]);

  if (!isValidLocation) {
    return <span className="text-muted-foreground text-xs">No location</span>;
  }

  return (
    <div ref={ref} className={`flex items-start gap-1.5 ${className}`}>
      <MapPin className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
      <span className="text-xs line-clamp-2">{address || `${lat!.toFixed(4)}, ${lon!.toFixed(4)}`}</span>
    </div>
  );
}
