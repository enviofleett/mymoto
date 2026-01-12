import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';
import { z } from 'zod';
import myMotoLogo from '@/assets/mymoto-logo-new.png';
const authSchema = z.object({
  email: z.string().trim().email({
    message: 'Invalid email address'
  }),
  password: z.string().min(6, {
    message: 'Password must be at least 6 characters'
  })
});
const Auth = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    signIn,
    user,
    isAdmin,
    isLoading,
    isRoleLoaded
  } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (user && !isLoading && isRoleLoaded) {
      // Role-based redirect: admins go to dashboard, owners go to chat
      const targetPath = isAdmin ? '/' : '/owner';
      navigate(targetPath);
    }
  }, [user, isAdmin, isLoading, isRoleLoaded, navigate]);
  const validateInput = () => {
    const result = authSchema.safeParse({
      email,
      password
    });
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
    const {
      error
    } = await signIn(email, password);
    setIsSubmitting(false);
    if (error) {
      if (error.message.includes('Invalid login credentials')) {
        setError('Invalid email or password. Please try again.');
      } else {
        setError(error.message);
      }
    }
  };
  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>;
  }
  return <div className="min-h-screen min-h-[100dvh] flex flex-col items-center justify-center bg-background p-4">
      {/* Large Neumorphic Logo */}
      <div className="mb-8 animate-fade-in">
        <div className="relative">
          {/* Pulsing ring */}
          <div className="absolute inset-0 w-32 h-32 rounded-full bg-accent/20 animate-[pulse_3s_ease-in-out_infinite]" />
          
          <div className="relative w-32 h-32 rounded-full shadow-neumorphic bg-card flex items-center justify-center ring-4 ring-accent/40">
            <div className="w-28 h-28 rounded-full shadow-neumorphic-inset bg-card flex items-center justify-center">
              <img src={myMotoLogo} alt="MyMoto" className="w-20 h-20 object-contain drop-shadow-lg" />
            </div>
          </div>
        </div>
      </div>

      {/* Brand Name */}
      <h1 className="text-3xl font-bold text-foreground mb-2 tracking-tight">
        mymoto
      </h1>
      <p className="text-muted-foreground mb-8 text-center">
        Fleet GPS Management System
      </p>

      {/* Login Card */}
      <Card className="w-full max-w-sm shadow-neumorphic border-border/30">
        <CardHeader className="text-center pb-4">
          <CardTitle className="text-xl">Welcome Back</CardTitle>
          <CardDescription>
            Sign in to access your dashboard
          </CardDescription>
        </CardHeader>
        
        <form onSubmit={handleSignIn}>
          <CardContent className="space-y-4">
            {error && <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>}
            
            <div className="space-y-2">
              <Label htmlFor="login-email">Email</Label>
              <Input id="login-email" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} className="shadow-neumorphic-inset border-border/30" required />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="login-password">Password</Label>
              <Input id="login-password" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} className="shadow-neumorphic-inset border-border/30" required />
            </div>
          </CardContent>
          
          <CardFooter>
            <Button type="submit" className="w-full shadow-neumorphic-button" disabled={isSubmitting}>
              {isSubmitting ? <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </> : 'Sign In'}
            </Button>
          </CardFooter>
        </form>
      </Card>

      {/* Footer */}
      <p className="text-xs text-muted-foreground mt-8 text-center">Powered by mymoto</p>
    </div>;
};
export default Auth;