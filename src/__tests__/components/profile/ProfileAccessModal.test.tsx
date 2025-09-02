/**
 * Component Tests for ProfileAccessModal
 * Tests the email entry modal for profile access
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfileAccessModal } from '@/components/profile/ProfileAccessModal';
import { SessionManager } from '@/lib/profile/sessionManager';

// Mock dependencies
jest.mock('@/lib/profile/sessionManager', () => ({
  SessionManager: {
    createSession: jest.fn(),
  }
}));

jest.mock('@/lib/profile/profileUtils', () => ({
  EmailValidation: {
    normalizeEmail: jest.fn((email: string) => email.toLowerCase().trim()),
    isValidEmail: jest.fn((email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)),
  }
}));

// Mock fetch
global.fetch = jest.fn();

const mockSessionManager = SessionManager as jest.Mocked<typeof SessionManager>;
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

describe('ProfileAccessModal', () => {
  const mockOnClose = jest.fn();
  const mockOnSuccess = jest.fn();

  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    onSuccess: mockOnSuccess,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should not render when isOpen is false', () => {
    render(
      <ProfileAccessModal
        {...defaultProps}
        isOpen={false}
      />
    );

    expect(screen.queryByText('Access Competitor Research Agent')).not.toBeInTheDocument();
  });

  it('should render modal when isOpen is true', () => {
    render(<ProfileAccessModal {...defaultProps} />);

    expect(screen.getByText('Access Competitor Research Agent')).toBeInTheDocument();
    expect(screen.getByText('Enter your email address to access your personalized workspace.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email Address')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Access Workspace' })).toBeInTheDocument();
  });

  it('should handle email input changes', async () => {
    const user = userEvent.setup();
    render(<ProfileAccessModal {...defaultProps} />);

    const emailInput = screen.getByLabelText('Email Address');
    
    await user.type(emailInput, 'test@hellofresh.com');

    expect(emailInput).toHaveValue('test@hellofresh.com');
  });

  it('should disable submit button when email is empty', () => {
    render(<ProfileAccessModal {...defaultProps} />);

    const submitButton = screen.getByRole('button', { name: 'Access Workspace' });
    
    expect(submitButton).toBeDisabled();
  });

  it('should enable submit button when email is provided', async () => {
    const user = userEvent.setup();
    render(<ProfileAccessModal {...defaultProps} />);

    const emailInput = screen.getByLabelText('Email Address');
    const submitButton = screen.getByRole('button', { name: 'Access Workspace' });
    
    await user.type(emailInput, 'test@hellofresh.com');

    expect(submitButton).toBeEnabled();
  });

  it('should handle successful profile creation', async () => {
    const user = userEvent.setup();
    const mockProfile = {
      id: 'profile-123',
      email: 'test@hellofresh.com',
      name: 'Test User'
    };

    const mockSession = {
      profileId: 'profile-123',
      email: 'test@hellofresh.com',
      createdAt: Date.now(),
      expiresAt: Date.now() + (24 * 60 * 60 * 1000)
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ profile: mockProfile, session: mockSession })
    } as Response);

    mockSessionManager.createSession.mockReturnValue(mockSession);

    render(<ProfileAccessModal {...defaultProps} />);

    const emailInput = screen.getByLabelText('Email Address');
    const submitButton = screen.getByRole('button', { name: 'Access Workspace' });

    await user.type(emailInput, 'test@hellofresh.com');
    await user.click(submitButton);

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
        'test@hellofresh.com'
      );

      expect(mockOnSuccess).toHaveBeenCalledWith(mockProfile);
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('should show loading state during submission', async () => {
    const user = userEvent.setup();
    
    // Mock a delayed response
    mockFetch.mockImplementationOnce(() => 
      new Promise(resolve => setTimeout(() => resolve({
        ok: true,
        json: async () => ({ profile: { id: 'test', email: 'test@hellofresh.com' } })
      } as Response), 100))
    );

    render(<ProfileAccessModal {...defaultProps} />);

    const emailInput = screen.getByLabelText('Email Address');
    const submitButton = screen.getByRole('button', { name: 'Access Workspace' });

    await user.type(emailInput, 'test@hellofresh.com');
    await user.click(submitButton);

    // Should show loading state
    expect(screen.getByText('Accessing...')).toBeInTheDocument();
    expect(submitButton).toBeDisabled();
    expect(emailInput).toBeDisabled();

    // Close button should be hidden during loading
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('should handle invalid email format', async () => {
    const user = userEvent.setup();
    render(<ProfileAccessModal {...defaultProps} />);

    const emailInput = screen.getByLabelText('Email Address');
    const submitButton = screen.getByRole('button', { name: 'Access Workspace' });

    await user.type(emailInput, 'invalid-email');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Please enter a valid email address')).toBeInTheDocument();
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should handle API error response', async () => {
    const user = userEvent.setup();
    
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Only HelloFresh email addresses are allowed' })
    } as Response);

    render(<ProfileAccessModal {...defaultProps} />);

    const emailInput = screen.getByLabelText('Email Address');
    const submitButton = screen.getByRole('button', { name: 'Access Workspace' });

    await user.type(emailInput, 'test@gmail.com');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Only HelloFresh email addresses are allowed')).toBeInTheDocument();
    });

    expect(mockOnSuccess).not.toHaveBeenCalled();
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it('should handle network error', async () => {
    const user = userEvent.setup();
    
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    render(<ProfileAccessModal {...defaultProps} />);

    const emailInput = screen.getByLabelText('Email Address');
    const submitButton = screen.getByRole('button', { name: 'Access Workspace' });

    await user.type(emailInput, 'test@hellofresh.com');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('should handle close button click', async () => {
    const user = userEvent.setup();
    render(<ProfileAccessModal {...defaultProps} />);

    const closeButton = screen.getByRole('button', { name: /close/i });
    
    await user.click(closeButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should handle cancel button click', async () => {
    const user = userEvent.setup();
    render(<ProfileAccessModal {...defaultProps} />);

    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    
    await user.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should prevent close during loading', async () => {
    const user = userEvent.setup();
    
    // Mock a delayed response
    mockFetch.mockImplementationOnce(() => 
      new Promise(resolve => setTimeout(() => resolve({
        ok: true,
        json: async () => ({ profile: { id: 'test', email: 'test@hellofresh.com' } })
      } as Response), 100))
    );

    render(<ProfileAccessModal {...defaultProps} />);

    const emailInput = screen.getByLabelText('Email Address');
    const submitButton = screen.getByRole('button', { name: 'Access Workspace' });

    await user.type(emailInput, 'test@hellofresh.com');
    await user.click(submitButton);

    // Try to close during loading - close button should not be available
    expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('should clear form state on close', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ProfileAccessModal {...defaultProps} />);

    const emailInput = screen.getByLabelText('Email Address');
    await user.type(emailInput, 'test@hellofresh.com');

    // Close modal
    const closeButton = screen.getByRole('button', { name: /close/i });
    await user.click(closeButton);

    // Reopen modal
    rerender(<ProfileAccessModal {...defaultProps} isOpen={true} />);

    // Email field should be cleared
    const newEmailInput = screen.getByLabelText('Email Address');
    expect(newEmailInput).toHaveValue('');
  });

  it('should handle form submission with Enter key', async () => {
    const user = userEvent.setup();
    const mockProfile = {
      id: 'profile-123',
      email: 'test@hellofresh.com',
      name: 'Test User'
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ profile: mockProfile })
    } as Response);

    render(<ProfileAccessModal {...defaultProps} />);

    const emailInput = screen.getByLabelText('Email Address');
    
    await user.type(emailInput, 'test@hellofresh.com');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  it('should display helpful information about the service', () => {
    render(<ProfileAccessModal {...defaultProps} />);

    expect(screen.getByText('• Your email creates a personal workspace for your projects and data')).toBeInTheDocument();
    expect(screen.getByText('• Sessions expire after 24 hours for security')).toBeInTheDocument();
    expect(screen.getByText('• Data is automatically organized by your profile')).toBeInTheDocument();
  });

  it('should have proper ARIA labels and accessibility', () => {
    render(<ProfileAccessModal {...defaultProps} />);

    const emailInput = screen.getByLabelText('Email Address');
    expect(emailInput).toHaveAttribute('type', 'email');
    expect(emailInput).toHaveAttribute('required');

    const form = emailInput.closest('form');
    expect(form).toBeInTheDocument();
  });
});
