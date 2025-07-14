import { renderHook, act } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { useDeleteCompetitor } from '../useDeleteCompetitor';

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

describe('useDeleteCompetitor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (global.fetch as jest.Mock).mockClear();
  });

  it('should initialize with default state', () => {
    const { result } = renderHook(() => useDeleteCompetitor());

    expect(result.current.isDeleting).toBe(false);
    expect(result.current.error).toBe(null);
    expect(typeof result.current.deleteCompetitor).toBe('function');
  });

  it('should handle successful deletion', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        message: 'Competitor deleted successfully',
        correlationId: 'test-correlation-id'
      }),
    };
    (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse);

    const { result } = renderHook(() => useDeleteCompetitor());

    let deleteResult;
    await act(async () => {
      deleteResult = await result.current.deleteCompetitor('test-competitor-id');
    });

    expect(global.fetch).toHaveBeenCalledWith('/api/competitors/test-competitor-id', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    expect(deleteResult).toEqual({
      success: true,
      message: 'Competitor deleted successfully',
      correlationId: 'test-correlation-id'
    });

    expect(result.current.isDeleting).toBe(false);
    expect(result.current.error).toBe(null);
  });

  it('should handle deletion with default success message', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        correlationId: 'test-correlation-id'
      }),
    };
    (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse);

    const { result } = renderHook(() => useDeleteCompetitor());

    let deleteResult;
    await act(async () => {
      deleteResult = await result.current.deleteCompetitor('test-competitor-id');
    });

    expect(deleteResult).toEqual({
      success: true,
      message: 'Competitor deleted successfully',
      correlationId: 'test-correlation-id'
    });
  });

  it('should handle 404 error (competitor not found)', async () => {
    const mockResponse = {
      ok: false,
      status: 404,
      json: async () => ({
        error: 'Competitor not found',
        correlationId: 'test-correlation-id'
      }),
    };
    (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse);

    const { result } = renderHook(() => useDeleteCompetitor());

    let deleteResult;
    await act(async () => {
      deleteResult = await result.current.deleteCompetitor('non-existent-id');
    });

    expect(deleteResult).toEqual({
      success: false,
      message: 'Competitor not found',
      correlationId: 'test-correlation-id'
    });

    expect(result.current.error).toBe('Competitor not found');
    expect(result.current.isDeleting).toBe(false);
  });

  it('should handle 409 error (conflict/dependencies exist)', async () => {
    const mockResponse = {
      ok: false,
      status: 409,
      json: async () => ({
        message: 'Cannot delete competitor due to existing dependencies',
        correlationId: 'test-correlation-id'
      }),
    };
    (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse);

    const { result } = renderHook(() => useDeleteCompetitor());

    let deleteResult;
    await act(async () => {
      deleteResult = await result.current.deleteCompetitor('competitor-with-deps');
    });

    expect(deleteResult).toEqual({
      success: false,
      message: 'Cannot delete competitor due to existing dependencies',
      correlationId: 'test-correlation-id'
    });

    expect(result.current.error).toBe('Cannot delete competitor due to existing dependencies');
  });

  it('should handle 500 server error', async () => {
    const mockResponse = {
      ok: false,
      status: 500,
      json: async () => ({
        error: 'Internal server error',
        correlationId: 'test-correlation-id'
      }),
    };
    (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse);

    const { result } = renderHook(() => useDeleteCompetitor());

    let deleteResult;
    await act(async () => {
      deleteResult = await result.current.deleteCompetitor('test-competitor-id');
    });

    expect(deleteResult).toEqual({
      success: false,
      message: 'Server error occurred (ID: test-correlation-id)',
      correlationId: 'test-correlation-id'
    });

    expect(result.current.error).toBe('Server error occurred (ID: test-correlation-id)');
  });

  it('should handle 500 server error without correlation ID', async () => {
    const mockResponse = {
      ok: false,
      status: 500,
      json: async () => ({
        error: 'Internal server error'
      }),
    };
    (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse);

    const { result } = renderHook(() => useDeleteCompetitor());

    let deleteResult;
    await act(async () => {
      deleteResult = await result.current.deleteCompetitor('test-competitor-id');
    });

    expect(deleteResult).toEqual({
      success: false,
      message: 'Server error occurred'
    });
  });

  it('should handle network errors', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useDeleteCompetitor());

    let deleteResult;
    await act(async () => {
      deleteResult = await result.current.deleteCompetitor('test-competitor-id');
    });

    expect(deleteResult).toEqual({
      success: false,
      message: 'Network error occurred. Please check your connection and try again.'
    });

    expect(result.current.error).toBe('Network error occurred. Please check your connection and try again.');
    expect(result.current.isDeleting).toBe(false);
  });

  it('should handle empty competitor ID', async () => {
    const { result } = renderHook(() => useDeleteCompetitor());

    let deleteResult;
    await act(async () => {
      deleteResult = await result.current.deleteCompetitor('');
    });

    expect(deleteResult).toEqual({
      success: false,
      message: 'Competitor ID is required'
    });

    expect(result.current.error).toBe('Competitor ID is required');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should handle null competitor ID', async () => {
    const { result } = renderHook(() => useDeleteCompetitor());

    let deleteResult;
    await act(async () => {
      deleteResult = await result.current.deleteCompetitor(null as any);
    });

    expect(deleteResult).toEqual({
      success: false,
      message: 'Competitor ID is required'
    });

    expect(result.current.error).toBe('Competitor ID is required');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should set loading state during deletion', async () => {
    let resolvePromise: (value: any) => void;
    const mockPromise = new Promise((resolve) => {
      resolvePromise = resolve;
    });

    (global.fetch as jest.Mock).mockReturnValueOnce(mockPromise);

    const { result } = renderHook(() => useDeleteCompetitor());

    // Start deletion
    act(() => {
      result.current.deleteCompetitor('test-competitor-id');
    });

    // Should be in loading state
    expect(result.current.isDeleting).toBe(true);
    expect(result.current.error).toBe(null);

    // Resolve the promise
    await act(async () => {
      resolvePromise!({
        ok: true,
        json: async () => ({ message: 'Success' }),
      });
    });

    // Should no longer be loading
    expect(result.current.isDeleting).toBe(false);
  });

  it('should clear error state when starting new deletion', async () => {
    // First call that fails
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useDeleteCompetitor());

    // First deletion attempt
    await act(async () => {
      await result.current.deleteCompetitor('test-competitor-id');
    });

    expect(result.current.error).toBe('Network error occurred. Please check your connection and try again.');

    // Second call that succeeds
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: 'Success' }),
    });

    // Second deletion attempt should clear error
    await act(async () => {
      await result.current.deleteCompetitor('test-competitor-id');
    });

    expect(result.current.error).toBe(null);
  });

  it('should handle unknown HTTP status codes', async () => {
    const mockResponse = {
      ok: false,
      status: 418, // I'm a teapot
      json: async () => ({
        message: 'Custom error message',
        correlationId: 'test-correlation-id'
      }),
    };
    (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse);

    const { result } = renderHook(() => useDeleteCompetitor());

    let deleteResult;
    await act(async () => {
      deleteResult = await result.current.deleteCompetitor('test-competitor-id');
    });

    expect(deleteResult).toEqual({
      success: false,
      message: 'Custom error message',
      correlationId: 'test-correlation-id'
    });
  });

  it('should fallback to default error message when API provides no message', async () => {
    const mockResponse = {
      ok: false,
      status: 418,
      json: async () => ({
        correlationId: 'test-correlation-id'
      }),
    };
    (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse);

    const { result } = renderHook(() => useDeleteCompetitor());

    let deleteResult;
    await act(async () => {
      deleteResult = await result.current.deleteCompetitor('test-competitor-id');
    });

    expect(deleteResult).toEqual({
      success: false,
      message: 'Failed to delete competitor',
      correlationId: 'test-correlation-id'
    });
  });
}); 