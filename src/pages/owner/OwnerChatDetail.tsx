import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useOwnerVehicles } from "@/hooks/useOwnerVehicles";
import { ArrowLeft, User, Send, Mic, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

const avatarColors = [
  "from-blue-500 to-purple-500",
  "from-cyan-500 to-teal-500",
  "from-orange-500 to-red-500",
];

export default function OwnerChatDetail() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: vehicles } = useOwnerVehicles();
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [historyLoading, setHistoryLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const vehicle = vehicles?.find(v => v.deviceId === deviceId);
  const vehicleName = vehicle?.name || "Vehicle";
  
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
      <div className="sticky top-0 z-10 bg-card border-b border-border px-4 py-3 safe-area-inset-top">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/owner")}
            className="shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          
          <div className="relative">
            <div className={cn(
              "w-10 h-10 rounded-full bg-gradient-to-br flex items-center justify-center",
              avatarColors[0]
            )}>
              <span className="text-lg">🚗</span>
            </div>
            <div className={cn(
              "absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-card",
              vehicle?.status === "online" ? "bg-green-500" : "bg-muted-foreground"
            )} />
          </div>

          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-foreground truncate">{vehicleName}</h2>
            <p className="text-xs text-muted-foreground">
              {vehicle?.status === "online" ? "Online" : "Offline"}
            </p>
          </div>

          <Button variant="ghost" size="icon">
            <User className="h-5 w-5" />
          </Button>
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
            <div className="flex flex-col items-center justify-center py-12">
              <div className={cn(
                "w-24 h-24 rounded-full bg-gradient-to-br flex items-center justify-center mb-4",
                avatarColors[0]
              )}>
                <span className="text-4xl">🚗</span>
              </div>
              <h3 className="font-semibold text-foreground mb-1">{vehicleName}</h3>
              <p className="text-sm text-muted-foreground text-center">
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
                <div className={cn(
                  "w-8 h-8 rounded-full bg-gradient-to-br flex items-center justify-center shrink-0",
                  avatarColors[0]
                )}>
                  <span className="text-sm">🚗</span>
                </div>
              )}
              <div
                className={cn(
                  "rounded-2xl px-4 py-2 max-w-[80%]",
                  msg.role === "user"
                    ? "bg-primary/10 rounded-br-sm"
                    : "bg-muted rounded-bl-sm"
                )}
              >
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                <p className="text-[10px] text-muted-foreground mt-1 text-right">
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              {msg.role === "user" && (
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                  <User className="h-4 w-4 text-primary-foreground" />
                </div>
              )}
            </div>
          ))}

          {streamingContent && (
            <div className="flex gap-2 justify-start">
              <div className={cn(
                "w-8 h-8 rounded-full bg-gradient-to-br flex items-center justify-center shrink-0",
                avatarColors[0]
              )}>
                <span className="text-sm">🚗</span>
              </div>
              <div className="rounded-2xl rounded-bl-sm px-4 py-2 max-w-[80%] bg-muted">
                <p className="text-sm whitespace-pre-wrap">{streamingContent}</p>
              </div>
            </div>
          )}

          {loading && !streamingContent && (
            <div className="flex gap-2 justify-start">
              <div className={cn(
                "w-8 h-8 rounded-full bg-gradient-to-br flex items-center justify-center shrink-0",
                avatarColors[0]
              )}>
                <Loader2 className="h-4 w-4 animate-spin text-white" />
              </div>
              <div className="rounded-2xl rounded-bl-sm px-4 py-2 bg-muted">
                <p className="text-sm text-muted-foreground">Thinking...</p>
              </div>
            </div>
          )}

          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="sticky bottom-0 bg-background border-t border-border px-4 py-3 safe-area-inset-bottom">
        <div className="flex items-center gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder={`Message ${vehicleName}...`}
            disabled={loading}
            className="flex-1 bg-muted/50 border-0 rounded-full h-11"
          />
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 h-11 w-11"
            disabled={loading}
          >
            <Mic className="h-5 w-5 text-muted-foreground" />
          </Button>
          <Button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            size="icon"
            className="shrink-0 rounded-full h-11 w-11"
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
