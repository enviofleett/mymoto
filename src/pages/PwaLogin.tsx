import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { Car, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { z } from "zod";

const gps51Schema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export default function PwaLogin() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleGps51Login = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const validation = gps51Schema.safeParse({ username, password });
    if (!validation.success) {
      setError(validation.error.errors[0].message);
      return;
    }

    setIsSubmitting(true);

    try {
      // Call the GPS51 user auth edge function
      const { data, error: fnError } = await supabase.functions.invoke('gps51-user-auth', {
        body: { username, password }
      });

      if (fnError) {
        throw new Error(fnError.message || 'Connection failed');
      }

      if (data?.error) {
        setError(data.error);
        setIsSubmitting(false);
        return;
      }

      if (data?.success && data?.email) {
        setSuccess(`Welcome! Synced ${data.vehicleCount || 0} vehicle(s). Signing you in...`);
        
        // Sign in to Supabase with the synced credentials
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: data.email,
          password: password,
        });

        if (signInError) {
          setError('Account synced but sign-in failed. Please try again.');
          setIsSubmitting(false);
          return;
        }

        // Navigate to owner dashboard
        setTimeout(() => {
          navigate('/owner');
        }, 1000);
      } else {
        setError('Unexpected response. Please try again.');
        setIsSubmitting(false);
      }
    } catch (err) {
      console.error('GPS51 login error:', err);
      setError(err instanceof Error ? err.message : 'Failed to connect. Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen min-h-[100dvh] flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border bg-card">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
            <Car className="w-8 h-8 text-primary" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold text-foreground">MyMoto</CardTitle>
            <CardDescription className="text-muted-foreground mt-1">
              Sign in with your GPS51 account
            </CardDescription>
          </div>
        </CardHeader>
        
        <CardContent>
          <form onSubmit={handleGps51Login} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            
            {success && (
              <Alert className="border-green-500/50 bg-green-500/10">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <AlertDescription className="text-green-600">{success}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="gps51-username" className="text-foreground">GPS51 Username</Label>
              <Input
                id="gps51-username"
                type="text"
                placeholder="Enter your GPS51 username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isSubmitting}
                className="bg-background border-border"
                autoComplete="username"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="gps51-password" className="text-foreground">Password</Label>
              <Input
                id="gps51-password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
                className="bg-background border-border"
                autoComplete="current-password"
              />
            </div>

            <Button 
              type="submit" 
              className="w-full" 
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                'Sign In'
              )}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground text-center mt-6">
            Your vehicles will be automatically synced from GPS51
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
