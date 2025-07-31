import { NextRequest, NextResponse } from 'next/server';
import { SnapshotMonitoringService } from '@/services/snapshotMonitoringService';
import { SnapshotFallbackService } from '@/services/snapshotFallbackService';
import { logger, generateCorrelationId } from '@/lib/logger';

/**
 * Task 7.3 & 7.4: API endpoint for snapshot monitoring and fallback management
 * GET /api/snapshot-monitoring - Returns system health and alerts
 * GET /api/snapshot-monitoring?type=alerts - Returns active alerts
 * GET /api/snapshot-monitoring?type=health - Returns system health metrics
 * GET /api/snapshot-monitoring?type=fallback - Returns fallback statistics
 * POST /api/snapshot-monitoring/resolve - Resolve an alert
 */

export async function GET(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const url = new URL(request.url);
  const type = url.searchParams.get('type') || 'overview';
  const operation = url.searchParams.get('operation');
  
  const logContext = {
    operation: 'getSnapshotMonitoring',
    type,
    correlationId
  };

  try {
    logger.info('API request for snapshot monitoring data', logContext);

    const monitoringService = SnapshotMonitoringService.getInstance();
    const fallbackService = SnapshotFallbackService.getInstance();

    switch (type) {
      case 'health': {
        // Return system health metrics
        const healthMetrics = await monitoringService.getSystemHealthMetrics();
        
        logger.info('System health metrics provided', {
          ...logContext,
          overallHealth: healthMetrics.overallHealth,
          successRate: healthMetrics.snapshotSuccessRate
        });

        return NextResponse.json({
          success: true,
          data: healthMetrics,
          meta: {
            type: 'health',
            generatedAt: new Date().toISOString(),
            correlationId
          }
        });
      }

      case 'alerts': {
        // Return active alerts
        const alerts = monitoringService.getActiveAlerts();
        const operationAlerts = operation ? 
          monitoringService.getAlertsForOperation(operation) : 
          alerts;
        
        logger.info('Active alerts provided', {
          ...logContext,
          totalAlerts: alerts.length,
          filteredAlerts: operationAlerts.length,
          operation
        });

        return NextResponse.json({
          success: true,
          data: {
            alerts: operationAlerts,
            summary: {
              total: alerts.length,
              critical: alerts.filter(a => a.severity === 'critical').length,
              warning: alerts.filter(a => a.severity === 'warning').length,
              info: alerts.filter(a => a.severity === 'info').length
            }
          },
          meta: {
            type: 'alerts',
            operation,
            generatedAt: new Date().toISOString(),
            correlationId
          }
        });
      }

      case 'fallback': {
        // Return fallback information
        const [strategies, statistics] = await Promise.all([
          fallbackService.getFallbackStrategies(),
          fallbackService.getFallbackStatistics()
        ]);
        
        logger.info('Fallback information provided', {
          ...logContext,
          strategiesCount: strategies.length,
          successRate: statistics.successRate
        });

        return NextResponse.json({
          success: true,
          data: {
            strategies,
            statistics,
            systemStatus: {
              strategiesEnabled: strategies.filter(s => s.enabled).length,
              totalStrategies: strategies.length,
              fallbackSuccessRate: statistics.successRate
            }
          },
          meta: {
            type: 'fallback',
            generatedAt: new Date().toISOString(),
            correlationId
          }
        });
      }

      case 'overview':
      default: {
        // Return comprehensive overview
        const [healthMetrics, alerts, fallbackStats] = await Promise.all([
          monitoringService.getSystemHealthMetrics(),
          monitoringService.getActiveAlerts(),
          fallbackService.getFallbackStatistics()
        ]);

        const overview = {
          systemHealth: {
            status: healthMetrics.overallHealth,
            successRate: healthMetrics.snapshotSuccessRate,
            uptime: healthMetrics.systemUptime,
            lastSuccessfulSnapshot: healthMetrics.lastSuccessfulSnapshot
          },
          alerts: {
            total: alerts.length,
            critical: healthMetrics.criticalAlerts,
            warning: healthMetrics.warningAlerts,
            recentAlerts: alerts.slice(0, 5) // Last 5 alerts
          },
          fallbacks: {
            successRate: fallbackStats.successRate,
            totalExecutions: fallbackStats.totalExecutions,
            mostUsedStrategy: Object.entries(fallbackStats.strategyUsage)
              .sort(([,a], [,b]) => b - a)[0]?.[0] || 'none'
          },
          recommendations: generateSystemRecommendations(healthMetrics, alerts, fallbackStats)
        };

        logger.info('Comprehensive monitoring overview provided', {
          ...logContext,
          systemStatus: overview.systemHealth.status,
          alertCount: overview.alerts.total,
          fallbackSuccessRate: overview.fallbacks.successRate
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
    }

  } catch (error) {
    logger.error('Failed to get snapshot monitoring data', error as Error, logContext);

    return NextResponse.json({
      success: false,
      error: {
        message: 'Failed to retrieve monitoring data',
        code: 'MONITORING_ERROR',
        correlationId
      },
      data: null
    }, { status: 500 });
  }
}

/**
 * POST /api/snapshot-monitoring - Resolve alerts, trigger actions
 */
export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId();
  
  try {
    const body = await request.json();
    const { action, alertId, reason, competitorId, operationType } = body;

    const logContext = {
      operation: 'snapshotMonitoringAction',
      action,
      alertId,
      competitorId,
      correlationId
    };

    logger.info('Snapshot monitoring action requested', logContext);

    const monitoringService = SnapshotMonitoringService.getInstance();
    const fallbackService = SnapshotFallbackService.getInstance();

    switch (action) {
      case 'resolve_alert': {
        if (!alertId || !reason) {
          return NextResponse.json({
            success: false,
            error: { message: 'alertId and reason are required for resolve_alert action' }
          }, { status: 400 });
        }

        const resolved = monitoringService.resolveAlert(alertId, reason);
        
        logger.info('Alert resolution attempted', {
          ...logContext,
          resolved,
          reason
        });

        return NextResponse.json({
          success: true,
          data: { resolved, alertId, reason },
          meta: { action: 'resolve_alert', correlationId }
        });
      }

      case 'trigger_fallback': {
        if (!competitorId || !operationType) {
          return NextResponse.json({
            success: false,
            error: { message: 'competitorId and operationType are required for trigger_fallback action' }
          }, { status: 400 });
        }

        const fallbackData = await fallbackService.executeFallback(competitorId, {
          operationType,
          failureCount: 5, // Simulate failure count
          lastFailureTime: new Date(),
          correlationId
        });

        logger.info('Manual fallback triggered', {
          ...logContext,
          success: !!fallbackData,
          dataSource: fallbackData?.fallbackContent.metadata.source
        });

        return NextResponse.json({
          success: true,
          data: { 
            fallbackExecuted: !!fallbackData,
            fallbackData: fallbackData ? {
              competitorId: fallbackData.competitorId,
              source: fallbackData.fallbackContent.metadata.source,
              confidence: fallbackData.fallbackContent.metadata.confidence
            } : null
          },
          meta: { action: 'trigger_fallback', correlationId }
        });
      }

      case 'cleanup_alerts': {
        const cleanedCount = monitoringService.cleanupOldAlerts();
        
        logger.info('Alerts cleanup performed', {
          ...logContext,
          cleanedCount
        });

        return NextResponse.json({
          success: true,
          data: { cleanedCount },
          meta: { action: 'cleanup_alerts', correlationId }
        });
      }

      default: {
        return NextResponse.json({
          success: false,
          error: { message: `Unknown action: ${action}` }
        }, { status: 400 });
      }
    }

  } catch (error) {
    logger.error('Failed to execute monitoring action', error as Error);

    return NextResponse.json({
      success: false,
      error: {
        message: 'Failed to execute monitoring action',
        code: 'ACTION_ERROR',
        correlationId
      }
    }, { status: 500 });
  }
}

/**
 * Generate system recommendations based on monitoring data
 */
function generateSystemRecommendations(
  healthMetrics: any,
  alerts: any[],
  fallbackStats: any
): Array<{
  type: 'performance' | 'reliability' | 'maintenance';
  priority: 'high' | 'medium' | 'low';
  message: string;
  action?: string;
}> {
  const recommendations = [];

  // Health-based recommendations
  if (healthMetrics.overallHealth === 'critical') {
    recommendations.push({
      type: 'reliability' as const,
      priority: 'high' as const,
      message: 'System health is critical - immediate attention required',
      action: 'Investigate active alerts and resolve critical issues'
    });
  }

  if (healthMetrics.snapshotSuccessRate < 70) {
    recommendations.push({
      type: 'performance' as const,
      priority: 'high' as const,
      message: `Snapshot success rate is low (${healthMetrics.snapshotSuccessRate}%)`,
      action: 'Review snapshot collection process and optimize failure handling'
    });
  }

  // Alert-based recommendations
  const criticalAlerts = alerts.filter(a => a.severity === 'critical').length;
  if (criticalAlerts > 0) {
    recommendations.push({
      type: 'reliability' as const,
      priority: 'high' as const,
      message: `${criticalAlerts} critical alerts require immediate attention`,
      action: 'Resolve critical alerts to restore system stability'
    });
  }

  // Fallback-based recommendations
  if (fallbackStats.successRate < 80) {
    recommendations.push({
      type: 'reliability' as const,
      priority: 'medium' as const,
      message: `Fallback success rate is low (${fallbackStats.successRate}%)`,
      action: 'Review and improve fallback strategies'
    });
  }

  if (fallbackStats.totalExecutions > 50) {
    recommendations.push({
      type: 'performance' as const,
      priority: 'medium' as const,
      message: 'High fallback usage indicates underlying snapshot issues',
      action: 'Investigate root causes of snapshot failures'
    });
  }

  // Maintenance recommendations
  if (alerts.length > 20) {
    recommendations.push({
      type: 'maintenance' as const,
      priority: 'low' as const,
      message: 'Large number of alerts - consider cleanup',
      action: 'Review and resolve old alerts to improve monitoring clarity'
    });
  }

  // Default positive feedback
  if (recommendations.length === 0) {
    recommendations.push({
      type: 'performance' as const,
      priority: 'low' as const,
      message: 'System is operating normally - continue monitoring',
      action: 'Maintain current monitoring and alerting practices'
    });
  }

  return recommendations;
} 