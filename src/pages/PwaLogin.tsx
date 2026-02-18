import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { z } from "zod";
import myMotoLogo from "@/assets/mymoto-logo-new.png";
import {
  attachUserAttribution,
  captureAttributionFromUrl,
  setAnalyticsUserId,
  trackEvent,
  trackReturnMilestones,
} from "@/lib/analytics";
const gps51Schema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required")
});
export default function PwaLogin() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    captureAttributionFromUrl();
    void trackEvent("auth_view", { path: "/login", method: "gps51" });
  }, []);

  const handleGps51Login = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    void trackEvent("auth_submit", { mode: "signin", method: "gps51", path: "/login" });
    const validation = gps51Schema.safeParse({
      username,
      password
    });
    if (!validation.success) {
      setError(validation.error.errors[0].message);
      return;
    }
    setIsSubmitting(true);
    try {
      // Call the GPS51 user auth edge function
      const {
        data,
        error: fnError
      } = await supabase.functions.invoke('gps51-user-auth', {
        body: {
          username,
          password
        }
      });
      if (fnError) {
        void trackEvent("auth_error", { mode: "signin", method: "gps51", reason: fnError.message || "connection_failed" });
        throw new Error(fnError.message || 'Connection failed');
      }
      if (data?.error) {
        void trackEvent("auth_error", { mode: "signin", method: "gps51", reason: data.error });
        setError(data.error);
        setIsSubmitting(false);
        return;
      }
      if (data?.success && data?.email) {
        setSuccess(`Welcome! Synced ${data.vehicleCount || 0} vehicle(s). Signing you in...`);

        // Sign in to Supabase with the synced credentials
        const {
          error: signInError
        } = await supabase.auth.signInWithPassword({
          email: data.email,
          password: password
        });
        if (signInError) {
          void trackEvent("auth_error", { mode: "signin", method: "gps51", reason: signInError.message || "sign_in_failed_after_sync" });
          setError('Account synced but sign-in failed. Please try again.');
          setIsSubmitting(false);
          return;
        }

        const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
        if (userId) {
          setAnalyticsUserId(userId);
          void trackEvent("auth_success", { entry: "gps51" });
          void attachUserAttribution(userId);
          void trackReturnMilestones(userId);
        }

        // Navigate based on role
        setTimeout(async () => {
          const { data: roles } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', (await supabase.auth.getUser()).data.user?.id);
            
          const isProvider = roles?.some(r => r.role === 'service_provider');
          const isAdmin = roles?.some(r => r.role === 'admin');

          if (isAdmin) navigate('/admin/dashboard');
          else if (isProvider) navigate('/partner/dashboard');
          else navigate('/owner/vehicles');
        }, 1000);
      } else {
        void trackEvent("auth_error", { mode: "signin", method: "gps51", reason: "unexpected_response" });
        setError('Unexpected response. Please try again.');
        setIsSubmitting(false);
      }
    } catch (err) {
      console.error('GPS51 login error:', err);
      void trackEvent("auth_error", {
        mode: "signin",
        method: "gps51",
        reason: err instanceof Error ? err.message : "unknown_error",
      });
      setError(err instanceof Error ? err.message : 'Failed to connect. Please try again.');
      setIsSubmitting(false);
    }
  };
  return <div className="min-h-screen min-h-[100dvh] flex flex-col items-center justify-center bg-background p-4">
      {/* Animated Logo with Neumorphic Glow */}
      <div className="mb-8 animate-fade-in">
        <div className="relative">
          {/* Neumorphic circle container */}
          <div className="w-24 h-24 rounded-full shadow-neumorphic bg-card flex items-center justify-center">
            <img src={myMotoLogo} alt="MyMoto" className="h-20 w-20 object-contain animate-[scale-in_0.5s_ease-out]" />
          </div>
          {/* Orange glow effect */}
          <div className="absolute inset-0 -z-10 blur-3xl opacity-30">
            <div className="h-28 w-28 -ml-2 -mt-2 rounded-full bg-accent" />
          </div>
        </div>
      </div>

      {/* Welcome text with staggered animation */}
      <div className="text-center mb-6 animate-fade-in [animation-delay:200ms]">
        <h1 className="text-3xl font-bold text-foreground tracking-tight">
          MyMoto
        </h1>
        <p className="text-muted-foreground mt-1">
          Your Vehicle Companion
        </p>
      </div>

      {/* Login Card with Neumorphic styling */}
      <Card className="w-full max-w-sm border-0 bg-card shadow-neumorphic rounded-2xl animate-fade-in [animation-delay:400ms]">
        <CardHeader className="text-center space-y-2 pb-4">
          <CardTitle className="text-xl font-semibold text-foreground">Welcome Back</CardTitle>
          <CardDescription className="text-muted-foreground">
            Sign in to your account
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <form onSubmit={handleGps51Login} className="space-y-4">
            {error && <Alert variant="destructive" className="animate-fade-in shadow-neumorphic-inset border-0">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>}
            
            {success && <Alert className="border-0 bg-status-active/10 shadow-neumorphic-inset animate-fade-in">
                <CheckCircle2 className="h-4 w-4 text-status-active" />
                <AlertDescription className="text-status-active">{success}</AlertDescription>
              </Alert>}

            <div className="space-y-2">
              <Label htmlFor="gps51-username" className="text-foreground text-sm">Username</Label>
              <Input id="gps51-username" type="text" placeholder="Enter your username" value={username} onChange={e => setUsername(e.target.value)} disabled={isSubmitting} className="bg-card border-0 shadow-neumorphic-inset h-12 rounded-xl focus-visible:ring-accent/50 text-foreground placeholder:text-muted-foreground" autoComplete="username" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="gps51-password" className="text-foreground text-sm">Password</Label>
              <Input id="gps51-password" type="password" placeholder="Enter your password" value={password} onChange={e => setPassword(e.target.value)} disabled={isSubmitting} className="bg-card border-0 shadow-neumorphic-inset h-12 rounded-xl focus-visible:ring-accent/50 text-foreground placeholder:text-muted-foreground" autoComplete="current-password" />
            </div>

            <Button type="submit" className="w-full mt-2 h-12 rounded-xl shadow-neumorphic-button bg-accent hover:bg-accent/90 text-accent-foreground font-semibold transition-all duration-200 hover:ring-2 hover:ring-accent/30" disabled={isSubmitting}>
              {isSubmitting ? <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connecting...
                </> : 'Sign In'}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground text-center mt-6">
            Your vehicles will be automatically synced
          </p>

          <div className="mt-6 pt-6 border-t border-muted/20 text-center">
            <button
              type="button"
              onClick={() => navigate('/auth')}
              className="text-sm text-accent hover:underline"
            >
              Not using GPS51? Standard Login / Sign Up
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Footer branding */}
      <p className="text-xs text-muted-foreground/60 mt-8 animate-fade-in [animation-delay:600ms]">Powered by mymoto</p>
    </div>;
}
