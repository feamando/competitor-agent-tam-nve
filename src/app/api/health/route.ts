import { NextRequest, NextResponse } from 'next/server';
import { healthCheckService } from '@/lib/health-check';
import { withRedisCache } from '@/lib/redis-cache';
import { logger } from '@/lib/logger';

// Define TTL for health check cache (in seconds)
const HEALTH_CHECK_CACHE_TTL = 30; // 30 seconds - short cache to still detect issues quickly

export async function GET(request: NextRequest): Promise<NextResponse> {
  const checkStartTime = performance.now();
  const correlationId = `health-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  logger.info('Health check requested', { correlationId });
  
  try {
    // Only cache in production to ensure development environment always gets fresh data
    const isProduction = process.env.NODE_ENV === 'production';
    const shouldUseCache = isProduction && !request.nextUrl.searchParams.has('no_cache');
    
    // Define the health check function
    const performHealthCheck = async () => {
      return await healthCheckService.performHealthCheck();
    };
    
    // Use caching if applicable, otherwise perform check directly
    let healthResult;
    
    if (shouldUseCache) {
      try {
        healthResult = await withRedisCache(
          performHealthCheck,
          'health_check',
          {},
          HEALTH_CHECK_CACHE_TTL
        );
      } catch (cacheError) {
        logger.warn('Redis cache failed for health check, proceeding without cache', { 
          correlationId,
          error: cacheError instanceof Error ? cacheError.message : String(cacheError)
        });
        // Fall back to direct execution if cache fails
        healthResult = await performHealthCheck();
      }
    } else {
      healthResult = await performHealthCheck();
    }
    
    // Set appropriate HTTP status code - only 503 for critical failures
    const httpStatus = healthResult.status === 'unhealthy' ? 503 : 200;
    
    logger.info('Health check completed', {
      correlationId,
      status: healthResult.status,
      httpStatus,
      responseTime: Math.round(performance.now() - checkStartTime),
      cached: shouldUseCache
    });
    
    return NextResponse.json(healthResult, { 
      status: httpStatus,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Content-Type': 'application/json',
        'X-Correlation-ID': correlationId,
        'X-Health-Status': healthResult.status
      }
    });
    
  } catch (error) {
    const responseTime = performance.now() - checkStartTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown health check error';
    
    logger.error('Health check failed completely', error as Error, {
      correlationId,
      responseTime: Math.round(responseTime)
    });
    
    // Return degraded status instead of complete failure
    const fallbackHealth = {
      status: 'degraded' as const,
      timestamp: new Date().toISOString(),
      uptime: Date.now(),
      version: process.env.APP_VERSION || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      checks: {
        database: {
          status: 'warn' as const,
          message: 'Health check service unavailable',
          timestamp: new Date().toISOString(),
          details: { fallback: true, error: errorMessage }
        },
        filesystem: {
          status: 'warn' as const,
          message: 'Health check service unavailable',
          timestamp: new Date().toISOString(),
          details: { fallback: true }
        },
        memory: {
          status: 'warn' as const,
          message: 'Health check service unavailable',
          timestamp: new Date().toISOString(),
          details: { fallback: true }
        },
        reports: {
          status: 'warn' as const,
          message: 'Health check service unavailable',
          timestamp: new Date().toISOString(),
          details: { fallback: true, total: 0, database: 0, files: 0 }
        }
      },
      metrics: {
        totalReports: 0,
        databaseReports: 0,
        fileReports: 0,
        responseTime: Math.round(responseTime)
      }
    };
    
    // Return 200 status even for fallback to prevent complete failure
    return NextResponse.json(fallbackHealth, { 
      status: 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Content-Type': 'application/json',
        'X-Correlation-ID': correlationId,
        'X-Health-Status': 'degraded',
        'X-Fallback-Mode': 'true'
      }
    });
  }
} 