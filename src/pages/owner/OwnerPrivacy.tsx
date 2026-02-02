import { useState, useEffect } from "react";
import { OwnerLayout } from "@/components/layouts/OwnerLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Shield, Loader2, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { formatLagos } from "@/lib/timezone";
import { format } from "date-fns";
import myMotoLogo from "@/assets/mymoto-logo-new.png";

interface TermsData {
  id: string;
  terms_content: string;
  version: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface UserAgreement {
  id: string;
  terms_version: string;
  agreed_at: string;
}

export default function OwnerPrivacy() {
  const { user } = useAuth();
  const [terms, setTerms] = useState<TermsData | null>(null);
  const [userAgreement, setUserAgreement] = useState<UserAgreement | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      fetchTerms();
      fetchUserAgreement();
    }
  }, [user]);

  const fetchTerms = async () => {
    try {
      // Get the most recent active term (in case multiple are active)
      const { data, error: queryError } = await (supabase as any)
        .from("privacy_security_terms")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (queryError) {
        if (queryError.code === 'PGRST116') {
          // No active terms found - this is okay, show message but don't treat as error
          setTerms(null);
          setError(null); // Don't show error, just show empty state
        } else if (queryError.code === '42P01') {
          // Table doesn't exist
          setError("Privacy & Security terms table does not exist. Please contact support.");
        } else {
          throw queryError;
        }
        return;
      }

      if (data) {
        setTerms(data);
      }
    } catch (err: any) {
      console.error("Error fetching privacy terms:", err);
      setError(err?.message || "Failed to load privacy & security terms");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUserAgreement = async () => {
    if (!user) return;

    try {
      const { data, error: queryError } = await (supabase as any)
        .from("user_terms_agreements")
        .select("*")
        .eq("user_id", user.id)
        .order("agreed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (queryError && queryError.code !== 'PGRST116') {
        console.error("Error fetching user agreement:", queryError);
        return;
      }

      if (data) {
        setUserAgreement(data);
      }
    } catch (err) {
      console.error("Error fetching user agreement:", err);
      // Don't set error state - this is non-critical
    }
  };

  const hasAgreedToCurrentVersion = () => {
    if (!terms || !userAgreement) return false;
    return userAgreement.terms_version === terms.version;
  };

  if (isLoading) {
    return (
      <OwnerLayout>
        <div className="flex flex-col min-h-full">
          <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm pt-[env(safe-area-inset-top)] -mt-[env(safe-area-inset-top)]">
            <div className="px-4 py-4">
              <div className="flex items-center gap-2.5">
                <img alt="MyMoto" className="w-6 h-6 object-contain" src={myMotoLogo} />
                <h1 className="text-xl font-bold text-foreground">Privacy & Security</h1>
              </div>
            </div>
          </div>
          <div className="flex-1 p-4 space-y-4">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-96 w-full" />
          </div>
        </div>
      </OwnerLayout>
    );
  }

  if (error) {
    return (
      <OwnerLayout>
        <div className="flex flex-col min-h-full">
          <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm pt-[env(safe-area-inset-top)] -mt-[env(safe-area-inset-top)]">
            <div className="px-4 py-4">
              <div className="flex items-center gap-2.5">
                <img alt="MyMoto" className="w-6 h-6 object-contain" src={myMotoLogo} />
                <h1 className="text-xl font-bold text-foreground">Privacy & Security</h1>
              </div>
            </div>
          </div>
          <div className="flex-1 p-4">
            <Card className="border-destructive">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-destructive">
                  <AlertCircle className="h-5 w-5" />
                  Error Loading Terms
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">{error}</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </OwnerLayout>
    );
  }

  return (
    <OwnerLayout>
      <div className="flex flex-col min-h-full">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm pt-[env(safe-area-inset-top)] -mt-[env(safe-area-inset-top)]">
          <div className="px-4 py-4">
            <div className="flex items-center gap-2.5">
              <img alt="MyMoto" className="w-6 h-6 object-contain" src={myMotoLogo} />
              <h1 className="text-xl font-bold text-foreground">Privacy & Security</h1>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-4 space-y-4">
          {/* Agreement Status Card */}
          {terms && (
            <Card className="border-0 bg-card shadow-neumorphic rounded-xl">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-primary" />
                    Terms Status
                  </CardTitle>
                  {hasAgreedToCurrentVersion() ? (
                    <Badge variant="default" className="bg-green-500">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Agreed
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-yellow-500 text-yellow-600">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      Not Agreed
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Current Version</span>
                  <Badge variant="secondary">{terms.version}</Badge>
                </div>
                {userAgreement && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Your Agreement</span>
                    <div className="flex items-center gap-2">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs">
                        {format(new Date(userAgreement.agreed_at), "MMM d, yyyy")}
                      </span>
                    </div>
                  </div>
                )}
                {terms.updated_at && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Last Updated</span>
                    <span className="text-xs">
                      {formatLagos(new Date(terms.updated_at), "MMM d, yyyy")}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Terms Content Card */}
          {terms && (
            <Card className="border-0 bg-card shadow-neumorphic rounded-xl">
              <CardHeader>
                <CardTitle>Privacy & Security Terms</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm max-w-none">
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">
                    {terms.terms_content}
                  </pre>
                </div>
              </CardContent>
            </Card>
          )}

          {/* No Terms Available */}
          {!terms && !error && (
            <Card className="border-0 bg-card shadow-neumorphic rounded-xl">
              <CardContent className="py-12 text-center space-y-4">
                <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">Privacy & Security terms are not available at this time.</p>
                <p className="text-xs text-muted-foreground">
                  Terms will be displayed here once they are configured by the administrator.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </OwnerLayout>
  );
}
