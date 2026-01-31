import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle, CheckCircle2, Eye, EyeOff, Building2, User } from 'lucide-react';
import { z } from 'zod';

const authSchema = z.object({
  email: z.string().trim().email({ message: 'Invalid email address' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters' }),
});

const ProviderAuth = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  
  // Provider registration fields
  const [businessName, setBusinessName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

  const validateInput = () => {
    const result = authSchema.safeParse({ email, password });
    if (!result.success) {
      setError(result.error.errors[0].message);
      return false;
    }
    
    if (isSignUp) {
      if (!businessName.trim()) {
        setError('Business name is required');
        return false;
      }
      if (!phone.trim()) {
        setError('Phone number is required');
        return false;
      }
    }
    
    return true;
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    
    if (!validateInput()) return;
    
    setIsSubmitting(true);
    const { error } = await signIn(email, password);
    setIsSubmitting(false);
    
    if (error) {
      setError(error.message || 'Failed to sign in');
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    
    if (!validateInput()) return;
    
    setIsSubmitting(true);
    const { error } = await signUp(email, password, {
      businessName,
      contactPerson,
      phone,
      categoryId: null, // Pending category selection
      address: '',
      city: '',
    });
    setIsSubmitting(false);
    
    if (error) {
      setError(error.message || 'Failed to create account');
    } else {
      setSuccess('Account created! Please check your email to confirm your account.');
      setTimeout(() => {
        setEmail('');
        setPassword('');
        setBusinessName('');
        setContactPerson('');
        setPhone('');
        setIsSignUp(false);
      }, 3000);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md border-0 bg-white/95 backdrop-blur-sm shadow-xl rounded-2xl">
        <CardHeader className="text-center space-y-2 pb-4">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
              <Building2 className="h-8 w-8 text-blue-600" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-blue-900">
            Service Provider Portal
          </CardTitle>
          <CardDescription className="text-blue-600">
            {isSignUp ? 'Register your business' : 'Sign in to your provider account'}
          </CardDescription>
        </CardHeader>
        
        <form onSubmit={isSignUp ? handleSignUp : handleSignIn}>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive" className="border-red-200 bg-red-50">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            
            {success && (
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-700">{success}</AlertDescription>
              </Alert>
            )}
            
            {isSignUp && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="business-name" className="text-blue-800">Business Name *</Label>
                  <Input
                    id="business-name"
                    placeholder="Your business name"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    disabled={isSubmitting}
                    className="border-blue-200 focus:border-blue-400"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="contact-person" className="text-blue-800">Contact Person</Label>
                  <Input
                    id="contact-person"
                    placeholder="Full name"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    disabled={isSubmitting}
                    className="border-blue-200 focus:border-blue-400"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-blue-800">Phone Number *</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="+234 800 000 0000"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={isSubmitting}
                    className="border-blue-200 focus:border-blue-400"
                    required
                  />
                </div>
              </>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="email" className="text-blue-800">Email Address *</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting}
                className="border-blue-200 focus:border-blue-400"
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password" className="text-blue-800">Password *</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isSubmitting}
                  className="border-blue-200 focus:border-blue-400 pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-400 hover:text-blue-600"
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>
          </CardContent>
          
          <CardFooter className="pt-0 flex flex-col gap-3">
            <Button 
              type="submit" 
              className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all duration-200"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isSignUp ? 'Creating account...' : 'Signing in...'}
                </>
              ) : (
                isSignUp ? 'Register Business' : 'Sign In'
              )}
            </Button>
            
            <Button
              type="button"
              variant="outline"
              className="w-full text-blue-600 border-blue-200 hover:bg-blue-50"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError(null);
                setSuccess(null);
              }}
              disabled={isSubmitting}
            >
              {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Register"}
            </Button>
            
            {!isSignUp && (
              <div className="text-center text-sm text-blue-600 mt-4">
                Forgot your password?{' '}
                <button
                  type="button"
                  onClick={() => navigate('/forgot-password')}
                  className="text-blue-800 hover:underline font-medium"
                >
                  Reset it here
                </button>
              </div>
            )}
          </CardFooter>
        </form>
      </Card>
      
      <div className="absolute bottom-4 left-4 text-xs text-blue-600/60">
        MyMoto Service Provider Portal v1.0
      </div>
    </div>
  );
};

export default ProviderAuth;