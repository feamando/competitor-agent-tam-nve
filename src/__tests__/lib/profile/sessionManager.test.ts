/**
 * Unit Tests for SessionManager
 * Tests browser session management and server-side session helpers
 */

import { SessionManager, ServerSessionManager, ProfileSession } from '@/lib/profile/sessionManager';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
  };
})();

// Mock window.localStorage
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock logger
jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('SessionManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.clear();
    // Reset Date.now mock
    jest.spyOn(Date, 'now').mockRestore();
  });

  describe('createSession', () => {
    it('should create and store a valid session', () => {
      const fixedTime = 1640995200000; // 2022-01-01 00:00:00
      jest.spyOn(Date, 'now').mockReturnValue(fixedTime);

      const session = SessionManager.createSession('profile-123', 'test@hellofresh.com');

      expect(session).toEqual({
        profileId: 'profile-123',
        email: 'test@hellofresh.com',
        createdAt: fixedTime,
        expiresAt: fixedTime + (24 * 60 * 60 * 1000) // 24 hours later
      });

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'competitor_agent_profile_session',
        JSON.stringify(session)
      );
    });

    it('should create session with custom duration', () => {
      const fixedTime = 1640995200000;
      jest.spyOn(Date, 'now').mockReturnValue(fixedTime);

      const session = SessionManager.createSession('profile-123', 'test@hellofresh.com', 12);

      expect(session.expiresAt).toBe(fixedTime + (12 * 60 * 60 * 1000)); // 12 hours later
    });

    it('should handle localStorage errors gracefully', () => {
      localStorageMock.setItem.mockImplementationOnce(() => {
        throw new Error('localStorage full');
      });

      const session = SessionManager.createSession('profile-123', 'test@hellofresh.com');

      expect(session).toBeDefined();
      expect(session.profileId).toBe('profile-123');
    });
  });

  describe('getCurrentSession', () => {
    it('should return valid unexpired session', () => {
      const futureTime = Date.now() + (2 * 60 * 60 * 1000); // 2 hours in future
      const session: ProfileSession = {
        profileId: 'profile-123',
        email: 'test@hellofresh.com',
        createdAt: Date.now() - (1 * 60 * 60 * 1000), // 1 hour ago
        expiresAt: futureTime
      };

      localStorageMock.getItem.mockReturnValue(JSON.stringify(session));

      const result = SessionManager.getCurrentSession();

      expect(result).toEqual(session);
    });

    it('should return null for expired session and clear it', () => {
      const pastTime = Date.now() - (1 * 60 * 60 * 1000); // 1 hour ago
      const expiredSession: ProfileSession = {
        profileId: 'profile-123',
        email: 'test@hellofresh.com',
        createdAt: Date.now() - (25 * 60 * 60 * 1000), // 25 hours ago
        expiresAt: pastTime
      };

      localStorageMock.getItem.mockReturnValue(JSON.stringify(expiredSession));

      const result = SessionManager.getCurrentSession();

      expect(result).toBeNull();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('competitor_agent_profile_session');
    });

    it('should return null when no session exists', () => {
      localStorageMock.getItem.mockReturnValue(null);

      const result = SessionManager.getCurrentSession();

      expect(result).toBeNull();
    });

    it('should handle corrupted session data and clear it', () => {
      localStorageMock.getItem.mockReturnValue('invalid-json');

      const result = SessionManager.getCurrentSession();

      expect(result).toBeNull();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('competitor_agent_profile_session');
    });

    // Test server-side rendering scenario
    it('should return null during server-side rendering', () => {
      // Mock window as undefined
      const originalWindow = global.window;
      delete (global as any).window;

      const result = SessionManager.getCurrentSession();

      expect(result).toBeNull();

      // Restore window
      global.window = originalWindow;
    });
  });

  describe('validateSession', () => {
    it('should return profile ID for valid session', () => {
      const futureTime = Date.now() + (2 * 60 * 60 * 1000);
      const session: ProfileSession = {
        profileId: 'profile-123',
        email: 'test@hellofresh.com',
        createdAt: Date.now(),
        expiresAt: futureTime
      };

      localStorageMock.getItem.mockReturnValue(JSON.stringify(session));

      const result = SessionManager.validateSession();

      expect(result).toBe('profile-123');
    });

    it('should return null for invalid session', () => {
      localStorageMock.getItem.mockReturnValue(null);

      const result = SessionManager.validateSession();

      expect(result).toBeNull();
    });
  });

  describe('isSessionValid', () => {
    it('should return true for valid session', () => {
      const futureTime = Date.now() + (2 * 60 * 60 * 1000);
      const session: ProfileSession = {
        profileId: 'profile-123',
        email: 'test@hellofresh.com',
        createdAt: Date.now(),
        expiresAt: futureTime
      };

      localStorageMock.getItem.mockReturnValue(JSON.stringify(session));

      expect(SessionManager.isSessionValid()).toBe(true);
    });

    it('should return false for invalid session', () => {
      localStorageMock.getItem.mockReturnValue(null);

      expect(SessionManager.isSessionValid()).toBe(false);
    });
  });

  describe('clearSession', () => {
    it('should remove session from localStorage', () => {
      SessionManager.clearSession();

      expect(localStorageMock.removeItem).toHaveBeenCalledWith('competitor_agent_profile_session');
    });

    it('should handle localStorage errors gracefully', () => {
      localStorageMock.removeItem.mockImplementationOnce(() => {
        throw new Error('localStorage error');
      });

      expect(() => SessionManager.clearSession()).not.toThrow();
    });
  });

  describe('refreshSession', () => {
    it('should extend existing session expiration', () => {
      const currentTime = Date.now();
      const session: ProfileSession = {
        profileId: 'profile-123',
        email: 'test@hellofresh.com',
        createdAt: currentTime - (1 * 60 * 60 * 1000),
        expiresAt: currentTime + (1 * 60 * 60 * 1000)
      };

      localStorageMock.getItem.mockReturnValue(JSON.stringify(session));
      jest.spyOn(Date, 'now').mockReturnValue(currentTime);

      const result = SessionManager.refreshSession(12); // 12 hours

      expect(result).toBe(true);
      
      const expectedRefreshedSession = {
        ...session,
        expiresAt: currentTime + (12 * 60 * 60 * 1000)
      };

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'competitor_agent_profile_session',
        JSON.stringify(expectedRefreshedSession)
      );
    });

    it('should return false when no session exists', () => {
      localStorageMock.getItem.mockReturnValue(null);

      const result = SessionManager.refreshSession();

      expect(result).toBe(false);
    });
  });

  describe('getSessionTimeRemaining', () => {
    it('should return correct remaining time in minutes', () => {
      const currentTime = Date.now();
      const twoHoursLater = currentTime + (2 * 60 * 60 * 1000);
      
      const session: ProfileSession = {
        profileId: 'profile-123',
        email: 'test@hellofresh.com',
        createdAt: currentTime,
        expiresAt: twoHoursLater
      };

      localStorageMock.getItem.mockReturnValue(JSON.stringify(session));
      jest.spyOn(Date, 'now').mockReturnValue(currentTime);

      const result = SessionManager.getSessionTimeRemaining();

      expect(result).toBe(120); // 2 hours = 120 minutes
    });

    it('should return 0 for expired session', () => {
      const currentTime = Date.now();
      const pastTime = currentTime - (1 * 60 * 60 * 1000);
      
      const session: ProfileSession = {
        profileId: 'profile-123',
        email: 'test@hellofresh.com',
        createdAt: currentTime - (25 * 60 * 60 * 1000),
        expiresAt: pastTime
      };

      localStorageMock.getItem.mockReturnValue(JSON.stringify(session));
      jest.spyOn(Date, 'now').mockReturnValue(currentTime);

      const result = SessionManager.getSessionTimeRemaining();

      expect(result).toBe(0);
    });

    it('should return 0 when no session exists', () => {
      localStorageMock.getItem.mockReturnValue(null);

      const result = SessionManager.getSessionTimeRemaining();

      expect(result).toBe(0);
    });
  });

  describe('sessionExpiresSoon', () => {
    it('should return true when session expires within 1 hour', () => {
      const currentTime = Date.now();
      const thirtyMinutesLater = currentTime + (30 * 60 * 1000);
      
      const session: ProfileSession = {
        profileId: 'profile-123',
        email: 'test@hellofresh.com',
        createdAt: currentTime,
        expiresAt: thirtyMinutesLater
      };

      localStorageMock.getItem.mockReturnValue(JSON.stringify(session));
      jest.spyOn(Date, 'now').mockReturnValue(currentTime);

      expect(SessionManager.sessionExpiresSoon()).toBe(true);
    });

    it('should return false when session expires after 1 hour', () => {
      const currentTime = Date.now();
      const twoHoursLater = currentTime + (2 * 60 * 60 * 1000);
      
      const session: ProfileSession = {
        profileId: 'profile-123',
        email: 'test@hellofresh.com',
        createdAt: currentTime,
        expiresAt: twoHoursLater
      };

      localStorageMock.getItem.mockReturnValue(JSON.stringify(session));
      jest.spyOn(Date, 'now').mockReturnValue(currentTime);

      expect(SessionManager.sessionExpiresSoon()).toBe(false);
    });

    it('should return false when session is expired', () => {
      const currentTime = Date.now();
      const pastTime = currentTime - (1 * 60 * 60 * 1000);
      
      const session: ProfileSession = {
        profileId: 'profile-123',
        email: 'test@hellofresh.com',
        createdAt: currentTime - (25 * 60 * 60 * 1000),
        expiresAt: pastTime
      };

      localStorageMock.getItem.mockReturnValue(JSON.stringify(session));
      jest.spyOn(Date, 'now').mockReturnValue(currentTime);

      expect(SessionManager.sessionExpiresSoon()).toBe(false);
    });
  });
});

