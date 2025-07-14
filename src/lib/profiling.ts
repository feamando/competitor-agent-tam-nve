/**
 * API Profiling Utility
 * 
 * This utility provides functions to profile API endpoints,
 * identify slow queries, and track performance metrics.
 */

import { logger } from './logger';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';

// Performance thresholds in milliseconds
export const PERFORMANCE_THRESHOLDS = {
  // Maximum acceptable response time (3000ms per requirements)
  API_RESPONSE_TIME: 3000,
  
  // Database operation thresholds
  DB_QUERY_TIME: {
    CRITICAL: 2000, // Database operations taking over 2 seconds are critical
    WARNING: 1000,  // Database operations taking over 1 second trigger warnings
    ACCEPTABLE: 500 // Target: database operations under 500ms
  },
  
  // Log thresholds
  ALWAYS_LOG: 3000, // Always log operations exceeding 3 seconds
  LOG_IN_DEV: 1000  // In development, log operations exceeding 1 second
};

// Interface for profiling options
interface ProfilingOptions {
  label: string;
  correlationId?: string;
  request?: NextRequest;
  additionalContext?: Record<string, any>;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Profile an async operation and log its execution time
 * 
 * @param fn Async function to profile
 * @param options Profiling options
 * @returns The result of the async function
 */
export async function profileOperation<T>(
  fn: () => Promise<T>,
  options: ProfilingOptions
): Promise<T> {
  const startTime = performance.now();
  const { label, correlationId, request, additionalContext, logLevel = 'info' } = options;
  
  try {
    // Execute the function
    const result = await fn();
    
    // Calculate execution time
    const executionTime = performance.now() - startTime;
    
    // Context for logging
    const context = {
      correlationId,
      executionTime: `${executionTime.toFixed(2)}ms`,
      url: request?.url,
      ...additionalContext
    };
    
    // Log based on thresholds
    if (executionTime >= PERFORMANCE_THRESHOLDS.ALWAYS_LOG) {
      logger.warn(`Slow operation: ${label}`, context);
    } else if (
      process.env.NODE_ENV === 'development' && 
      executionTime >= PERFORMANCE_THRESHOLDS.LOG_IN_DEV
    ) {
      logger.debug(`Performance monitoring: ${label}`, context);
    } else if (executionTime >= PERFORMANCE_THRESHOLDS.DB_QUERY_TIME.WARNING) {
      logger[logLevel](`Operation completed with warning: ${label}`, context);
    }
    
    return result;
  } catch (error) {
    const executionTime = performance.now() - startTime;
    
    logger.error(`Failed operation: ${label}`, {
      correlationId,
      executionTime: `${executionTime.toFixed(2)}ms`,
      url: request?.url,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      ...additionalContext
    });
    
    throw error;
  }
}

/**
 * Create a profiled Prisma client that logs slow queries
 * 
 * @returns Enhanced Prisma client with query profiling
 */
export function createProfiledPrismaClient() {
  const prisma = new PrismaClient({
    log: [
      { level: 'warn', emit: 'event' },
      { level: 'error', emit: 'event' }
    ],
  });
  
  // Log slow queries
  prisma.$on('query', (e: any) => {
    if (e.duration >= PERFORMANCE_THRESHOLDS.DB_QUERY_TIME.CRITICAL) {
      logger.warn('Slow database query detected', {
        query: e.query,
        params: e.params,
        duration: `${e.duration}ms`,
        target: e.target
      });
    }
  });
  
  // Log query errors
  prisma.$on('error', (e: any) => {
    logger.error('Database query error', {
      message: e.message,
      target: e.target
    });
  });
  
  return prisma;
}

/**
 * Middleware to track API endpoint performance
 * 
 * @param handler API route handler function
 * @param options Profiling options
 * @returns Enhanced handler with performance tracking
 */
export function withProfiling(
  handler: (req: NextRequest) => Promise<Response>,
  options: Omit<ProfilingOptions, 'request'>
) {
  return async (req: NextRequest) => {
    return profileOperation(
      () => handler(req),
      {
        ...options,
        request: req
      }
    );
  };
}

/**
 * Track execution time for a piece of code
 * 
 * @param label Label for the tracked code
 * @param context Additional context
 * @returns Object with stop function to end timing and get duration
 */
export function trackExecutionTime(label: string, context: Record<string, any> = {}) {
  const startTime = performance.now();
  
  return {
    stop: () => {
      const executionTime = performance.now() - startTime;
      
      if (executionTime >= PERFORMANCE_THRESHOLDS.DB_QUERY_TIME.WARNING) {
        logger.warn(`Slow execution: ${label}`, {
          ...context,
          executionTime: `${executionTime.toFixed(2)}ms`
        });
      }
      
      return executionTime;
    }
  };
}

/**
 * Generate performance recommendations based on query patterns
 * 
 * @param queryStats Query execution statistics
 * @returns Performance recommendations
 */
export function generatePerformanceRecommendations(
  queryStats: Array<{
    query: string;
    duration: number;
    count: number;
  }>
) {
  const recommendations = [];
  
  for (const stat of queryStats) {
    if (stat.duration > PERFORMANCE_THRESHOLDS.DB_QUERY_TIME.CRITICAL) {
      // Critical performance issues
      const recommendation = {
        severity: 'critical',
        query: stat.query,
        averageDuration: stat.duration,
        callCount: stat.count,
        recommendation: ''
      };
      
      // Identify common patterns and suggest optimizations
      if (stat.query.includes('SELECT') && !stat.query.includes('WHERE')) {
        recommendation.recommendation = 'Add filtering conditions to reduce result set size';
      } else if (stat.query.includes('JOIN') && stat.count > 10) {
        recommendation.recommendation = 'Consider denormalizing frequently accessed data';
      } else if (stat.query.includes('ORDER BY') && !stat.query.includes('LIMIT')) {
        recommendation.recommendation = 'Add LIMIT clause to reduce sorting overhead';
      } else {
        recommendation.recommendation = 'Review query execution plan and add appropriate indexes';
      }
      
      recommendations.push(recommendation);
    }
  }
  
  return recommendations;
}

/**
 * Detect N+1 query patterns from query logs
 * 
 * @param queryLog Query log entries
 * @returns Detection results with recommendations
 */
export function detectNPlusOneQueries(
  queryLog: Array<{
    query: string;
    timestamp: number;
    parentOperation?: string;
  }>
) {
  const results = {
    detected: false,
    patterns: [] as Array<{
      parentOperation: string;
      repeatedQueries: number;
      recommendation: string;
    }>
  };
  
  // Group queries by parent operation
  const queryGroups: Record<string, string[]> = {};
  
  for (const entry of queryLog) {
    if (!entry.parentOperation) continue;
    
    if (!queryGroups[entry.parentOperation]) {
      queryGroups[entry.parentOperation] = [];
    }
    
    queryGroups[entry.parentOperation].push(entry.query);
  }
  
  // Analyze each group for similar repeated queries
  for (const [operation, queries] of Object.entries(queryGroups)) {
    // Simple heuristic: if there are many similar queries in short succession
    const queryPatterns: Record<string, number> = {};
    
    for (const query of queries) {
      // Normalize query by removing specific IDs/values
      const normalizedQuery = query.replace(/'\w+'/g, '?').replace(/\d+/g, '?');
      
      queryPatterns[normalizedQuery] = (queryPatterns[normalizedQuery] || 0) + 1;
    }
    
    // Check for patterns with high repetition
    for (const [pattern, count] of Object.entries(queryPatterns)) {
      if (count > 5) { // Threshold for N+1 detection
        results.detected = true;
        results.patterns.push({
          parentOperation: operation,
          repeatedQueries: count,
          recommendation: pattern.includes('WHERE') && pattern.includes('=') ?
            'Use batched queries with IN operator or add proper includes/joins' :
            'Review data access pattern and consider eager loading related data'
        });
      }
    }
  }
  
  return results;
} 