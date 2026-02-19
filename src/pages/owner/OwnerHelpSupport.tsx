import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { OwnerLayout } from "@/components/layouts/OwnerLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useVoiceAgent } from "@/hooks/useVoiceAgent";
import {
  useOwnerSupportTickets,
  useSupportMessages,
  useSupportAgentChat,
  type SupportTicket,
} from "@/hooks/useSupportAgent";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  Headset,
  MessageSquarePlus,
  Mic,
  Send,
  Square,
  Loader2,
} from "lucide-react";
import { formatRelativeTime } from "@/lib/timezone";

type TicketFilter = "open" | "closed" | "all";

function getTicketStateVariant(status: SupportTicket["status"]) {
  if (status === "resolved" || status === "closed") return "secondary";
  if (status === "pending_support") return "destructive";
  if (status === "pending_user") return "outline";
  return "default";
}

export default function OwnerHelpSupport() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const listRef = useRef<HTMLDivElement>(null);

  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [filter, setFilter] = useState<TicketFilter>("open");
  const [input, setInput] = useState("");

  const { data: tickets, isLoading: ticketsLoading } = useOwnerSupportTickets();
  const { data: messages, isLoading: messagesLoading } = useSupportMessages(selectedTicketId);
  const sendToSupport = useSupportAgentChat();

  const visibleTickets = useMemo(() => {
    const rows = tickets || [];
    if (filter === "all") return rows;
    if (filter === "closed") return rows.filter((t) => t.status === "closed" || t.status === "resolved");
    return rows.filter((t) => t.status !== "closed" && t.status !== "resolved");
  }, [tickets, filter]);

  useEffect(() => {
    if (!tickets || tickets.length === 0) {
      setSelectedTicketId(null);
      return;
    }
    if (selectedTicketId && tickets.some((t) => t.id === selectedTicketId)) return;
    const preferred = tickets.find((t) => t.status !== "closed" && t.status !== "resolved") || tickets[0];
    setSelectedTicketId(preferred.id);
  }, [tickets, selectedTicketId]);

  useEffect(() => {
    if (!selectedTicketId) return;
    const channel = supabase
      .channel(`owner-support-ticket-${selectedTicketId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_ticket_messages",
          filter: `ticket_id=eq.${selectedTicketId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["support-messages", selectedTicketId] });
          queryClient.invalidateQueries({ queryKey: ["owner-support-tickets"] });
        }
      )
      .subscribe(() => {
        // query invalidation is handled by mutation; this guarantees passive updates
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, selectedTicketId]);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, sendToSupport.isPending]);

  const { capability, state, startRecording, stopRecording } = useVoiceAgent({
    lang: "en-NG",
    onFinalTranscript: (text) => {
      if (!text.trim()) return;
      setInput((prev) => (prev ? `${prev} ${text}` : text));
    },
    onError: (type, message) => {
      toast({
        title: type === "unsupported" ? "Voice unavailable" : "Voice error",
        description: message,
        variant: type === "unsupported" ? "default" : "destructive",
      });
    },
  });

  const handleSend = async () => {
    const message = input.trim();
    if (!message || sendToSupport.isPending) return;
    setInput("");
    try {
      const result = await sendToSupport.mutateAsync({
        ticket_id: selectedTicketId || undefined,
        message,
        voice_meta: {
          confidence: state.confidence ?? undefined,
        },
      });
      setSelectedTicketId(result.ticket.id);
    } catch (error: any) {
      setInput(message);
      toast({
        title: "Could not send support request",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  const selectedTicket = tickets?.find((t) => t.id === selectedTicketId) || null;
  const canSend = input.trim().length > 0 && !sendToSupport.isPending;

  return (
    <OwnerLayout>
      <div className="flex flex-col min-h-full">
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm pt-[env(safe-area-inset-top)] -mt-[env(safe-area-inset-top)]">
          <div className="px-4 py-4 flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/owner/profile")} className="p-2">
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <Headset className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold text-foreground">Help & Support</h1>
            </div>
            <Button
              className="ml-auto"
              size="sm"
              variant="outline"
              onClick={() => setSelectedTicketId(null)}
            >
              <MessageSquarePlus className="h-4 w-4 mr-1" />
              New Request
            </Button>
          </div>
        </div>

        <div className="flex-1 p-4 pb-32 space-y-4">
          <div className="flex items-center gap-2">
            <Button size="sm" variant={filter === "open" ? "default" : "outline"} onClick={() => setFilter("open")}>
              Open
            </Button>
            <Button size="sm" variant={filter === "closed" ? "default" : "outline"} onClick={() => setFilter("closed")}>
              Closed
            </Button>
            <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>
              All
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
            <Card className="border-0 bg-card shadow-neumorphic rounded-xl">
              <CardContent className="p-3 space-y-2">
                {ticketsLoading ? (
                  <>
                    <Skeleton className="h-16 rounded-lg" />
                    <Skeleton className="h-16 rounded-lg" />
                  </>
                ) : visibleTickets.length === 0 ? (
                  <div className="text-sm text-muted-foreground p-3">
                    No tickets yet. Start a new support request.
                  </div>
                ) : (
                  visibleTickets.map((ticket) => (
                    <button
                      key={ticket.id}
                      onClick={() => setSelectedTicketId(ticket.id)}
                      className={cn(
                        "w-full text-left rounded-lg px-3 py-2 transition-all duration-200",
                        "bg-card shadow-neumorphic-sm hover:shadow-neumorphic",
                        selectedTicketId === ticket.id && "ring-2 ring-accent/40"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">#{ticket.ticket_no}</span>
                        <Badge variant={getTicketStateVariant(ticket.status)} className="capitalize">
                          {ticket.status.replace("_", " ")}
                        </Badge>
                      </div>
                      <div className="text-sm font-medium mt-1 line-clamp-1">
                        {ticket.subject || "Support Request"}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-1">
                        {ticket.updated_at ? formatRelativeTime(new Date(ticket.updated_at)) : "--"}
                      </div>
                    </button>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="border-0 bg-card shadow-neumorphic rounded-xl">
              <CardContent className="p-0 flex flex-col h-[70vh]">
                <div className="border-b border-border/30 px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-foreground">
                        {selectedTicket ? `Ticket #${selectedTicket.ticket_no}` : "New Support Request"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {selectedTicket
                          ? `${selectedTicket.subject || "Support Request"}`
                          : "Describe your issue and the agent will create a ticket."}
                      </div>
                    </div>
                    {selectedTicket && (
                      <Badge variant={getTicketStateVariant(selectedTicket.status)} className="capitalize">
                        {selectedTicket.status.replace("_", " ")}
                      </Badge>
                    )}
                  </div>
                </div>

                <ScrollArea className="flex-1 px-4 py-3">
                  <div ref={listRef} className="space-y-3">
                    {messagesLoading ? (
                      <>
                        <Skeleton className="h-16 w-[80%] rounded-lg" />
                        <Skeleton className="h-16 w-[80%] rounded-lg ml-auto" />
                      </>
                    ) : (messages || []).length === 0 ? (
                      <div className="text-sm text-muted-foreground text-center py-10">
                        Start by describing your technical issue, sales question, or any support request.
                      </div>
                    ) : (
                      (messages || []).map((msg) => {
                        const mine = msg.sender_type === "user";
                        return (
                          <div key={msg.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                            <div
                              className={cn(
                                "max-w-[85%] rounded-xl px-3 py-2 text-sm",
                                mine
                                  ? "bg-accent text-accent-foreground shadow-neumorphic-sm"
                                  : "bg-card shadow-neumorphic-inset text-foreground"
                              )}
                            >
                              <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                              <div className="text-[10px] opacity-70 mt-1 capitalize">
                                {msg.sender_type} · {formatRelativeTime(new Date(msg.created_at))}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>

                <div className="border-t border-border/30 p-3">
                  <div className="flex items-end gap-2">
                    <Input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Describe your issue..."
                      className="bg-card shadow-neumorphic-inset border-0"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void handleSend();
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        if (state.isRecording) stopRecording();
                        else void startRecording();
                      }}
                      disabled={!capability.sttSupported || sendToSupport.isPending}
                      title={state.isRecording ? "Stop recording" : "Start voice input"}
                    >
                      {state.isRecording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    </Button>
                    <Button onClick={() => void handleSend()} disabled={!canSend}>
                      {sendToSupport.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                  {state.interimTranscript && (
                    <div className="text-[11px] text-muted-foreground mt-2">
                      Listening: {state.interimTranscript}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </OwnerLayout>
  );
}
