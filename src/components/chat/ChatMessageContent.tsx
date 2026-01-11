import { useState } from "react";
import { MapPin, ChevronDown, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface LocationData {
  lat: number;
  lng: number;
  address: string;
}

interface ChatMessageContentProps {
  content: string;
  isUser?: boolean;
}

function parseLocationMarkers(content: string): (string | { type: 'location'; data: LocationData })[] {
  const locationRegex = /\[LOCATION:\s*([\d.-]+),\s*([\d.-]+),\s*"([^"]+)"\]/g;
  const parts: (string | { type: 'location'; data: LocationData })[] = [];
  
  let lastIndex = 0;
  let match;
  
  while ((match = locationRegex.exec(content)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }
    
    // Add the location object
    parts.push({
      type: 'location',
      data: {
        lat: parseFloat(match[1]),
        lng: parseFloat(match[2]),
        address: match[3]
      }
    });
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text
  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }
  
  return parts;
}

function cleanMapLinks(text: string): string {
  // Remove markdown map links since we have the location tab
  return text.replace(/\[Open in Maps\]\([^)]+\)/g, '').trim();
}

function LocationTab({ data, isUser }: { data: LocationData; isUser?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
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
          <p className="text-sm mb-2">{data.address}</p>
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

export function ChatMessageContent({ content, isUser }: ChatMessageContentProps) {
  const cleanedContent = cleanMapLinks(content);
  const parts = parseLocationMarkers(cleanedContent);
  
  return (
    <>
      {parts.map((part, index) => {
        if (typeof part === 'string') {
          // Clean up extra whitespace/newlines around removed links
          const cleanText = part.replace(/\n\s*\n/g, '\n').trim();
          if (!cleanText) return null;
          return <span key={index}>{cleanText}</span>;
        }
        
        return (
          <LocationTab 
            key={index} 
            data={part.data} 
            isUser={isUser}
          />
        );
      })}
    </>
  );
}
