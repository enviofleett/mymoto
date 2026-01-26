import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isAdmin: boolean;
  isProvider: boolean;
  isLoading: boolean;
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
  const [isRoleLoaded, setIsRoleLoaded] = useState(false);

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


  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        // Defer role checks with setTimeout to prevent deadlock
        if (session?.user) {
          setIsRoleLoaded(false);
          setTimeout(() => {
            Promise.all([
              checkAdminRole(session.user.id),
              checkProviderRole(session.user.id),
            ]).then(([isAdminResult, isProviderResult]) => {
              setIsAdmin(isAdminResult);
              setIsProvider(isProviderResult);
              setIsRoleLoaded(true);
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
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        Promise.all([
          checkAdminRole(session.user.id),
          checkProviderRole(session.user.id),
        ]).then(([isAdminResult, isProviderResult]) => {
          setIsAdmin(isAdminResult);
          setIsProvider(isProviderResult);
          setIsRoleLoaded(true);
        });
      } else {
        setIsRoleLoaded(true);
      }
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
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
    await supabase.auth.signOut();
    setIsAdmin(false);
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
    <AuthContext.Provider value={{ user, session, isAdmin, isProvider, isLoading, isRoleLoaded, signIn, signUp, signOut, resetPassword, updatePassword }}>
      {children}
    </AuthContext.Provider>
  );
};
