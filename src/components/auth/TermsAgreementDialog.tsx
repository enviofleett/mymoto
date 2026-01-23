import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Shield, Loader2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface TermsAgreementDialogProps {
  open: boolean;
  onAgreed: () => void;
  userId: string;
}

export function TermsAgreementDialog({ open, onAgreed, userId }: TermsAgreementDialogProps) {
  const [terms, setTerms] = useState<string>("");
  const [version, setVersion] = useState<string>("");
  const [agreed, setAgreed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      fetchTerms();
    }
  }, [open]);

  const fetchTerms = async () => {
    setIsLoading(true);
    try {
      // Get most recent active terms (in case multiple are active)
      const { data, error } = await (supabase as any)
        .from("privacy_security_terms")
        .select("terms_content, version, updated_at")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setTerms(data.terms_content);
        setVersion(data.version);
      } else {
        // No terms set, allow user to proceed
        setTerms("No privacy & security terms have been set yet.");
        setVersion("N/A");
      }
    } catch (error) {
      console.error("Error fetching terms:", error);
      toast({
        title: "Error",
        description: "Failed to load terms. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAgree = async () => {
    if (!agreed) {
      toast({
        title: "Agreement Required",
        description: "Please check the box to agree to the terms.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      // Get user IP and user agent
      const ipAddress = await fetch('https://api.ipify.org?format=json')
        .then(res => res.json())
        .then(data => data.ip)
        .catch(() => 'Unknown');

      const userAgent = navigator.userAgent;

      // Record agreement
      const { error } = await (supabase as any)
        .from("user_terms_agreements")
        .insert({
          user_id: userId,
          terms_version: version,
          ip_address: ipAddress,
          user_agent: userAgent,
        });

      if (error) throw error;

      toast({
        title: "Terms Accepted",
        description: "Thank you for accepting our Privacy & Security Terms.",
      });

      onAgreed();
    } catch (error: any) {
      console.error("Error saving agreement:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to save agreement. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog 
      open={open} 
      onOpenChange={() => {}} // Prevent closing without agreeing
    >
      <DialogContent className="w-[95vw] max-w-3xl h-[90vh] max-h-[90vh] flex flex-col p-4 sm:p-6 m-4">
        <DialogHeader className="flex-shrink-0 pb-2">
          <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Shield className="h-5 w-5 text-primary flex-shrink-0" />
            <span>Privacy & Security Terms</span>
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm mt-1">
            Please read and agree to our Privacy & Security Terms to continue using MyMoto.
            {version && (
              <span className="block mt-1 text-xs text-muted-foreground">
                Version {version}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <Separator className="flex-shrink-0" />

        {/* Scrollable Terms Content */}
        <div className="flex-1 min-h-0 overflow-hidden mt-2">
          <ScrollArea className="h-full w-full pr-2 sm:pr-4">
            {isLoading ? (
              <div className="flex items-center justify-center h-full min-h-[200px]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <pre className="whitespace-pre-wrap font-sans text-xs sm:text-sm leading-relaxed text-foreground bg-muted/30 p-3 sm:p-4 rounded-lg break-words">
                  {terms}
                </pre>
              </div>
            )}
          </ScrollArea>
        </div>

        <Separator className="flex-shrink-0 mt-2" />

        {/* Agreement Checkbox Section */}
        <div className="flex-shrink-0 space-y-3 sm:space-y-4 mt-3 sm:mt-4">
          <div className="flex items-start space-x-2 sm:space-x-3">
            <Checkbox
              id="agree-terms"
              checked={agreed}
              onCheckedChange={(checked) => setAgreed(checked === true)}
              disabled={isLoading || isSaving}
              className="mt-0.5 sm:mt-1 flex-shrink-0"
            />
            <Label
              htmlFor="agree-terms"
              className="text-xs sm:text-sm leading-relaxed cursor-pointer"
            >
              I have read, understood, and agree to the Privacy & Security Terms outlined above.
              I acknowledge that my data will be processed according to these terms.
            </Label>
          </div>

          {!agreed && (
            <div className="flex items-center gap-2 text-xs sm:text-sm text-destructive">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>You must agree to the terms to continue.</span>
            </div>
          )}
        </div>

        <DialogFooter className="flex-shrink-0 mt-3 sm:mt-4">
          <Button
            onClick={handleAgree}
            disabled={!agreed || isLoading || isSaving}
            className="w-full sm:w-auto"
            size="default"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Shield className="h-4 w-4 mr-2" />
                I Agree & Continue
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
