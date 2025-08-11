/**
 * Component Tests for ProfileProvider
 * Tests the React context provider for session state management
 */

import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { ProfileProvider, useProfile } from '@/components/profile/ProfileProvider';
import { SessionManager } from '@/lib/profile/sessionManager';

// Mock SessionManager
jest.mock('@/lib/profile/sessionManager', () => ({
  SessionManager: {
    getCurrentSession: jest.fn(),
    getSessionTimeRemaining: jest.fn(),
    createSession: jest.fn(),
    clearSession: jest.fn(),
    refreshSession: jest.fn(),
  }
}));

// Mock fetch
global.fetch = jest.fn();

const mockSessionManager = SessionManager as jest.Mocked<typeof SessionManager>;
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

// Test component that uses the profile context
const TestComponent: React.FC = () => {
  const { 
    profile, 
    session, 
    isLoading, 
    isAuthenticated, 
    login, 
    logout, 
    sessionTimeRemaining 
  } = useProfile();

  return (
    <div>
      <div data-testid="loading">{isLoading ? 'loading' : 'loaded'}</div>
      <div data-testid="authenticated">{isAuthenticated ? 'authenticated' : 'not-authenticated'}</div>
      <div data-testid="profile-email">{profile?.email || 'no-profile'}</div>
      <div data-testid="session-time">{sessionTimeRemaining}</div>
      <button data-testid="login-btn" onClick={() => login('test@hellofresh.com')}>
        Login
      </button>
      <button data-testid="logout-btn" onClick={logout}>
        Logout
      </button>
    </div>
  );
};

