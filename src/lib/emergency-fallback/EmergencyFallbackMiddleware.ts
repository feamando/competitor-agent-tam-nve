/**
 * Task 4.1: Emergency Fallback Middleware
 * Integrates emergency fallback system with existing services and API endpoints
 */

import { emergencyFallbackSystem, EmergencyFallbackOptions, EmergencyFallbackResult } from './EmergencyFallbackSystem';
import { logger, generateCorrelationId, createCorrelationLogger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';

// Middleware configuration
export interface FallbackMiddlewareConfig {
  enableCircuitBreaker?: boolean;
  enableRetry?: boolean;
  enableEmergencyMode?: boolean;
  maxRetries?: number;
  timeoutMs?: number;
  operationType: 'report_generation' | 'analysis' | 'data_collection' | 'service_initialization';
}

// Enhanced API response with fallback information
export interface EnhancedAPIResponse<T = any> {
  success: boolean;
  data?: T | undefined;
  error?: string | undefined;
  fallbackInfo?: {
    fallbackUsed: boolean;
    fallbackType: string;
    recoveryTime: number;
    userMessage: string;
    warnings: string[];
  } | undefined;
  correlationId: string;
  timestamp: string;
  retryable?: boolean | undefined;
  retryAfter?: number | undefined;
}

/**
 * Emergency Fallback Middleware for API endpoints
 */
export class EmergencyFallbackMiddleware {
  /**
   * Wrap API endpoint with emergency fallback protection
   */
  static withFallback<T>(
    handler: (request: NextRequest, context: any) => Promise<T>,
    config: FallbackMiddlewareConfig
  ) {
    return async (request: NextRequest, context: any = {}): Promise<NextResponse> => {
      const correlationId = generateCorrelationId();
      const correlatedLogger = createCorrelationLogger(correlationId);
      
      const requestContext = {
        method: request.method,
        url: request.url,
        correlationId,
        operationType: config.operationType
      };

      correlatedLogger.info('API request with fallback protection', requestContext);

      try {
        // Extract project ID from request (multiple possible locations)
        const projectId = await this.extractProjectId(request, context);
        
        if (!projectId) {
          return NextResponse.json({
            success: false,
            error: 'Project ID is required',
            correlationId,
            timestamp: new Date().toISOString()
          }, { status: 400 });
        }

                 // Execute with fallback protection
         const fallbackOptions: EmergencyFallbackOptions = {
           projectId,
           operationType: config.operationType,
           originalError: new Error('API operation'),
           correlationId,
           enableEmergencyMode: config.enableEmergencyMode ?? false
         };

        const result = await emergencyFallbackSystem.executeWithFallback(
          () => handler(request, { ...context, correlationId, projectId }),
          fallbackOptions
        );

        return this.createResponse(result, correlationId);

      } catch (error) {
        correlatedLogger.error('Unhandled error in fallback middleware', error as Error, requestContext);
        
        return NextResponse.json({
          success: false,
          error: 'Internal server error',
          correlationId,
          timestamp: new Date().toISOString()
        }, { status: 500 });
      }
    };
  }

  /**
   * Wrap service method with emergency fallback protection
   */
  static async wrapServiceMethod<T>(
    serviceMethod: () => Promise<T>,
    options: EmergencyFallbackOptions
  ): Promise<EmergencyFallbackResult<T>> {
    return emergencyFallbackSystem.executeWithFallback(serviceMethod, options);
  }

  /**
   * Extract project ID from various request sources
   */
  private static async extractProjectId(request: NextRequest, context: any): Promise<string | null> {
    // Try URL search params
    const { searchParams } = new URL(request.url);
    let projectId = searchParams.get('projectId');
    
    if (projectId) return projectId;

    // Try request body
    try {
      const body = await request.clone().json();
      projectId = body.projectId;
      if (projectId) return projectId;
    } catch {
      // Ignore JSON parsing errors
    }

         // Try context
     projectId = context.projectId;
     if (projectId) return projectId;

     // Try URL path parameters
     const urlParts = request.url.split('/');
     const projectIndex = urlParts.findIndex(part => part === 'projects');
     if (projectIndex !== -1 && projectIndex + 1 < urlParts.length) {
       return urlParts[projectIndex + 1] || null;
     }

     return null;
  }

  /**
   * Create standardized response from fallback result
   */
  private static createResponse<T>(
    result: EmergencyFallbackResult<T>,
    correlationId: string
  ): NextResponse {
    const response: EnhancedAPIResponse<T> = {
      success: result.success,
      data: result.data,
      correlationId,
      timestamp: new Date().toISOString()
    };

    if (!result.success) {
      response.error = result.errorClassification.userFriendlyMessage;
      response.retryable = result.errorClassification.retryable;
      
      if (result.errorClassification.estimatedRecoveryTime) {
        response.retryAfter = Math.ceil(result.errorClassification.estimatedRecoveryTime / 1000);
      }
    }

    if (result.fallbackUsed) {
      response.fallbackInfo = {
        fallbackUsed: result.fallbackUsed,
        fallbackType: result.fallbackType,
        recoveryTime: result.recoveryTime,
        userMessage: result.userMessage,
        warnings: result.warnings
      };
    }

    const statusCode = result.success ? 200 : this.getStatusCodeFromError(result.errorClassification);
    
    return NextResponse.json(response, { status: statusCode });
  }

  /**
   * Determine HTTP status code from error classification
   */
  private static getStatusCodeFromError(classification: any): number {
    switch (classification.category) {
      case 'authentication':
        return 401;
      case 'authorization':
        return 403;
      case 'data_validation':
        return 400;
      case 'rate_limit':
        return 429;
      case 'service_unavailable':
      case 'resource_exhaustion':
        return 503;
      case 'network':
      case 'external_dependency':
        return 502;
      default:
        return 500;
    }
  }
}

/**
 * Service wrapper for emergency fallback
 */
export class EmergencyFallbackServiceWrapper {
  /**
   * Wrap service instance with fallback protection
   */
  static wrap<T extends object>(
    service: T,
    projectId: string,
    operationType: EmergencyFallbackOptions['operationType']
  ): T {
    const correlationId = generateCorrelationId();
    
    return new Proxy(service, {
      get(target, prop, receiver) {
        const original = Reflect.get(target, prop, receiver);
        
        if (typeof original === 'function') {
          return async (...args: any[]) => {
            const fallbackOptions: EmergencyFallbackOptions = {
              projectId,
              operationType,
              originalError: new Error(`Service method ${String(prop)} failed`),
              correlationId
            };

            const result = await emergencyFallbackSystem.executeWithFallback(
              () => original.apply(target, args),
              fallbackOptions
            );

            if (!result.success) {
              throw new Error(result.errorClassification.userFriendlyMessage);
            }

            return result.data;
          };
        }
        
        return original;
      }
    });
  }
}

/**
 * Hook for React components to use emergency fallback
 */
export function useEmergencyFallback(projectId: string) {
  const executeWithFallback = async <T>(
    operation: () => Promise<T>,
    operationType: EmergencyFallbackOptions['operationType']
  ): Promise<EmergencyFallbackResult<T>> => {
    const fallbackOptions: EmergencyFallbackOptions = {
      projectId,
      operationType,
      originalError: new Error('Component operation failed'),
      correlationId: generateCorrelationId()
    };

    return emergencyFallbackSystem.executeWithFallback(operation, fallbackOptions);
  };

  const isEmergencyMode = emergencyFallbackSystem.isEmergencyModeActive(projectId);
  
  return {
    executeWithFallback,
    isEmergencyMode,
    disableEmergencyMode: () => emergencyFallbackSystem.disableEmergencyMode(projectId)
  };
}

/**
 * Utility functions for error handling
 */
export class EmergencyFallbackUtils {
  /**
   * Create user-friendly error message
   */
  static createUserFriendlyError(error: Error, operationType: string): string {
    const classification = emergencyFallbackSystem.classifyError(error);
    return classification.userFriendlyMessage;
  }

  /**
   * Check if error is retryable
   */
  static isRetryable(error: Error): boolean {
    const classification = emergencyFallbackSystem.classifyError(error);
    return classification.retryable;
  }

  /**
   * Get estimated recovery time
   */
  static getEstimatedRecoveryTime(error: Error): number | undefined {
    const classification = emergencyFallbackSystem.classifyError(error);
    return classification.estimatedRecoveryTime;
  }

  /**
   * Create standardized error response
   */
  static createErrorResponse(
    error: Error,
    correlationId: string,
    operationType: string
  ): EnhancedAPIResponse {
    const classification = emergencyFallbackSystem.classifyError(error);
    
    return {
      success: false,
      error: classification.userFriendlyMessage,
      correlationId,
      timestamp: new Date().toISOString(),
      retryable: classification.retryable,
      retryAfter: classification.estimatedRecoveryTime ? 
        Math.ceil(classification.estimatedRecoveryTime / 1000) : undefined
    };
  }
}

// Export for use in API routes
export { EmergencyFallbackMiddleware as default }; 