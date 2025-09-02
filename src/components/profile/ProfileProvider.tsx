'use client';

/**
 * Profile Provider - React context provider for session state management
 * Part of TP-026 Basic User Profiles Implementation
 */

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { SessionManager, ProfileSession } from '@/lib/profile/sessionManager';

interface Profile {
  id: string;
  email: string;
  name?: string;
}

interface ProfileContextType {
  profile: Profile | null;
  session: ProfileSession | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string) => Promise<void>;
  logout: () => void;
  refreshSession: () => void;
  sessionTimeRemaining: number;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

interface ProfileProviderProps {
  children: ReactNode;
}

export function ProfileProvider({ children }: ProfileProviderProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<ProfileSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionTimeRemaining, setSessionTimeRemaining] = useState(0);

  // Check for existing session on mount
  useEffect(() => {
    checkExistingSession();
  }, []);

  // Update session time remaining every minute
  useEffect(() => {
    const interval = setInterval(() => {
      if (session) {
        const remaining = SessionManager.getSessionTimeRemaining();
        setSessionTimeRemaining(remaining);
        
        // Auto-logout if session expired
        if (remaining <= 0) {
          logout();
        }
      }
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [session]);

  const checkExistingSession = async () => {
    try {
      setIsLoading(true);
      const currentSession = SessionManager.getCurrentSession();
      
      if (currentSession) {
        // Verify session with server
        const response = await fetch('/api/profile', {
          headers: {
            'x-profile-id': currentSession.profileId
          }
        });

        if (response.ok) {
          const data = await response.json();
          setProfile(data.profile);
          setSession(currentSession);
          setSessionTimeRemaining(SessionManager.getSessionTimeRemaining());
        } else {
          // Server rejected session, clear it
          SessionManager.clearSession();
        }
      }
    } catch (error) {
      console.error('Failed to check existing session:', error);
      SessionManager.clearSession();
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string): Promise<void> => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Login failed');
      }

      const data = await response.json();
      
      // Create session
      const newSession = SessionManager.createSession(data.profile.id, data.profile.email);
      
      setProfile(data.profile);
      setSession(newSession);
      setSessionTimeRemaining(SessionManager.getSessionTimeRemaining());
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    SessionManager.clearSession();
    setProfile(null);
    setSession(null);
    setSessionTimeRemaining(0);
    
    // Optional: Notify server
    fetch('/api/profile', {
      method: 'DELETE',
      headers: {
        'x-profile-id': session?.profileId || ''
      }
    }).catch(console.error);
  };

  const refreshSession = () => {
    if (session) {
      const success = SessionManager.refreshSession();
      if (success) {
        const updatedSession = SessionManager.getCurrentSession();
        setSession(updatedSession);
        setSessionTimeRemaining(SessionManager.getSessionTimeRemaining());
      }
    }
  };

  const value: ProfileContextType = {
    profile,
    session,
    isLoading,
    isAuthenticated: !!profile && !!session,
    login,
    logout,
    refreshSession,
    sessionTimeRemaining
  };

  return (
    <ProfileContext.Provider value={value}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile(): ProfileContextType {
  const context = useContext(ProfileContext);
  if (context === undefined) {
    throw new Error('useProfile must be used within a ProfileProvider');
  }
  return context;
}

// Hook for components that need authenticated profile
export function useAuthenticatedProfile(): ProfileContextType & { profile: Profile; session: ProfileSession } {
  const context = useProfile();
  if (!context.isAuthenticated || !context.profile || !context.session) {
    throw new Error('Profile authentication required');
  }
  return context as ProfileContextType & { profile: Profile; session: ProfileSession };
}