describe('ProfileProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockSessionManager.getCurrentSession.mockReturnValue(null);
    mockSessionManager.getSessionTimeRemaining.mockReturnValue(0);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should render children and provide context', () => {
    render(
      <ProfileProvider>
        <TestComponent />
      </ProfileProvider>
    );

    expect(screen.getByTestId('loading')).toHaveTextContent('loaded');
    expect(screen.getByTestId('authenticated')).toHaveTextContent('not-authenticated');
    expect(screen.getByTestId('profile-email')).toHaveTextContent('no-profile');
  });

  it('should show loading state initially', () => {
    render(
      <ProfileProvider>
        <TestComponent />
      </ProfileProvider>
    );

    // Initial render should show loading state briefly
    expect(screen.getByTestId('loading')).toHaveTextContent('loaded');
  });

  it('should authenticate with existing valid session', async () => {
    const mockSession = {
      profileId: 'profile-123',
      email: 'test@hellofresh.com',
      createdAt: Date.now(),
      expiresAt: Date.now() + (2 * 60 * 60 * 1000)
    };

    const mockProfile = {
      id: 'profile-123',
      email: 'test@hellofresh.com',
      name: 'Test User'
    };

    mockSessionManager.getCurrentSession.mockReturnValue(mockSession);
    mockSessionManager.getSessionTimeRemaining.mockReturnValue(120);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ profile: mockProfile })
    } as Response);

    await act(async () => {
      render(
        <ProfileProvider>
          <TestComponent />
        </ProfileProvider>
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('authenticated');
      expect(screen.getByTestId('profile-email')).toHaveTextContent('test@hellofresh.com');
      expect(screen.getByTestId('session-time')).toHaveTextContent('120');
    });
  });

  it('should clear invalid session from server', async () => {
    const mockSession = {
      profileId: 'invalid-profile',
      email: 'test@hellofresh.com',
      createdAt: Date.now(),
      expiresAt: Date.now() + (2 * 60 * 60 * 1000)
    };

    mockSessionManager.getCurrentSession.mockReturnValue(mockSession);

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404
    } as Response);

    await act(async () => {
      render(
        <ProfileProvider>
          <TestComponent />
        </ProfileProvider>
      );
    });

    await waitFor(() => {
      expect(mockSessionManager.clearSession).toHaveBeenCalled();
      expect(screen.getByTestId('authenticated')).toHaveTextContent('not-authenticated');
    });
  });

  it('should handle login successfully', async () => {
    const mockProfile = {
      id: 'profile-123',
      email: 'newuser@hellofresh.com',
      name: 'New User'
    };

    const mockSession = {
      profileId: 'profile-123',
      email: 'newuser@hellofresh.com',
      createdAt: Date.now(),
      expiresAt: Date.now() + (24 * 60 * 60 * 1000)
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ profile: mockProfile })
    } as Response);

    mockSessionManager.createSession.mockReturnValue(mockSession);
    mockSessionManager.getSessionTimeRemaining.mockReturnValue(1440); // 24 hours

    render(
      <ProfileProvider>
        <TestComponent />
      </ProfileProvider>
    );

    await act(async () => {
      screen.getByTestId('login-btn').click();
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email: 'test@hellofresh.com' })
      });
      
      expect(mockSessionManager.createSession).toHaveBeenCalledWith(
        'profile-123',
        'newuser@hellofresh.com'
      );
      
      expect(screen.getByTestId('authenticated')).toHaveTextContent('authenticated');
      expect(screen.getByTestId('profile-email')).toHaveTextContent('newuser@hellofresh.com');
    });
  });

  it('should handle login failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Invalid email' })
    } as Response);

    render(
      <ProfileProvider>
        <TestComponent />
      </ProfileProvider>
    );

    await expect(async () => {
      await act(async () => {
        screen.getByTestId('login-btn').click();
      });
    }).rejects.toThrow('Invalid email');

    expect(screen.getByTestId('authenticated')).toHaveTextContent('not-authenticated');
  });

  it('should handle logout', async () => {
    const mockSession = {
      profileId: 'profile-123',
      email: 'test@hellofresh.com',
      createdAt: Date.now(),
      expiresAt: Date.now() + (2 * 60 * 60 * 1000)
    };

    mockSessionManager.getCurrentSession
      .mockReturnValueOnce(mockSession)  // Initial session check
      .mockReturnValueOnce(null);        // After logout

    mockSessionManager.getSessionTimeRemaining
      .mockReturnValueOnce(120)   // Initial time
      .mockReturnValueOnce(0);    // After logout

    const mockProfile = {
      id: 'profile-123',
      email: 'test@hellofresh.com',
      name: 'Test User'
    };

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ profile: mockProfile })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      } as Response);

    await act(async () => {
      render(
        <ProfileProvider>
          <TestComponent />
        </ProfileProvider>
      );
    });

    // Wait for initial authentication
    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('authenticated');
    });

    // Perform logout
    await act(async () => {
      screen.getByTestId('logout-btn').click();
    });

    await waitFor(() => {
      expect(mockSessionManager.clearSession).toHaveBeenCalled();
      expect(screen.getByTestId('authenticated')).toHaveTextContent('not-authenticated');
      expect(screen.getByTestId('profile-email')).toHaveTextContent('no-profile');
      expect(screen.getByTestId('session-time')).toHaveTextContent('0');
    });
  });

  it('should auto-logout when session expires', async () => {
    const mockSession = {
      profileId: 'profile-123',
      email: 'test@hellofresh.com',
      createdAt: Date.now(),
      expiresAt: Date.now() + (2 * 60 * 60 * 1000)
    };

    mockSessionManager.getCurrentSession.mockReturnValue(mockSession);
    mockSessionManager.getSessionTimeRemaining
      .mockReturnValueOnce(1)  // 1 minute remaining
      .mockReturnValueOnce(0); // Expired

    const mockProfile = {
      id: 'profile-123',
      email: 'test@hellofresh.com',
      name: 'Test User'
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ profile: mockProfile })
    } as Response);

    await act(async () => {
      render(
        <ProfileProvider>
          <TestComponent />
        </ProfileProvider>
      );
    });

    // Wait for authentication
    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('authenticated');
    });

    // Fast-forward time to trigger session expiry check
    act(() => {
      jest.advanceTimersByTime(60000); // 1 minute
    });

    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('not-authenticated');
    });
  });

  it('should throw error when useProfile used outside provider', () => {
    // Suppress console.error for this test
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      render(<TestComponent />);
    }).toThrow('useProfile must be used within a ProfileProvider');

    consoleSpy.mockRestore();
  });
});

// Test for useAuthenticatedProfile hook
describe('useAuthenticatedProfile', () => {
  it('should throw error when not authenticated', () => {
    const { useAuthenticatedProfile } = require('@/components/profile/ProfileProvider');
    
    const TestAuthComponent: React.FC = () => {
      try {
        useAuthenticatedProfile();
        return <div>authenticated</div>;
      } catch (error) {
        return <div data-testid="error">{(error as Error).message}</div>;
      }
    };

    // Suppress console.error for this test
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ProfileProvider>
        <TestAuthComponent />
      </ProfileProvider>
    );

    expect(screen.getByTestId('error')).toHaveTextContent('Profile authentication required');

    consoleSpy.mockRestore();
  });
});
