import { NextRequest, NextResponse } from 'next/server';
import { SnapshotEfficiencyMetricsService } from '@/services/snapshotEfficiencyMetricsService';
import { logger, generateCorrelationId } from '@/lib/logger';

/**
 * Task 6.4: API endpoint for snapshot efficiency metrics dashboard consumption
 * GET /api/snapshot-efficiency - Returns comprehensive efficiency metrics
 * GET /api/snapshot-efficiency?range=24h|7d|30d - Returns metrics for specific time range
 * GET /api/snapshot-efficiency?overview=true - Returns quick overview metrics
 */

export async function GET(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const url = new URL(request.url);
  const timeRange = url.searchParams.get('range') as '24h' | '7d' | '30d' || '24h';
  const isOverview = url.searchParams.get('overview') === 'true';
  
  const logContext = {
    operation: 'getSnapshotEfficiencyMetrics',
    timeRange,
    isOverview,
    correlationId
  };

  try {
    logger.info('API request for snapshot efficiency metrics', logContext);

    const metricsService = SnapshotEfficiencyMetricsService.getInstance();

    if (isOverview) {
      // Return quick overview for dashboard widgets
      const overview = await metricsService.getEfficiencyOverview();
      
      logger.info('Snapshot efficiency overview provided', {
        ...logContext,
        efficiencyRate: overview.currentEfficiencyRate,
        optimizations: overview.todayOptimizations
      });

      return NextResponse.json({
        success: true,
        data: overview,
        meta: {
          type: 'overview',
          generatedAt: new Date().toISOString(),
          correlationId
        }
      });
    }

    // Return comprehensive metrics
    const metrics = await metricsService.getEfficiencyMetrics(timeRange);
    
    logger.info('Comprehensive snapshot efficiency metrics provided', {
      ...logContext,
      efficiencyRate: metrics.optimizationStats.efficiencyRate,
      totalSnapshots: metrics.optimizationStats.totalSnapshots,
      resourcesSaved: metrics.optimizationStats.resourcesSaved
    });

    return NextResponse.json({
      success: true,
      data: metrics,
      meta: {
        type: 'comprehensive',
        timeRange,
        generatedAt: new Date().toISOString(),
        correlationId
      }
    });

  } catch (error) {
    logger.error('Failed to get snapshot efficiency metrics', error as Error, logContext);

    return NextResponse.json({
      success: false,
      error: {
        message: 'Failed to retrieve snapshot efficiency metrics',
        code: 'METRICS_ERROR',
        correlationId
      },
      data: null
    }, { status: 500 });
  }
}

/**
 * Task 6.4: Additional endpoint for real-time efficiency status
 * POST /api/snapshot-efficiency/status - Returns current system efficiency status
 */
export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId();
  
  try {
    const body = await request.json();
    const { projectId } = body;

    const logContext = {
      operation: 'getEfficiencyStatus',
      projectId,
      correlationId
    };

    logger.info('Real-time efficiency status requested', logContext);

    const metricsService = SnapshotEfficiencyMetricsService.getInstance();
    const overview = await metricsService.getEfficiencyOverview();

    // Enhanced status with project-specific information would go here
    const status = {
      ...overview,
      systemStatus: overview.currentEfficiencyRate > 15 ? 'optimal' : 
                   overview.currentEfficiencyRate > 5 ? 'good' : 'needs_optimization',
      recommendations: getEfficiencyRecommendations(overview),
      projectId
    };

    logger.info('Real-time efficiency status provided', {
      ...logContext,
      systemStatus: status.systemStatus,
      efficiencyRate: status.currentEfficiencyRate
    });

    return NextResponse.json({
      success: true,
      data: status,
      meta: {
        type: 'status',
        generatedAt: new Date().toISOString(),
        correlationId
      }
    });

  } catch (error) {
    logger.error('Failed to get efficiency status', error as Error);

    return NextResponse.json({
      success: false,
      error: {
        message: 'Failed to retrieve efficiency status',
        code: 'STATUS_ERROR',
        correlationId
      }
    }, { status: 500 });
  }
}

/**
 * Generate efficiency recommendations based on current metrics
 */
function getEfficiencyRecommendations(overview: {
  currentEfficiencyRate: number;
  todayOptimizations: number;
  cacheHitRate: number;
  estimatedSavings: string;
}): Array<{
  type: 'cache' | 'optimization' | 'system';
  priority: 'high' | 'medium' | 'low';
  message: string;
  action?: string;
}> {
  const recommendations = [];

  // Cache performance recommendations
  if (overview.cacheHitRate < 70) {
    recommendations.push({
      type: 'cache' as const,
      priority: 'medium' as const,
      message: `Cache hit rate is ${overview.cacheHitRate}% - consider increasing cache TTL`,
      action: 'Adjust cache settings'
    });
  }

  // Optimization recommendations
  if (overview.currentEfficiencyRate < 10) {
    recommendations.push({
      type: 'optimization' as const,
      priority: 'high' as const,
      message: 'Low optimization rate detected - review freshness thresholds',
      action: 'Review snapshot freshness policies'
    });
  }

  // System recommendations
  if (overview.todayOptimizations < 5) {
    recommendations.push({
      type: 'system' as const,
      priority: 'low' as const,
      message: 'Few optimizations today - system may be operating efficiently or needs monitoring',
      action: 'Monitor snapshot patterns'
    });
  }

  // Positive feedback when performing well
  if (overview.currentEfficiencyRate > 20) {
    recommendations.push({
      type: 'system' as const,
      priority: 'low' as const,
      message: 'Excellent optimization performance - system is running efficiently',
      action: 'Continue current settings'
    });
  }

  return recommendations;
} 