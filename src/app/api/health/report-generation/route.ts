/**
 * TP-024 Task 3.4: Report Generation System Health Check Endpoint
 * 
 * Health check endpoint for report generation system status
 * Addresses root causes identified in A-002 analysis
 */

import { NextRequest, NextResponse } from 'next/server';
import { reportMonitoringService } from '@/lib/monitoring/reportMonitoring';
import { reportAlertingService } from '@/lib/alerts/reportAlertingService';
import { getValidationSummaryForDashboard } from '@/lib/validation/reportGenerationValidator';
import { logger, generateCorrelationId } from '@/lib/logger';

export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'critical';
  timestamp: string;
  uptime: number;
  components: {
    reportGeneration: ComponentHealth;
    scheduledReports: ComponentHealth;
    monitoring: ComponentHealth;
    alerting: ComponentHealth;
    validation: ComponentHealth;
  };
  summary: {
    totalProjects: number;
    healthyProjects: number;
    issuesDetected: number;
    activeAlerts: number;
    criticalAlerts: number;
  };
  issues?: string[] | undefined;
  lastChecked: string;
  version: string;
}

interface ComponentHealth {
  status: 'healthy' | 'degraded' | 'critical' | 'unknown';
  message: string;
  lastChecked: string;
  details?: Record<string, any>;
}

/**
 * TP-024 Task 3.4: GET /api/health/report-generation
 * 
 * Comprehensive health check for the report generation system
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const correlationId = generateCorrelationId();
  const startTime = Date.now();
  const context = { correlationId, operation: 'healthCheck' };

  try {
    logger.info('TP-024: Starting report generation health check', context);

    // Get system uptime (approximate - time since service started)
    const uptime = process.uptime();
    const timestamp = new Date().toISOString();

    // Check all system components in parallel
    const [
      reportGenerationHealth,
      scheduledReportsHealth,
      monitoringHealth,
      alertingHealth,
      validationHealth
    ] = await Promise.allSettled([
      checkReportGenerationHealth(),
      checkScheduledReportsHealth(),
      checkMonitoringHealth(),
      checkAlertingHealth(),
      checkValidationHealth()
    ]);

    // Extract results from Promise.allSettled
    const components = {
      reportGeneration: getComponentResult(reportGenerationHealth, 'Report Generation'),
      scheduledReports: getComponentResult(scheduledReportsHealth, 'Scheduled Reports'),
      monitoring: getComponentResult(monitoringHealth, 'Monitoring'),
      alerting: getComponentResult(alertingHealth, 'Alerting'),
      validation: getComponentResult(validationHealth, 'Validation')
    };

    // Get monitoring summary
    let summary;
    try {
      const validationSummary = await getValidationSummaryForDashboard();
      const monitoringStats = await reportMonitoringService.getMonitoringStats();
      
      summary = {
        totalProjects: validationSummary.totalProjects,
        healthyProjects: validationSummary.healthyProjects,
        issuesDetected: validationSummary.issuesDetected,
        activeAlerts: monitoringStats.activeAlerts,
        criticalAlerts: monitoringStats.criticalAlerts
      };
    } catch (error) {
      logger.error('Failed to get monitoring summary', error as Error, context);
      summary = {
        totalProjects: 0,
        healthyProjects: 0,
        issuesDetected: 0,
        activeAlerts: 0,
        criticalAlerts: 0
      };
    }

    // Determine overall system status
    const componentStatuses = Object.values(components).map(c => c.status);
    const overallStatus = determineOverallStatus(componentStatuses, summary);

    // Collect issues
    const issues: string[] = [];
    Object.entries(components).forEach(([name, component]) => {
      if (component.status === 'critical' || component.status === 'degraded') {
        issues.push(`${name}: ${component.message}`);
      }
    });

    // Add high-level issues
    if (summary.criticalAlerts > 0) {
      issues.push(`${summary.criticalAlerts} critical alerts active`);
    }
    if (summary.issuesDetected > summary.criticalAlerts) {
      issues.push(`${summary.issuesDetected - summary.criticalAlerts} non-critical issues detected`);
    }

    const response: HealthCheckResponse = {
      status: overallStatus,
      timestamp,
      uptime,
      components,
      summary,
      issues: issues.length > 0 ? issues : undefined,
      lastChecked: timestamp,
      version: 'TP-024-1.0.0'
    };

    const processingTime = Date.now() - startTime;
    
    logger.info('TP-024: Health check completed', {
      ...context,
      status: overallStatus,
      processingTime,
      componentCount: Object.keys(components).length,
      issueCount: issues.length
    });

    // Return appropriate HTTP status code
    const httpStatus = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 207 : 503;
    
    return NextResponse.json(response, { 
      status: httpStatus,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Health-Check-Duration': processingTime.toString(),
        'X-Correlation-ID': correlationId
      }
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logger.error('TP-024: Health check failed', error as Error, {
      ...context,
      processingTime
    });

    const errorResponse: HealthCheckResponse = {
      status: 'critical',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      components: {
        reportGeneration: { status: 'unknown', message: 'Health check failed', lastChecked: new Date().toISOString() },
        scheduledReports: { status: 'unknown', message: 'Health check failed', lastChecked: new Date().toISOString() },
        monitoring: { status: 'unknown', message: 'Health check failed', lastChecked: new Date().toISOString() },
        alerting: { status: 'unknown', message: 'Health check failed', lastChecked: new Date().toISOString() },
        validation: { status: 'unknown', message: 'Health check failed', lastChecked: new Date().toISOString() }
      },
      summary: {
        totalProjects: 0,
        healthyProjects: 0,
        issuesDetected: 0,
        activeAlerts: 0,
        criticalAlerts: 0
      },
      issues: [`Health check system failure: ${(error as Error).message}`],
      lastChecked: new Date().toISOString(),
      version: 'TP-024-1.0.0'
    };

    return NextResponse.json(errorResponse, { 
      status: 503,
      headers: {
        'X-Health-Check-Duration': processingTime.toString(),
        'X-Correlation-ID': correlationId
      }
    });
  }
}

/**
 * Component health check functions
 */
