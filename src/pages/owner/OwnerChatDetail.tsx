import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useOwnerVehicles } from "@/hooks/useOwnerVehicles";
import { useVehicleLLMSettings } from "@/hooks/useVehicleProfile";
import { ArrowLeft, Car, User, Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
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

  const vehicle = vehicles?.find(v => v.deviceId === deviceId);
  const vehicleName = llmSettings?.nickname || vehicle?.name || "Vehicle";
  const plateNumber = vehicle?.plateNumber || vehicle?.name || "";
  const hasNickname = llmSettings?.nickname && llmSettings.nickname !== plateNumber;
  const avatarUrl = llmSettings?.avatar_url || vehicle?.avatarUrl;
  
  const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/vehicle-chat`;

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
      const { data, error } = await supabase
        .from("vehicle_chat_history")
        .select("*")
        .eq("device_id", deviceId)
        .order("created_at", { ascending: true })
        .limit(50);

      if (error) throw error;
      setMessages((data as ChatMessage[]) || []);
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
      const response = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
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
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm border-b border-border/50 pt-[env(safe-area-inset-top)] -mt-[env(safe-area-inset-top)]">
        <div className="flex items-center gap-3 px-3 py-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/owner")}
            className="shrink-0 h-9 w-9"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          
          <div className="relative shrink-0">
            <Avatar className="w-9 h-9">
              <AvatarImage src={avatarUrl || undefined} alt={vehicleName} />
              <AvatarFallback className="bg-muted">
                <Car className="h-4 w-4 text-muted-foreground" />
              </AvatarFallback>
            </Avatar>
            <div className={cn(
              "absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-card",
              vehicle?.status === "online" ? "bg-status-active" : "bg-muted-foreground"
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
                  <Skeleton className="h-16 flex-1 rounded-lg" />
                </div>
              ))}
            </div>
          ) : messages.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Car className="h-7 w-7 text-muted-foreground" />
              </div>
              <h3 className="font-medium text-foreground mb-1">{vehicleName}</h3>
              <p className="text-xs text-muted-foreground text-center max-w-[200px]">
                Ask about location, battery, speed, or trip history
              </p>
            </div>
          ) : null}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex gap-2",
                msg.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              {msg.role === "assistant" && (
                <Avatar className="w-7 h-7 shrink-0">
                  <AvatarImage src={avatarUrl || undefined} alt={vehicleName} />
                  <AvatarFallback className="bg-muted">
                    <Car className="h-3.5 w-3.5 text-muted-foreground" />
                  </AvatarFallback>
                </Avatar>
              )}
              <div
                className={cn(
                  "rounded-2xl px-3.5 py-2.5 max-w-[75%]",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-md"
                    : "bg-muted text-foreground rounded-bl-md"
                )}
              >
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                <p className={cn(
                  "text-[10px] mt-1.5 text-right",
                  msg.role === "user" ? "text-primary-foreground/70" : "text-muted-foreground"
                )}>
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              {msg.role === "user" && (
                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                  <User className="h-3.5 w-3.5 text-primary" />
                </div>
              )}
            </div>
          ))}

          {streamingContent && (
            <div className="flex gap-2 justify-start">
              <Avatar className="w-7 h-7 shrink-0">
                <AvatarImage src={avatarUrl || undefined} alt={vehicleName} />
                <AvatarFallback className="bg-muted">
                  <Car className="h-3.5 w-3.5 text-muted-foreground" />
                </AvatarFallback>
              </Avatar>
              <div className="rounded-2xl rounded-bl-md px-3.5 py-2.5 max-w-[75%] bg-muted">
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{streamingContent}</p>
              </div>
            </div>
          )}

          {loading && !streamingContent && (
            <div className="flex gap-2 justify-start">
              <Avatar className="w-7 h-7 shrink-0">
                <AvatarImage src={avatarUrl || undefined} alt={vehicleName} />
                <AvatarFallback className="bg-muted">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                </AvatarFallback>
              </Avatar>
              <div className="rounded-2xl rounded-bl-md px-3.5 py-2.5 bg-muted">
                <p className="text-sm text-muted-foreground">Thinking...</p>
              </div>
            </div>
          )}

          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="sticky bottom-0 bg-card/95 backdrop-blur-sm border-t border-border/50 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="Type a message..."
            disabled={loading}
            className="flex-1 bg-muted/50 border-border/50 rounded-full h-10 text-sm px-4"
          />
          <Button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            size="icon"
            className="shrink-0 rounded-full h-10 w-10"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
