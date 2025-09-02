/**
 * Component Tests for LogoutButton
 * Tests the header logout component with profile session clearing
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LogoutButton, CompactLogoutButton } from '@/components/profile/LogoutButton';
import { useProfile } from '@/components/profile/ProfileProvider';

// Mock the ProfileProvider hook
jest.mock('@/components/profile/ProfileProvider', () => ({
  useProfile: jest.fn(),
}));

const mockUseProfile = useProfile as jest.MockedFunction<typeof useProfile>;

describe('LogoutButton', () => {
  const defaultProfileContext = {
    profile: {
      id: 'profile-123',
      email: 'test@hellofresh.com',
      name: 'Test User'
    },
    session: {
      profileId: 'profile-123',
      email: 'test@hellofresh.com',
      createdAt: Date.now(),
      expiresAt: Date.now() + (2 * 60 * 60 * 1000)
    },
    isLoading: false,
    isAuthenticated: true,
    login: jest.fn(),
    logout: jest.fn(),
    refreshSession: jest.fn(),
    sessionTimeRemaining: 120 // 2 hours
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseProfile.mockReturnValue(defaultProfileContext);
  });

  it('should not render when no profile is available', () => {
    mockUseProfile.mockReturnValue({
      ...defaultProfileContext,
      profile: null,
      isAuthenticated: false
    });

    render(<LogoutButton />);
    
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('should render logout button with user information', () => {
    render(<LogoutButton />);

    expect(screen.getByText('Test User')).toBeInTheDocument();
    expect(screen.getByText('2h 0m left')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Logout' })).toBeInTheDocument();
  });

  it('should display email when name is not available', () => {
    mockUseProfile.mockReturnValue({
      ...defaultProfileContext,
      profile: {
        ...defaultProfileContext.profile!,
        name: undefined
      }
    });

    render(<LogoutButton />);

    expect(screen.getByText('test@hellofresh.com')).toBeInTheDocument();
  });

  it('should format time remaining correctly', () => {
    // Test minutes only
    mockUseProfile.mockReturnValue({
      ...defaultProfileContext,
      sessionTimeRemaining: 45
    });

    render(<LogoutButton />);
    expect(screen.getByText('45m left')).toBeInTheDocument();
  });

  it('should format hours and minutes correctly', () => {
    // Test 1 hour 30 minutes
    mockUseProfile.mockReturnValue({
      ...defaultProfileContext,
      sessionTimeRemaining: 90
    });

    render(<LogoutButton />);
    expect(screen.getByText('1h 30m left')).toBeInTheDocument();
  });

  it('should show expired status', () => {
    mockUseProfile.mockReturnValue({
      ...defaultProfileContext,
      sessionTimeRemaining: 0
    });

    render(<LogoutButton />);
    expect(screen.getByText('Expired')).toBeInTheDocument();
  });

  it('should highlight expiring soon sessions', () => {
    // Session expires in 30 minutes (less than 60)
    mockUseProfile.mockReturnValue({
      ...defaultProfileContext,
      sessionTimeRemaining: 30
    });

    render(<LogoutButton />);
    
    const timeElement = screen.getByText('30m left');
    expect(timeElement).toHaveClass('text-amber-600');
  });

  it('should handle logout click', async () => {
    const user = userEvent.setup();
    const mockLogout = jest.fn();
    
    mockUseProfile.mockReturnValue({
      ...defaultProfileContext,
      logout: mockLogout
    });

    render(<LogoutButton />);

    const logoutButton = screen.getByRole('button', { name: 'Logout' });
    await user.click(logoutButton);

    expect(mockLogout).toHaveBeenCalled();
  });

  it('should show loading state during logout', async () => {
    const user = userEvent.setup();
    const mockLogout = jest.fn(() => new Promise(resolve => setTimeout(resolve, 100)));
    
    mockUseProfile.mockReturnValue({
      ...defaultProfileContext,
      logout: mockLogout
    });

    render(<LogoutButton />);

    const logoutButton = screen.getByRole('button', { name: 'Logout' });
    await user.click(logoutButton);

    expect(screen.getByText('Logging out...')).toBeInTheDocument();
    expect(logoutButton).toBeDisabled();

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled();
    });
  });

  it('should handle logout errors gracefully', async () => {
    const user = userEvent.setup();
    const mockLogout = jest.fn().mockRejectedValue(new Error('Logout failed'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    
    mockUseProfile.mockReturnValue({
      ...defaultProfileContext,
      logout: mockLogout
    });

    render(<LogoutButton />);

    const logoutButton = screen.getByRole('button', { name: 'Logout' });
    await user.click(logoutButton);

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Logout failed:', expect.any(Error));
    });

    consoleSpy.mockRestore();
  });

  it('should not show email when showEmail is false', () => {
    render(<LogoutButton showEmail={false} />);

    expect(screen.queryByText('Test User')).not.toBeInTheDocument();
    expect(screen.queryByText('2h 0m left')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Logout' })).toBeInTheDocument();
  });

  it('should apply custom className', () => {
    render(<LogoutButton className="custom-class" />);

    const container = screen.getByRole('button').closest('div');
    expect(container).toHaveClass('custom-class');
  });

  it('should have proper tooltip', () => {
    render(<LogoutButton />);

    const logoutButton = screen.getByRole('button', { name: 'Logout' });
    expect(logoutButton).toHaveAttribute('title', 'Logout from test@hellofresh.com');
  });
});

describe('CompactLogoutButton', () => {
  const defaultProfileContext = {
    profile: {
      id: 'profile-123',
      email: 'test@hellofresh.com',
      name: 'Test User'
    },
    session: null,
    isLoading: false,
    isAuthenticated: true,
    login: jest.fn(),
    logout: jest.fn(),
    refreshSession: jest.fn(),
    sessionTimeRemaining: 120
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseProfile.mockReturnValue(defaultProfileContext);
  });

  it('should not render when no profile is available', () => {
    mockUseProfile.mockReturnValue({
      ...defaultProfileContext,
      profile: null,
      isAuthenticated: false
    });

    render(<CompactLogoutButton />);
    
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('should render compact logout button', () => {
    render(<CompactLogoutButton />);

    const logoutButton = screen.getByRole('button');
    expect(logoutButton).toBeInTheDocument();
    expect(logoutButton).toHaveAttribute('title', 'Logout from test@hellofresh.com');
    
    // Should not show text, only icon
    expect(screen.queryByText('Logout')).not.toBeInTheDocument();
    expect(screen.queryByText('Test User')).not.toBeInTheDocument();
  });

  it('should handle logout click', async () => {
    const user = userEvent.setup();
    const mockLogout = jest.fn();
    
    mockUseProfile.mockReturnValue({
      ...defaultProfileContext,
      logout: mockLogout
    });

    render(<CompactLogoutButton />);

    const logoutButton = screen.getByRole('button');
    await user.click(logoutButton);

    expect(mockLogout).toHaveBeenCalled();
  });

  it('should show loading state during logout', async () => {
    const user = userEvent.setup();
    const mockLogout = jest.fn(() => new Promise(resolve => setTimeout(resolve, 100)));
    
    mockUseProfile.mockReturnValue({
      ...defaultProfileContext,
      logout: mockLogout
    });

    render(<CompactLogoutButton />);

    const logoutButton = screen.getByRole('button');
    await user.click(logoutButton);

    expect(logoutButton).toBeDisabled();
    // Should show spinning icon during loading
    const spinningIcon = logoutButton.querySelector('.animate-spin');
    expect(spinningIcon).toBeInTheDocument();

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled();
    });
  });

  it('should apply custom className', () => {
    render(<CompactLogoutButton className="custom-compact-class" />);

    const logoutButton = screen.getByRole('button');
    expect(logoutButton).toHaveClass('custom-compact-class');
  });

  it('should handle logout errors gracefully', async () => {
    const user = userEvent.setup();
    const mockLogout = jest.fn().mockRejectedValue(new Error('Logout failed'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    
    mockUseProfile.mockReturnValue({
      ...defaultProfileContext,
      logout: mockLogout
    });

    render(<CompactLogoutButton />);

    const logoutButton = screen.getByRole('button');
    await user.click(logoutButton);

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Logout failed:', expect.any(Error));
    });

    consoleSpy.mockRestore();
  });
});
