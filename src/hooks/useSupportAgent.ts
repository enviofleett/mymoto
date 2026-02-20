import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/integrations/supabase/edge";

export type SupportTicketStatus =
  | "new"
  | "open"
  | "pending_support"
  | "pending_user"
  | "resolved"
  | "closed";

export type SupportTicketPriority = "low" | "normal" | "high" | "urgent";

export interface SupportQueue {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  routing_instructions: string | null;
  is_active: boolean;
  display_order: number;
}

export interface SupportRepresentative {
  id: string;
  queue_id: string | null;
  name: string;
  role_label: string | null;
  signature: string | null;
  is_active: boolean;
  display_order: number;
}

export interface SupportTicket {
  id: string;
  ticket_no: number;
  user_id: string;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  queue_id: string | null;
  representative_id: string | null;
  subject: string | null;
  summary: string | null;
  created_by: "user" | "agent" | "admin";
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupportMessage {
  id: string;
  ticket_id: string;
  sender_type: "user" | "agent" | "admin" | "system";
  sender_user_id: string | null;
  representative_id: string | null;
  content: string;
  message_format: string;
  citations: Array<Record<string, unknown>>;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface SupportKnowledgeEntry {
  id: string;
  queue_id: string | null;
  title: string;
  content: string;
  tags: string[];
  is_active: boolean;
  source: "manual";
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useSupportQueues(activeOnly = false) {
  return useQuery({
    queryKey: ["support-queues", activeOnly],
    queryFn: async (): Promise<SupportQueue[]> => {
      let query = (supabase as any)
        .from("support_queues")
        .select("*")
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (activeOnly) query = query.eq("is_active", true);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as SupportQueue[];
    },
  });
}

export function useSupportRepresentatives(queueId?: string | null) {
  return useQuery({
    queryKey: ["support-representatives", queueId || "all"],
    queryFn: async (): Promise<SupportRepresentative[]> => {
      let query = (supabase as any)
        .from("support_representatives")
        .select("*")
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (queueId) query = query.eq("queue_id", queueId);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as SupportRepresentative[];
    },
  });
}

export function useOwnerSupportTickets() {
  return useQuery({
    queryKey: ["owner-support-tickets"],
    queryFn: async (): Promise<SupportTicket[]> => {
      const { data, error } = await (supabase as any)
        .from("support_tickets")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as SupportTicket[];
    },
  });
}

export function useAdminSupportTickets(params?: {
  status?: SupportTicketStatus | "all";
  queueId?: string | "all";
  priority?: SupportTicketPriority | "all";
  search?: string;
}) {
  return useQuery({
    queryKey: ["admin-support-tickets", params || {}],
    queryFn: async (): Promise<SupportTicket[]> => {
      let query = (supabase as any)
        .from("support_tickets")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(300);

      if (params?.status && params.status !== "all") query = query.eq("status", params.status);
      if (params?.queueId && params.queueId !== "all") query = query.eq("queue_id", params.queueId);
      if (params?.priority && params.priority !== "all") query = query.eq("priority", params.priority);
      if (params?.search?.trim()) query = query.ilike("subject", `%${params.search.trim()}%`);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as SupportTicket[];
    },
  });
}

export function useSupportMessages(ticketId: string | null) {
  return useQuery({
    queryKey: ["support-messages", ticketId],
    enabled: !!ticketId,
    queryFn: async (): Promise<SupportMessage[]> => {
      const { data, error } = await (supabase as any)
        .from("support_ticket_messages")
        .select("*")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return ((data || []).map((row: any) => ({
        ...row,
        citations: Array.isArray(row.citations) ? row.citations : [],
        metadata: row.metadata || {},
      })) as SupportMessage[]);
    },
  });
}

export function useSupportKnowledgeEntries() {
  return useQuery({
    queryKey: ["support-knowledge-entries"],
    queryFn: async (): Promise<SupportKnowledgeEntry[]> => {
      const { data, error } = await (supabase as any)
        .from("support_knowledge_entries")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return ((data || []).map((row: any) => ({
        ...row,
        tags: Array.isArray(row.tags) ? row.tags : [],
      })) as SupportKnowledgeEntry[]);
    },
  });
}

export function useSupportAgentChat() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      ticket_id?: string;
      message: string;
      queue_hint?: string;
      voice_meta?: { confidence?: number };
    }) => {
      const data = await invokeEdgeFunction<{
        ticket: SupportTicket;
        user_message: SupportMessage;
        agent_message: SupportMessage;
      }>("support-agent-chat", payload);
      return data;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["owner-support-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["admin-support-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["support-messages", result.ticket.id] });
    },
  });
}

export function useAdminTicketReply() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      ticket_id: string;
      message?: string;
      representative_id?: string | null;
      status?: SupportTicketStatus;
      priority?: SupportTicketPriority;
      queue_id?: string | null;
    }) => {
      const data = await invokeEdgeFunction<{
        ticket: SupportTicket;
        message: SupportMessage | null;
      }>("support-ticket-admin-reply", payload);
      return data;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["admin-support-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["owner-support-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["support-messages", result.ticket.id] });
    },
  });
}
