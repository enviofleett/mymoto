import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isAdmin: boolean;
  isProvider: boolean;
  isLoading: boolean;
  isLoggingOut: boolean;
  isRoleLoaded: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isProvider, setIsProvider] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isRoleLoaded, setIsRoleLoaded] = useState(false);

  useEffect(() => {
    // One-shot notice set by auth guards (issuer mismatch / malformed / invalid JWT)
    const fallbackKey = 'mymoto-auth-notice';
    const url = import.meta.env.VITE_SUPABASE_URL || "https://cmvpnsqiefbsqkwnraka.supabase.co";
    const ref = (() => {
      try {
        return new URL(url).hostname.split(".")[0] || "unknown";
      } catch {
        return "unknown";
      }
    })();
    const key = `mymoto-auth-notice:${ref}`;
    try {
      const raw = localStorage.getItem(key) ?? localStorage.getItem(fallbackKey);
      if (!raw) return;
      const notice = JSON.parse(raw) as { type?: string; reason?: string; ts?: number };
      localStorage.removeItem(key);
      localStorage.removeItem(fallbackKey);

      const ts = typeof notice.ts === 'number' ? notice.ts : 0;
      if (Date.now() - ts > 2 * 60_000) return;

      if (notice.type === 'session_invalid') {
        const reason = notice.reason || 'unknown';
        const detail =
          reason === 'issuer_mismatch'
            ? 'Looks like you were logged into a different environment/project.'
            : reason === 'malformed'
              ? 'Stored auth data was corrupted.'
              : 'Your session is no longer valid.';
        toast.error('Your session is invalid for this environment. Please sign in again.', {
          description: detail,
        });
      }
    } catch {
      // ignore
      try {
        localStorage.removeItem(key);
      } catch {
        // ignore
      }
    }
  }, []);

  type RefreshRolesOptions = {
    blocking?: boolean;
  };

  const checkAdminRole = async (userId: string) => {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();
    
    if (error) {
      console.error('Error checking admin role:', error);
      return false;
    }
    return !!data;
  };

  const checkProviderRole = async (userId: string) => {
    // IMPORTANT:
    // Do NOT filter by role=eq.service_provider at the DB level.
    // If the `app_role` enum in the target DB doesn't include 'service_provider',
    // PostgREST will return 400 (invalid input value for enum app_role).
    // Instead, fetch the user's roles and check in JS.
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);
    
    if (error) {
      console.error('Error checking provider role:', error);
      return false;
    }
    
    const roles = (data || []) as Array<{ role: string }>;
    return roles.some((r) => r.role === 'service_provider' || r.role === 'provider');
  };

  const refreshRoles = async (userId: string, options?: RefreshRolesOptions) => {
    const blocking = options?.blocking !== false;

    // Only initial/foreground role loads should be blocking. Background refreshes
    // should never flip isRoleLoaded=false, because it can disable queries/UI.
    if (blocking) setIsRoleLoaded(false);

    try {
      const [isAdminResult, isProviderResult] = await Promise.all([
        checkAdminRole(userId),
        checkProviderRole(userId),
      ]);
      setIsAdmin(isAdminResult);
      setIsProvider(isProviderResult);
      if (import.meta.env.DEV) {
        console.log('[Auth] Roles refreshed', { userId, isAdmin: isAdminResult, isProvider: isProviderResult });
      }
    } catch (e) {
      // Fail closed on roles (never grant privileges on error), but don't brick the app.
      setIsAdmin(false);
      setIsProvider(false);
      if (import.meta.env.DEV) {
        console.warn('[Auth] Failed to refresh roles; defaulting roles to false', { userId, error: e });
      }
    } finally {
      setIsRoleLoaded(true);
    }
  };


  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (import.meta.env.DEV) {
          console.log('[Auth] onAuthStateChange', { event, userId: session?.user?.id ?? null });
        }
        setSession(session);
        setUser(session?.user ?? null);
        
        // Defer role checks with setTimeout to prevent deadlock
        if (session?.user) {
          setTimeout(() => {
            void refreshRoles(session.user.id, { blocking: true }).catch((e) => {
              // refreshRoles is exception-safe; this is just to avoid unhandled rejections.
              if (import.meta.env.DEV) console.warn('[Auth] refreshRoles rejected', e);
            });
          }, 0);
        } else {
          setIsAdmin(false);
          setIsProvider(false);
          setIsRoleLoaded(true);
        }
        setIsLoading(false);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (import.meta.env.DEV) {
        console.log('[Auth] Initial session check', {
          hasSession: !!session,
          userId: session?.user?.id ?? null,
          error: error?.message ?? null,
        });
      }
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        void refreshRoles(session.user.id, { blocking: true }).catch((e) => {
          if (import.meta.env.DEV) console.warn('[Auth] refreshRoles rejected', e);
        });
      } else {
        setIsRoleLoaded(true);
      }
      setIsLoading(false);
    }).catch((e) => {
      // If session check fails, don't keep the app in an "auth loading" state forever.
      if (import.meta.env.DEV) console.warn('[Auth] Initial session check failed', e);
      setSession(null);
      setUser(null);
      setIsAdmin(false);
      setIsProvider(false);
      setIsRoleLoaded(true);
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) return;
    const intervalId = setInterval(() => {
      void refreshRoles(session.user.id, { blocking: false }).catch((e) => {
        if (import.meta.env.DEV) console.warn('[Auth] refreshRoles rejected', e);
      });
    }, 60_000);
    return () => clearInterval(intervalId);
  }, [session?.user?.id]);

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      if (error) {
        if (import.meta.env.DEV) {
          console.error('[Auth] signInWithPassword failed', { email, message: error.message, name: error.name });
        }
        // Handle specific error types
        if (error.message.includes('Failed to fetch') || error.message.includes('ERR_CONNECTION_CLOSED')) {
          return { 
            error: new Error('Network error: Unable to connect to server. Please check your internet connection and try again.') 
          };
        }
        return { error: error as Error };
      }
      
      if (import.meta.env.DEV) {
        console.log('[Auth] signInWithPassword success', { email });
      }
      return { error: null };
    } catch (err) {
      // Handle network errors and other exceptions
      if (err instanceof Error) {
        if (err.message.includes('Failed to fetch') || err.message.includes('ERR_CONNECTION_CLOSED')) {
          return { 
            error: new Error('Network error: Unable to connect to server. Please check your internet connection and try again.') 
          };
        }
        return { error: err };
      }
      return { error: new Error('An unexpected error occurred. Please try again.') };
    }
  };

  const signUp = async (email: string, password: string) => {
    try {
      const redirectUrl = `${window.location.origin}/`;
      
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
        },
      });
      
      if (error) {
        // Handle specific error types
        if (error.message.includes('Failed to fetch') || error.message.includes('ERR_CONNECTION_CLOSED')) {
          return { 
            error: new Error('Network error: Unable to connect to server. Please check your internet connection and try again.') 
          };
        }
        return { error: error as Error };
      }
      
      return { error: null };
    } catch (err) {
      // Handle network errors and other exceptions
      if (err instanceof Error) {
        if (err.message.includes('Failed to fetch') || err.message.includes('ERR_CONNECTION_CLOSED')) {
          return { 
            error: new Error('Network error: Unable to connect to server. Please check your internet connection and try again.') 
          };
        }
        return { error: err };
      }
      return { error: new Error('An unexpected error occurred. Please try again.') };
    }
  };

  const signOut = async () => {
    try {
      setIsLoggingOut(true);
      await supabase.auth.signOut();
      setIsAdmin(false);
      setIsProvider(false);
    } finally {
      setIsLoggingOut(false);
    }
  };

  const resetPassword = async (email: string) => {
    const redirectUrl = `${window.location.origin}/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl,
    });
    return { error: error as Error | null };
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    return { error: error as Error | null };
  };

  return (
    <AuthContext.Provider value={{ user, session, isAdmin, isProvider, isLoading, isLoggingOut, isRoleLoaded, signIn, signUp, signOut, resetPassword, updatePassword }}>
      {children}
    </AuthContext.Provider>
  );
};
