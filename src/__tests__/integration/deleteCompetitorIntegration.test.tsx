import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import DeleteCompetitorButton from '@/components/competitors/DeleteCompetitorButton';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

// Mock fetch globally
global.fetch = jest.fn();

const mockRouter = {
  push: jest.fn(),
  refresh: jest.fn(),
  back: jest.fn(),
  forward: jest.fn(),
  replace: jest.fn(),
  prefetch: jest.fn(),
};

describe('Delete Competitor Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (global.fetch as jest.Mock).mockClear();
  });

  describe('Complete Delete Flow', () => {
    const defaultProps = {
      competitorId: 'test-competitor-id',
      competitorName: 'Test Competitor',
    };

    it('should complete successful deletion flow with API integration', async () => {
      // Mock successful API response
      const mockApiResponse = {
        ok: true,
        json: async () => ({
          message: 'Competitor deleted successfully',
          deletedCompetitor: {
            id: 'test-competitor-id',
            name: 'Test Competitor'
          },
          relatedDataCount: {
            reports: 2,
            snapshots: 5
          },
          correlationId: 'test-correlation-id'
        })
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce(mockApiResponse);

      const mockOnDeleteSuccess = jest.fn();
      const mockOnDeleteError = jest.fn();

      // Render component
      render(
        <DeleteCompetitorButton
          {...defaultProps}
          onDeleteSuccess={mockOnDeleteSuccess}
          onDeleteError={mockOnDeleteError}
        />
      );

      // Step 1: Click delete button to open modal
      const deleteButton = screen.getByRole('button', { name: /delete competitor/i });
      fireEvent.click(deleteButton);

      // Step 2: Verify modal opens with correct content
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Delete Competitor' })).toBeInTheDocument();
      expect(screen.getByText(/Are you sure you want to delete/)).toBeInTheDocument();
      expect(screen.getByText(/Test Competitor/)).toBeInTheDocument();

      // Step 3: Click confirm delete button in modal
      const confirmButton = screen.getByRole('button', { name: 'Delete' });
      fireEvent.click(confirmButton);

      // Step 4: Wait for API call and verify success callback
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/competitors/test-competitor-id',
          expect.objectContaining({
            method: 'DELETE',
            headers: expect.objectContaining({
              'Content-Type': 'application/json',
            }),
          })
        );
      });

      // Step 5: Verify success callback was called
      await waitFor(() => {
        expect(mockOnDeleteSuccess).toHaveBeenCalled();
      });

      // Step 6: Verify modal is closed after successful deletion
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });

      // Step 7: Verify router navigation (if implemented)
      await waitFor(() => {
        expect(mockRouter.push).toHaveBeenCalledWith('/competitors');
      });
    });

    it('should handle API error responses gracefully', async () => {
      // Mock 404 API response
      const mockApiResponse = {
        ok: false,
        status: 404,
        json: async () => ({
          error: 'Competitor not found',
          message: 'The competitor you are trying to delete does not exist.',
          correlationId: 'error-correlation-id'
        })
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce(mockApiResponse);

      const mockOnDeleteSuccess = jest.fn();
      const mockOnDeleteError = jest.fn();

      render(
        <DeleteCompetitorButton
          {...defaultProps}
          onDeleteSuccess={mockOnDeleteSuccess}
          onDeleteError={mockOnDeleteError}
        />
      );

      // Click delete button to open modal
      const deleteButton = screen.getByRole('button', { name: /delete competitor/i });
      fireEvent.click(deleteButton);

      // Confirm deletion
      const confirmButton = screen.getByRole('button', { name: 'Delete' });
      fireEvent.click(confirmButton);

      // Wait for API call
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      // Verify error handling
      await waitFor(() => {
        expect(mockOnDeleteError).toHaveBeenCalledWith('Competitor not found');
      });

      // Verify modal stays open on error
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      // Verify error message is displayed
      const errorMessages = screen.getAllByText(/Competitor not found/);
      expect(errorMessages.length).toBeGreaterThan(0);
    });

    it('should handle network errors', async () => {
      // Mock network error
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      const mockOnDeleteSuccess = jest.fn();
      const mockOnDeleteError = jest.fn();

      render(
        <DeleteCompetitorButton
          {...defaultProps}
          onDeleteSuccess={mockOnDeleteSuccess}
          onDeleteError={mockOnDeleteError}
        />
      );

      // Click delete button to open modal
      const deleteButton = screen.getByRole('button', { name: /delete competitor/i });
      fireEvent.click(deleteButton);

      // Confirm deletion
      const confirmButton = screen.getByRole('button', { name: 'Delete' });
      fireEvent.click(confirmButton);

      // Verify network error handling
      await waitFor(() => {
        expect(mockOnDeleteError).toHaveBeenCalledWith(
          'Network error occurred. Please check your connection and try again.'
        );
      });

      // Verify modal stays open on error
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  describe('Callback Functions', () => {
    const defaultProps = {
      competitorId: 'test-competitor-id',
      competitorName: 'Test Competitor',
    };

    it('should call onDeleteSuccess callback after successful deletion', async () => {
      // Mock successful API response
      const mockApiResponse = {
        ok: true,
        json: async () => ({
          message: 'Competitor deleted successfully',
          deletedCompetitor: {
            id: 'test-competitor-id',
            name: 'Test Competitor'
          }
        })
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce(mockApiResponse);

      const mockOnDeleteSuccess = jest.fn();
      const mockOnDeleteError = jest.fn();

      render(
        <DeleteCompetitorButton
          {...defaultProps}
          onDeleteSuccess={mockOnDeleteSuccess}
          onDeleteError={mockOnDeleteError}
        />
      );

      // Click delete button to open modal
      const deleteButton = screen.getByRole('button', { name: /delete competitor/i });
      fireEvent.click(deleteButton);

      // Confirm deletion
      const confirmButton = screen.getByRole('button', { name: 'Delete' });
      fireEvent.click(confirmButton);

      // Wait for API call to complete
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/competitors/test-competitor-id',
          expect.objectContaining({
            method: 'DELETE'
          })
        );
      });

      // Verify success callback is called
      await waitFor(() => {
        expect(mockOnDeleteSuccess).toHaveBeenCalled();
      });

      // Verify error callback is not called
      expect(mockOnDeleteError).not.toHaveBeenCalled();
    });
  });
}); 