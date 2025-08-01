/**
 * Metrics Middleware - Task 7.1
 * 
 * Middleware for automatically capturing project resolution metrics
 * across all project discovery operations. Integrates seamlessly with
 * existing project discovery service to track success/failure rates.
 * 
 * Features:
 * - Automatic metric collection for all project resolution attempts
 * - Performance tracking (latency, cache hits)
 * - Error categorization and analysis
 * - Request source tracking (API, migration, background)
 * - Correlation ID tracking for request tracing
 * 
 * Part of TP-013-20250801-project-report-association-fix
 */

import { projectResolutionMetrics, ProjectResolutionAttempt } from '../metrics/projectResolutionMetrics';
import { logger, generateCorrelationId } from '../logger';
import { ProjectDiscoveryResult, ProjectDiscoveryOptions } from '@/services/projectDiscoveryService';

/**
 * Enhanced project discovery result with metrics metadata
 */
export interface MetricsEnhancedProjectDiscoveryResult extends ProjectDiscoveryResult {
  metrics?: {
    latencyMs: number;
    cacheHit: boolean;
    correlationId: string;
    requestSource: ProjectResolutionAttempt['requestSource'];
  };
}

/**
 * Metrics collection decorator for project discovery methods
 */
export function withProjectResolutionMetrics<T extends (...args: any[]) => Promise<ProjectDiscoveryResult>>(
  originalMethod: T,
  methodName: string,
  defaultRequestSource: ProjectResolutionAttempt['requestSource'] = 'api'
): T {
  return (async function(...args: Parameters<T>): Promise<MetricsEnhancedProjectDiscoveryResult> {
    const startTime = Date.now();
    const correlationId = generateCorrelationId();
    const competitorId = args[0] as string; // First argument is typically competitorId
    const options = args[1] as ProjectDiscoveryOptions | undefined;
    const requestSource = options?.requestSource || defaultRequestSource;
    
    logger.debug('Starting project resolution with metrics', {
      method: methodName,
      competitorId,
      correlationId,
      requestSource
    });
    
    try {
      const result = await originalMethod.apply(this, args);
      const endTime = Date.now();
      const latencyMs = endTime - startTime;
      
      // Determine if this was a cache hit (heuristic based on very fast response)
      const cacheHit = latencyMs < 10 && result.success;
      
      // Record metrics based on result
      if (result.success && result.projectId) {
        // Determine confidence level
        let confidence: 'high' | 'medium' | 'low' = 'medium';
        if (result.projects && result.projects.length === 1) {
          confidence = 'high';
        } else if (result.requiresExplicitSelection) {
          confidence = 'low';
        }
        
        // Determine resolution method
        let resolutionMethod = 'unknown';
        if (result.projects && result.projects.length === 1) {
          resolutionMethod = 'direct_single_project';
        } else if (result.projects && result.projects.length > 1) {
          resolutionMethod = 'multiple_projects_priority';
        }
        
        projectResolutionMetrics.recordSuccess({
          competitorId,
          projectId: result.projectId,
          confidence,
          resolutionMethod,
          latencyMs,
          cacheHit,
          multipleProjectsFound: result.projects?.length || 0,
          requestSource,
          correlationId
        });
        
        logger.info('Project resolution succeeded', {
          method: methodName,
          competitorId,
          projectId: result.projectId,
          confidence,
          latencyMs,
          cacheHit,
          correlationId
        });
      } else {
        // Determine error type
        let errorType = 'unknown_error';
        let errorMessage = result.error || 'Unknown error';
        
        if (result.error?.includes('No projects associated')) {
          errorType = 'no_projects_found';
        } else if (result.requiresExplicitSelection) {
          errorType = 'multiple_projects_ambiguous';
        } else if (result.error?.includes('database') || result.error?.includes('connection')) {
          errorType = 'database_error';
        } else if (result.error?.includes('required') || result.error?.includes('validation')) {
          errorType = 'validation_error';
        }
        
        projectResolutionMetrics.recordFailure({
          competitorId,
          errorType,
          errorMessage,
          latencyMs,
          cacheHit,
          requestSource,
          correlationId
        });
        
        logger.warn('Project resolution failed', {
          method: methodName,
          competitorId,
          errorType,
          errorMessage,
          latencyMs,
          correlationId
        });
      }
      
      // Return enhanced result with metrics metadata
      return {
        ...result,
        metrics: {
          latencyMs,
          cacheHit,
          correlationId,
          requestSource
        }
      };
      
    } catch (error) {
      const endTime = Date.now();
      const latencyMs = endTime - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      projectResolutionMetrics.recordFailure({
        competitorId,
        errorType: 'system_error',
        errorMessage,
        latencyMs,
        cacheHit: false,
        requestSource,
        correlationId
      });
      
      logger.error('Project resolution system error', error as Error, {
        method: methodName,
        competitorId,
        latencyMs,
        correlationId
      });
      
      throw error;
    }
  }) as T;
}

/**
 * Metrics collection for batch operations
 */
export class BatchMetricsCollector {
  private batchId: string;
  private startTime: number;
  private attempts: number = 0;
  private successes: number = 0;
  private failures: number = 0;
  
  constructor(
    private requestSource: ProjectResolutionAttempt['requestSource'],
    private operationName: string
  ) {
    this.batchId = generateCorrelationId();
    this.startTime = Date.now();
    
    logger.info('Starting batch project resolution operation', {
      batchId: this.batchId,
      requestSource: this.requestSource,
      operationName: this.operationName
    });
  }
  