describe('ServerSessionManager', () => {
  describe('getProfileIdFromRequest', () => {
    it('should extract profile ID from x-profile-id header', () => {
      const mockRequest = {
        headers: {
          get: jest.fn((key: string) => {
            if (key === 'x-profile-id') return 'profile-123';
            return null;
          })
        }
      } as unknown as Request;

      const result = ServerSessionManager.getProfileIdFromRequest(mockRequest);

      expect(result).toBe('profile-123');
      expect(mockRequest.headers.get).toHaveBeenCalledWith('x-profile-id');
    });

    it('should fallback to cookie-based session', () => {
      const currentTime = Date.now();
      const futureTime = currentTime + (2 * 60 * 60 * 1000);
      const session: ProfileSession = {
        profileId: 'profile-456',
        email: 'test@hellofresh.com',
        createdAt: currentTime,
        expiresAt: futureTime
      };
      
      const cookieValue = encodeURIComponent(JSON.stringify(session));
      const cookieHeader = `competitor_agent_profile_session=${cookieValue}; other=value`;

      const mockRequest = {
        headers: {
          get: jest.fn((key: string) => {
            if (key === 'x-profile-id') return null;
            if (key === 'cookie') return cookieHeader;
            return null;
          })
        }
      } as unknown as Request;

      jest.spyOn(Date, 'now').mockReturnValue(currentTime);

      const result = ServerSessionManager.getProfileIdFromRequest(mockRequest);

      expect(result).toBe('profile-456');
    });

    it('should return null for expired cookie session', () => {
      const currentTime = Date.now();
      const pastTime = currentTime - (1 * 60 * 60 * 1000);
      const expiredSession: ProfileSession = {
        profileId: 'profile-456',
        email: 'test@hellofresh.com',
        createdAt: currentTime - (25 * 60 * 60 * 1000),
        expiresAt: pastTime
      };
      
      const cookieValue = encodeURIComponent(JSON.stringify(expiredSession));
      const cookieHeader = `competitor_agent_profile_session=${cookieValue}`;

      const mockRequest = {
        headers: {
          get: jest.fn((key: string) => {
            if (key === 'x-profile-id') return null;
            if (key === 'cookie') return cookieHeader;
            return null;
          })
        }
      } as unknown as Request;

      jest.spyOn(Date, 'now').mockReturnValue(currentTime);

      const result = ServerSessionManager.getProfileIdFromRequest(mockRequest);

      expect(result).toBeNull();
    });

    it('should return null when no session data available', () => {
      const mockRequest = {
        headers: {
          get: jest.fn(() => null)
        }
      } as unknown as Request;

      const result = ServerSessionManager.getProfileIdFromRequest(mockRequest);

      expect(result).toBeNull();
    });

    it('should handle malformed cookie data gracefully', () => {
      const mockRequest = {
        headers: {
          get: jest.fn((key: string) => {
            if (key === 'x-profile-id') return null;
            if (key === 'cookie') return 'competitor_agent_profile_session=invalid-json';
            return null;
          })
        }
      } as unknown as Request;

      const result = ServerSessionManager.getProfileIdFromRequest(mockRequest);

      expect(result).toBeNull();
    });
  });

  describe('parseCookies', () => {
    it('should parse cookie string correctly', () => {
      const cookieHeader = 'session=abc123; user=john; theme=dark';
      
      const result = ServerSessionManager['parseCookies'](cookieHeader);

      expect(result).toEqual({
        session: 'abc123',
        user: 'john',
        theme: 'dark'
      });
    });

    it('should handle empty cookie string', () => {
      const result = ServerSessionManager['parseCookies']('');

      expect(result).toEqual({});
    });

    it('should handle malformed cookies gracefully', () => {
      const cookieHeader = 'valid=value; invalid; another=good';
      
      const result = ServerSessionManager['parseCookies'](cookieHeader);

      expect(result).toEqual({
        valid: 'value',
        another: 'good'
      });
    });
  });
});
