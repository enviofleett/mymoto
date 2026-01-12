import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Rocket, History, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface AppUpdate {
  id: string;
  version: string;
  release_notes: string | null;
  is_mandatory: boolean;
  is_active: boolean;
  created_at: string;
}

export function PushUpdateCard() {
  const [version, setVersion] = useState("");
  const [releaseNotes, setReleaseNotes] = useState("");
  const [isMandatory, setIsMandatory] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [recentUpdates, setRecentUpdates] = useState<AppUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchRecentUpdates = async () => {
    // Using type assertion since table may not exist in generated types yet
    const { data, error } = await (supabase
      .from('app_updates' as any)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5)) as { data: AppUpdate[] | null; error: any };

    if (!error && data) {
      setRecentUpdates(data);
      // Pre-fill with incremented version
      if (data.length > 0) {
        const lastVersion = data[0].version;
        const parts = lastVersion.split('.').map(Number);
        parts[2] = (parts[2] || 0) + 1;
        setVersion(parts.join('.'));
      } else {
        setVersion('1.0.0');
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRecentUpdates();
  }, []);

  const handlePushUpdate = async () => {
    if (!version.trim()) {
      toast({
        title: "Version required",
        description: "Please enter a version number",
        variant: "destructive",
      });
      return;
    }

    // Validate version format (x.y.z)
    if (!/^\d+\.\d+\.\d+$/.test(version)) {
      toast({
        title: "Invalid version format",
        description: "Use semantic versioning (e.g., 1.2.3)",
        variant: "destructive",
      });
      return;
    }

    setIsPushing(true);
    try {
      // Deactivate all previous updates (type assertion for new table)
      await (supabase
        .from('app_updates' as any)
        .update({ is_active: false })
        .eq('is_active', true));

      // Insert new update
      const { error } = await (supabase
        .from('app_updates' as any)
        .insert({
          version: version.trim(),
          release_notes: releaseNotes.trim() || null,
          is_mandatory: isMandatory,
          is_active: true,
        }));

      if (error) throw error;

      toast({
        title: "Update pushed!",
        description: `Version ${version} is now being pushed to all users`,
      });

      // Reset form and refresh list
      setReleaseNotes("");
      setIsMandatory(false);
      fetchRecentUpdates();
    } catch (error) {
      console.error('Error pushing update:', error);
      toast({
        title: "Push failed",
        description: "Could not push the update. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsPushing(false);
    }
  };

  return (
    <Card className="shadow-neumorphic">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Rocket className="h-5 w-5 text-primary" />
          Push PWA Update
        </CardTitle>
        <CardDescription>
          Push updates to all users who have installed the PWA
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Version Input */}
        <div className="space-y-2">
          <Label htmlFor="version">Version Number</Label>
          <Input
            id="version"
            placeholder="1.4.0"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
          />
        </div>

        {/* Release Notes */}
        <div className="space-y-2">
          <Label htmlFor="notes">Release Notes (Optional)</Label>
          <Textarea
            id="notes"
            placeholder="What's new in this version..."
            value={releaseNotes}
            onChange={(e) => setReleaseNotes(e.target.value)}
            rows={3}
          />
        </div>

        {/* Mandatory Toggle */}
        <div className="flex items-center justify-between py-2">
          <div>
            <Label htmlFor="mandatory" className="text-sm font-medium">
              Mandatory Update
            </Label>
            <p className="text-xs text-muted-foreground">
              Users cannot dismiss this update
            </p>
          </div>
          <Switch
            id="mandatory"
            checked={isMandatory}
            onCheckedChange={setIsMandatory}
          />
        </div>

        {/* Push Button */}
        <Button
          onClick={handlePushUpdate}
          disabled={isPushing || !version.trim()}
          className="w-full gap-2"
        >
          {isPushing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Pushing...
            </>
          ) : (
            <>
              <Rocket className="h-4 w-4" />
              Push Update to All Users
            </>
          )}
        </Button>

        {/* Recent Updates */}
        <div className="pt-4 border-t border-border">
          <h4 className="text-sm font-medium flex items-center gap-2 mb-3">
            <History className="h-4 w-4 text-muted-foreground" />
            Recent Updates
          </h4>
          
          {loading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : recentUpdates.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No updates pushed yet
            </p>
          ) : (
            <div className="space-y-2">
              {recentUpdates.map((update) => (
                <div
                  key={update.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium">
                        v{update.version}
                      </span>
                      {update.is_active && (
                        <Badge variant="default" className="text-xs">
                          Active
                        </Badge>
                      )}
                      {update.is_mandatory && (
                        <Badge variant="secondary" className="text-xs">
                          Mandatory
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(update.created_at), 'MMM d, yyyy HH:mm')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
