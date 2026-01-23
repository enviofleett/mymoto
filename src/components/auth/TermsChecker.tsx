import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { TermsAgreementDialog } from "./TermsAgreementDialog";
import { supabase } from "@/integrations/supabase/client";

export function TermsChecker({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const [showTermsDialog, setShowTermsDialog] = useState(false);
  const [hasCheckedTerms, setHasCheckedTerms] = useState(false);

  useEffect(() => {
    if (!isLoading && user && !hasCheckedTerms) {
      checkTermsAgreement();
    }
  }, [user, isLoading, hasCheckedTerms]);

  const checkTermsAgreement = async () => {
    if (!user) return;

    try {
      // Get current active terms version (get most recent if multiple exist)
      const { data: termsData } = await (supabase as any)
        .from("privacy_security_terms")
        .select("version")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!termsData) {
        // No terms set, allow user to proceed
        setHasCheckedTerms(true);
        return;
      }

      // Check if user has agreed to current version
      const { data: agreement } = await (supabase as any)
        .from("user_terms_agreements")
        .select("terms_version")
        .eq("user_id", user.id)
        .eq("terms_version", termsData.version)
        .maybeSingle();

      if (!agreement) {
        // User hasn't agreed to current version, show dialog
        setShowTermsDialog(true);
      } else {
        // User has agreed, allow to proceed
        setHasCheckedTerms(true);
      }
    } catch (error) {
      console.error("Error checking terms agreement:", error);
      // On error, allow user to proceed (fail open)
      setHasCheckedTerms(true);
    }
  };

  const handleAgreed = () => {
    setShowTermsDialog(false);
    setHasCheckedTerms(true);
  };

  // Only check terms if user is logged in
  // For unauthenticated users (like on /auth page), allow through immediately
  if (!user) {
    return <>{children}</>;
  }

  // Show loading or terms dialog while checking
  if (isLoading || !hasCheckedTerms) {
    return (
      <>
        {showTermsDialog && user && (
          <TermsAgreementDialog
            open={showTermsDialog}
            onAgreed={handleAgreed}
            userId={user.id}
          />
        )}
        {!showTermsDialog && (
          <div className="flex items-center justify-center min-h-screen">
            <div className="text-center space-y-2">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <p className="text-sm text-muted-foreground">Loading...</p>
            </div>
          </div>
        )}
      </>
    );
  }

  return <>{children}</>;
}
