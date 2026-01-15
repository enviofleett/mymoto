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
      const { data, error } = await (supabase as any)
        .from("privacy_security_terms")
        .select("terms_content, version")
        .eq("is_active", true)
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
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Shield className="h-5 w-5 text-primary" />
            Privacy & Security Terms
          </DialogTitle>
          <DialogDescription>
            Please read and agree to our Privacy & Security Terms to continue using MyMoto.
            {version && (
              <span className="block mt-1 text-xs">
                Version {version} • Last updated: {format(new Date(), "MMMM d, yyyy")}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <Separator />

        <ScrollArea className="flex-1 pr-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground bg-muted/30 p-4 rounded-lg">
                {terms}
              </pre>
            </div>
          )}
        </ScrollArea>

        <Separator />

        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <Checkbox
              id="agree-terms"
              checked={agreed}
              onCheckedChange={(checked) => setAgreed(checked === true)}
              disabled={isLoading || isSaving}
              className="mt-1"
            />
            <Label
              htmlFor="agree-terms"
              className="text-sm leading-relaxed cursor-pointer"
            >
              I have read, understood, and agree to the Privacy & Security Terms outlined above.
              I acknowledge that my data will be processed according to these terms.
            </Label>
          </div>

          {!agreed && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span>You must agree to the terms to continue.</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            onClick={handleAgree}
            disabled={!agreed || isLoading || isSaving}
            className="w-full sm:w-auto"
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