  recordAttempt(competitorId: string, result: ProjectDiscoveryResult, latencyMs: number): void {
    this.attempts++;
    
    if (result.success && result.projectId) {
      this.successes++;
      
      let confidence: 'high' | 'medium' | 'low' = 'medium';
      if (result.projects && result.projects.length === 1) {
        confidence = 'high';
      } else if (result.requiresExplicitSelection) {
        confidence = 'low';
      }
      
      let resolutionMethod = 'batch_operation';
      if (result.projects && result.projects.length === 1) {
        resolutionMethod = 'batch_direct_single_project';
      } else if (result.projects && result.projects.length > 1) {
        resolutionMethod = 'batch_multiple_projects_priority';
      }
      
      projectResolutionMetrics.recordSuccess({
        competitorId,
        projectId: result.projectId,
        confidence,
        resolutionMethod,
        latencyMs,
        cacheHit: latencyMs < 10,
        multipleProjectsFound: result.projects?.length || 0,
        requestSource: this.requestSource,
        correlationId: this.batchId
      });
    } else {
      this.failures++;
      
      let errorType = 'batch_unknown_error';
      if (result.error?.includes('No projects associated')) {
        errorType = 'batch_no_projects_found';
      } else if (result.requiresExplicitSelection) {
        errorType = 'batch_multiple_projects_ambiguous';
      }
      
      projectResolutionMetrics.recordFailure({
        competitorId,
        errorType,
        errorMessage: result.error || 'Batch operation failure',
        latencyMs,
        cacheHit: false,
        requestSource: this.requestSource,
        correlationId: this.batchId
      });
    }
  }
  
  complete(): {
    batchId: string;
    operationName: string;
    totalTime: number;
    attempts: number;
    successes: number;
    failures: number;
    successRate: number;
  } {
    const totalTime = Date.now() - this.startTime;
    const successRate = this.attempts > 0 ? this.successes / this.attempts : 0;
    
    const summary = {
      batchId: this.batchId,
      operationName: this.operationName,
      totalTime,
      attempts: this.attempts,
      successes: this.successes,
      failures: this.failures,
      successRate
    };
    
    logger.info('Batch project resolution operation completed', {
      ...summary,
      requestSource: this.requestSource
    });
    
    return summary;
  }
}

/**
 * Middleware for Express/Next.js API routes
 */
export function projectResolutionMetricsMiddleware(
  req: any,
  res: any,
  next: () => void
): void {
  const startTime = Date.now();
  const correlationId = req.headers['x-correlation-id'] || generateCorrelationId();
  
  // Add correlation ID to request
  req.correlationId = correlationId;
  
  // Intercept response to capture metrics
  const originalSend = res.send;
  res.send = function(body: any) {
    const endTime = Date.now();
    const latencyMs = endTime - startTime;
    
    // Extract metrics from response if available
    try {
      const responseData = typeof body === 'string' ? JSON.parse(body) : body;
      
      if (responseData && responseData.projectId) {
        // Successful project resolution
        const competitorId = req.query?.competitorId || req.body?.competitorId;
        if (competitorId) {
          projectResolutionMetrics.recordSuccess({
            competitorId,
            projectId: responseData.projectId,
            confidence: responseData.confidence || 'medium',
            resolutionMethod: responseData.resolutionMethod || 'api_endpoint',
            latencyMs,
            cacheHit: latencyMs < 50, // Heuristic for cache hit
            requestSource: 'api',
            correlationId
          });
        }
      } else if (res.statusCode >= 400) {
        // Failed project resolution
        const competitorId = req.query?.competitorId || req.body?.competitorId;
        if (competitorId) {
          let errorType = 'api_error';
          if (res.statusCode === 404) {
            errorType = 'no_projects_found';
          } else if (res.statusCode === 422) {
            errorType = 'multiple_projects_ambiguous';
          } else if (res.statusCode >= 500) {
            errorType = 'system_error';
          }
          
          projectResolutionMetrics.recordFailure({
            competitorId,
            errorType,
            errorMessage: responseData?.error || `HTTP ${res.statusCode}`,
            latencyMs,
            cacheHit: false,
            requestSource: 'api',
            correlationId
          });
        }
      }
    } catch (error) {
      // Ignore parsing errors
      logger.debug('Could not parse response for metrics', { error: (error as Error).message });
    }
    
    return originalSend.call(this, body);
  };
  
  next();
}

/**
 * Utility functions for manual metrics collection
 */
export const MetricsUtils = {
  /**
   * Create a batch metrics collector for migration operations
   */
  createMigrationBatch: (operationName: string) => {
    return new BatchMetricsCollector('migration', operationName);
  },
  
  /**
   * Create a batch metrics collector for background operations
   */
  createBackgroundBatch: (operationName: string) => {
    return new BatchMetricsCollector('background', operationName);
  },
  
  /**
   * Record a manual project resolution attempt
   */
  recordManualAttempt: (data: {
    competitorId: string;
    success: boolean;
    projectId?: string;
    confidence?: 'high' | 'medium' | 'low';
    errorType?: string;
    errorMessage?: string;
    latencyMs: number;
  }) => {
    if (data.success && data.projectId) {
      projectResolutionMetrics.recordSuccess({
        competitorId: data.competitorId,
        projectId: data.projectId,
        confidence: data.confidence || 'medium',
        resolutionMethod: 'manual_operation',
        latencyMs: data.latencyMs,
        cacheHit: false,
        requestSource: 'manual'
      });
    } else {
      projectResolutionMetrics.recordFailure({
        competitorId: data.competitorId,
        errorType: data.errorType || 'manual_error',
        errorMessage: data.errorMessage || 'Manual operation failed',
        latencyMs: data.latencyMs,
        cacheHit: false,
        requestSource: 'manual'
      });
    }
  }
}; 