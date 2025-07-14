import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface DeleteResult {
  success: boolean;
  message?: string;
  correlationId?: string;
}

interface UseDeleteCompetitorReturn {
  deleteCompetitor: (id: string) => Promise<DeleteResult>;
  isDeleting: boolean;
  error: string | null;
}

/**
 * Custom hook for deleting a competitor
 * Handles API communication, loading states, and error management
 */
export function useDeleteCompetitor(): UseDeleteCompetitorReturn {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const deleteCompetitor = useCallback(async (id: string): Promise<DeleteResult> => {
    if (!id) {
      const errorMessage = 'Competitor ID is required';
      setError(errorMessage);
      return { success: false, message: errorMessage };
    }

    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/competitors/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle different error scenarios based on status code
        let errorMessage = 'Failed to delete competitor';
        
        switch (response.status) {
          case 404:
            errorMessage = 'Competitor not found';
            break;
          case 409:
            errorMessage = data.message || 'Cannot delete competitor due to existing dependencies';
            break;
          case 500:
            errorMessage = `Server error occurred${data.correlationId ? ` (ID: ${data.correlationId})` : ''}`;
            break;
          default:
            errorMessage = data.message || errorMessage;
        }

        setError(errorMessage);
        return { 
          success: false, 
          message: errorMessage,
          correlationId: data.correlationId 
        };
      }

      // Success case
      return {
        success: true,
        message: data.message || 'Competitor deleted successfully',
        correlationId: data.correlationId
      };

    } catch (networkError) {
      const errorMessage = 'Network error occurred. Please check your connection and try again.';
      setError(errorMessage);
      return { success: false, message: errorMessage };
    } finally {
      setIsDeleting(false);
    }
  }, []);

  return {
    deleteCompetitor,
    isDeleting,
    error,
  };
} 