import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, ArrowLeft, Mail } from 'lucide-react';
import { z } from 'zod';
import myMotoLogo from '@/assets/mymoto-logo-new.png';

const emailSchema = z.string().trim().email({ message: 'Invalid email address' });
const authSchema = z.object({
  email: emailSchema,
  password: z.string().min(6, { message: 'Password must be at least 6 characters' })
});

const Auth = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const { signIn, user, isAdmin, isLoading, isRoleLoaded } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user && !isLoading && isRoleLoaded) {
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

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    
    const result = emailSchema.safeParse(email);
    if (!result.success) {
      setError('Please enter a valid email address');
      return;
    }

    setIsSubmitting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth`,
    });
    setIsSubmitting(false);

    if (error) {
      setError(error.message);
    } else {
      setSuccess('Password reset email sent! Check your inbox.');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen min-h-[100dvh] flex flex-col items-center justify-center bg-background p-4">
        {/* Skeleton Logo */}
        <div className="mb-8 animate-pulse">
          <div className="w-32 h-32 rounded-full bg-muted shadow-neumorphic" />
        </div>

        {/* Skeleton Brand Name */}
        <div className="h-8 w-32 bg-muted rounded-md mb-2 animate-pulse" />
        <div className="h-4 w-48 bg-muted/60 rounded-md mb-8 animate-pulse" />

        {/* Skeleton Card */}
        <div className="w-full max-w-sm shadow-neumorphic border border-border/30 rounded-xl p-6 space-y-6">
          <div className="text-center space-y-2">
            <div className="h-6 w-32 bg-muted rounded-md mx-auto animate-pulse" />
            <div className="h-4 w-48 bg-muted/60 rounded-md mx-auto animate-pulse" />
          </div>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="h-4 w-12 bg-muted/60 rounded-md animate-pulse" />
              <div className="h-10 w-full bg-muted rounded-md shadow-neumorphic-inset animate-pulse" />
            </div>
            <div className="space-y-2">
              <div className="h-4 w-16 bg-muted/60 rounded-md animate-pulse" />
              <div className="h-10 w-full bg-muted rounded-md shadow-neumorphic-inset animate-pulse" />
            </div>
          </div>
          
          <div className="h-10 w-full bg-muted rounded-md shadow-neumorphic-button animate-pulse" />
        </div>

        <div className="h-3 w-32 bg-muted/40 rounded-md mt-8 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="min-h-screen min-h-[100dvh] flex flex-col items-center justify-center bg-background p-4">
      {/* Large Neumorphic Logo */}
      <div className="mb-8 animate-fade-in">
        <div className="relative">
          <div className="absolute inset-0 w-32 h-32 rounded-full bg-accent/20 animate-[pulse_3s_ease-in-out_infinite]" />
          
          <div className="relative w-32 h-32 rounded-full shadow-neumorphic bg-card flex items-center justify-center ring-4 ring-accent/40">
            <div className="w-28 h-28 rounded-full shadow-neumorphic-inset bg-card flex items-center justify-center">
              <img src={myMotoLogo} alt="MyMoto" className="w-20 h-20 object-contain drop-shadow-lg" />
            </div>
          </div>
        </div>
      </div>

      {/* Brand Name */}
      <h1 className="text-3xl font-bold text-foreground mb-2 tracking-tight">mymoto</h1>
      <p className="text-muted-foreground mb-8 text-center">Bond better with cars.</p>

      {/* Login / Forgot Password Card */}
      <Card className="w-full max-w-sm shadow-neumorphic border-border/30">
        <CardHeader className="text-center pb-4">
          <CardTitle className="text-xl">
            {isForgotPassword ? 'Reset Password' : 'Welcome Back'}
          </CardTitle>
          <CardDescription>
            {isForgotPassword 
              ? 'Enter your email to receive a reset link' 
              : 'Sign in to access your dashboard'}
          </CardDescription>
        </CardHeader>
        
        <form onSubmit={isForgotPassword ? handleForgotPassword : handleSignIn}>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            
            {success && (
              <Alert className="border-accent/50 bg-accent/10">
                <Mail className="h-4 w-4 text-accent" />
                <AlertDescription className="text-accent">{success}</AlertDescription>
              </Alert>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="login-email">Email</Label>
              <Input 
                id="login-email" 
                type="email" 
                placeholder="you@example.com" 
                value={email} 
                onChange={e => setEmail(e.target.value)} 
                className="shadow-neumorphic-inset border-border/30" 
                required 
              />
            </div>
            
            {!isForgotPassword && (
              <div className="space-y-2">
                <Label htmlFor="login-password">Password</Label>
                <Input 
                  id="login-password" 
                  type="password" 
                  placeholder="••••••••" 
                  value={password} 
                  onChange={e => setPassword(e.target.value)} 
                  className="shadow-neumorphic-inset border-border/30" 
                  required 
                />
              </div>
            )}
          </CardContent>
          
          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full shadow-neumorphic-button" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isForgotPassword ? 'Sending...' : 'Signing in...'}
                </>
              ) : (
                isForgotPassword ? 'Send Reset Link' : 'Sign In'
              )}
            </Button>
            
            <Button
              type="button"
              variant="ghost"
              className="w-full text-muted-foreground hover:text-foreground"
              onClick={() => {
                setIsForgotPassword(!isForgotPassword);
                setError(null);
                setSuccess(null);
              }}
            >
              {isForgotPassword ? (
                <>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Sign In
                </>
              ) : (
                'Forgot Password?'
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>

      {/* Footer */}
      <p className="text-xs text-muted-foreground mt-8 text-center">Powered by mymoto</p>
    </div>
  );
};

export default Auth;