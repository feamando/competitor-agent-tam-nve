/**
 * Session Manager - Browser session management utilities
 * Part of TP-026 Basic User Profiles Implementation
 */

import { logger } from '@/lib/logger';

export interface ProfileSession {
  profileId: string;
  email: string;
  createdAt: number;
  expiresAt: number;
}

export class SessionManager {
  private static readonly SESSION_KEY = 'competitor_agent_profile_session';
  private static readonly DEFAULT_DURATION_HOURS = 24;

  /**
   * Create a new profile session
   */
  static createSession(profileId: string, email: string, durationHours: number = this.DEFAULT_DURATION_HOURS): ProfileSession {
    const now = Date.now();
    const session: ProfileSession = {
      profileId,
      email,
      createdAt: now,
      expiresAt: now + (durationHours * 60 * 60 * 1000)
    };

    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(this.SESSION_KEY, JSON.stringify(session));
      }
      logger.info(`Created profile session for ${email}`);
    } catch (error) {
      logger.error('Failed to create session in localStorage:', error as Error);
    }

    return session;
  }

  /**
   * Get current profile session
   */
  static getCurrentSession(): ProfileSession | null {
    try {
      if (typeof window === 'undefined') {
        return null; // Server-side rendering
      }

      const sessionData = localStorage.getItem(this.SESSION_KEY);
      if (!sessionData) {
        return null;
      }

      const session: ProfileSession = JSON.parse(sessionData);
      
      // Check if session is expired
      if (Date.now() > session.expiresAt) {
        this.clearSession();
        return null;
      }

      return session;
    } catch (error) {
      logger.error('Failed to get current session:', error as Error);
      this.clearSession(); // Clear corrupted session
      return null;
    }
  }

  /**
   * Validate session and return profile ID
   */
  static validateSession(): string | null {
    const session = this.getCurrentSession();
    return session?.profileId || null;
  }

  /**
   * Check if current session is valid
   */
  static isSessionValid(): boolean {
    return this.validateSession() !== null;
  }

  /**
   * Clear current session
   */
  static clearSession(): void {
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem(this.SESSION_KEY);
      }
      logger.info('Profile session cleared');
    } catch (error) {
      logger.error('Failed to clear session:', error as Error);
    }
  }

  /**
   * Refresh session expiration
   */
  static refreshSession(durationHours: number = this.DEFAULT_DURATION_HOURS): boolean {
    const currentSession = this.getCurrentSession();
    if (!currentSession) {
      return false;
    }

    const refreshedSession: ProfileSession = {
      ...currentSession,
      expiresAt: Date.now() + (durationHours * 60 * 60 * 1000)
    };

    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(this.SESSION_KEY, JSON.stringify(refreshedSession));
      }
      logger.info(`Refreshed session for ${currentSession.email}`);
      return true;
    } catch (error) {
      logger.error('Failed to refresh session:', error as Error);
      return false;
    }
  }

  /**
   * Get session time remaining in minutes
   */
  static getSessionTimeRemaining(): number {
    const session = this.getCurrentSession();
    if (!session) {
      return 0;
    }

    const remainingMs = session.expiresAt - Date.now();
    return Math.max(0, Math.floor(remainingMs / (1000 * 60)));
  }

  /**
   * Check if session expires soon (within 1 hour)
   */
  static sessionExpiresSoon(): boolean {
    const remainingMinutes = this.getSessionTimeRemaining();
    return remainingMinutes > 0 && remainingMinutes <= 60;
  }
}

// Server-side session helpers for API routes
export class ServerSessionManager {
  /**
   * Get profile ID from request headers or cookies (for API routes)
   */
  static getProfileIdFromRequest(request: Request): string | null {
    try {
      // Try to get from custom header first
      const profileId = request.headers.get('x-profile-id');
      if (profileId) {
        return profileId;
      }

      // Fallback to cookies if available
      const cookieHeader = request.headers.get('cookie');
      if (cookieHeader) {
        const cookies = this.parseCookies(cookieHeader);
        const sessionData = cookies[SessionManager['SESSION_KEY']];
        if (sessionData) {
          const session: ProfileSession = JSON.parse(decodeURIComponent(sessionData));
          if (Date.now() <= session.expiresAt) {
            return session.profileId;
          }
        }
      }

      return null;
    } catch (error) {
      logger.error('Failed to get profile ID from request:', error as Error);
      return null;
    }
  }

  /**
   * Parse cookie string into object
   */
  private static parseCookies(cookieHeader: string): Record<string, string> {
    return cookieHeader
      .split(';')
      .reduce((cookies, cookie) => {
        const [name, value] = cookie.trim().split('=');
        if (name && value) {
          cookies[name] = value;
        }
        return cookies;
      }, {} as Record<string, string>);
  }
}
