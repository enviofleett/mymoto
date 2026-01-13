import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Link2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import myMotoLogo from "@/assets/mymoto-logo-new.png";

const authSchema = z.object({
  email: z.string().trim().email({ message: 'Invalid email address' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters' }),
});

const gps51Schema = z.object({
  username: z.string().trim().min(1, { message: 'Username is required' }),
  password: z.string().min(1, { message: 'Password is required' }),
});

const Auth = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [gps51Username, setGps51Username] = useState('');
  const [gps51Password, setGps51Password] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('login');
  
  const { signIn, signUp, user, isAdmin, isLoading, isRoleLoaded } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user && !isLoading && isRoleLoaded) {
      // Role-based redirect: admins go to dashboard, owners go to chat
      const targetPath = isAdmin ? '/' : '/owner';
      navigate(targetPath);
    }
  }, [user, isAdmin, isLoading, isRoleLoaded, navigate]);

  const validateInput = () => {
    const result = authSchema.safeParse({ email, password });
    if (!result.success) {
      setError(result.error.errors[0].message);
      return false;
    }
    return true;
  };

  const validateGps51Input = () => {
    const result = gps51Schema.safeParse({ username: gps51Username, password: gps51Password });
    if (!result.success) {
      setError(result.error.errors[0].message);
      return false;
    }
    return true;
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (!validateInput()) return;
    
    setIsSubmitting(true);
    const { error } = await signIn(email, password);
    setIsSubmitting(false);
    
    if (error) {
      if (error.message.includes('Invalid login credentials')) {
        setError('Invalid email or password. Please try again.');
      } else {
        setError(error.message);
      }
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    
    if (!validateInput()) return;
    
    setIsSubmitting(true);
    const { error } = await signUp(email, password);
    setIsSubmitting(false);
    
    if (error) {
      if (error.message.includes('already registered')) {
        setError('This email is already registered. Please sign in instead.');
      } else {
        setError(error.message);
      }
    } else {
      setSuccess('Check your email for the confirmation link to complete registration.');
    }
  };

  const handleGps51Connect = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    
    if (!validateGps51Input()) return;
    
    setIsSubmitting(true);
    
    try {
      // Step 1: Call the GPS51 auth edge function
      const { data, error: fnError } = await supabase.functions.invoke('gps51-user-auth', {
        body: { username: gps51Username, password: gps51Password }
      });

      // Handle edge function errors - check data.error first (returned from function body)
      if (data?.error) {
        throw new Error(data.error);
      }

      if (fnError) {
        throw new Error(fnError.message || 'Failed to connect to GPS51');
      }

      if (!data?.success) {
        throw new Error('GPS51 authentication failed. Please check your credentials.');
      }

      setSuccess(`Account synced! ${data.vehiclesSynced || 0} vehicles imported. Logging you in...`);
      
      // Step 2: Sign in with the synced credentials
      const { error: signInError } = await signIn(data.email, gps51Password);
      
      if (signInError) {
        throw new Error('Account synced but login failed. Please try signing in with your GPS51 credentials.');
      }
      
      // Navigation will happen automatically via useEffect

    } catch (err: unknown) {
      console.error('GPS51 connect error:', err);
      const message = err instanceof Error ? err.message : 'Unable to connect to GPS51. Please try again.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen min-h-[100dvh] flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen min-h-[100dvh] flex flex-col items-center justify-center bg-background p-4">
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
          Fleet GPS Manager
        </p>
      </div>

      {/* Login Card with Neumorphic styling */}
      <Card className="w-full max-w-sm border-0 bg-card shadow-neumorphic rounded-2xl animate-fade-in [animation-delay:400ms]">
        <Tabs value={activeTab} onValueChange={(val) => { setActiveTab(val); setError(null); setSuccess(null); }} className="w-full">
          <CardHeader className="text-center space-y-4 pb-2">
            <TabsList className="grid w-full grid-cols-3 bg-card shadow-neumorphic-inset rounded-xl h-11">
              <TabsTrigger 
                value="login" 
                className="rounded-lg data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:shadow-neumorphic-button text-sm font-medium"
              >
                Sign In
              </TabsTrigger>
              <TabsTrigger 
                value="signup"
                className="rounded-lg data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:shadow-neumorphic-button text-sm font-medium"
              >
                Sign Up
              </TabsTrigger>
              <TabsTrigger 
                value="gps51" 
                className="rounded-lg data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:shadow-neumorphic-button text-sm font-medium flex items-center gap-1"
              >
                <Link2 className="h-3 w-3" />
                GPS51
              </TabsTrigger>
            </TabsList>
          </CardHeader>
          
          <TabsContent value="login" className="mt-0">
            <form onSubmit={handleSignIn}>
              <CardContent className="space-y-4 pt-2">
                <CardDescription className="text-center text-muted-foreground text-sm">
                  Sign in to your account
                </CardDescription>
                
                {error && (
                  <Alert variant="destructive" className="animate-fade-in shadow-neumorphic-inset border-0">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                
                <div className="space-y-2">
                  <Label htmlFor="login-email" className="text-foreground text-sm">Email</Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={isSubmitting}
                    className="bg-card border-0 shadow-neumorphic-inset h-12 rounded-xl focus-visible:ring-accent/50 text-foreground placeholder:text-muted-foreground"
                    autoComplete="email"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="login-password" className="text-foreground text-sm">Password</Label>
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isSubmitting}
                    className="bg-card border-0 shadow-neumorphic-inset h-12 rounded-xl focus-visible:ring-accent/50 text-foreground placeholder:text-muted-foreground"
                    autoComplete="current-password"
                  />
                </div>
                
                <Button 
                  type="submit" 
                  className="w-full mt-2 h-12 rounded-xl shadow-neumorphic-button bg-accent hover:bg-accent/90 text-accent-foreground font-semibold transition-all duration-200 hover:ring-2 hover:ring-accent/30" 
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    'Sign In'
                  )}
                </Button>
              </CardContent>
            </form>
          </TabsContent>
          
          <TabsContent value="signup" className="mt-0">
            <form onSubmit={handleSignUp}>
              <CardContent className="space-y-4 pt-2">
                <CardDescription className="text-center text-muted-foreground text-sm">
                  Create a new account
                </CardDescription>
                
                {error && (
                  <Alert variant="destructive" className="animate-fade-in shadow-neumorphic-inset border-0">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                
                {success && (
                  <Alert className="border-0 bg-status-active/10 shadow-neumorphic-inset animate-fade-in">
                    <CheckCircle2 className="h-4 w-4 text-status-active" />
                    <AlertDescription className="text-status-active">{success}</AlertDescription>
                  </Alert>
                )}
                
                <div className="space-y-2">
                  <Label htmlFor="signup-email" className="text-foreground text-sm">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={isSubmitting}
                    className="bg-card border-0 shadow-neumorphic-inset h-12 rounded-xl focus-visible:ring-accent/50 text-foreground placeholder:text-muted-foreground"
                    autoComplete="email"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="signup-password" className="text-foreground text-sm">Password</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isSubmitting}
                    className="bg-card border-0 shadow-neumorphic-inset h-12 rounded-xl focus-visible:ring-accent/50 text-foreground placeholder:text-muted-foreground"
                    autoComplete="new-password"
                  />
                </div>
                
                <Button 
                  type="submit" 
                  className="w-full mt-2 h-12 rounded-xl shadow-neumorphic-button bg-accent hover:bg-accent/90 text-accent-foreground font-semibold transition-all duration-200 hover:ring-2 hover:ring-accent/30" 
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating account...
                    </>
                  ) : (
                    'Create Account'
                  )}
                </Button>
              </CardContent>
            </form>
          </TabsContent>
          
          <TabsContent value="gps51" className="mt-0">
            <form onSubmit={handleGps51Connect}>
              <CardContent className="space-y-4 pt-2">
                <CardDescription className="text-center text-muted-foreground text-sm">
                  Connect your GPS51 account
                </CardDescription>
                
                {error && (
                  <Alert variant="destructive" className="animate-fade-in shadow-neumorphic-inset border-0">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                
                {success && (
                  <Alert className="border-0 bg-status-active/10 shadow-neumorphic-inset animate-fade-in">
                    <CheckCircle2 className="h-4 w-4 text-status-active" />
                    <AlertDescription className="text-status-active">{success}</AlertDescription>
                  </Alert>
                )}
                
                <div className="rounded-xl bg-card shadow-neumorphic-inset p-3 text-sm text-muted-foreground">
                  <p className="flex items-center gap-2">
                    <Link2 className="h-4 w-4 text-accent" />
                    Import your vehicles from GPS51
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="gps51-username" className="text-foreground text-sm">Username</Label>
                  <Input
                    id="gps51-username"
                    type="text"
                    placeholder="08012345678 or email"
                    value={gps51Username}
                    onChange={(e) => setGps51Username(e.target.value)}
                    required
                    disabled={isSubmitting}
                    className="bg-card border-0 shadow-neumorphic-inset h-12 rounded-xl focus-visible:ring-accent/50 text-foreground placeholder:text-muted-foreground"
                    autoComplete="username"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="gps51-password" className="text-foreground text-sm">Password</Label>
                  <Input
                    id="gps51-password"
                    type="password"
                    placeholder="••••••••"
                    value={gps51Password}
                    onChange={(e) => setGps51Password(e.target.value)}
                    required
                    disabled={isSubmitting}
                    className="bg-card border-0 shadow-neumorphic-inset h-12 rounded-xl focus-visible:ring-accent/50 text-foreground placeholder:text-muted-foreground"
                    autoComplete="current-password"
                  />
                </div>
                
                <Button 
                  type="submit" 
                  className="w-full mt-2 h-12 rounded-xl shadow-neumorphic-button bg-accent hover:bg-accent/90 text-accent-foreground font-semibold transition-all duration-200 hover:ring-2 hover:ring-accent/30" 
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Link2 className="mr-2 h-4 w-4" />
                      Connect & Import
                    </>
                  )}
                </Button>
              </CardContent>
            </form>
          </TabsContent>
        </Tabs>
      </Card>

      {/* Footer branding */}
      <p className="text-xs text-muted-foreground/60 mt-8 animate-fade-in [animation-delay:600ms]">
        Powered by mymoto
      </p>
    </div>
  );
};

export default Auth;
