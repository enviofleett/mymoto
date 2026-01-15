import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react';
import { z } from 'zod';
import myMotoLogo from '@/assets/mymoto-logo-new.png';

const emailSchema = z.object({
  email: z.string().trim().email({ message: 'Invalid email address' }),
});

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { resetPassword } = useAuth();
  const navigate = useNavigate();

  const validateInput = () => {
    const result = emailSchema.safeParse({ email });
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
    const { error } = await resetPassword(email);
    setIsSubmitting(false);
    
    if (error) {
      setError(error.message || 'Failed to send reset email. Please try again.');
    } else {
      setSuccess('Password reset email sent! Please check your inbox and follow the instructions.');
    }
  };

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
          Reset Your Password
        </p>
      </div>

      {/* Reset Password Card with Neumorphic styling */}
      <Card className="w-full max-w-sm border-0 bg-card shadow-neumorphic rounded-2xl animate-fade-in [animation-delay:400ms]">
        <CardHeader className="text-center space-y-2 pb-4">
          <CardTitle className="text-xl font-semibold text-foreground">Forgot Password?</CardTitle>
          <CardDescription className="text-muted-foreground">
            Enter your email address and we'll send you a link to reset your password
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
              <Label htmlFor="reset-email" className="text-foreground text-sm">Email</Label>
              <Input
                id="reset-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting}
                className="bg-card border-0 shadow-neumorphic-inset h-12 rounded-xl focus-visible:ring-accent/50 text-foreground placeholder:text-muted-foreground"
                required
                autoComplete="email"
              />
            </div>
          </CardContent>
          
          <CardFooter className="pt-0 flex flex-col gap-3">
            <Button 
              type="submit" 
              className="w-full h-12 rounded-xl shadow-neumorphic-button bg-accent hover:bg-accent/90 text-accent-foreground font-semibold transition-all duration-200 hover:ring-2 hover:ring-accent/30" 
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                'Send Reset Link'
              )}
            </Button>
            
            <Link 
              to="/auth" 
              className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Sign In
            </Link>
          </CardFooter>
        </form>
      </Card>

      {/* Footer branding */}
      <p className="text-xs text-muted-foreground/60 mt-8 animate-fade-in [animation-delay:600ms]">Powered by mymoto</p>
    </div>
  );
};

export default ForgotPassword;
