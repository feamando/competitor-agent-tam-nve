/**
 * Project Resolution Metrics API - Task 7.1
 * 
 * API endpoint for exposing project resolution success/failure rate metrics
 * to monitoring dashboards, alerting systems, and operational tools.
 * 
 * Endpoints:
 * - GET /api/metrics/project-resolution - Get metrics summary
 * - GET /api/metrics/project-resolution/prometheus - Prometheus format
 * - GET /api/metrics/project-resolution/detailed - Detailed metrics report
 * 
 * Part of TP-013-20250801-project-report-association-fix
 */

import { NextRequest, NextResponse } from 'next/server';
import { projectResolutionMetrics } from '@/lib/metrics/projectResolutionMetrics';
import { logger } from '@/lib/logger';

/**
 * GET /api/metrics/project-resolution
 * Returns project resolution metrics summary
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'json';
    const period = searchParams.get('period') as 'hourly' | 'daily' | 'weekly' | 'monthly' || 'daily';
    const detailed = searchParams.get('detailed') === 'true';
    
    logger.info('Project resolution metrics requested', {
      format,
      period,
      detailed,
      userAgent: request.headers.get('user-agent'),
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip')
    });
    
    // Handle Prometheus format
    if (format === 'prometheus') {
      const prometheusMetrics = projectResolutionMetrics.exportPrometheusMetrics();
      
      return new NextResponse(prometheusMetrics, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
    }
    
    // Handle detailed report format
    if (detailed) {
      const report = projectResolutionMetrics.generateMetricsReport(period);
      
      return NextResponse.json({
        status: 'success',
        timestamp: new Date().toISOString(),
        period,
        report
      }, {
        status: 200,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
    }
    
    // Handle standard JSON format
    const aggregation = projectResolutionMetrics.getCurrentMetricsAggregation();
    const currentMetrics = aggregation[period];
    
    // Calculate additional derived metrics
    const derivedMetrics = {
      confidenceDistribution: {
        high: currentMetrics.successfulResolutions > 0 ? 
          (currentMetrics.highConfidenceCount / currentMetrics.successfulResolutions) * 100 : 0,
        medium: currentMetrics.successfulResolutions > 0 ? 
          (currentMetrics.mediumConfidenceCount / currentMetrics.successfulResolutions) * 100 : 0,
        low: currentMetrics.successfulResolutions > 0 ? 
          (currentMetrics.lowConfidenceCount / currentMetrics.successfulResolutions) * 100 : 0
      },
      healthScore: calculateHealthScore(currentMetrics),
      trends: calculateTrends(aggregation)
    };
    
    const response = {
      status: 'success',
      timestamp: new Date().toISOString(),
      period,
      metrics: {
        ...currentMetrics,
        ...derivedMetrics
      },
      aggregation: format === 'full' ? aggregation : undefined
    };
    
    return NextResponse.json(response, {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=60', // Cache for 1 minute
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });
    
  } catch (error) {
    logger.error('Failed to retrieve project resolution metrics', error as Error, {
      url: request.url,
      method: request.method
    });
    
    return NextResponse.json({
      status: 'error',
      error: 'Failed to retrieve metrics',
      timestamp: new Date().toISOString()
    }, {
      status: 500
    });
  }
}

/**
 * Calculate overall health score based on metrics
 */
function calculateHealthScore(metrics: any): {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  factors: {
    successRate: number;
    latency: number;
    cacheEfficiency: number;
    errorRate: number;
  };
} {
  const factors = {
    successRate: Math.min(100, (metrics.successRate || 0) * 125), // Max 100, bonus for >80%
    latency: Math.max(0, 100 - (metrics.averageLatencyMs || 0) / 2), // Penalty for >50ms
    cacheEfficiency: (metrics.cacheHitRate || 0) * 100,
    errorRate: Math.max(0, 100 - ((metrics.failedResolutions / Math.max(metrics.totalAttempts, 1)) * 200))
  };
  
  const score = (factors.successRate + factors.latency + factors.cacheEfficiency + factors.errorRate) / 4;
  
  let grade: 'A' | 'B' | 'C' | 'D' | 'F';
  if (score >= 90) grade = 'A';
  else if (score >= 80) grade = 'B';
  else if (score >= 70) grade = 'C';
  else if (score >= 60) grade = 'D';
  else grade = 'F';
  
  return { score: Math.round(score), grade, factors };
}

/**
 * Calculate trends across different time periods
 */
function calculateTrends(aggregation: any): {
  successRateTrend: 'improving' | 'stable' | 'declining';
  latencyTrend: 'improving' | 'stable' | 'declining';
  volumeTrend: 'increasing' | 'stable' | 'decreasing';
} {
  const hourly = aggregation.hourly;
  const daily = aggregation.daily;
  
  // Success rate trend (hourly vs daily average)
  const hourlySuccessRate = hourly.successRate || 0;
  const dailyAverageSuccessRate = daily.successRate || 0;
  let successRateTrend: 'improving' | 'stable' | 'declining';
  
  if (hourlySuccessRate > dailyAverageSuccessRate * 1.05) {
    successRateTrend = 'improving';
  } else if (hourlySuccessRate < dailyAverageSuccessRate * 0.95) {
    successRateTrend = 'declining';
  } else {
    successRateTrend = 'stable';
  }
  
  // Latency trend
  const hourlyLatency = hourly.averageLatencyMs || 0;
  const dailyAverageLatency = daily.averageLatencyMs || 0;
  let latencyTrend: 'improving' | 'stable' | 'declining';
  
  if (hourlyLatency < dailyAverageLatency * 0.9) {
    latencyTrend = 'improving';
  } else if (hourlyLatency > dailyAverageLatency * 1.1) {
    latencyTrend = 'declining';
  } else {
    latencyTrend = 'stable';
  }
  
  // Volume trend
  const hourlyVolume = hourly.totalAttempts || 0;
  const expectedHourlyVolume = (daily.totalAttempts || 0) / 24;
  let volumeTrend: 'increasing' | 'stable' | 'decreasing';
  
  if (hourlyVolume > expectedHourlyVolume * 1.2) {
    volumeTrend = 'increasing';
  } else if (hourlyVolume < expectedHourlyVolume * 0.8) {
    volumeTrend = 'decreasing';
  } else {
    volumeTrend = 'stable';
  }
  
  return { successRateTrend, latencyTrend, volumeTrend };
}

/**
 * OPTIONS /api/metrics/project-resolution
 * Handle CORS preflight requests
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    }
  });
} 