import { usePwaUpdates } from "@/hooks/usePwaUpdates";
import { Download, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function UpdatePrompt() {
  const { pendingUpdate, applyUpdate, dismissUpdate } = usePwaUpdates();

  if (!pendingUpdate) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-[90] md:left-auto md:right-6 md:max-w-sm animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-card shadow-neumorphic rounded-xl p-4 border border-border">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-full bg-primary/20">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-foreground text-sm">
              Update Available
            </h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              Version {pendingUpdate.version}
            </p>
            {pendingUpdate.release_notes && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {pendingUpdate.release_notes}
              </p>
            )}
          </div>

          {!pendingUpdate.is_mandatory && (
            <button
              onClick={dismissUpdate}
              className="p-1 hover:bg-muted rounded-full transition-colors shrink-0"
              aria-label="Dismiss update"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>

        <div className={cn(
          "mt-3 flex gap-2",
          pendingUpdate.is_mandatory ? "justify-end" : "justify-between"
        )}>
          {!pendingUpdate.is_mandatory && (
            <Button
              variant="ghost"
              size="sm"
              onClick={dismissUpdate}
              className="text-muted-foreground"
            >
              Later
            </Button>
          )}
          <Button
            size="sm"
            onClick={applyUpdate}
            className="gap-2 bg-primary hover:bg-primary/90"
          >
            <Download className="h-4 w-4" />
            Update Now
          </Button>
        </div>

        {pendingUpdate.is_mandatory && (
          <p className="text-xs text-orange-500 mt-2 text-center">
            This update is required to continue using the app
          </p>
        )}
      </div>
    </div>
  );
}
