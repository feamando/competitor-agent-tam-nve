/**
 * Component Tests for ProfileAccessGate and SessionWarning
 * Tests the main application access gate and session warning components
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfileAccessGate, SessionWarning } from '@/components/profile/ProfileAccessGate';
import { useProfile } from '@/components/profile/ProfileProvider';

// Mock the ProfileProvider hook
jest.mock('@/components/profile/ProfileProvider', () => ({
  useProfile: jest.fn(),
}));

// Mock ProfileAccessModal
jest.mock('@/components/profile/ProfileAccessModal', () => ({
  ProfileAccessModal: ({ isOpen, onClose, onSuccess }: any) => (
    isOpen ? (
      <div data-testid="profile-access-modal">
        <button onClick={onClose}>Close Modal</button>
        <button onClick={() => onSuccess({ id: 'test', email: 'test@hellofresh.com' })}>
          Success
        </button>
      </div>
    ) : null
  )
}));

const mockUseProfile = useProfile as jest.MockedFunction<typeof useProfile>;

describe('ProfileAccessGate', () => {
  const TestChildren = () => <div data-testid="protected-content">Protected Content</div>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should show loading state when isLoading is true', () => {
    mockUseProfile.mockReturnValue({
      profile: null,
      session: null,
      isLoading: true,
      isAuthenticated: false,
      login: jest.fn(),
      logout: jest.fn(),
      refreshSession: jest.fn(),
      sessionTimeRemaining: 0
    });

    render(
      <ProfileAccessGate>
        <TestChildren />
      </ProfileAccessGate>
    );

    expect(screen.getByText('Loading your workspace...')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  it('should show access gate when not authenticated', () => {
    mockUseProfile.mockReturnValue({
      profile: null,
      session: null,
      isLoading: false,
      isAuthenticated: false,
      login: jest.fn(),
      logout: jest.fn(),
      refreshSession: jest.fn(),
      sessionTimeRemaining: 0
    });

    render(
      <ProfileAccessGate>
        <TestChildren />
      </ProfileAccessGate>
    );

    expect(screen.getByText('Competitor Research Agent')).toBeInTheDocument();
    expect(screen.getByText('Your personal workspace for competitive intelligence')).toBeInTheDocument();
    expect(screen.getByText('Secure Access Required')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Access Your Workspace' })).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  it('should show protected content when authenticated', () => {
    mockUseProfile.mockReturnValue({
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
      sessionTimeRemaining: 120
    });

    render(
      <ProfileAccessGate>
        <TestChildren />
      </ProfileAccessGate>
    );

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    expect(screen.queryByText('Secure Access Required')).not.toBeInTheDocument();
  });

  it('should open modal when Access Workspace button is clicked', async () => {
    const user = userEvent.setup();
    
    mockUseProfile.mockReturnValue({
      profile: null,
      session: null,
      isLoading: false,
      isAuthenticated: false,
      login: jest.fn(),
      logout: jest.fn(),
      refreshSession: jest.fn(),
      sessionTimeRemaining: 0
    });

    render(
      <ProfileAccessGate>
        <TestChildren />
      </ProfileAccessGate>
    );

    const accessButton = screen.getByRole('button', { name: 'Access Your Workspace' });
    await user.click(accessButton);

    expect(screen.getByTestId('profile-access-modal')).toBeInTheDocument();
  });

  it('should close modal when modal onClose is triggered', async () => {
    const user = userEvent.setup();
    
    mockUseProfile.mockReturnValue({
      profile: null,
      session: null,
      isLoading: false,
      isAuthenticated: false,
      login: jest.fn(),
      logout: jest.fn(),
      refreshSession: jest.fn(),
      sessionTimeRemaining: 0
    });

    render(
      <ProfileAccessGate>
        <TestChildren />
      </ProfileAccessGate>
    );

    // Open modal
    const accessButton = screen.getByRole('button', { name: 'Access Your Workspace' });
    await user.click(accessButton);

    expect(screen.getByTestId('profile-access-modal')).toBeInTheDocument();

    // Close modal
    const closeButton = screen.getByText('Close Modal');
    await user.click(closeButton);

    expect(screen.queryByTestId('profile-access-modal')).not.toBeInTheDocument();
  });

  it('should close modal on success', async () => {
    const user = userEvent.setup();
    
    mockUseProfile.mockReturnValue({
      profile: null,
      session: null,
      isLoading: false,
      isAuthenticated: false,
      login: jest.fn(),
      logout: jest.fn(),
      refreshSession: jest.fn(),
      sessionTimeRemaining: 0
    });

    render(
      <ProfileAccessGate>
        <TestChildren />
      </ProfileAccessGate>
    );

    // Open modal
    const accessButton = screen.getByRole('button', { name: 'Access Your Workspace' });
    await user.click(accessButton);

    expect(screen.getByTestId('profile-access-modal')).toBeInTheDocument();

    // Trigger success
    const successButton = screen.getByText('Success');
    await user.click(successButton);

    expect(screen.queryByTestId('profile-access-modal')).not.toBeInTheDocument();
  });

  it('should display feature benefits in access gate', () => {
    mockUseProfile.mockReturnValue({
      profile: null,
      session: null,
      isLoading: false,
      isAuthenticated: false,
      login: jest.fn(),
      logout: jest.fn(),
      refreshSession: jest.fn(),
      sessionTimeRemaining: 0
    });

    render(
      <ProfileAccessGate>
        <TestChildren />
      </ProfileAccessGate>
    );

    expect(screen.getByText('✓ Email-based profile system')).toBeInTheDocument();
    expect(screen.getByText('✓ Automatic data organization')).toBeInTheDocument();
    expect(screen.getByText('✓ 24-hour secure sessions')).toBeInTheDocument();
    expect(screen.getByText('✓ Complete data isolation')).toBeInTheDocument();
  });

  it('should show shield icon in access gate', () => {
    mockUseProfile.mockReturnValue({
      profile: null,
      session: null,
      isLoading: false,
      isAuthenticated: false,
      login: jest.fn(),
      logout: jest.fn(),
      refreshSession: jest.fn(),
      sessionTimeRemaining: 0
    });

    render(
      <ProfileAccessGate>
        <TestChildren />
      </ProfileAccessGate>
    );

    // Check for shield icon (SVG with specific path)
    const shieldIcon = screen.getByRole('img', { hidden: true });
    expect(shieldIcon).toBeInTheDocument();
  });
});

describe('SessionWarning', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should not render when session time remaining > 15 minutes', () => {
    mockUseProfile.mockReturnValue({
      profile: { id: 'test', email: 'test@hellofresh.com' },
      session: null,
      isLoading: false,
      isAuthenticated: true,
      login: jest.fn(),
      logout: jest.fn(),
      refreshSession: jest.fn(),
      sessionTimeRemaining: 30 // 30 minutes
    });

    render(<SessionWarning />);

    expect(screen.queryByText(/Your session expires in/)).not.toBeInTheDocument();
  });

  it('should render warning when session expires in 15 minutes or less', () => {
    mockUseProfile.mockReturnValue({
      profile: { id: 'test', email: 'test@hellofresh.com' },
      session: null,
      isLoading: false,
      isAuthenticated: true,
      login: jest.fn(),
      logout: jest.fn(),
      refreshSession: jest.fn(),
      sessionTimeRemaining: 10 // 10 minutes
    });

    render(<SessionWarning />);

    expect(screen.getByText('Your session expires in 10 minutes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Extend Session' })).toBeInTheDocument();
  });

  it('should not render when session is expired (0 minutes)', () => {
    mockUseProfile.mockReturnValue({
      profile: { id: 'test', email: 'test@hellofresh.com' },
      session: null,
      isLoading: false,
      isAuthenticated: true,
      login: jest.fn(),
      logout: jest.fn(),
      refreshSession: jest.fn(),
      sessionTimeRemaining: 0
    });

    render(<SessionWarning />);

    expect(screen.queryByText(/Your session expires in/)).not.toBeInTheDocument();
  });

  it('should handle extend session click', async () => {
    const user = userEvent.setup();
    const mockRefreshSession = jest.fn();

    mockUseProfile.mockReturnValue({
      profile: { id: 'test', email: 'test@hellofresh.com' },
      session: null,
      isLoading: false,
      isAuthenticated: true,
      login: jest.fn(),
      logout: jest.fn(),
      refreshSession: mockRefreshSession,
      sessionTimeRemaining: 10
    });

    render(<SessionWarning />);

    const extendButton = screen.getByRole('button', { name: 'Extend Session' });
    await user.click(extendButton);

    expect(mockRefreshSession).toHaveBeenCalled();
  });

  it('should handle dismiss click', async () => {
    const user = userEvent.setup();

    mockUseProfile.mockReturnValue({
      profile: { id: 'test', email: 'test@hellofresh.com' },
      session: null,
      isLoading: false,
      isAuthenticated: true,
      login: jest.fn(),
      logout: jest.fn(),
      refreshSession: jest.fn(),
      sessionTimeRemaining: 10
    });

    render(<SessionWarning />);

    const dismissButton = screen.getByRole('button', { name: /close/i });
    await user.click(dismissButton);

    expect(screen.queryByText(/Your session expires in/)).not.toBeInTheDocument();
  });

  it('should remain dismissed after dismiss click', async () => {
    const user = userEvent.setup();

    const { rerender } = render(<SessionWarning />);

    // Initial render with warning
    mockUseProfile.mockReturnValue({
      profile: { id: 'test', email: 'test@hellofresh.com' },
      session: null,
      isLoading: false,
      isAuthenticated: true,
      login: jest.fn(),
      logout: jest.fn(),
      refreshSession: jest.fn(),
      sessionTimeRemaining: 10
    });

    rerender(<SessionWarning />);

    const dismissButton = screen.getByRole('button', { name: /close/i });
    await user.click(dismissButton);

    // Re-render with same time remaining - should still be dismissed
    mockUseProfile.mockReturnValue({
      profile: { id: 'test', email: 'test@hellofresh.com' },
      session: null,
      isLoading: false,
      isAuthenticated: true,
      login: jest.fn(),
      logout: jest.fn(),
      refreshSession: jest.fn(),
      sessionTimeRemaining: 10
    });

    rerender(<SessionWarning />);

    expect(screen.queryByText(/Your session expires in/)).not.toBeInTheDocument();
  });

  it('should show warning icon', () => {
    mockUseProfile.mockReturnValue({
      profile: { id: 'test', email: 'test@hellofresh.com' },
      session: null,
      isLoading: false,
      isAuthenticated: true,
      login: jest.fn(),
      logout: jest.fn(),
      refreshSession: jest.fn(),
      sessionTimeRemaining: 10
    });

    render(<SessionWarning />);

    // Check for warning triangle icon
    const warningIcon = screen.getByRole('img', { hidden: true });
    expect(warningIcon).toBeInTheDocument();
  });

  it('should have proper styling for warning bar', () => {
    mockUseProfile.mockReturnValue({
      profile: { id: 'test', email: 'test@hellofresh.com' },
      session: null,
      isLoading: false,
      isAuthenticated: true,
      login: jest.fn(),
      logout: jest.fn(),
      refreshSession: jest.fn(),
      sessionTimeRemaining: 10
    });

    render(<SessionWarning />);

    const warningBar = screen.getByText('Your session expires in 10 minutes').closest('div');
    expect(warningBar).toHaveClass('fixed', 'top-0', 'left-0', 'right-0', 'bg-amber-500');
  });
});
