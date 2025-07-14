/**
 * API Response Times Monitoring Endpoint
 * Phase 5.1: API Response Times Optimization
 * 
 * GET /api/performance-monitoring/api-response-times - Get API response time metrics
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateCorrelationId, logger } from '@/lib/logger';
import { withCache } from '@/lib/cache';
import { PERFORMANCE_THRESHOLDS, profileOperation } from '@/lib/profiling';

// Cache time for performance metrics
const METRICS_CACHE_TTL = 60 * 1000; // 1 minute

// Interface for the response time data structure
interface ApiResponseTimeMetrics {
  endpoint: string;
  averageResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  maxResponseTime: number;
  totalRequests: number;
  requestsOver3000ms: number;
  percentageOver3000ms: number;
  timeRange: string;
  timestamps: string[];
  responseTimeSeries: number[];
}

/**
 * GET /api/performance-monitoring/api-response-times
 */
export async function GET(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const { searchParams } = new URL(request.url);
  const timeRange = searchParams.get('timeRange') || '24h';
  const endpoint = searchParams.get('endpoint') || 'all';
  
  const context = {
    correlationId,
    timeRange,
    endpoint,
    operation: 'get_api_response_times'
  };

  return profileOperation(async () => {
    try {
      logger.info('API response times monitoring requested', context);
      
      // Use caching for better performance
      const metricsData = await withCache(
        () => getApiResponseTimeMetrics(timeRange, endpoint),
        'api_response_times',
        { timeRange, endpoint },
        METRICS_CACHE_TTL
      );
      
      // Identify endpoints exceeding threshold
      const endpointsExceeding3000ms = metricsData.filter(
        metrics => metrics.averageResponseTime > PERFORMANCE_THRESHOLDS.API_RESPONSE_TIME
      );
      
      // Calculate overall statistics
      const overallStats = calculateOverallStats(metricsData);
      
      // Generate optimization recommendations
      const recommendations = generateOptimizationRecommendations(metricsData);
      
      return NextResponse.json({
        endpoints: metricsData,
        summary: {
          totalEndpoints: metricsData.length,
          endpointsExceeding3000ms: endpointsExceeding3000ms.length,
          percentageExceeding: 
            metricsData.length > 0 
              ? (endpointsExceeding3000ms.length / metricsData.length * 100).toFixed(2)
              : '0',
          overallAverageResponseTime: overallStats.averageResponseTime,
          overallP95ResponseTime: overallStats.p95ResponseTime,
          overallMaxResponseTime: overallStats.maxResponseTime,
        },
        recommendations,
        timeRange,
        timestamp: new Date().toISOString(),
        correlationId
      }, {
        headers: {
          'Cache-Control': 'public, max-age=60',
          'X-Correlation-ID': correlationId
        }
      });
    } catch (error) {
      logger.error('Failed to retrieve API response time metrics', {
        ...context,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return NextResponse.json({
        error: 'Failed to retrieve API response time metrics',
        message: error instanceof Error ? error.message : 'Unknown error',
        correlationId
      }, { status: 500 });
    }
  }, {
    label: 'API: GET /api/performance-monitoring/api-response-times',
    correlationId,
    additionalContext: { timeRange, endpoint }
  });
}

/**
 * Get API response time metrics from monitoring database
 */
async function getApiResponseTimeMetrics(
  timeRange: string,
  endpoint: string
): Promise<ApiResponseTimeMetrics[]> {
  // Determine the date range based on the timeRange parameter
  const now = new Date();
  let startDate: Date;
  
  switch (timeRange) {
    case '1h':
      startDate = new Date(now.getTime() - 60 * 60 * 1000);
      break;
    case '6h':
      startDate = new Date(now.getTime() - 6 * 60 * 60 * 1000);
      break;
    case '7d':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case '24h':
    default:
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
  }
  
  // Build query conditions
  const whereConditions: any = {
    timestamp: {
      gte: startDate
    },
    eventType: 'api_request',
  };
  
  // Add endpoint filtering if specified
  if (endpoint !== 'all') {
    whereConditions.endpoint = endpoint;
  }
  
  // Query all monitoring events within the time range
  const monitoringEvents = await prisma.monitoringEvent.findMany({
    where: whereConditions,
    select: {
      endpoint: true,
      responseTime: true,
      timestamp: true,
    },
    orderBy: {
      timestamp: 'asc'
    }
  });
  
  // Group events by endpoint
  const eventsByEndpoint: Record<string, any[]> = {};
  
  for (const event of monitoringEvents) {
    if (!eventsByEndpoint[event.endpoint]) {
      eventsByEndpoint[event.endpoint] = [];
    }
    
    eventsByEndpoint[event.endpoint].push(event);
  }
  
  // Calculate metrics for each endpoint
  return Object.entries(eventsByEndpoint).map(([endpointName, events]) => {
    // Extract response times
    const responseTimes = events.map(e => e.responseTime);
    
    // Sort for percentile calculation
    const sortedResponseTimes = [...responseTimes].sort((a, b) => a - b);
    
    // Calculate statistics
    const totalRequests = responseTimes.length;
    const requestsOver3000ms = responseTimes.filter(t => t > PERFORMANCE_THRESHOLDS.API_RESPONSE_TIME).length;
    const percentageOver3000ms = totalRequests > 0 
      ? (requestsOver3000ms / totalRequests) * 100 
      : 0;
    
    // Calculate percentiles
    const p95Index = Math.floor(totalRequests * 0.95);
    const p99Index = Math.floor(totalRequests * 0.99);
    
    // Prepare time series data
    const timestamps = events.map(e => e.timestamp.toISOString());
    
    return {
      endpoint: endpointName,
      averageResponseTime: calculateAverage(responseTimes),
      p95ResponseTime: totalRequests > 0 ? sortedResponseTimes[p95Index] || 0 : 0,
      p99ResponseTime: totalRequests > 0 ? sortedResponseTimes[p99Index] || 0 : 0,
      maxResponseTime: Math.max(...responseTimes, 0),
      totalRequests,
      requestsOver3000ms,
      percentageOver3000ms,
      timeRange,
      timestamps,
      responseTimeSeries: responseTimes
    };
  });
}

/**
 * Calculate overall statistics across all endpoints
 */
function calculateOverallStats(endpointMetrics: ApiResponseTimeMetrics[]) {
  // Flatten all response times
  const allResponseTimes = endpointMetrics.flatMap(metric => metric.responseTimeSeries);
  
  // Sort for percentile calculation
  const sortedResponseTimes = [...allResponseTimes].sort((a, b) => a - b);
  const totalRequests = allResponseTimes.length;
  
  // Calculate percentiles
  const p95Index = Math.floor(totalRequests * 0.95);
  
  return {
    averageResponseTime: calculateAverage(allResponseTimes),
    p95ResponseTime: totalRequests > 0 ? sortedResponseTimes[p95Index] || 0 : 0,
    maxResponseTime: Math.max(...allResponseTimes, 0),
    totalRequests
  };
}

/**
 * Calculate average from an array of numbers
 */
function calculateAverage(values: number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((acc, val) => acc + val, 0);
  return sum / values.length;
}

/**
 * Generate optimization recommendations based on metrics
 */
function generateOptimizationRecommendations(endpointMetrics: ApiResponseTimeMetrics[]) {
  const recommendations = [];
  
  // Sort endpoints by average response time (descending)
  const sortedEndpoints = [...endpointMetrics]
    .sort((a, b) => b.averageResponseTime - a.averageResponseTime);
  
  // Focus on top 5 slowest endpoints
  const slowestEndpoints = sortedEndpoints.slice(0, 5);
  
  for (const endpoint of slowestEndpoints) {
    if (endpoint.averageResponseTime > PERFORMANCE_THRESHOLDS.API_RESPONSE_TIME) {
      // Critical endpoint needs immediate attention
      recommendations.push({
        endpoint: endpoint.endpoint,
        severity: 'critical',
        responseTime: endpoint.averageResponseTime,
        recommendation: `Optimize database queries and implement caching for ${endpoint.endpoint}`,
        potentialGain: 'High',
        implementationEffort: 'Medium'
      });
    } else if (endpoint.p95ResponseTime > PERFORMANCE_THRESHOLDS.API_RESPONSE_TIME) {
      // Endpoint has significant outliers
      recommendations.push({
        endpoint: endpoint.endpoint,
        severity: 'warning',
        responseTime: endpoint.averageResponseTime,
        p95ResponseTime: endpoint.p95ResponseTime,
        recommendation: `Investigate performance outliers for ${endpoint.endpoint}`,
        potentialGain: 'Medium',
        implementationEffort: 'Low'
      });
    }
  }
  
  // Add general recommendations if needed
  if (sortedEndpoints.length > 0 && 
      sortedEndpoints[0].averageResponseTime > PERFORMANCE_THRESHOLDS.API_RESPONSE_TIME) {
    recommendations.push({
      endpoint: 'general',
      severity: 'info',
      recommendation: 'Consider implementing database query batching across multiple endpoints',
      potentialGain: 'Medium',
      implementationEffort: 'Medium'
    });
  }
  
  return recommendations;
} 