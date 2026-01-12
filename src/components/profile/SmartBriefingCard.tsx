import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkles, MessageSquare } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface SmartBriefingCardProps {
  deviceId: string;
}

export function SmartBriefingCard({ deviceId }: SmartBriefingCardProps) {
  const { data: briefing, isLoading } = useQuery({
    queryKey: ['latest-briefing', deviceId],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from('vehicle_chat_history' as any)
        .select('content, created_at')
        .eq('device_id', deviceId)
        .eq('role', 'assistant')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle() as any);
      
      if (error) {
        console.error('Error fetching briefing:', error);
        return null;
      }
      return data as { content: string; created_at: string } | null;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!deviceId,
  });

  if (isLoading) {
    return (
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4">
          <div className="flex gap-3">
            <Skeleton className="h-5 w-5 shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-16 w-full" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!briefing) {
    return (
      <Card className="border-muted bg-muted/30">
        <CardContent className="p-4">
          <div className="flex gap-3 items-center">
            <MessageSquare className="h-5 w-5 text-muted-foreground shrink-0" />
            <div>
              <h4 className="text-sm font-medium text-foreground">No AI Insights Yet</h4>
              <p className="text-sm text-muted-foreground mt-1">
                Chat with your vehicle to get personalized insights and briefings.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
      <CardContent className="p-4">
        <div className="flex gap-3">
          <div className="p-2 rounded-lg bg-primary/20 shrink-0 h-fit">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
              AI Insight
            </h4>
            <p className="text-sm text-muted-foreground mt-1.5 line-clamp-3 leading-relaxed">
              {briefing.content}
            </p>
            <span className="text-xs text-muted-foreground/60 mt-2 block">
              {formatDistanceToNow(new Date(briefing.created_at), { addSuffix: true })}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
