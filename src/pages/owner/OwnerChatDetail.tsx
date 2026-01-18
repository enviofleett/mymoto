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
  const [historyLoading, setHistoryLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch vehicle alerts
  const { data: vehicleAlerts } = useVehicleAlerts(deviceId ?? null, 20);

  const vehicle = vehicles?.find(v => v.deviceId === deviceId);
  const vehicleName = llmSettings?.nickname || vehicle?.name || "Vehicle";
  const plateNumber = vehicle?.plateNumber || vehicle?.name || "";
  const hasNickname = llmSettings?.nickname && llmSettings.nickname !== plateNumber;
  const avatarUrl = llmSettings?.avatar_url || vehicle?.avatarUrl;
  
  const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/vehicle-chat`;

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
    if (deviceId) {
      fetchHistory();
    }
  }, [deviceId]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      if (!user?.id) return;
      
      const { data, error } = await (supabase as any)
        .from("vehicle_chat_history")
        .select("*")
        .eq("device_id", deviceId)
        .eq("user_id", user.id) // Ensure users only see their own messages
        .order("created_at", { ascending: true })
        .limit(50);

      if (error) throw error;
      setMessages(((data as any[]) || []) as ChatMessage[]);
    } catch (err) {
      console.error("Error fetching chat history:", err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !user || !deviceId) return;

    const userMessage = input.trim();
    setInput("");
    setLoading(true);
    setStreamingContent("");

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
      const authToken = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      
      const response = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          device_id: deviceId,
          message: userMessage,
          user_id: user.id,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to get response");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullResponse = "";
      let buffer = "";

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;
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

      setStreamingContent("");
      if (fullResponse) {
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: fullResponse,
            created_at: new Date().toISOString(),
          },
        ]);
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
                    {format(new Date(msg.created_at), "MMM d, HH:mm")}
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
            placeholder="Type a message..."
            disabled={loading}
            className="flex-1 bg-card border-0 shadow-neumorphic-inset rounded-full h-12 text-sm px-5 focus-visible:ring-accent/30"
          />
          {/* Neumorphic send button */}
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
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
