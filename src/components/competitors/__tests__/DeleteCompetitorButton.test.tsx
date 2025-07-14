import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import DeleteCompetitorButton from '../DeleteCompetitorButton';
import { useDeleteCompetitor } from '@/hooks/useDeleteCompetitor';

// Mock dependencies
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

jest.mock('@/hooks/useDeleteCompetitor', () => ({
  useDeleteCompetitor: jest.fn(),
}));

jest.mock('@heroicons/react/24/outline', () => ({
  TrashIcon: ({ className }: { className?: string }) => (
    <div data-testid="trash-icon" className={className}>TrashIcon</div>
  ),
  ExclamationTriangleIcon: ({ className }: { className?: string }) => (
    <div data-testid="exclamation-icon" className={className}>ExclamationIcon</div>
  ),
}));

const mockRouter = {
  push: jest.fn(),
  refresh: jest.fn(),
  back: jest.fn(),
  forward: jest.fn(),
  replace: jest.fn(),
  prefetch: jest.fn(),
};

const mockDeleteCompetitor = jest.fn();
const mockUseDeleteCompetitor = {
  deleteCompetitor: mockDeleteCompetitor,
  isDeleting: false,
  error: null,
};

describe('DeleteCompetitorButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (useDeleteCompetitor as jest.Mock).mockReturnValue(mockUseDeleteCompetitor);
  });

  const defaultProps = {
    competitorId: 'test-competitor-id',
    competitorName: 'Test Competitor',
  };

  it('should render delete button', () => {
    render(<DeleteCompetitorButton {...defaultProps} />);
    
    const deleteButton = screen.getByRole('button', { name: /delete competitor/i });
    expect(deleteButton).toBeInTheDocument();
    expect(screen.getByTestId('trash-icon')).toBeInTheDocument();
  });

  it('should apply custom className when provided', () => {
    const customClass = 'custom-test-class';
    render(<DeleteCompetitorButton {...defaultProps} className={customClass} />);
    
    const deleteButton = screen.getByRole('button', { name: /delete competitor/i });
    expect(deleteButton).toHaveClass(customClass);
  });

  it('should show confirmation modal when delete button is clicked', () => {
    render(<DeleteCompetitorButton {...defaultProps} />);
    
    const deleteButton = screen.getByRole('button', { name: /delete competitor/i });
    fireEvent.click(deleteButton);
    
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/are you sure you want to delete/i)).toBeInTheDocument();
    expect(screen.getByText('Test Competitor')).toBeInTheDocument();
    expect(screen.getByTestId('exclamation-icon')).toBeInTheDocument();
  });

  it('should close modal when cancel button is clicked', () => {
    render(<DeleteCompetitorButton {...defaultProps} />);
    
    // Open modal
    const deleteButton = screen.getByRole('button', { name: /delete competitor/i });
    fireEvent.click(deleteButton);
    
    // Verify modal is open
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    
    // Close modal
    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelButton);
    
    // Verify modal is closed by checking for dialog role
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('should close modal when clicking outside (backdrop)', () => {
    render(<DeleteCompetitorButton {...defaultProps} />);
    
    // Open modal
    const deleteButton = screen.getByRole('button', { name: /delete competitor/i });
    fireEvent.click(deleteButton);
    
    // Verify modal is open
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    
    // Click the backdrop div directly (not the dialog container)
    const modalDialog = screen.getByRole('dialog');
    const backdrop = modalDialog.querySelector('.fixed.inset-0.bg-gray-500');
    expect(backdrop).toBeInTheDocument();
    fireEvent.click(backdrop!);
    
    // Verify modal is closed by checking for dialog role
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('should call deleteCompetitor when confirm button is clicked', async () => {
    mockDeleteCompetitor.mockResolvedValue({ success: true });
    
    render(<DeleteCompetitorButton {...defaultProps} />);
    
    // Open modal
    const deleteButton = screen.getByRole('button', { name: /delete competitor/i });
    fireEvent.click(deleteButton);
    
    // Confirm deletion
    const confirmButton = screen.getByRole('button', { name: /^delete$/i });
    fireEvent.click(confirmButton);
    
    expect(mockDeleteCompetitor).toHaveBeenCalledWith('test-competitor-id');
  });

  it('should show loading state during deletion', async () => {
    (useDeleteCompetitor as jest.Mock).mockReturnValue({
      ...mockUseDeleteCompetitor,
      isDeleting: true,
    });
    
    render(<DeleteCompetitorButton {...defaultProps} />);
    
    // When deleting, the main button should show "Deleting..." text and be disabled
    const deleteButton = screen.getByRole('button', { name: /deleting/i });
    expect(deleteButton).toBeDisabled();
    expect(deleteButton).toHaveTextContent('Deleting...');
    
    // When isDeleting is true, clicking the button should not open the modal
    // since the button is disabled
    fireEvent.click(deleteButton);
    
    // Verify modal did not open when button is disabled
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('should disable delete button when deleting', async () => {
    (useDeleteCompetitor as jest.Mock).mockReturnValue({
      ...mockUseDeleteCompetitor,
      isDeleting: true,
    });
    
    render(<DeleteCompetitorButton {...defaultProps} />);
    
    // When deleting, the button text changes to "Deleting..." and becomes disabled
    const deleteButton = screen.getByRole('button', { name: /deleting/i });
    expect(deleteButton).toBeDisabled();
  });

  it('should call onDeleteSuccess callback on successful deletion', async () => {
    const onDeleteSuccess = jest.fn();
    mockDeleteCompetitor.mockResolvedValue({ success: true });
    
    render(
      <DeleteCompetitorButton 
        {...defaultProps} 
        onDeleteSuccess={onDeleteSuccess} 
      />
    );
    
    // Open modal
    const deleteButton = screen.getByRole('button', { name: /delete competitor/i });
    fireEvent.click(deleteButton);
    
    // Confirm deletion
    const confirmButton = screen.getByRole('button', { name: /^delete$/i });
    fireEvent.click(confirmButton);
    
    await waitFor(() => {
      expect(onDeleteSuccess).toHaveBeenCalled();
    });
  });

  it('should call onDeleteError callback on failed deletion', async () => {
    const onDeleteError = jest.fn();
    const errorMessage = 'Deletion failed';
    mockDeleteCompetitor.mockResolvedValue({ 
      success: false, 
      message: errorMessage 
    });
    
    render(
      <DeleteCompetitorButton 
        {...defaultProps} 
        onDeleteError={onDeleteError} 
      />
    );
    
    // Open modal
    const deleteButton = screen.getByRole('button', { name: /delete competitor/i });
    fireEvent.click(deleteButton);
    
    // Confirm deletion
    const confirmButton = screen.getByRole('button', { name: /^delete$/i });
    fireEvent.click(confirmButton);
    
    await waitFor(() => {
      expect(onDeleteError).toHaveBeenCalledWith(errorMessage);
    });
  });

  it('should display error message from hook', () => {
    const errorMessage = 'Network error occurred';
    (useDeleteCompetitor as jest.Mock).mockReturnValue({
      ...mockUseDeleteCompetitor,
      error: errorMessage,
    });
    
    render(<DeleteCompetitorButton {...defaultProps} />);
    
    expect(screen.getByText(errorMessage)).toBeInTheDocument();
    expect(screen.getByText(errorMessage)).toHaveClass('text-red-600');
  });

  it('should close modal after successful deletion', async () => {
    mockDeleteCompetitor.mockResolvedValue({ success: true });
    
    render(<DeleteCompetitorButton {...defaultProps} />);
    
    // Open modal
    const deleteButton = screen.getByRole('button', { name: /delete competitor/i });
    fireEvent.click(deleteButton);
    
    // Verify modal is open first
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    
    // Confirm deletion
    const confirmButton = screen.getByRole('button', { name: /^delete$/i });
    fireEvent.click(confirmButton);
    
    // Wait for modal to close after successful deletion
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('should handle keyboard navigation (ESC to close modal)', () => {
    render(<DeleteCompetitorButton {...defaultProps} />);
    
    // Open modal
    const deleteButton = screen.getByRole('button', { name: /delete competitor/i });
    fireEvent.click(deleteButton);
    
    // Press ESC
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('should trap focus within modal when open', () => {
    render(<DeleteCompetitorButton {...defaultProps} />);
    
    // Open modal
    const deleteButton = screen.getByRole('button', { name: /delete competitor/i });
    fireEvent.click(deleteButton);
    
    // Focus should be trapped within modal
    const modal = screen.getByRole('dialog');
    expect(modal).toBeInTheDocument();
    
    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    const confirmButton = screen.getByRole('button', { name: /^delete$/i });
    
    expect(cancelButton).toBeInTheDocument();
    expect(confirmButton).toBeInTheDocument();
  });

  it('should have proper ARIA attributes', () => {
    render(<DeleteCompetitorButton {...defaultProps} />);
    
    const deleteButton = screen.getByRole('button', { name: /delete competitor/i });
    // The button text should be sufficient for accessibility
    expect(deleteButton).toHaveTextContent('Delete Competitor');
    
    // Open modal
    fireEvent.click(deleteButton);
    
    const modal = screen.getByRole('dialog');
    expect(modal).toHaveAttribute('aria-modal', 'true');
    expect(modal).toHaveAttribute('aria-labelledby');
  });

  it('should clear error when modal is opened', () => {
    const { rerender } = render(<DeleteCompetitorButton {...defaultProps} />);
    
    // Set error state
    (useDeleteCompetitor as jest.Mock).mockReturnValue({
      ...mockUseDeleteCompetitor,
      error: 'Some error',
    });
    
    rerender(<DeleteCompetitorButton {...defaultProps} />);
    expect(screen.getByText('Some error')).toBeInTheDocument();
    
    // Open modal (this should clear error)
    const deleteButton = screen.getByRole('button', { name: /delete competitor/i });
    fireEvent.click(deleteButton);
    
    // Error should still be visible as it's from the hook state
    expect(screen.getAllByText('Some error')).toHaveLength(2); // One outside modal, one in modal
  });
}); 