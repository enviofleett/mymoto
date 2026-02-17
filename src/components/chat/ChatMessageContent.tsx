import { useState, useEffect, useRef } from "react";
import { MapPin, ChevronDown, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { cleanMapLinks, parseMessageParts } from "./chatMessageParser";

interface LocationMeta {
  lastSeenLabel?: string;
  statusText?: string;
  batteryText?: string;
  ignitionText?: string;
}

interface LocationData {
  lat: number;
  lng: number;
  address: string;
}

interface ChatMessageContentProps {
  content: string;
  isUser?: boolean;
  meta?: LocationMeta;
}

function TripTable({ markdown }: { markdown: string }) {
  const lines = markdown.split('\n').filter((line) => line.trim());
  const tableRows: string[][] = [];

  lines.forEach((line) => {
    if (line.startsWith('|') && line.endsWith('|')) {
      const cells = line
        .split('|')
        .map((cell) => cell.trim())
        .filter((cell) => cell.length > 0);
      if (cells.length > 0) {
        tableRows.push(cells);
      }
    }
  });

  if (tableRows.length === 0) {
    return null;
  }

  const headers = tableRows[0] || [];
  const dataRows = tableRows.slice(2);

  return (
    <div className="mt-2 overflow-x-auto rounded-lg border border-border bg-background/60">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            {headers.map((header, index) => (
              <th key={index} className="px-3 py-2 text-left font-semibold text-foreground">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dataRows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-border/40">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-3 py-2 text-foreground/90">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MiniMap({ lat, lng }: { lat: number; lng: number }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
    }).setView([lat, lng], 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

    const icon = L.divIcon({
      className: 'custom-marker',
      html: `<div class="w-6 h-6 rounded-full border-2 border-white shadow-lg flex items-center justify-center" style="background:#ea580c;">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
          <circle cx="12" cy="10" r="3"/>
        </svg>
      </div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });

    L.marker([lat, lng], { icon }).addTo(map);
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [lat, lng]);

  return (
    <div 
      ref={mapRef} 
      className="w-full h-32 rounded-md overflow-hidden mb-2"
      style={{ minHeight: '128px' }}
    />
  );
}

function LocationTab({ data, isUser, meta }: { data: LocationData; isUser?: boolean; meta?: LocationMeta }) {
  const [isOpen, setIsOpen] = useState(true);
  const mapsUrl = `https://www.google.com/maps?q=${data.lat},${data.lng}`;
  
  return (
    <div className={cn(
      "my-2 rounded-lg overflow-hidden border",
      isUser 
        ? "border-primary-foreground/20 bg-primary-foreground/10" 
        : "border-border bg-background/50"
    )}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 text-left transition-colors",
          isUser 
            ? "hover:bg-primary-foreground/20" 
            : "hover:bg-muted/50"
        )}
      >
        <MapPin className="h-4 w-4 shrink-0" />
        <span className="text-sm font-medium flex-1">View Location</span>
        <ChevronDown className={cn(
          "h-4 w-4 shrink-0 transition-transform duration-200",
          isOpen && "rotate-180"
        )} />
      </button>
      
      {isOpen && (
        <div className={cn(
          "px-3 py-2 border-t",
          isUser ? "border-primary-foreground/20" : "border-border"
        )}>
          <MiniMap lat={data.lat} lng={data.lng} />
          <p className="text-sm mb-1">{data.address}</p>
          {meta && (
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
              <span>Last: {meta.lastSeenLabel ?? "--"}</span>
              <span>Status: {meta.statusText ?? "--"}</span>
              <span>Battery: {meta.batteryText ?? "--"}</span>
              <span>{meta.ignitionText ?? "Ignition --"}</span>
            </div>
          )}
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "inline-flex items-center gap-1.5 text-xs font-medium transition-colors",
              isUser 
                ? "text-primary-foreground/80 hover:text-primary-foreground" 
                : "text-primary hover:text-primary/80"
            )}
          >
            <ExternalLink className="h-3 w-3" />
            Open in Google Maps
          </a>
        </div>
      )}
    </div>
  );
}

export function ChatMessageContent({ content, isUser, meta }: ChatMessageContentProps) {
  const cleanedContent = cleanMapLinks(content);
  const parts = parseMessageParts(cleanedContent);
  
  return (
    <>
      {parts.map((part, index) => {
        if (typeof part === 'string') {
          // Clean up extra whitespace/newlines around removed links
          const cleanText = part.replace(/\n\s*\n/g, '\n').trim();
          if (!cleanText) return null;
          return <span key={index}>{cleanText}</span>;
        }

        if (part.type === 'trip_table') {
          return <TripTable key={index} markdown={part.markdown} />;
        }

        return <LocationTab key={index} data={part.data} isUser={isUser} meta={meta} />;
      })}
    </>
  );
}
