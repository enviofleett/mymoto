import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  useAdminSupportTickets,
  useSupportMessages,
  useSupportQueues,
  useSupportRepresentatives,
  useSupportKnowledgeEntries,
  useAdminTicketReply,
  type SupportTicketStatus,
  type SupportTicketPriority,
} from "@/hooks/useSupportAgent";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Brain,
  Headset,
  LifeBuoy,
  Loader2,
  MessageSquare,
  Save,
  Send,
  Settings2,
  Users,
} from "lucide-react";
import { formatRelativeTime } from "@/lib/timezone";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS: SupportTicketStatus[] = ["new", "open", "pending_support", "pending_user", "resolved", "closed"];
const PRIORITY_OPTIONS: SupportTicketPriority[] = ["low", "normal", "high", "urgent"];

function statusVariant(status: SupportTicketStatus) {
  if (status === "resolved" || status === "closed") return "secondary";
  if (status === "pending_support") return "destructive";
  if (status === "pending_user") return "outline";
  return "default";
}

export default function AdminSupportAgent() {
  const queryClient = useQueryClient();

  const [ticketStatusFilter, setTicketStatusFilter] = useState<SupportTicketStatus | "all">("all");
  const [ticketPriorityFilter, setTicketPriorityFilter] = useState<SupportTicketPriority | "all">("all");
  const [ticketSearch, setTicketSearch] = useState("");
  const [ticketQueueFilter, setTicketQueueFilter] = useState<string | "all">("all");
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [adminReply, setAdminReply] = useState("");
  const [selectedRepresentativeId, setSelectedRepresentativeId] = useState<string | null>(null);

  const [newQueueName, setNewQueueName] = useState("");
  const [newQueueSlug, setNewQueueSlug] = useState("");
  const [newQueueDescription, setNewQueueDescription] = useState("");
  const [newQueueInstructions, setNewQueueInstructions] = useState("");

  const [newRepQueueId, setNewRepQueueId] = useState<string>("");
  const [newRepName, setNewRepName] = useState("");
  const [newRepRole, setNewRepRole] = useState("");
  const [newRepSignature, setNewRepSignature] = useState("");

  const [knowledgeQueueId, setKnowledgeQueueId] = useState<string | null>(null);
  const [knowledgeTitle, setKnowledgeTitle] = useState("");
  const [knowledgeContent, setKnowledgeContent] = useState("");
  const [knowledgeTags, setKnowledgeTags] = useState("");

  const [supportPrompt, setSupportPrompt] = useState("");
  const [supportModel, setSupportModel] = useState("");
  const [supportMaxDocs, setSupportMaxDocs] = useState("5");
  const [supportHandoffRules, setSupportHandoffRules] = useState("");

  const { data: queues } = useSupportQueues(false);
  const { data: reps } = useSupportRepresentatives();
  const { data: knowledgeEntries } = useSupportKnowledgeEntries();
  const { data: tickets, isLoading: ticketsLoading } = useAdminSupportTickets({
    status: ticketStatusFilter,
    priority: ticketPriorityFilter,
    queueId: ticketQueueFilter,
    search: ticketSearch,
  });
  const { data: messages, isLoading: messagesLoading } = useSupportMessages(selectedTicketId);
  const adminReplyMutation = useAdminTicketReply();

  const { data: publishedResourcePosts } = useQuery({
    queryKey: ["support-resource-posts-preview"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("resource_posts")
        .select("id,title,updated_at")
        .eq("is_published", true)
        .order("updated_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as Array<{ id: string; title: string; updated_at: string }>;
    },
  });

  const selectedTicket = useMemo(
    () => (tickets || []).find((t) => t.id === selectedTicketId) || null,
    [selectedTicketId, tickets]
  );

  useEffect(() => {
    if (!tickets || tickets.length === 0) {
      setSelectedTicketId(null);
      return;
    }
    if (selectedTicketId && tickets.some((t) => t.id === selectedTicketId)) return;
    setSelectedTicketId(tickets[0].id);
  }, [tickets, selectedTicketId]);

  useEffect(() => {
    const load = async () => {
      const keys = [
        "support_agent_system_prompt",
        "support_agent_model",
        "support_agent_max_context_docs",
        "support_agent_handoff_rules",
      ];
      const { data } = await (supabase as any).from("app_settings").select("key,value").in("key", keys);
      const rows = (data || []) as Array<{ key: string; value: string }>;
      const map = new Map(rows.map((r) => [r.key, r.value]));
      setSupportPrompt(map.get("support_agent_system_prompt") || "");
      setSupportModel(map.get("support_agent_model") || "");
      setSupportMaxDocs(map.get("support_agent_max_context_docs") || "5");
      setSupportHandoffRules(map.get("support_agent_handoff_rules") || "{}");
    };
    void load();
  }, []);

  useEffect(() => {
    if (!selectedTicketId) return;
    const channel = supabase
      .channel(`admin-support-ticket-${selectedTicketId}`)
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
          queryClient.invalidateQueries({ queryKey: ["admin-support-tickets"] });
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, selectedTicketId]);

  const saveIntelligence = useMutation({
    mutationFn: async () => {
      const rows = [
        { key: "support_agent_system_prompt", value: supportPrompt },
        { key: "support_agent_model", value: supportModel },
        { key: "support_agent_max_context_docs", value: supportMaxDocs },
        { key: "support_agent_handoff_rules", value: supportHandoffRules },
      ];
      const { error } = await (supabase as any).from("app_settings").upsert(rows, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => toast.success("Support intelligence settings saved"),
    onError: (error: any) => toast.error("Failed to save intelligence settings", { description: error?.message }),
  });

  const createQueue = useMutation({
    mutationFn: async () => {
      const payload = {
        name: newQueueName.trim(),
        slug: newQueueSlug.trim().toLowerCase(),
        description: newQueueDescription.trim() || null,
        routing_instructions: newQueueInstructions.trim() || null,
      };
      if (!payload.name || !payload.slug) throw new Error("Queue name and slug are required");
      const { error } = await (supabase as any).from("support_queues").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Queue created");
      setNewQueueName("");
      setNewQueueSlug("");
      setNewQueueDescription("");
      setNewQueueInstructions("");
      queryClient.invalidateQueries({ queryKey: ["support-queues"] });
    },
    onError: (error: any) => toast.error("Failed to create queue", { description: error?.message }),
  });

  const createRepresentative = useMutation({
    mutationFn: async () => {
      if (!newRepName.trim() || !newRepQueueId) throw new Error("Representative name and queue are required");
      const { error } = await (supabase as any).from("support_representatives").insert({
        queue_id: newRepQueueId,
        name: newRepName.trim(),
        role_label: newRepRole.trim() || null,
        signature: newRepSignature.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Representative created");
      setNewRepName("");
      setNewRepRole("");
      setNewRepSignature("");
      queryClient.invalidateQueries({ queryKey: ["support-representatives"] });
    },
    onError: (error: any) => toast.error("Failed to create representative", { description: error?.message }),
  });

  const createKnowledge = useMutation({
    mutationFn: async () => {
      if (!knowledgeTitle.trim() || !knowledgeContent.trim()) throw new Error("Title and content are required");
      const tags = knowledgeTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const { error } = await (supabase as any).from("support_knowledge_entries").insert({
        queue_id: knowledgeQueueId || null,
        title: knowledgeTitle.trim(),
        content: knowledgeContent.trim(),
        tags,
        source: "manual",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Knowledge entry created");
      setKnowledgeTitle("");
      setKnowledgeContent("");
      setKnowledgeTags("");
      setKnowledgeQueueId(null);
      queryClient.invalidateQueries({ queryKey: ["support-knowledge-entries"] });
    },
    onError: (error: any) => toast.error("Failed to create knowledge entry", { description: error?.message }),
  });

  const updateTicketFields = useMutation({
    mutationFn: async (payload: {
      ticketId: string;
      status?: SupportTicketStatus;
      priority?: SupportTicketPriority;
      queue_id?: string | null;
      representative_id?: string | null;
    }) => {
      const { ticketId, ...rest } = payload;
      const { error } = await (supabase as any)
        .from("support_tickets")
        .update(rest)
        .eq("id", ticketId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-support-tickets"] }),
    onError: (error: any) => toast.error("Failed to update ticket", { description: error?.message }),
  });

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-32">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Headset className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Support Agent</h1>
            <p className="text-muted-foreground text-sm">
              Ticket operations, agent intelligence, queues, and knowledge.
            </p>
          </div>
        </div>

        <Tabs defaultValue="tickets" className="space-y-4">
          <TabsList>
            <TabsTrigger value="tickets"><MessageSquare className="h-4 w-4 mr-2" />Tickets</TabsTrigger>
            <TabsTrigger value="intelligence"><Brain className="h-4 w-4 mr-2" />Intelligence</TabsTrigger>
            <TabsTrigger value="queues"><Users className="h-4 w-4 mr-2" />Queues & Reps</TabsTrigger>
            <TabsTrigger value="knowledge"><LifeBuoy className="h-4 w-4 mr-2" />Knowledge</TabsTrigger>
          </TabsList>

          <TabsContent value="tickets">
            <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Inbox</CardTitle>
                  <CardDescription>Manage support tickets and routing</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Input placeholder="Search subject..." value={ticketSearch} onChange={(e) => setTicketSearch(e.target.value)} />
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      className="bg-card border border-border rounded-md h-9 px-2 text-sm"
                      value={ticketStatusFilter}
                      onChange={(e) => setTicketStatusFilter(e.target.value as any)}
                    >
                      <option value="all">All status</option>
                      {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <select
                      className="bg-card border border-border rounded-md h-9 px-2 text-sm"
                      value={ticketPriorityFilter}
                      onChange={(e) => setTicketPriorityFilter(e.target.value as any)}
                    >
                      <option value="all">All priority</option>
                      {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <select
                    className="bg-card border border-border rounded-md h-9 px-2 text-sm w-full"
                    value={ticketQueueFilter}
                    onChange={(e) => setTicketQueueFilter(e.target.value)}
                  >
                    <option value="all">All queues</option>
                    {(queues || []).map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
                  </select>
                  <ScrollArea className="h-[56vh] pr-2">
                    <div className="space-y-2">
                      {ticketsLoading ? (
                        <>
                          <Skeleton className="h-20" />
                          <Skeleton className="h-20" />
                        </>
                      ) : (tickets || []).map((ticket) => (
                        <button
                          key={ticket.id}
                          onClick={() => setSelectedTicketId(ticket.id)}
                          className={cn(
                            "w-full text-left p-3 rounded-lg border transition-all",
                            "hover:bg-muted/30",
                            selectedTicketId === ticket.id && "border-accent ring-1 ring-accent/40"
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-muted-foreground">#{ticket.ticket_no}</span>
                            <Badge variant={statusVariant(ticket.status)} className="capitalize">
                              {ticket.status.replace("_", " ")}
                            </Badge>
                          </div>
                          <div className="text-sm font-medium mt-1 line-clamp-1">{ticket.subject || "Support Request"}</div>
                          <div className="text-[11px] text-muted-foreground mt-1">
                            {ticket.updated_at ? formatRelativeTime(new Date(ticket.updated_at)) : "--"}
                          </div>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Ticket Detail</CardTitle>
                  <CardDescription>Two-way support conversation and controls</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!selectedTicket ? (
                    <div className="text-sm text-muted-foreground">Select a ticket to view messages.</div>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                        <select
                          className="bg-card border border-border rounded-md h-9 px-2 text-sm"
                          value={selectedTicket.status}
                          onChange={(e) =>
                            updateTicketFields.mutate({ ticketId: selectedTicket.id, status: e.target.value as SupportTicketStatus })
                          }
                        >
                          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <select
                          className="bg-card border border-border rounded-md h-9 px-2 text-sm"
                          value={selectedTicket.priority}
                          onChange={(e) =>
                            updateTicketFields.mutate({ ticketId: selectedTicket.id, priority: e.target.value as SupportTicketPriority })
                          }
                        >
                          {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                        </select>
                        <select
                          className="bg-card border border-border rounded-md h-9 px-2 text-sm"
                          value={selectedTicket.queue_id || ""}
                          onChange={(e) =>
                            updateTicketFields.mutate({
                              ticketId: selectedTicket.id,
                              queue_id: e.target.value || null,
                            })
                          }
                        >
                          <option value="">No queue</option>
                          {(queues || []).map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
                        </select>
                        <select
                          className="bg-card border border-border rounded-md h-9 px-2 text-sm"
                          value={selectedRepresentativeId || selectedTicket.representative_id || ""}
                          onChange={(e) => setSelectedRepresentativeId(e.target.value || null)}
                        >
                          <option value="">No representative</option>
                          {(reps || []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                      </div>

                      <ScrollArea className="h-[42vh] rounded-md border p-3">
                        <div className="space-y-2">
                          {messagesLoading ? (
                            <>
                              <Skeleton className="h-16 w-[80%]" />
                              <Skeleton className="h-16 w-[80%] ml-auto" />
                            </>
                          ) : (messages || []).map((m) => {
                            const mine = m.sender_type === "admin";
                            return (
                              <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                                <div
                                  className={cn(
                                    "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                                    mine ? "bg-primary text-primary-foreground" : "bg-muted"
                                  )}
                                >
                                  <div className="whitespace-pre-wrap">{m.content}</div>
                                  <div className="text-[10px] opacity-70 mt-1 capitalize">
                                    {m.sender_type} · {formatRelativeTime(new Date(m.created_at))}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </ScrollArea>

                      <div className="flex items-end gap-2">
                        <Textarea
                          rows={3}
                          value={adminReply}
                          onChange={(e) => setAdminReply(e.target.value)}
                          placeholder="Type a reply to the customer..."
                        />
                        <Button
                          onClick={() =>
                            adminReplyMutation.mutate({
                              ticket_id: selectedTicket.id,
                              message: adminReply,
                              representative_id: selectedRepresentativeId || selectedTicket.representative_id || null,
                              status: "pending_user",
                            }, {
                              onSuccess: () => setAdminReply(""),
                            })
                          }
                          disabled={!adminReply.trim() || adminReplyMutation.isPending}
                        >
                          {adminReplyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="intelligence">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Settings2 className="h-5 w-5" />Support Intelligence</CardTitle>
                <CardDescription>Control system prompt, model override, and handoff rules.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>System Prompt</Label>
                  <Textarea rows={8} value={supportPrompt} onChange={(e) => setSupportPrompt(e.target.value)} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Model Override</Label>
                    <Input value={supportModel} onChange={(e) => setSupportModel(e.target.value)} placeholder="e.g. openai/gpt-4o-mini" />
                  </div>
                  <div className="space-y-2">
                    <Label>Max Context Docs</Label>
                    <Input value={supportMaxDocs} onChange={(e) => setSupportMaxDocs(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Handoff Rules (JSON/text)</Label>
                  <Textarea rows={5} value={supportHandoffRules} onChange={(e) => setSupportHandoffRules(e.target.value)} />
                </div>
                <Button onClick={() => saveIntelligence.mutate()} disabled={saveIntelligence.isPending}>
                  {saveIntelligence.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Save Intelligence Settings
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="queues">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Queues</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Input placeholder="Queue name" value={newQueueName} onChange={(e) => setNewQueueName(e.target.value)} />
                  <Input placeholder="Queue slug (technical, sales...)" value={newQueueSlug} onChange={(e) => setNewQueueSlug(e.target.value)} />
                  <Input placeholder="Description" value={newQueueDescription} onChange={(e) => setNewQueueDescription(e.target.value)} />
                  <Textarea placeholder="Routing instructions for LLM" rows={4} value={newQueueInstructions} onChange={(e) => setNewQueueInstructions(e.target.value)} />
                  <Button onClick={() => createQueue.mutate()} disabled={createQueue.isPending}>
                    {createQueue.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Create Queue
                  </Button>
                  <div className="space-y-2 pt-2 border-t">
                    {(queues || []).map((q) => (
                      <div key={q.id} className="p-2 rounded border">
                        <div className="font-medium">{q.name} <span className="text-xs text-muted-foreground">({q.slug})</span></div>
                        <div className="text-xs text-muted-foreground">{q.description || "No description"}</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Representatives</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <select
                    className="bg-card border border-border rounded-md h-9 px-2 text-sm w-full"
                    value={newRepQueueId}
                    onChange={(e) => setNewRepQueueId(e.target.value)}
                  >
                    <option value="">Select queue</option>
                    {(queues || []).map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
                  </select>
                  <Input placeholder="Representative name" value={newRepName} onChange={(e) => setNewRepName(e.target.value)} />
                  <Input placeholder="Role label" value={newRepRole} onChange={(e) => setNewRepRole(e.target.value)} />
                  <Input placeholder="Signature (optional)" value={newRepSignature} onChange={(e) => setNewRepSignature(e.target.value)} />
                  <Button onClick={() => createRepresentative.mutate()} disabled={createRepresentative.isPending}>
                    {createRepresentative.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Create Representative
                  </Button>
                  <div className="space-y-2 pt-2 border-t">
                    {(reps || []).map((r) => (
                      <div key={r.id} className="p-2 rounded border">
                        <div className="font-medium">{r.name}</div>
                        <div className="text-xs text-muted-foreground">{r.role_label || "No role label"}</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="knowledge">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Manual Knowledge Entry</CardTitle>
                  <CardDescription>Create support-specific articles for the support agent.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <select
                    className="bg-card border border-border rounded-md h-9 px-2 text-sm w-full"
                    value={knowledgeQueueId || ""}
                    onChange={(e) => setKnowledgeQueueId(e.target.value || null)}
                  >
                    <option value="">All queues</option>
                    {(queues || []).map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
                  </select>
                  <Input placeholder="Title" value={knowledgeTitle} onChange={(e) => setKnowledgeTitle(e.target.value)} />
                  <Textarea rows={6} placeholder="Knowledge content..." value={knowledgeContent} onChange={(e) => setKnowledgeContent(e.target.value)} />
                  <Input placeholder="Tags (comma-separated)" value={knowledgeTags} onChange={(e) => setKnowledgeTags(e.target.value)} />
                  <Button onClick={() => createKnowledge.mutate()} disabled={createKnowledge.isPending}>
                    {createKnowledge.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Create Knowledge Entry
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Hybrid Sources Preview</CardTitle>
                  <CardDescription>
                    Agent uses manual knowledge + published resource posts.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-sm font-medium">Manual entries ({knowledgeEntries?.length || 0})</div>
                  <ScrollArea className="h-40 border rounded-md p-2">
                    <div className="space-y-2">
                      {(knowledgeEntries || []).map((k) => (
                        <div key={k.id} className="p-2 rounded border">
                          <div className="font-medium text-sm">{k.title}</div>
                          <div className="text-xs text-muted-foreground line-clamp-2">{k.content}</div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                  <div className="text-sm font-medium">Published resource posts ({publishedResourcePosts?.length || 0})</div>
                  <ScrollArea className="h-40 border rounded-md p-2">
                    <div className="space-y-2">
                      {(publishedResourcePosts || []).map((p) => (
                        <div key={p.id} className="p-2 rounded border">
                          <div className="font-medium text-sm">{p.title}</div>
                          <div className="text-xs text-muted-foreground">
                            Updated {formatRelativeTime(new Date(p.updated_at))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

