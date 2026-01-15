import { useState, useEffect } from "react";
import { Shield, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface TermsAgreementDateProps {
  userId: string | undefined;
}

export function TermsAgreementDate({ userId }: TermsAgreementDateProps) {
  const [agreementDate, setAgreementDate] = useState<string | null>(null);
  const [termsVersion, setTermsVersion] = useState<string | null>(null);

  useEffect(() => {
    if (userId) {
      fetchAgreementDate();
    }
  }, [userId]);

  const fetchAgreementDate = async () => {
    try {
      // Get the latest agreement for this user
      const { data, error } = await (supabase as any)
        .from("user_terms_agreements")
        .select("agreed_at, terms_version")
        .eq("user_id", userId)
        .order("agreed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error("Error fetching terms agreement:", error);
        return;
      }

      if (data) {
        setAgreementDate(data.agreed_at);
        setTermsVersion(data.terms_version);
      }
    } catch (error) {
      console.error("Error fetching terms agreement:", error);
    }
  };

  if (!agreementDate) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2 pt-2 border-t border-border/50">
      <Shield className="h-3.5 w-3.5" />
      <span>
        Terms agreed: {format(new Date(agreementDate), "MMM d, yyyy 'at' h:mm a")}
        {termsVersion && ` (v${termsVersion})`}
      </span>
    </div>
  );
}
