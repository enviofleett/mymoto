import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { Send, Bot, User, Loader2, Car, MapPin, ExternalLink, Battery, Gauge, Power, Navigation } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

interface LocationData {
  lat: number;
  lon: number;
  address: string;
}

// Location Card Component - renders a rich map preview
function LocationCard({ lat, lon, address }: LocationData) {
  const mapUrl = `https://www.google.com/maps?q=${lat},${lon}`;
  const staticMapUrl = `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s+3b82f6(${lon},${lat})/${lon},${lat},14,0/300x200@2x?access_token=${import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || 'pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY4NXVycTA2emYycXBndHRqcmZ3N3gifQ.rJcFIG214AriISLbB6B5aw'}`;

  return (
    <div className="my-2 rounded-lg border border-border bg-card overflow-hidden max-w-sm">
      <div className="relative h-48 bg-muted">
        <img
          src={staticMapUrl}
          alt="Location map"
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="%23e5e7eb"/><text x="50%" y="50%" text-anchor="middle" fill="%236b7280" font-family="sans-serif" font-size="14">Map Preview</text></svg>';
          }}
        />
        <div className="absolute top-2 right-2 bg-background/90 backdrop-blur-sm px-2 py-1 rounded text-xs font-medium">
          📍 Live Location
        </div>
      </div>
      <div className="p-3 space-y-2">
        <div className="flex items-start gap-2">
          <MapPin className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <p className="text-sm font-medium">{address}</p>
        </div>
        <div className="text-xs text-muted-foreground">
          {lat.toFixed(5)}, {lon.toFixed(5)}
        </div>
        <a
          href={mapUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-md bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition-colors"
        >
          <ExternalLink className="h-4 w-4" />
          Open in Google Maps
        </a>
      </div>
    </div>
  );
}

// Parse message content and extract location tags and trip tables
function parseMessageContent(content: string): { 
  text: string; 
  locations: LocationData[];
  tripTables: string[];
} {
  const locations: LocationData[] = [];
  const tripTables: string[] = [];
  let text = content;

  // Match [LOCATION: lat, lng, "address"] pattern
  const locationRegex = /\[LOCATION:\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*"([^"]+)"\]/g;

  text = text.replace(locationRegex, (match, lat, lon, address) => {
    locations.push({
      lat: parseFloat(lat),
      lon: parseFloat(lon),
      address: address.trim()
    });
    return ''; // Remove the tag from text
  });

  // Match [TRIP_TABLE: ...] pattern
  const tripTableRegex = /\[TRIP_TABLE:(.*?)\]/gs;
  let tripTableMatch;
  while ((tripTableMatch = tripTableRegex.exec(text)) !== null) {
    tripTables.push(tripTableMatch[1].trim());
    text = text.replace(tripTableMatch[0], ''); // Remove the tag from text
  }

  return { text: text.trim(), locations, tripTables };
}