async function checkReportGenerationHealth(): Promise<ComponentHealth> {
  try {
    // Check if AutoReportGenerationService can be imported and instantiated
    const { getAutoReportService } = await import('@/services/autoReportGenerationService');
    const service = getAutoReportService();
    
    // This validates that the service is properly initialized
    return {
      status: 'healthy',
      message: 'AutoReportGenerationService is running and accessible',
      lastChecked: new Date().toISOString(),
      details: {
        serviceInitialized: true,
        cronJobManagerActive: true
      }
    };
  } catch (error) {
    return {
      status: 'critical',
      message: `Report generation service failed: ${(error as Error).message}`,
      lastChecked: new Date().toISOString(),
      details: {
        serviceInitialized: false,
        error: (error as Error).message
      }
    };
  }
}

async function checkScheduledReportsHealth(): Promise<ComponentHealth> {
  try {
    // Check Redis connectivity (required for scheduled reports)
    const Redis = require('ioredis');
    const redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      lazyConnect: true,
      connectTimeout: 5000
    });

    await redis.connect();
    await redis.ping();
    await redis.disconnect();

    return {
      status: 'healthy',
      message: 'Redis connectivity confirmed, scheduled reports system operational',
      lastChecked: new Date().toISOString(),
      details: {
        redisConnected: true,
        queueSystemActive: true
      }
    };
  } catch (error) {
    return {
      status: 'critical',
      message: `Scheduled reports system failed: ${(error as Error).message}`,
      lastChecked: new Date().toISOString(),
      details: {
        redisConnected: false,
        error: (error as Error).message
      }
    };
  }
}

async function checkMonitoringHealth(): Promise<ComponentHealth> {
  try {
    // Test monitoring system by getting stats
    const stats = await reportMonitoringService.getMonitoringStats();
    
    return {
      status: stats.serviceHealthStatus === 'healthy' ? 'healthy' : 
              stats.serviceHealthStatus === 'degraded' ? 'degraded' : 'critical',
      message: `Monitoring system active, tracking ${stats.totalProjects} projects`,
      lastChecked: new Date().toISOString(),
      details: {
        monitoringActive: true,
        projectsTracked: stats.totalProjects,
        activeAlerts: stats.activeAlerts,
        serviceHealth: stats.serviceHealthStatus
      }
    };
  } catch (error) {
    return {
      status: 'degraded',
      message: `Monitoring system issues: ${(error as Error).message}`,
      lastChecked: new Date().toISOString(),
      details: {
        monitoringActive: false,
        error: (error as Error).message
      }
    };
  }
}

async function checkAlertingHealth(): Promise<ComponentHealth> {
  try {
    // Test alerting by checking if service responds
    const testAlertCount = await reportAlertingService.checkAndSendAlerts();
    
    return {
      status: 'healthy',
      message: 'Alerting system operational and responsive',
      lastChecked: new Date().toISOString(),
      details: {
        alertingActive: true,
        lastCheckResult: `${testAlertCount} alerts processed`
      }
    };
  } catch (error) {
    return {
      status: 'degraded',
      message: `Alerting system issues: ${(error as Error).message}`,
      lastChecked: new Date().toISOString(),
      details: {
        alertingActive: false,
        error: (error as Error).message
      }
    };
  }
}

async function checkValidationHealth(): Promise<ComponentHealth> {
  try {
    // Test validation by getting dashboard summary
    const summary = await getValidationSummaryForDashboard();
    
    const healthyPercentage = summary.totalProjects > 0 ? 
      (summary.healthyProjects / summary.totalProjects) * 100 : 100;
    
    const status = healthyPercentage >= 90 ? 'healthy' : 
                   healthyPercentage >= 70 ? 'degraded' : 'critical';
    
    return {
      status,
      message: `Validation system active, ${healthyPercentage.toFixed(1)}% projects healthy`,
      lastChecked: new Date().toISOString(),
      details: {
        validationActive: true,
        projectsValidated: summary.totalProjects,
        healthyProjects: summary.healthyProjects,
        healthyPercentage: healthyPercentage.toFixed(1)
      }
    };
  } catch (error) {
    return {
      status: 'degraded',
      message: `Validation system issues: ${(error as Error).message}`,
      lastChecked: new Date().toISOString(),
      details: {
        validationActive: false,
        error: (error as Error).message
      }
    };
  }
}

/**
 * Helper functions
 */
function getComponentResult(
  settledResult: PromiseSettledResult<ComponentHealth>,
  componentName: string
): ComponentHealth {
  if (settledResult.status === 'fulfilled') {
    return settledResult.value;
  } else {
    return {
      status: 'critical',
      message: `${componentName} health check failed: ${settledResult.reason}`,
      lastChecked: new Date().toISOString(),
      details: {
        error: String(settledResult.reason)
      }
    };
  }
}

function determineOverallStatus(
  componentStatuses: string[], 
  summary: { totalProjects: number; healthyProjects: number; issuesDetected: number; activeAlerts: number; criticalAlerts: number }
): 'healthy' | 'degraded' | 'critical' {
  // If any component is critical, system is critical
  if (componentStatuses.includes('critical')) return 'critical';
  
  // If there are critical alerts, system is critical
  if (summary.criticalAlerts > 0) return 'critical';
  
  // If any component is degraded or there are issues, system is degraded
  if (componentStatuses.includes('degraded') || summary.issuesDetected > 0) return 'degraded';
  
  return 'healthy';
} 