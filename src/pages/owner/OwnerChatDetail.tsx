import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useOwnerVehicles } from "@/hooks/useOwnerVehicles";
import { useVehicleLLMSettings } from "@/hooks/useVehicleProfile";
import { useVehicleAlerts, formatAlertForChat } from "@/hooks/useVehicleAlerts";
import { ArrowLeft, Car, User, Send, Loader2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatMessageContent } from "@/components/chat/ChatMessageContent";
import { formatLagosDate } from "@/lib/timezone";
import { useQuery } from "@tanstack/react-query";
import { ErrorBoundary } from "@/components/ErrorBoundary";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  isAlert?: boolean;
  severity?: 'info' | 'warning' | 'error' | 'critical';
  user_id?: string;
  device_id?: string;
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
        // Fix: Fetch newest messages first, then let the UI sort them
        .order("created_at", { ascending: false }) 
        .limit(100); 

      if (error) throw error;
      return ((data as any[]) || []) as ChatMessage[];
    },
    enabled: !!deviceId && !!user?.id,
    // Fix: Remove aggressive caching that causes messages to disappear on navigation
    // We rely on this query to "catch up" on messages missed while unmounted
    staleTime: 0, 
    refetchOnMount: true,
    refetchOnWindowFocus: false, // Realtime handles updates while focused
  });

  // ✅ FIX #2: Improved history merge with better deduplication
  useEffect(() => {
    if (!historyData) return;
    
    setMessages(prev => {
      // ✅ FIX #2: Use Set for O(1) lookup instead of array filtering
      const existingIds = new Set(prev.map(m => m.id));
      const historyIds = new Set(historyData.map(m => m.id));
      
      // Separate temp messages from DB messages
      const tempMessages = prev.filter(m => m.id.startsWith('temp-'));
      const existingDbMessages = prev.filter(m => !m.id.startsWith('temp-'));
      
      // Find new messages from history that don't exist yet
      const newDbMessages = historyData.filter(m => !existingIds.has(m.id));
      
      // Combine: existing DB messages, new DB messages, temp messages
      const merged = [...existingDbMessages, ...newDbMessages, ...tempMessages];
      
      // ✅ FIX: Sort by created_at to maintain chronological order
      // If timestamps are identical or very close, ensure user messages come before assistant messages
      merged.sort((a, b) => {
        const timeA = new Date(a.created_at).getTime();
        const timeB = new Date(b.created_at).getTime();
        const diff = timeA - timeB;
        
        // If timestamps are within 100ms of each other, use role as tiebreaker
        // User messages should come before assistant messages
        if (Math.abs(diff) < 100) {
          if (a.role === 'user' && b.role === 'assistant') return -1;
          if (a.role === 'assistant' && b.role === 'user') return 1;
        }
        
        return diff;
      });
      
      // ✅ FIX #2: Final deduplication pass (shouldn't be needed, but safety check)
      const deduplicated: ChatMessage[] = [];
      const seenIds = new Set<string>();
      for (const msg of merged) {
        if (!seenIds.has(msg.id)) {
          seenIds.add(msg.id);
          deduplicated.push(msg);
        }
      }
      
      console.log('[Chat] Merging history:', {
        historyCount: historyData.length,
        prevCount: prev.length,
        tempCount: tempMessages.length,
        newCount: newDbMessages.length,
        mergedCount: deduplicated.length
      });
      
      return deduplicated;
    });
  }, [historyData]);

  // ✅ FIX #4: Set up realtime subscription with proper cleanup
  useEffect(() => {
    if (!user?.id || !deviceId) return;
    
    console.log('[Chat] Setting up realtime subscription for:', { deviceId, userId: user.id });
    
    let mounted = true; // ✅ FIX #4: Track if component is mounted
    let channel: ReturnType<typeof supabase.channel> | null = null;
    
    const setupSubscription = async () => {
      // Cleanup existing channel if any
      if (channel) {
        supabase.removeChannel(channel);
      }

      channel = supabase
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
            if (!mounted) return; // ✅ FIX #4: Don't update if unmounted
            
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
                // ✅ FIX #2: Better deduplication using Set for message IDs
                const messageIds = new Set(prev.map(m => m.id));
                
                // Skip if message already exists
                if (messageIds.has(newMessage.id)) {
                  console.log('[Chat] Message already exists, skipping');
                  return prev;
                }
                
                // Remove temporary messages with matching content
                const filtered = prev.filter(m => {
                  // Keep if it's not a temp message
                  if (!m.id.startsWith('temp-')) return true;
                  
                  // Remove temp messages that match the new message
                  if (m.role === newMessage.role && m.content === newMessage.content) {
                    console.log('[Chat] Removing temp message:', m.id);
                    return false;
                  }
                  
                  return true;
                });
                
                // ✅ FIX: Add new message in chronological order with role-based tiebreaker
                const updated = [...filtered, newMessage];
                updated.sort((a, b) => {
                  const timeA = new Date(a.created_at).getTime();
                  const timeB = new Date(b.created_at).getTime();
                  const diff = timeA - timeB;
                  
                  // If timestamps are within 100ms of each other, use role as tiebreaker
                  if (Math.abs(diff) < 100) {
                    if (a.role === 'user' && b.role === 'assistant') return -1;
                    if (a.role === 'assistant' && b.role === 'user') return 1;
                  }
                  
                  return diff;
                });
                
                return updated;
              });
            } else {
              console.log('[Chat] Message user_id does not match current user, ignoring');
            }
          }
        )
        .subscribe((status) => {
          if (!mounted) return;
          
          console.log('[Chat] Realtime subscription status:', status);
          if (status === 'SUBSCRIBED') {
            console.log('[Chat] ✅ Realtime subscription active');
          } else if (status === 'CHANNEL_ERROR') {
            console.error('[Chat] ❌ Realtime subscription error - retrying in 5s...');
            // Retry subscription after delay
            setTimeout(() => {
              if (mounted) setupSubscription();
            }, 5000);
          }
        });
    };
    
    setupSubscription();

    return () => {
      mounted = false; // ✅ FIX #4: Mark as unmounted
      if (channel) {
        console.log('[Chat] Cleaning up realtime subscription');
        supabase.removeChannel(channel);
      }
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

    // ✅ FIX: Merge and sort by date with role-based tiebreaker
    const combined = [...messages, ...alertMessages];
    combined.sort((a, b) => {
      const timeA = new Date(a.created_at).getTime();
      const timeB = new Date(b.created_at).getTime();
      const diff = timeA - timeB;
      
      // If timestamps are within 100ms of each other, use role as tiebreaker
      if (Math.abs(diff) < 100) {
        if (a.role === 'user' && b.role === 'assistant') return -1;
        if (a.role === 'assistant' && b.role === 'user') return 1;
      }
      
      return diff;
    });
    
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

  // ✅ FIX #5: Retry logic with exponential backoff
  const sendWithRetry = async (
    userMessage: string,
    tempUserMsg: ChatMessage,
    retryCount = 0
  ): Promise<void> => {
    const MAX_RETRIES = 3;
    const INITIAL_RETRY_DELAY = 1000; // 1 second
    const MAX_RETRY_DELAY = 10000; // 10 seconds

    // ✅ FIX #1: Add AbortController with timeout
    const controller = new AbortController();
    const REQUEST_TIMEOUT = 60000; // 60 seconds (increased from 30s to handle cold starts/LLM latency)
    const timeoutId = setTimeout(() => controller.abort("Request timed out after 60s"), REQUEST_TIMEOUT);

    try {
      // Get the session token for proper authorization
      const { data: { session } } = await supabase.auth.getSession();
      
      // CRITICAL SECURITY FIX: Do not fallback to publishable key - require valid session
      if (!session?.access_token) {
        toast({
          variant: "destructive",
          title: "Authentication required",
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
        signal: controller.signal, // ✅ FIX #1: Add abort signal
      });
      
      clearTimeout(timeoutId); // Clear timeout on success

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

        // Handle successful JSON response (non-streamed)
        // This handles the case where the backend returns a simple JSON response
        if (jsonData.text) {
          const fullResponse = jsonData.text;
          console.log('[Chat] JSON response received:', fullResponse.substring(0, 50) + '...');
          
          const tempAssistantMsg: ChatMessage = {
            id: `temp-assistant-${Date.now()}`,
            role: "assistant",
            content: fullResponse,
            created_at: new Date().toISOString(),
          };
          
          setMessages(prev => {
            const exists = prev.some(m => 
              m.role === 'assistant' && 
              m.content === fullResponse &&
              !m.id.startsWith('temp-')
            );
            if (exists) return prev;
            return [...prev, tempAssistantMsg];
          });
          
          setStreamingContent("");
          return; // Exit successfully
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
      const streamStartTime = Date.now();
      const STREAM_TIMEOUT = 120000; // 120 seconds max for stream
      const MAX_ITERATIONS = 10000; // Safety limit for iterations
      let iterationCount = 0;

      try {
        // ✅ FIX #7: Add timeout and iteration limit to stream reading
        while (iterationCount < MAX_ITERATIONS) {
          // Check for stream timeout
          if (Date.now() - streamStartTime > STREAM_TIMEOUT) {
            console.warn('[Chat] Stream timeout after 120s, closing stream');
            reader.cancel();
            throw new Error('Stream timeout: Response took too long');
          }

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
          
          iterationCount++;
        }
        
        if (iterationCount >= MAX_ITERATIONS) {
          console.warn('[Chat] Stream iteration limit reached, closing stream');
          reader.cancel();
          throw new Error('Stream iteration limit reached');
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
      clearTimeout(timeoutId); // ✅ FIX #1: Clear timeout on error
      
      console.error("Chat error:", err);

      // Check for specific Lovable API configuration error
      if (err instanceof Error && (
        err.message.includes("Lovable API error: 401") || 
        err.message.includes("Invalid API Key")
      )) {
        toast({
          title: "Configuration Error",
          description: "The AI service is not correctly configured (Invalid API Key). Please contact support.",
          variant: "destructive",
        });
        setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
        return;
      }
      
      // ✅ FIX #1: Handle timeout errors specifically
      const isTimeout = err instanceof Error && (
        err.name === 'AbortError' || 
        err.message.includes('timeout') ||
        err.message.includes('took too long')
      );
      
      // ✅ FIX #5: Retry logic for network errors
      const isNetworkError = err instanceof Error && (
        err.message.includes('Failed to fetch') ||
        err.message.includes('NetworkError') ||
        err.message.includes('network') ||
        (!isTimeout && retryCount < MAX_RETRIES)
      );
      
      if (isNetworkError && retryCount < MAX_RETRIES) {
        const retryDelay = Math.min(
          INITIAL_RETRY_DELAY * Math.pow(2, retryCount),
          MAX_RETRY_DELAY
        );
        
        console.log(`[Chat] Retrying in ${retryDelay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
        
        toast({
          title: "Retrying...",
          description: `Connection issue. Retrying in ${Math.round(retryDelay / 1000)}s...`,
          variant: "default",
        });
        
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return sendWithRetry(userMessage, tempUserMsg, retryCount + 1);
      }
      
      // Final error - no more retries
      toast({
        title: isTimeout ? "Request Timeout" : "Error",
        description: isTimeout 
          ? "The request took too long. Please try again."
          : err instanceof Error ? err.message : "Failed to send message",
        variant: "destructive",
      });
      
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
    } finally {
      setLoading(false);
      // ✅ FIX #2: Clear sending flag immediately (realtime will handle deduplication)
      isSendingRef.current = false;
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !user || !deviceId) return;
    if (loading) return; // Prevent multiple simultaneous sends

    const userMessage = input.trim();
    setInput("");
    setLoading(true);
    setStreamingContent("");
    isSendingRef.current = true; // Mark that we're sending

    const tempUserMsg: ChatMessage = {
      id: `temp-${Date.now()}-${Math.random()}`,
      role: "user",
      content: userMessage,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    await sendWithRetry(userMessage, tempUserMsg, 0);
  };

  return (
    <ErrorBoundary
      fallback={
        <div className="flex flex-col h-screen bg-background items-center justify-center p-4">
          <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
          <h2 className="text-lg font-semibold mb-2">Chat Error</h2>
          <p className="text-sm text-muted-foreground text-center mb-4">
            Something went wrong with the chat. Please refresh the page.
          </p>
          <Button onClick={() => window.location.reload()}>
            Refresh Page
          </Button>
        </div>
      }
    >
    <div className="flex flex-col h-screen bg-background">
      {/* Header - Neumorphic styling */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm pt-[env(safe-area-inset-top)] -mt-[env(safe-area-inset-top)]">
        <div className="flex items-center gap-3 px-4 py-3">
          {/* Neumorphic back button */}
          <button
            onClick={() => navigate("/owner/vehicles")}
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
        <div className="py-4 space-y-4 pb-24">
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
                    {formatLagosDate(msg.created_at, {
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
      <div className="sticky bottom-0 bg-background/95 backdrop-blur-sm px-4 max-[360px]:px-3 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-3">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder={llmSettings && !llmSettings.llm_enabled ? "AI Companion is paused. Enable it in settings to chat." : "Type a message..."}
            disabled={loading || (llmSettings && !llmSettings.llm_enabled)}
            className="flex-1 bg-card border-0 shadow-neumorphic-inset rounded-full h-12 max-[360px]:h-11 text-sm px-5 focus-visible:ring-accent/30"
          />
          {/* Neumorphic send button */}
          <button
            onClick={handleSend}
            disabled={loading || !input.trim() || (llmSettings && !llmSettings.llm_enabled)}
            className={cn(
              "w-12 h-12 max-[360px]:w-11 max-[360px]:h-11 rounded-full bg-card shadow-neumorphic-sm flex items-center justify-center transition-all duration-200 shrink-0",
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
    </ErrorBoundary>
  );
}
