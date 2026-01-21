import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useOwnerVehicles } from "@/hooks/useOwnerVehicles";
import { useVehicleLLMSettings } from "@/hooks/useVehicleProfile";
import { useVehicleAlerts, formatAlertForChat } from "@/hooks/useVehicleAlerts";
import { ArrowLeft, Car, User, Send, Loader2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatMessageContent } from "@/components/chat/ChatMessageContent";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  isAlert?: boolean;
  severity?: 'info' | 'warning' | 'error' | 'critical';
}

export default function OwnerChatDetail() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: vehicles } = useOwnerVehicles();
  const { data: llmSettings } = useVehicleLLMSettings(deviceId ?? null);
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const isSendingRef = useRef(false); // Track if we're currently sending a message

  // Fetch vehicle alerts
  const { data: vehicleAlerts } = useVehicleAlerts(deviceId ?? null, 20);

  const vehicle = vehicles?.find(v => v.deviceId === deviceId);
  const vehicleName = llmSettings?.nickname || vehicle?.name || "Vehicle";
  const plateNumber = vehicle?.plateNumber || vehicle?.name || "";
  const hasNickname = llmSettings?.nickname && llmSettings.nickname !== plateNumber;
  const avatarUrl = llmSettings?.avatar_url || vehicle?.avatarUrl;
  
  const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/vehicle-chat`;

  // ✅ FIX: Use React Query for chat history with caching
  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['vehicle-chat-history', deviceId, user?.id],
    queryFn: async () => {
      if (!user?.id || !deviceId) return [];
      
      const { data, error } = await (supabase as any)
        .from("vehicle_chat_history")
        .select("id, role, content, created_at, device_id, user_id")
        .eq("device_id", deviceId)
        .eq("user_id", user.id) // Ensure users only see their own messages
        .order("created_at", { ascending: true })
        .limit(100); // Increased limit to show more history

      if (error) throw error;
      return ((data as any[]) || []) as ChatMessage[];
    },
    enabled: !!deviceId && !!user?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes - data fresh for longer (realtime handles updates)
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    refetchOnWindowFocus: false, // Realtime subscription handles updates
    refetchOnMount: false, // Don't refetch on mount if we have cached data
    refetchOnReconnect: false, // Don't refetch on reconnect (realtime handles it)
  });

  // ✅ FIX: Merge history data with existing messages (don't overwrite temp messages)
  useEffect(() => {
    // Don't merge if we're currently sending a message (to avoid race conditions)
    if (isSendingRef.current) {
      console.log('[Chat] Skipping history merge - message sending in progress');
      return;
    }
    
    if (historyData && historyData.length > 0) {
      setMessages(prev => {
        // Merge strategy: Keep temp messages, merge DB messages by ID
        const dbMessageIds = new Set(historyData.map(m => m.id));
        const tempMessages = prev.filter(m => m.id.startsWith('temp-'));
        const existingDbMessages = prev.filter(m => !m.id.startsWith('temp-') && dbMessageIds.has(m.id));
        const newDbMessages = historyData.filter(m => !existingDbMessages.some(ex => ex.id === m.id));
        
        // Combine: existing DB messages (keep order), new DB messages, temp messages
        const merged = [...existingDbMessages, ...newDbMessages, ...tempMessages];
        
        // Sort by created_at to maintain chronological order
        merged.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        
        console.log('[Chat] Merging history:', {
          historyCount: historyData.length,
          prevCount: prev.length,
          tempCount: tempMessages.length,
          mergedCount: merged.length,
          isSending: isSendingRef.current
        });
        
        return merged;
      });
    } else if (historyData && historyData.length === 0) {
      // Only clear if we have no temp messages (initial load)
      setMessages(prev => {
        const hasTempMessages = prev.some(m => m.id.startsWith('temp-'));
        if (!hasTempMessages && !isSendingRef.current) {
          return [];
        }
        // Keep temp messages even if history is empty
        return prev.filter(m => m.id.startsWith('temp-'));
      });
    }
  }, [historyData]);

  // ✅ FIX: Set up realtime subscription for new messages
  useEffect(() => {
    if (!user?.id || !deviceId) return;
    
    console.log('[Chat] Setting up realtime subscription for:', { deviceId, userId: user.id });
    
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
          console.log('[Chat] Realtime event received:', {
            event: payload.eventType,
            table: payload.table,
            new: payload.new
          });
          
          const newMessage = payload.new as ChatMessage;
          console.log('[Chat] New message from realtime:', {
            id: newMessage.id,
            role: newMessage.role,
            content: newMessage.content?.substring(0, 50) + '...',
            userId: newMessage.user_id,
            matchesCurrentUser: newMessage.user_id === user.id
          });
          
          // Only add messages for this user
          if (newMessage.user_id === user.id) {
            setMessages(prev => {
              // ✅ FIX: Replace temporary user messages with real DB messages
              // Check if this is a user message that matches a temporary one
              if (newMessage.role === 'user') {
                console.log('[Chat] Processing user message from realtime');
                // Find and remove temporary user message with matching content
                const filtered = prev.filter(m => 
                  !(m.id.startsWith('temp-') && m.role === 'user' && m.content === newMessage.content)
                );
                // Avoid duplicates - check by ID
                if (filtered.some(m => m.id === newMessage.id)) {
                  console.log('[Chat] User message already exists, skipping');
                  return filtered;
                }
                console.log('[Chat] Adding user message from realtime');
                return [...filtered, newMessage];
              } else {
                // Assistant messages - replace temporary messages with real DB message
                console.log('[Chat] Processing assistant message from realtime:', newMessage.id);
                // Remove any temporary assistant messages with matching content
                const filtered = prev.filter(m => 
                  !(m.id.startsWith('temp-assistant-') && m.role === 'assistant' && m.content === newMessage.content)
                );
                // Avoid duplicates - check by ID
                if (filtered.some(m => m.id === newMessage.id)) {
                  console.log('[Chat] Assistant message already exists, skipping');
                  return filtered;
                }
                console.log('[Chat] Adding assistant message from realtime, replacing temp');
                return [...filtered, newMessage];
              }
            });
          } else {
            console.log('[Chat] Message user_id does not match current user, ignoring');
          }
        }
      )
      .subscribe((status) => {
        console.log('[Chat] Realtime subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('[Chat] ✅ Realtime subscription active');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[Chat] ❌ Realtime subscription error');
        }
      });

    return () => {
      console.log('[Chat] Cleaning up realtime subscription');
      supabase.removeChannel(channel);
    };
  }, [deviceId, user?.id]);

  // Convert alerts to chat messages and merge with chat history
  const allMessages = useMemo(() => {
    const alertMessages: ChatMessage[] = (vehicleAlerts || []).map(alert => ({
      id: `alert-${alert.id}`,
      role: "assistant" as const,
      content: formatAlertForChat(alert),
      created_at: alert.created_at,
      isAlert: true,
      severity: alert.severity,
    }));

    // Merge and sort by date
    const combined = [...messages, ...alertMessages];
    combined.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    
    // Remove duplicates (same id)
    const seen = new Set<string>();
    return combined.filter(msg => {
      if (seen.has(msg.id)) return false;
      seen.add(msg.id);
      return true;
    });
  }, [messages, vehicleAlerts]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  const handleSend = async () => {
    if (!input.trim() || !user || !deviceId) return;

    const userMessage = input.trim();
    setInput("");
    setLoading(true);
    setStreamingContent("");
    isSendingRef.current = true; // Mark that we're sending

    const tempUserMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: userMessage,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      // Get the session token for proper authorization
      const { data: { session } } = await supabase.auth.getSession();
      
      // CRITICAL SECURITY FIX: Do not fallback to publishable key - require valid session
      if (!session?.access_token) {
        toast.error("Authentication required", {
          description: "Please sign in to send messages",
        });
        return;
      }
      
      console.log('[Chat] Sending message:', { deviceId, message: userMessage, userId: user.id });
      
      const response = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          device_id: deviceId,
          message: userMessage,
          user_id: user.id,
        }),
      });

      console.log('[Chat] Response status:', response.status, response.statusText);
      console.log('[Chat] Response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error('[Chat] Error response:', errorText);
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText || `HTTP ${response.status}: ${response.statusText}` };
        }
        throw new Error(errorData.error || `Failed to get response: ${response.status}`);
      }

      // Check content type - might be JSON error instead of stream
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const jsonData = await response.json();
        console.warn('[Chat] Received JSON instead of stream:', jsonData);
        if (jsonData.error) {
          throw new Error(jsonData.error);
        }
      }

      if (!response.body) {
        console.error('[Chat] No response body received');
        throw new Error('No response body from server');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = "";
      let buffer = "";
      let hasReceivedData = false;

      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            console.log('[Chat] Stream done. Full response length:', fullResponse.length);
            break;
          }

          hasReceivedData = true;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6).trim();
              if (data === "[DONE]") {
                console.log('[Chat] Received [DONE] marker');
                continue;
              }
              try {
                const parsed = JSON.parse(data);
                if (parsed.delta) {
                  fullResponse += parsed.delta;
                  setStreamingContent(fullResponse);
                  console.log('[Chat] Received delta, total length:', fullResponse.length);
                } else if (parsed.error) {
                  console.error('[Chat] Error in stream:', parsed.error);
                  throw new Error(parsed.error);
                }
              } catch (parseError) {
                console.warn('[Chat] Failed to parse stream data:', line, parseError);
              }
            }
          }
        }

        if (!hasReceivedData) {
          console.warn('[Chat] No data received in stream');
        }

        // ✅ FIX: Keep streaming content visible, add as temporary message if realtime doesn't arrive
        if (fullResponse) {
          console.log('[Chat] Full response received:', fullResponse.substring(0, 50) + '...');
          
          // Add as temporary assistant message immediately so user sees it
          const tempAssistantMsg: ChatMessage = {
            id: `temp-assistant-${Date.now()}`,
            role: "assistant",
            content: fullResponse,
            created_at: new Date().toISOString(),
          };
          setMessages(prev => {
            // Check if message already exists (from realtime)
            const exists = prev.some(m => 
              m.role === 'assistant' && 
              m.content === fullResponse &&
              !m.id.startsWith('temp-')
            );
            if (exists) {
              console.log('[Chat] Message already exists from realtime, skipping temp');
              return prev;
            }
            // Add temporary message
            return [...prev, tempAssistantMsg];
          });
          
          // Clear streaming content since we've added it as a message
          setStreamingContent("");
          
          // Don't set timeout to remove - keep temp message permanently if realtime doesn't arrive
          // The realtime subscription will replace it when it arrives
          // If realtime never arrives, the temp message stays (better than losing the message)
          console.log('[Chat] Temp assistant message added, will be replaced by realtime when it arrives');
        } else {
          setStreamingContent("");
        }
      } catch (streamError) {
        console.error('[Chat] Stream error:', streamError);
        throw streamError;
      } finally {
        reader.releaseLock();
      }
    } catch (err) {
      console.error("Chat error:", err);
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to send message",
        variant: "destructive",
      });
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
    } finally {
      setLoading(false);
      // Clear sending flag after a delay to allow realtime to process
      setTimeout(() => {
        isSendingRef.current = false;
        console.log('[Chat] Message send complete, allowing history merges');
      }, 3000); // 3 second buffer
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header - Neumorphic styling */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm pt-[env(safe-area-inset-top)] -mt-[env(safe-area-inset-top)]">
        <div className="flex items-center gap-3 px-4 py-3">
          {/* Neumorphic back button */}
          <button
            onClick={() => navigate("/owner")}
            className="w-10 h-10 rounded-full bg-card shadow-neumorphic-sm flex items-center justify-center transition-all duration-200 active:shadow-neumorphic-inset shrink-0"
          >
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </button>
          
          {/* Neumorphic avatar */}
          <div className="relative shrink-0">
            <div className="w-11 h-11 rounded-full shadow-neumorphic-sm bg-card p-0.5">
              <Avatar className="w-full h-full">
                <AvatarImage src={avatarUrl || undefined} alt={vehicleName} />
                <AvatarFallback className="bg-secondary">
                  <Car className="h-5 w-5 text-muted-foreground" />
                </AvatarFallback>
              </Avatar>
            </div>
            <div className={cn(
              "absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-card transition-all duration-300",
              vehicle?.status === "online" 
                ? "bg-status-active shadow-[0_0_8px_hsl(142_70%_50%/0.5)]" 
                : "bg-muted-foreground"
            )} />
          </div>

          <div className="flex-1 min-w-0">
            <h2 className="font-medium text-foreground text-sm truncate">
              {vehicleName}
              {hasNickname && (
                <span className="text-muted-foreground font-normal ml-1">
                  ({plateNumber})
                </span>
              )}
            </h2>
            <p className="text-[11px] text-muted-foreground">
              {vehicle?.status === "online" ? "Online" : "Offline"}
            </p>
          </div>
        </div>
      </div>

      {/* AI Disabled Warning */}
      {llmSettings && !llmSettings.llm_enabled && (
        <div className="mx-4 mt-2 mb-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-amber-600 dark:text-amber-500">
                AI Companion is paused for this vehicle
              </p>
              <p className="text-xs text-amber-600/80 dark:text-amber-500/80 mt-0.5">
                Enable it in vehicle settings to chat with {vehicleName}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      <ScrollArea className="flex-1 px-4">
        <div className="py-4 space-y-4">
          {historyLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-2">
                  <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                  <Skeleton className="h-16 flex-1 rounded-xl" />
                </div>
              ))}
            </div>
          ) : allMessages.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-20 h-20 rounded-full shadow-neumorphic bg-card flex items-center justify-center mb-4">
                <Car className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="font-medium text-foreground mb-1">{vehicleName}</h3>
              <p className="text-xs text-muted-foreground text-center max-w-[200px]">
                Ask about location, battery, speed, or trip history
              </p>
            </div>
          ) : null}

          {allMessages.map((msg) => {
            const isAlert = 'isAlert' in msg && msg.isAlert;
            const severity = 'severity' in msg ? msg.severity : undefined;
            
            // Alert-specific styling
            const getAlertBgClass = () => {
              if (!isAlert) return "";
              switch (severity) {
                case 'critical': return "bg-destructive/10 border border-destructive/30";
                case 'error': return "bg-destructive/10 border border-destructive/20";
                case 'warning': return "bg-accent/10 border border-accent/30";
                default: return "bg-secondary border border-border";
              }
            };

            return (
              <div
                key={msg.id}
                className={cn(
                  "flex gap-2",
                  msg.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {msg.role === "assistant" && (
                  <div className="w-8 h-8 rounded-full shadow-neumorphic-sm bg-card p-0.5 shrink-0">
                    <Avatar className="w-full h-full">
                      {isAlert ? (
                        <AvatarFallback className={cn(
                          severity === 'critical' || severity === 'error' 
                            ? "bg-destructive/20" 
                            : severity === 'warning' 
                              ? "bg-accent/20" 
                              : "bg-secondary"
                        )}>
                          <AlertTriangle className={cn(
                            "h-3.5 w-3.5",
                            severity === 'critical' || severity === 'error' 
                              ? "text-destructive" 
                              : severity === 'warning' 
                                ? "text-accent" 
                                : "text-muted-foreground"
                          )} />
                        </AvatarFallback>
                      ) : (
                        <>
                          <AvatarImage src={avatarUrl || undefined} alt={vehicleName} />
                          <AvatarFallback className="bg-secondary">
                            <Car className="h-3.5 w-3.5 text-muted-foreground" />
                          </AvatarFallback>
                        </>
                      )}
                    </Avatar>
                  </div>
                )}
                <div
                  className={cn(
                    "rounded-2xl px-4 py-3 max-w-[75%] shadow-neumorphic-sm",
                    msg.role === "user"
                      ? "bg-accent text-accent-foreground rounded-br-md"
                      : isAlert 
                        ? cn("rounded-bl-md bg-card", getAlertBgClass())
                        : "bg-card text-foreground rounded-bl-md"
                  )}
                >
                  {isAlert && (
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={cn(
                        "text-[10px] font-semibold uppercase tracking-wide",
                        severity === 'critical' || severity === 'error' 
                          ? "text-destructive" 
                          : severity === 'warning' 
                            ? "text-accent" 
                            : "text-muted-foreground"
                      )}>
                        {severity === 'critical' ? '🚨 Critical Alert' : 
                         severity === 'error' ? '⚠️ Alert' : 
                         severity === 'warning' ? '⚡ Warning' : 'ℹ️ Info'}
                      </span>
                    </div>
                  )}
                  <div className="text-sm whitespace-pre-wrap leading-relaxed">
                    <ChatMessageContent content={msg.content} isUser={msg.role === "user"} />
                  </div>
                  <p className={cn(
                    "text-[10px] mt-1.5 text-right",
                    msg.role === "user" ? "text-accent-foreground/70" : "text-muted-foreground"
                  )}>
                    {new Date(msg.created_at).toLocaleString('en-US', {
                      timeZone: 'Africa/Lagos',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                {msg.role === "user" && (
                  <div className="w-8 h-8 rounded-full shadow-neumorphic-sm bg-accent/20 flex items-center justify-center shrink-0">
                    <User className="h-3.5 w-3.5 text-accent" />
                  </div>
                )}
              </div>
            );
          })}

          {streamingContent && (
            <div className="flex gap-2 justify-start">
              <div className="w-8 h-8 rounded-full shadow-neumorphic-sm bg-card p-0.5 shrink-0">
                <Avatar className="w-full h-full">
                  <AvatarImage src={avatarUrl || undefined} alt={vehicleName} />
                  <AvatarFallback className="bg-secondary">
                    <Car className="h-3.5 w-3.5 text-muted-foreground" />
                  </AvatarFallback>
                </Avatar>
              </div>
              <div className="rounded-2xl rounded-bl-md px-4 py-3 max-w-[75%] bg-card shadow-neumorphic-sm">
                <div className="text-sm whitespace-pre-wrap leading-relaxed">
                  <ChatMessageContent content={streamingContent} isUser={false} />
                </div>
              </div>
            </div>
          )}

          {loading && !streamingContent && (
            <div className="flex gap-2 justify-start">
              <div className="w-8 h-8 rounded-full shadow-neumorphic-sm bg-card flex items-center justify-center shrink-0">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              </div>
              <div className="rounded-2xl rounded-bl-md px-4 py-3 bg-card shadow-neumorphic-sm">
                <p className="text-sm text-muted-foreground">Thinking...</p>
              </div>
            </div>
          )}

          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Input - Neumorphic styling */}
      <div className="sticky bottom-0 bg-background/95 backdrop-blur-sm px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-3">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder={llmSettings && !llmSettings.llm_enabled ? "AI Companion is paused. Enable it in settings to chat." : "Type a message..."}
            disabled={loading || (llmSettings && !llmSettings.llm_enabled)}
            className="flex-1 bg-card border-0 shadow-neumorphic-inset rounded-full h-12 text-sm px-5 focus-visible:ring-accent/30"
          />
          {/* Neumorphic send button */}
          <button
            onClick={handleSend}
            disabled={loading || !input.trim() || (llmSettings && !llmSettings.llm_enabled)}
            className={cn(
              "w-12 h-12 rounded-full bg-card shadow-neumorphic-sm flex items-center justify-center transition-all duration-200 shrink-0",
              "hover:shadow-neumorphic active:shadow-neumorphic-inset",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              input.trim() && "ring-2 ring-accent/50"
            )}
          >
            <Send className={cn("h-5 w-5", input.trim() ? "text-accent" : "text-muted-foreground")} />
          </button>
        </div>
      </div>
    </div>
  );
}
