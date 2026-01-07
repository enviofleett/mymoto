import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { Send, Bot, User, Loader2, Car } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

interface VehicleChatProps {
  deviceId: string;
  vehicleName: string;
}

export function VehicleChat({ deviceId, vehicleName }: VehicleChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [historyLoading, setHistoryLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/vehicle-chat`;

  useEffect(() => {
    fetchHistory();
  }, [deviceId]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from('vehicle_chat_history')
        .select('*')
        .eq('device_id', deviceId)
        .order('created_at', { ascending: true })
        .limit(50);
      
      if (error) throw error;
      setMessages((data as ChatMessage[]) || []);
    } catch (err) {
      console.error('Error fetching chat history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

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
      const response = await fetch(CHAT_URL, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`
        },
        body: JSON.stringify({
          device_id: deviceId,
          message: userMessage,
          user_id: user.id
        })
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

      // Replace streaming content with final message
      setStreamingContent("");
      if (fullResponse) {
        setMessages(prev => [
          ...prev,
          {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: fullResponse,
            created_at: new Date().toISOString()
          }
        ]);
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
      <ScrollArea className="flex-1 pr-4">
        <div className="space-y-4 pb-4">
          {historyLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading chat history...
            </div>
          ) : messages.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Car className="h-12 w-12 mb-3 text-primary/50" />
              <p className="font-medium">Chat with {vehicleName}</p>
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
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
              )}
              <div
                className={`rounded-lg px-4 py-2 max-w-[80%] ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
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
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div className="rounded-lg px-4 py-2 max-w-[80%] bg-muted">
                <p className="text-sm whitespace-pre-wrap">{streamingContent}</p>
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
          placeholder={`Ask ${vehicleName} something...`}
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
