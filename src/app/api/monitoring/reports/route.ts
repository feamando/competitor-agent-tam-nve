/**
 * Task 5.2: Report Generation Monitoring API
 * Provides comprehensive metrics, alerts, and performance data for report generation monitoring
 */

import { NextRequest, NextResponse } from 'next/server';
import { reportGenerationMonitor } from '@/lib/monitoring/ReportGenerationMonitor';
import { 
  logger, 
  generateCorrelationId, 
  createCorrelationLogger,
  trackBusinessEvent 
} from '@/lib/logger';

/**
 * GET - Get report generation metrics and performance data
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const correlationId = generateCorrelationId();
  const correlatedLogger = createCorrelationLogger(correlationId);

  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'metrics';
    const timeWindow = (searchParams.get('timeWindow') || '24h') as '1h' | '24h' | '7d';
    const correlationIdParam = searchParams.get('correlationId');

    correlatedLogger.info('Report monitoring API request', { action, timeWindow, correlationIdParam });

    let responseData;

    switch (action) {
      case 'metrics':
        // Get comprehensive performance metrics
        responseData = {
          performanceMetrics: reportGenerationMonitor.getPerformanceMetrics(timeWindow),
          reportTypeBreakdown: reportGenerationMonitor.getReportTypeBreakdown(timeWindow),
          timeWindow
        };
        break;

      case 'alerts':
        // Get active alerts
        responseData = {
          activeAlerts: reportGenerationMonitor.getActiveAlerts(),
          alertCount: reportGenerationMonitor.getActiveAlerts().length
        };
        break;

      case 'performance':
        // Get just performance metrics
        responseData = reportGenerationMonitor.getPerformanceMetrics(timeWindow);
        break;

      case 'breakdown':
        // Get report type breakdown
        responseData = {
          reportTypes: reportGenerationMonitor.getReportTypeBreakdown(timeWindow),
          timeWindow
        };
        break;

      case 'correlation':
        // Get correlation trace
        if (!correlationIdParam) {
          throw new Error('correlationId parameter is required for correlation action');
        }
        
        const trace = reportGenerationMonitor.getCorrelationTrace(correlationIdParam);
        if (!trace) {
          return NextResponse.json({
            success: false,
            error: 'Correlation trace not found',
            correlationId,
            timestamp: new Date().toISOString()
          }, { status: 404 });
        }

        responseData = {
          trace,
          correlationId: correlationIdParam
        };
        break;

      case 'health':
        // Get health summary
        const healthMetrics = reportGenerationMonitor.getPerformanceMetrics('1h');
        responseData = {
          status: healthMetrics.failureRate > 0.2 ? 'critical' : 
                   healthMetrics.failureRate > 0.1 ? 'warning' : 'healthy',
          successRate: `${(healthMetrics.successRate * 100).toFixed(1)}%`,
          failureRate: `${(healthMetrics.failureRate * 100).toFixed(1)}%`,
          averageProcessingTime: `${(healthMetrics.averageProcessingTime / 1000).toFixed(1)}s`,
          queueDepth: healthMetrics.queueDepth,
          activeAlerts: healthMetrics.activeAlerts,
          reportsLastHour: healthMetrics.reportsLast1Hour,
                     recommendations: generateHealthRecommendations(healthMetrics)
        };
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    // Add common response metadata
    const response = {
      success: true,
      action,
      data: responseData,
      timestamp: new Date().toISOString(),
      correlationId
    };

    trackBusinessEvent('report_monitoring_api_accessed', {
      action,
      timeWindow,
      correlationId,
      hasData: !!responseData
    });

    return NextResponse.json(response);

  } catch (error) {
    correlatedLogger.error('Report monitoring API error', error as Error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to retrieve report monitoring data',
      details: (error as Error).message,
      correlationId,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

/**
 * POST - Control actions for report monitoring
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId = generateCorrelationId();
  const correlatedLogger = createCorrelationLogger(correlationId);

  try {
    const body = await request.json();
    const { action, ...params } = body;

    correlatedLogger.info('Report monitoring control action', { action, params });

    let result;
    let message;

    switch (action) {
             case 'track_start':
         // Start tracking a new report
         const { projectId, reportType, metadata = {} } = params;
         if (!projectId || !reportType) {
           throw new Error('projectId and reportType are required');
         }

         const startMetricId = reportGenerationMonitor.trackReportStart(
           projectId,
           reportType,
           params.correlationId,
           { ...metadata, sourceService: 'api' }
         );

         result = { metricId: startMetricId, correlationId: params.correlationId || correlationId };
         message = 'Report tracking started successfully';
         break;

       case 'track_step':
         // Track a report processing step
                  const { metricId: stepMetricId, stepName, status, stepMetadata } = params;
         if (!stepMetricId || !stepName || !status) {
           throw new Error('metricId, stepName, and status are required');
         }

         reportGenerationMonitor.trackReportStep(stepMetricId, stepName, status, stepMetadata);
         result = { metricId: stepMetricId, stepName, status };
        message = 'Report step tracked successfully';
        break;

      case 'track_completion':
        // Complete report tracking
        const { metricId: completionMetricId, completionStatus, reportId, error } = params;
        if (!completionMetricId || !completionStatus) {
          throw new Error('metricId and status are required');
        }

        reportGenerationMonitor.trackReportCompletion(
          completionMetricId,
          completionStatus,
          reportId,
          error
        );

        result = { metricId: completionMetricId, status: completionStatus, reportId };
        message = 'Report tracking completed successfully';
        break;

      case 'resolve_alert':
        // Resolve specific alert
        const { alertId } = params;
        if (!alertId) {
          throw new Error('alertId is required');
        }

        const resolved = reportGenerationMonitor.resolveAlert(alertId);
        result = { alertId, resolved };
        message = resolved ? 'Alert resolved successfully' : 'Alert not found or already resolved';
        break;

      case 'bulk_resolve_alerts':
        // Resolve multiple alerts
        const { alertIds = [] } = params;
                 const resolveResults = alertIds.map((id: string) => ({
           alertId: id,
           resolved: reportGenerationMonitor.resolveAlert(id)
         }));

         const resolvedCount = resolveResults.filter((r: { resolved: boolean }) => r.resolved).length;
        result = { resolveResults, resolvedCount, totalRequested: alertIds.length };
        message = `${resolvedCount}/${alertIds.length} alerts resolved successfully`;
        break;

      case 'get_trace':
        // Get detailed correlation trace
        const { traceCorrelationId } = params;
        if (!traceCorrelationId) {
          throw new Error('correlationId is required');
        }

        const detailedTrace = reportGenerationMonitor.getCorrelationTrace(traceCorrelationId);
        result = { trace: detailedTrace, found: !!detailedTrace };
        message = detailedTrace ? 'Correlation trace retrieved' : 'Correlation trace not found';
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    trackBusinessEvent('report_monitoring_action_executed', {
      action,
      success: true,
      correlationId
    });

    return NextResponse.json({
      success: true,
      action,
      result,
      message,
      timestamp: new Date().toISOString(),
      correlationId
    });

  } catch (error) {
    correlatedLogger.error('Report monitoring control action failed', error as Error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to execute report monitoring action',
      details: (error as Error).message,
      correlationId,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

/**
 * Helper function to generate health recommendations
 */
function generateHealthRecommendations(metrics: any): string[] {
  const recommendations: string[] = [];

  if (metrics.failureRate > 0.15) {
    recommendations.push('High failure rate detected - investigate failed reports and check service health');
  }

  if (metrics.averageProcessingTime > 300000) { // 5 minutes
    recommendations.push('Processing times are high - consider optimizing report generation pipeline');
  }

  if (metrics.queueDepth > 50) {
    recommendations.push('Queue backlog detected - consider scaling processing capacity');
  }

  if (metrics.endToEndTrackingRate < 0.90) {
    recommendations.push('Correlation tracking issues - verify correlation ID propagation');
  }

  if (metrics.activeAlerts > 5) {
    recommendations.push('Multiple active alerts - review and resolve monitoring issues');
  }

  if (recommendations.length === 0) {
    recommendations.push('Report generation monitoring is healthy - no issues detected');
  }

  return recommendations;
} 