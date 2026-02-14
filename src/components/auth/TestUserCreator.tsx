import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Copy, Check, UserPlus } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export function TestUserCreator() {
  const { signUp } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createdUser, setCreatedUser] = useState<{email: string, password: string} | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'email' | 'password' | null>(null);

  const generateCredentials = () => {
    const randomId = Math.random().toString(36).substring(2, 8);
    // Use a timestamp to ensure uniqueness
    const timestamp = new Date().getTime().toString().slice(-4);
    return {
      email: `test.user.${randomId}${timestamp}@example.com`,
      password: `Test${randomId}!${timestamp}`
    };
  };

  const handleCreateTestUser = async () => {
    setIsCreating(true);
    setError(null);
    setCreatedUser(null);

    const credentials = generateCredentials();

    try {
      const { error } = await signUp(credentials.email, credentials.password);
      
      if (error) {
        setError(error.message);
      } else {
        setCreatedUser(credentials);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsCreating(false);
    }
  };

  const copyToClipboard = (text: string, field: 'email' | 'password') => {
    navigator.clipboard.writeText(text);
    setCopied(field);
    setTimeout(() => setCopied(null), 2000);
  };

  if (!isOpen) {
    return (
      <Button 
        variant="ghost" 
        size="sm" 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 opacity-50 hover:opacity-100 transition-opacity text-xs"
      >
        <UserPlus className="h-4 w-4 mr-2" />
        Dev: Create Test User
      </Button>
    );
  }

  return (
    <Card className="fixed bottom-4 right-4 w-80 shadow-lg border-2 border-dashed border-muted-foreground/20 animate-in slide-in-from-bottom-5">
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium">Test User Generator</CardTitle>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsOpen(false)}>
          <span className="sr-only">Close</span>
          <span aria-hidden="true">&times;</span>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {!createdUser ? (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Generates a new user with random credentials and automatically signs them up.
            </p>
            {error && (
              <Alert variant="destructive" className="py-2 text-xs">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button 
              onClick={handleCreateTestUser} 
              disabled={isCreating}
              className="w-full"
              size="sm"
            >
              {isCreating ? (
                <>
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                  Creating...
                </>
              ) : (
                'Generate & Create User'
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-3 animate-in fade-in">
            <Alert className="py-2 bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-400">
              <Check className="h-3 w-3 mr-2" />
              <AlertDescription className="text-xs">User created successfully!</AlertDescription>
            </Alert>
            
            <div className="space-y-2">
              <Label className="text-xs">Email</Label>
              <div className="flex gap-2">
                <Input 
                  value={createdUser.email} 
                  readOnly 
                  className="h-8 text-xs font-mono"
                />
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8 shrink-0"
                  onClick={() => copyToClipboard(createdUser.email, 'email')}
                >
                  {copied === 'email' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Password</Label>
              <div className="flex gap-2">
                <Input 
                  value={createdUser.password} 
                  readOnly 
                  className="h-8 text-xs font-mono"
                />
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8 shrink-0"
                  onClick={() => copyToClipboard(createdUser.password, 'password')}
                >
                  {copied === 'password' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                </Button>
              </div>
            </div>

            <Button 
              variant="outline" 
              size="sm" 
              className="w-full mt-2"
              onClick={() => setCreatedUser(null)}
            >
              Create Another
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