// Render trip table from markdown
function TripTable({ markdown }: { markdown: string }) {
  // Parse markdown table
  const lines = markdown.split('\n').filter(line => line.trim());
  const tableRows: string[][] = [];
  
  lines.forEach(line => {
    if (line.startsWith('|') && line.endsWith('|')) {
      const cells = line
        .split('|')
        .map(cell => cell.trim())
        .filter(cell => cell.length > 0);
      if (cells.length > 0) {
        tableRows.push(cells);
      }
    }
  });

  if (tableRows.length === 0) {
    return null;
  }

  // First row is header, second is separator, rest are data
  const headers = tableRows[0] || [];
  const dataRows = tableRows.slice(2);

  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            {headers.map((header, index) => (
              <th
                key={index}
                className="px-4 py-3 text-left font-semibold text-foreground"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dataRows.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className="border-b border-border/50 hover:bg-muted/30 transition-colors"
            >
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className="px-4 py-2.5 text-foreground/90"
                >
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

// Render chat message with rich elements
function ChatMessageContent({ content, isUser }: { content: string; isUser: boolean }) {
  const { text, locations, tripTables } = parseMessageContent(content);

  // Parse markdown links from remaining text
  const parts: (string | { text: string; url: string })[] = [];
  const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let lastIndex = 0;
  let match;

  while ((match = linkRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push({ text: match[1], url: match[2] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return (
    <div className="space-y-2">
      {/* Text content with links */}
      {parts.length > 0 ? (
        <div className="text-sm">
          {parts.map((part, index) => {
            if (typeof part === 'string') {
              return <span key={index} className="whitespace-pre-wrap">{part}</span>;
            }

            const isMapLink = part.url.includes('google.com/maps');

            return (
              <a
                key={index}
                href={part.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 my-1 rounded-full text-xs font-medium transition-all cursor-pointer no-underline hover:scale-105 active:scale-95 ${
                  isMapLink
                    ? 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/30 shadow-sm'
                    : isUser
                      ? 'bg-primary-foreground/20 hover:bg-primary-foreground/30 text-primary-foreground'
                      : 'bg-muted-foreground/10 hover:bg-muted-foreground/20 text-foreground'
                }`}
              >
                {isMapLink && <MapPin className="h-3.5 w-3.5" />}
                <span>{part.text}</span>
                <ExternalLink className="h-3 w-3 opacity-60" />
              </a>
            );
          })}
        </div>
      ) : text ? (
        <p className="text-sm whitespace-pre-wrap">{text}</p>
      ) : null}

      {/* Location cards */}
      {locations.map((location, index) => (
        <LocationCard key={index} {...location} />
      ))}

      {/* Trip tables */}
      {tripTables.map((tableMarkdown, index) => (
        <TripTable key={index} markdown={tableMarkdown} />
      ))}
    </div>
  );
}

interface VehicleChatProps {
  deviceId: string;
  vehicleName: string;
  avatarUrl?: string | null;
  nickname?: string | null;
}

export function VehicleChat({ deviceId, vehicleName, avatarUrl, nickname }: VehicleChatProps) {
  const displayName = nickname || vehicleName;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const { user } = useAuth();
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);

  const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/vehicle-chat`;

  // Fetch chat history with React Query
  const { data: historyData, isLoading: historyLoading, refetch: refetchHistory } = useQuery({
    queryKey: ['vehicle-chat-history', deviceId, user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await (supabase as any)
        .from('vehicle_chat_history')
        .select('*')
        .eq('device_id', deviceId)
        .eq('user_id', user.id) // Filter by user_id so users only see their own messages
        .order('created_at', { ascending: true })
        .limit(100); // Increased limit to show more history

      if (error) throw error;
      return (data as ChatMessage[]) || [];
    },
    enabled: !!deviceId && !!user?.id,
    staleTime: 0, // Always consider data stale to refetch on mount
    refetchOnMount: true, // Refetch when component mounts
    refetchOnWindowFocus: true, // Refetch when window regains focus
  });

  // Fetch current vehicle telemetry for context
  const { data: vehicleContext } = useQuery({
    queryKey: ['vehicle-context', deviceId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('vehicle_positions')
        .select('*')
        .eq('device_id', deviceId)
        .single();

      if (error) throw error;
      return data as any;
    },
    enabled: !!deviceId,
    refetchInterval: 30000 // Refresh every 30s for live context
  });

  // Update messages when history loads
  useEffect(() => {
    if (historyData) {
      setMessages(historyData);
    }
  }, [historyData]);

  // Set up realtime subscription for new messages
  useEffect(() => {
    if (!user?.id || !deviceId) return;
    
    const channel = supabase
      .channel(`vehicle_chat:${deviceId}:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'vehicle_chat_history',
          filter: `device_id=eq.${deviceId}`
        },
        (payload) => {
          const newMessage = payload.new as ChatMessage;
          // Only add messages for this user
          if ((newMessage as any).user_id === user.id) {
            setMessages(prev => {
              // Avoid duplicates
              if (prev.some(m => m.id === newMessage.id)) return prev;
              return [...prev, newMessage];
            });
            // Refetch history to ensure we have the latest
            refetchHistory();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [deviceId, user?.id, refetchHistory]);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  const handleSend = async () => {
    if (!input.trim() || !user) return;

    const userMessage = input.trim();
    setInput("");
    setLoading(true);
    setStreamingContent("");

    // Optimistic UI - add user message immediately
    const tempUserMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: userMessage,
      created_at: new Date().toISOString()
    };
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      // Build rich context payload with live telemetry and client timestamp
      const contextPayload = {
        device_id: deviceId,
        message: userMessage,
        user_id: user.id,
        client_timestamp: new Date().toISOString(),
        live_telemetry: vehicleContext ? {
          speed: vehicleContext.speed,
          battery: vehicleContext.battery_percent,
          ignition: vehicleContext.ignition_on,
          latitude: vehicleContext.latitude,
          longitude: vehicleContext.longitude,
          is_online: vehicleContext.is_online,
          is_overspeeding: vehicleContext.is_overspeeding,
          total_mileage: vehicleContext.total_mileage,
          gps_time: vehicleContext.gps_time
        } : null
      };

      const response = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify(contextPayload)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to get response');
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';
      let buffer = '';

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.delta) {
                fullResponse += parsed.delta;
                setStreamingContent(fullResponse);
              }
            } catch {}
          }
        }
      }

      // Clear streaming content (message will come via realtime subscription)
      setStreamingContent("");
      
      // Wait a moment for database save to complete, then refetch
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Invalidate and refetch chat history to ensure messages are loaded
      await refetchHistory();
      
      // Verify messages were saved (check if our optimistic message was replaced with real one)
      const { data: verifyData } = await (supabase as any)
        .from('vehicle_chat_history')
        .select('id, content, created_at')
        .eq('device_id', deviceId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(2);
      
      if (verifyData && verifyData.length >= 2) {
        // Messages were saved successfully
        console.log('Chat messages verified in database');
      } else {
        console.warn('Warning: Chat messages may not have been saved to database');
        toast({
          title: "Warning",
          description: "Your message was sent but may not have been saved. Please refresh the page.",
          variant: "default"
        });
      }

    } catch (err) {
      console.error('Chat error:', err);
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to send message",
        variant: "destructive"
      });
      // Remove optimistic message on error
      setMessages(prev => prev.filter(m => m.id !== tempUserMsg.id));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[400px]">
      {/* Live telemetry indicator */}
      {vehicleContext && (
        <div className="mb-2 p-2 rounded-lg bg-muted/50 border border-border">
          <div className="grid grid-cols-4 gap-2 text-xs">
            <div className="flex items-center gap-1">
              <Gauge className="h-3 w-3 text-muted-foreground" />
              <span>{vehicleContext.speed || 0} km/h</span>
            </div>
            <div className="flex items-center gap-1">
              <Battery className={`h-3 w-3 ${
                vehicleContext.battery_percent > 50 ? 'text-green-500' :
                vehicleContext.battery_percent > 20 ? 'text-yellow-500' : 'text-red-500'
              }`} />
              <span>{vehicleContext.battery_percent || 0}%</span>
            </div>
            <div className="flex items-center gap-1">
              <Power className={`h-3 w-3 ${vehicleContext.ignition_on ? 'text-green-500' : 'text-muted-foreground'}`} />
              <span>{vehicleContext.ignition_on ? 'ON' : 'OFF'}</span>
            </div>
            <div className="flex items-center gap-1">
              <Navigation className="h-3 w-3 text-muted-foreground" />
              <span className={vehicleContext.is_online ? 'text-green-500' : 'text-muted-foreground'}>
                {vehicleContext.is_online ? 'Online' : 'Offline'}
              </span>
            </div>
          </div>
        </div>
      )}

      <ScrollArea className="flex-1 pr-4">
        <div className="space-y-4 pb-4">
          {historyLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading chat history...
            </div>
          ) : messages.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              {avatarUrl ? (
                <img src={avatarUrl} alt={displayName} className="h-12 w-12 rounded-full object-cover mb-3" />
              ) : (
                <Car className="h-12 w-12 mb-3 text-primary/50" />
              )}
              <p className="font-medium">Chat with {displayName}</p>
              <p className="text-sm text-center mt-1">
                Ask about location, battery, speed, or trip history
              </p>
            </div>
          ) : null}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" />
                  ) : (
                    <Bot className="h-4 w-4 text-primary" />
                  )}
                </div>
              )}
              <div
                className={`rounded-lg px-4 py-2 max-w-[80%] ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                }`}
              >
                <ChatMessageContent content={msg.content} isUser={msg.role === 'user'} />
              </div>
              {msg.role === 'user' && (
                <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                  <User className="h-4 w-4 text-primary-foreground" />
                </div>
              )}
            </div>
          ))}

          {/* Streaming response */}
          {streamingContent && (
            <div className="flex gap-3 justify-start">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" />
                ) : (
                  <Bot className="h-4 w-4 text-primary" />
                )}
              </div>
              <div className="rounded-lg px-4 py-2 max-w-[80%] bg-muted">
                <ChatMessageContent content={streamingContent} isUser={false} />
              </div>
            </div>
          )}

          {/* Loading indicator */}
          {loading && !streamingContent && (
            <div className="flex gap-3 justify-start">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Loader2 className="h-4 w-4 text-primary animate-spin" />
              </div>
              <div className="rounded-lg px-4 py-2 bg-muted">
                <p className="text-sm text-muted-foreground">Thinking...</p>
              </div>
            </div>
          )}

          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      <div className="flex gap-2 pt-4 border-t">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
          placeholder={`Ask ${displayName} something...`}
          disabled={loading}
          className="flex-1"
        />
        <Button onClick={handleSend} disabled={loading || !input.trim()} size="icon">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
