/**
 * Task 3.2: Memory Tracking Middleware
 * Middleware for tracking memory usage per API endpoint
 */

import { NextRequest, NextResponse } from 'next/server';
import { profileEndpoint } from '@/lib/debug/memoryProfiler';
import { logger } from '@/lib/logger';

/**
 * Memory tracking middleware for API endpoints
 */
export function memoryTrackingMiddleware(
  handler: (req: NextRequest) => Promise<NextResponse>
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    // Extract endpoint information
    const endpoint = req.nextUrl.pathname;
    const method = req.method;
    const requestId = req.headers.get('x-request-id') || undefined;

    // Start memory profiling
    const endProfiling = profileEndpoint(endpoint, method, requestId, {
      userAgent: req.headers.get('user-agent') || undefined,
      contentLength: req.headers.get('content-length') || undefined
    });

    let response: NextResponse;
    let error: Error | null = null;

    try {
      // Execute the API handler
      response = await handler(req);
    } catch (err) {
      error = err as Error;
      logger.error('API endpoint error during memory profiling', err as Error);
      
      // Create error response
      response = NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }

    // End memory profiling with response details
    const responseSize = response.headers.get('content-length') 
      ? parseInt(response.headers.get('content-length')!) 
      : undefined;
    
    endProfiling(response.status, responseSize);

    // Log additional context if there was an error
    if (error) {
      logger.error('Memory profiling completed with error', error);
    }

    return response;
  };
}

/**
 * Simple memory tracking for non-Next.js environments
 */
export function trackApiCall<T>(
  endpoint: string,
  method: string,
  handler: () => Promise<T>,
  requestId?: string
): Promise<T> {
  const endProfiling = profileEndpoint(endpoint, method, requestId);
  
  return handler()
    .then((result) => {
      endProfiling(200); // Assume success
      return result;
    })
    .catch((error) => {
      endProfiling(500); // Assume error
      throw error;
    });
}

/**
 * Decorator for automatic memory tracking
 */
export function MemoryTracked(endpoint?: string) {
  return function (
    target: any,
    propertyName: string,
    descriptor: PropertyDescriptor
  ) {
    const method = descriptor.value;
    const endpointName = endpoint || `${target.constructor.name}.${propertyName}`;

    descriptor.value = async function (...args: any[]) {
      const endProfiling = profileEndpoint(endpointName, 'METHOD');
      
      try {
        const result = await method.apply(this, args);
        endProfiling(200);
        return result;
      } catch (error) {
        endProfiling(500);
        throw error;
      }
    };

    return descriptor;
  };
} 