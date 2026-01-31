import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isProvider: boolean;
  isProviderApproved: boolean;
  providerProfile: any;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, providerData: any) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProviderProfile: () => Promise<void>;
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
  const [isLoading, setIsLoading] = useState(true);
  const [isProvider, setIsProvider] = useState(false);
  const [isProviderApproved, setIsProviderApproved] = useState(false);
  const [providerProfile, setProviderProfile] = useState<any>(null);

  const checkProviderStatus = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('service_providers')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      
      if (error) {
        console.error('Error checking provider status:', error);
        return { isProvider: false, isApproved: false, profile: null };
      }
      
      const isProvider = !!data;
      const isApproved = data?.status === 'approved';
      
      return { isProvider, isApproved, profile: data };
    } catch (error) {
      console.error('Error checking provider status:', error);
      return { isProvider: false, isApproved: false, profile: null };
    }
  };

  const refreshProviderProfile = async () => {
    if (!user) return;
    
    const { isProvider, isApproved, profile } = await checkProviderStatus(user.id);
    setIsProvider(isProvider);
    setIsProviderApproved(isApproved);
    setProviderProfile(profile);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          const { isProvider, isApproved, profile } = await checkProviderStatus(session.user.id);
          setIsProvider(isProvider);
          setIsProviderApproved(isApproved);
          setProviderProfile(profile);
        } else {
          setIsProvider(false);
          setIsProviderApproved(false);
          setProviderProfile(null);
        }
        
        setIsLoading(false);
      }
    );

    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        const { isProvider, isApproved, profile } = await checkProviderStatus(session.user.id);
        setIsProvider(isProvider);
        setIsProviderApproved(isApproved);
        setProviderProfile(profile);
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
        return { error: error as Error };
      }
      
      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  };

  const signUp = async (email: string, password: string, providerData: any) => {
    try {
      const { data, error } = await supabase.functions.invoke('public-register-provider', {
        body: {
          email,
          password,
          businessName: providerData.businessName,
          contactPerson: providerData.contactPerson,
          phone: providerData.phone,
          categoryId: providerData.categoryId,
          address: providerData.address,
          city: providerData.city,
        }
      });
      
      if (error) {
        console.error('Edge function error:', error);
        return { error: error as Error };
      }
      
      if (data?.error) {
        console.error('Registration error:', data.error);
        return { error: new Error(data.error) };
      }
      
      return { error: null };
    } catch (err) {
      console.error('Signup exception:', err);
      return { error: err as Error };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setIsProvider(false);
    setIsProviderApproved(false);
    setProviderProfile(null);
  };

  return (
    <AuthContext.Provider value={{
      user,
      session,
      isLoading,
      isProvider,
      isProviderApproved,
      providerProfile,
      signIn,
      signUp,
      signOut,
      refreshProviderProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
};