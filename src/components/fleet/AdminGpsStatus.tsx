import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { RefreshCw, CheckCircle, AlertCircle, Clock, Timer } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface TokenStatus {
  hasToken: boolean;
  updatedAt: string | null;
  expiresAt: string | null;
  metadata: {
    refreshed_by?: string;
    refreshed_at?: string;
  } | null;
}

export function AdminGpsStatus() {
  const [tokenStatus, setTokenStatus] = useState<TokenStatus>({
    hasToken: false,
    updatedAt: null,
    expiresAt: null,
    metadata: null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { toast } = useToast();

  const fetchTokenStatus = async () => {
    try {
      const { data, error } = await (supabase
        .from('app_settings' as any)
        .select('value, metadata, updated_at, expires_at')
        .eq('key', 'gps_token')
        .maybeSingle() as any);

      if (error) {
        console.error('Error fetching token status:', error);
        return;
      }

      setTokenStatus({
        hasToken: !!data?.value,
        updatedAt: data?.updated_at || null,
        expiresAt: data?.expires_at || null,
        metadata: data?.metadata as TokenStatus['metadata'] || null,
      });
    } catch (error) {
      console.error('Failed to fetch token status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTokenStatus();
  }, []);

  // Auto-refresh token if expired or missing
  useEffect(() => {
    const autoRefreshIfNeeded = async () => {
      if (isLoading) return;

      const now = new Date();
      const expiresAt = tokenStatus.expiresAt ? new Date(tokenStatus.expiresAt) : null;
      const isExpired = expiresAt ? now >= expiresAt : true;

      if (!tokenStatus.hasToken || isExpired) {
        console.log("Token expired or missing. Attempting auto-refresh...");
        await handleRefreshToken();
      }
    };

    autoRefreshIfNeeded();
  }, [isLoading, tokenStatus.hasToken, tokenStatus.expiresAt]);

  const handleRefreshToken = async () => {
    setIsRefreshing(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast({
          title: 'Authentication Required',
          description: 'Please sign in to refresh the GPS token.',
          variant: 'destructive',
        });
        return;
      }

      const { data, error } = await supabase.functions.invoke('gps-auth', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) {
        console.error('Error refreshing token:', error);
        toast({
          title: 'Refresh Failed',
          description: error.message || 'Failed to refresh GPS token.',
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Token Refreshed',
        description: `GPS token refreshed. Valid until ${new Date(data.expires_at).toLocaleString()}`,
      });

      await fetchTokenStatus();
    } catch (error) {
      console.error('Failed to refresh token:', error);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred while refreshing the token.',
        variant: 'destructive',
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  const getTimeUntilExpiry = (expiresAt: string | null) => {
    if (!expiresAt) return null;
    const expires = new Date(expiresAt);
    const now = new Date();
    const diffMs = expires.getTime() - now.getTime();
    
    if (diffMs <= 0) return 'Expired';
    
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (diffHours > 0) return `${diffHours}h ${diffMinutes}m remaining`;
    return `${diffMinutes}m remaining`;
  };

  const isTokenValid = () => {
    if (!tokenStatus.hasToken || !tokenStatus.expiresAt) return false;
    return new Date() < new Date(tokenStatus.expiresAt);
  };

  if (isLoading) {
    return (
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg">GPS Token Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Loading status...
          </div>
        </CardContent>
      </Card>
    );
  }

  const tokenValid = isTokenValid();
  const timeUntilExpiry = getTimeUntilExpiry(tokenStatus.expiresAt);

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">GPS Token Status</CardTitle>
            <CardDescription>Manage GPS API authentication token</CardDescription>
          </div>
          <Badge 
            variant={tokenValid ? 'default' : 'destructive'}
            className="flex items-center gap-1"
          >
            {tokenValid ? (
              <>
                <CheckCircle className="h-3 w-3" />
                Active
              </>
            ) : (
              <>
                <AlertCircle className="h-3 w-3" />
                {tokenStatus.hasToken ? 'Expired' : 'No Token'}
              </>
            )}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Last Refreshed:</span>
            <span className="font-medium">{formatDate(tokenStatus.updatedAt)}</span>
          </div>
          
          {tokenStatus.expiresAt && (
            <div className="flex items-center gap-2 text-sm">
              <Timer className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Expires:</span>
              <span className={`font-medium ${tokenValid ? 'text-green-600' : 'text-red-500'}`}>
                {timeUntilExpiry}
              </span>
            </div>
          )}
          
          {tokenStatus.metadata?.refreshed_by && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground ml-6">Refreshed by:</span>
              <span className="font-medium">{tokenStatus.metadata.refreshed_by}</span>
            </div>
          )}
        </div>

        <Button
          onClick={handleRefreshToken}
          disabled={isRefreshing}
          className="w-full"
        >
          {isRefreshing ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Refreshing Token...
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh GPS Token
            </>
          )}
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          Token valid for 24 hours. Auto-refreshes when expired.
        </p>
      </CardContent>
    </Card>
  );
}
