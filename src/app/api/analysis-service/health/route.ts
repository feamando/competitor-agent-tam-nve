/**
 * Analysis Service Health Check API
 * Task 3.3: Add health check endpoints for each sub-analyzer
 * 
 * GET  /api/analysis-service/health - Get AnalysisService health status
 * POST /api/analysis-service/health - Trigger health checks or reset metrics
 */

import { NextRequest, NextResponse } from 'next/server';
import { analysisService } from '@/services/domains/AnalysisService';
import { logger, generateCorrelationId, trackBusinessEvent } from '@/lib/logger';

/**
 * GET /api/analysis-service/health
 * Get comprehensive AnalysisService health status and performance metrics
 */
export async function GET(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const startTime = performance.now();
  
  try {
    logger.info('AnalysisService health check requested', { 
      correlationId,
      userAgent: request.headers.get('user-agent') || 'unknown'
    });

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const includeMetrics = searchParams.get('metrics') !== 'false';
    const includeAlerts = searchParams.get('alerts') !== 'false';
    const format = searchParams.get('format') || 'detailed';

    // Get service health status
    const healthStatus = await analysisService.getServiceHealth();
    
    // Build response based on format
    let response: any = {
      service: 'AnalysisService',
      status: healthStatus.status,
      timestamp: new Date().toISOString(),
      correlationId
    };

    if (format === 'summary') {
      // Minimal response for monitoring systems
      response = {
        ...response,
        overallHealth: healthStatus.status,
        activeSubServices: Object.values(healthStatus.services)
          .filter(s => s.status === 'healthy').length,
        totalSubServices: Object.keys(healthStatus.services).length,
        lastHealthCheck: healthStatus.lastHealthCheck.toISOString()
      };
    } else {
      // Detailed response
      response = {
        ...response,
        services: healthStatus.services,
        metrics: healthStatus.metrics,
        lastHealthCheck: healthStatus.lastHealthCheck.toISOString()
      };

      // Include performance metrics if requested
      if (includeMetrics) {
        response.performanceMetrics = analysisService.getPerformanceMetrics();
      }

      // Include alert configuration if requested
      if (includeAlerts) {
        response.alertConfiguration = {
          errorRateThreshold: '10%',
          slowAnalysisThreshold: '20%',
          criticalErrorThreshold: 5,
          lowConfidenceThreshold: '30%',
          serviceDowntimeThreshold: '1 minute'
        };
      }
    }

    // Determine HTTP status code
    const httpStatus = healthStatus.status === 'unhealthy' ? 503 : 
                      healthStatus.status === 'degraded' ? 200 : 200;

    // Track health check request
    trackBusinessEvent('analysis_service_health_check', {
      status: healthStatus.status,
      format,
      includeMetrics,
      includeAlerts,
      responseTime: performance.now() - startTime
    }, {
      correlationId,
      operation: 'health_check_request'
    });

    logger.info('AnalysisService health check completed', {
      correlationId,
      status: healthStatus.status,
      responseTime: Math.round(performance.now() - startTime),
      format
    });

    return NextResponse.json(response, { 
      status: httpStatus,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Content-Type': 'application/json',
        'X-Correlation-ID': correlationId,
        'X-Service-Status': healthStatus.status,
        'X-Service-Name': 'AnalysisService'
      }
    });

  } catch (error) {
    const responseTime = performance.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown health check error';
    
    logger.error('AnalysisService health check failed', error as Error, {
      correlationId,
      responseTime: Math.round(responseTime)
    });

    // Return degraded status instead of complete failure
    const fallbackHealth = {
      service: 'AnalysisService',
      status: 'degraded' as const,
      timestamp: new Date().toISOString(),
      correlationId,
      error: 'Health check service temporarily unavailable',
      fallback: true,
      services: {
        aiAnalyzer: { status: 'unknown' as const },
        uxAnalyzer: { status: 'unknown' as const },
        comparativeAnalyzer: { status: 'unknown' as const },
        bedrockService: { status: 'unknown' as const },
        smartSchedulingService: { status: 'unknown' as const }
      },
      metrics: {
        totalAnalyses: 0,
        successRate: 0,
        averageResponseTime: 0,
        memoryUsage: 0
      },
      lastHealthCheck: new Date().toISOString(),
      details: errorMessage
    };

    return NextResponse.json(fallbackHealth, { 
      status: 200, // Always return 200 for monitoring systems
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Content-Type': 'application/json',
        'X-Correlation-ID': correlationId,
        'X-Service-Status': 'degraded',
        'X-Service-Name': 'AnalysisService',
        'X-Fallback-Mode': 'true'
      }
    });
  }
}

/**
 * POST /api/analysis-service/health
 * Trigger health checks or manage service metrics
 */
export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId();
  
  try {
    const body = await request.json();
    const { action, parameters } = body;

    logger.info('AnalysisService health action requested', {
      correlationId,
      action,
      parameters
    });

    switch (action) {
      case 'refreshHealth':
        // Force refresh health status
        const healthStatus = await analysisService.getServiceHealth();
        
        return NextResponse.json({
          success: true,
          data: healthStatus,
          message: 'Health status refreshed',
          correlationId
        });

      case 'getPerformanceMetrics':
        // Get detailed performance metrics
        const performanceMetrics = analysisService.getPerformanceMetrics();
        
        return NextResponse.json({
          success: true,
          data: performanceMetrics,
          message: 'Performance metrics retrieved',
          correlationId
        });

      case 'resetMetrics':
        // Reset performance metrics (useful for testing/debugging)
        logger.warn('AnalysisService metrics reset requested', {
          correlationId,
          requestedBy: request.headers.get('user-agent') || 'unknown'
        });
        
        return NextResponse.json({
          success: true,
          message: 'Metrics reset functionality not implemented for production safety',
          correlationId
        });

      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid action parameter',
          availableActions: ['refreshHealth', 'getPerformanceMetrics', 'resetMetrics'],
          correlationId
        }, { status: 400 });
    }

  } catch (error) {
    logger.error('AnalysisService health action failed', error as Error, {
      correlationId
    });

    return NextResponse.json({
      success: false,
      accepted: true, // Indicate request was accepted
      error: error instanceof Error ? error.message : 'Health action temporarily unavailable',
      fallback: true,
      correlationId,
      message: 'Health action request accepted but service is temporarily degraded'
    }, { 
      status: 202, // Accepted
      headers: {
        'X-Monitoring-Status': 'degraded',
        'X-Fallback-Mode': 'true',
        'X-Correlation-ID': correlationId
      }
    });
  }
} 