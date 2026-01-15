import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { z } from 'zod';
import myMotoLogo from '@/assets/mymoto-logo-new.png';

const passwordSchema = z.object({
  password: z.string().min(6, { message: 'Password must be at least 6 characters' }),
  confirmPassword: z.string().min(6, { message: 'Please confirm your password' }),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

const ResetPassword = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isValidating, setIsValidating] = useState(true);
  
  const { updatePassword } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    // Check if we have the required tokens in the URL
    const accessToken = searchParams.get('access_token');
    const type = searchParams.get('type');
    
    if (!accessToken || type !== 'recovery') {
      setError('Invalid or expired reset link. Please request a new password reset.');
      setIsValidating(false);
    } else {
      setIsValidating(false);
    }
  }, [searchParams]);

  const validateInput = () => {
    const result = passwordSchema.safeParse({ password, confirmPassword });
    if (!result.success) {
      setError(result.error.errors[0].message);
      return false;
    }
    return true;
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    
    if (!validateInput()) return;
    
    setIsSubmitting(true);
    const { error } = await updatePassword(password);
    setIsSubmitting(false);
    
    if (error) {
      setError(error.message || 'Failed to update password. Please try again.');
    } else {
      setSuccess('Password updated successfully! Redirecting to sign in...');
      setTimeout(() => {
        navigate('/auth');
      }, 2000);
    }
  };

  if (isValidating) {
    return (
      <div className="min-h-screen min-h-[100dvh] flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
          Set New Password
        </p>
      </div>

      {/* Reset Password Card with Neumorphic styling */}
      <Card className="w-full max-w-sm border-0 bg-card shadow-neumorphic rounded-2xl animate-fade-in [animation-delay:400ms]">
        <CardHeader className="text-center space-y-2 pb-4">
          <CardTitle className="text-xl font-semibold text-foreground">Reset Password</CardTitle>
          <CardDescription className="text-muted-foreground">
            Enter your new password below
          </CardDescription>
        </CardHeader>
        
        <form onSubmit={handleResetPassword}>
          <CardContent className="space-y-4">
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
              <Label htmlFor="new-password" className="text-foreground text-sm">New Password</Label>
              <Input
                id="new-password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
                className="bg-card border-0 shadow-neumorphic-inset h-12 rounded-xl focus-visible:ring-accent/50 text-foreground placeholder:text-muted-foreground"
                required
                autoComplete="new-password"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="confirm-password" className="text-foreground text-sm">Confirm Password</Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isSubmitting}
                className="bg-card border-0 shadow-neumorphic-inset h-12 rounded-xl focus-visible:ring-accent/50 text-foreground placeholder:text-muted-foreground"
                required
                autoComplete="new-password"
              />
            </div>
          </CardContent>
          
          <CardFooter className="pt-0">
            <Button 
              type="submit" 
              className="w-full mt-2 h-12 rounded-xl shadow-neumorphic-button bg-accent hover:bg-accent/90 text-accent-foreground font-semibold transition-all duration-200 hover:ring-2 hover:ring-accent/30" 
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                'Update Password'
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>

      {/* Footer branding */}
      <p className="text-xs text-muted-foreground/60 mt-8 animate-fade-in [animation-delay:600ms]">Powered by mymoto</p>
    </div>
  );
};

export default ResetPassword;
