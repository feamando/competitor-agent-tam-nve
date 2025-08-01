/**
 * Orphaned Report Alerts API - Task 7.2
 * 
 * API endpoint for managing orphaned report alerts, providing status information,
 * and enabling manual control of the alerting system.
 * 
 * Endpoints:
 * - GET /api/alerts/orphaned-reports - Get alert status and recent alerts
 * - POST /api/alerts/orphaned-reports/trigger - Manually trigger alert check
 * - POST /api/alerts/orphaned-reports/resolve - Resolve specific alert
 * - PUT /api/alerts/orphaned-reports/config - Update alert configuration
 * 
 * Part of TP-013-20250801-project-report-association-fix
 */

import { NextRequest, NextResponse } from 'next/server';
import { AlertHelpers } from '@/lib/alerts/orphanedReportAlerts';
import { SchedulerHelpers } from '@/lib/alerts/alertScheduler';
import { logger } from '@/lib/logger';

/**
 * GET /api/alerts/orphaned-reports
 * Returns current alert status and recent alerts
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const includeDetails = searchParams.get('details') === 'true';
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    
    logger.info('Orphaned report alerts status requested', {
      includeDetails,
      limit,
      userAgent: request.headers.get('user-agent')
    });
    
    // Get alert status
    const alertStatus = AlertHelpers.getStatus();
    
    // Get scheduler status
    const schedulerStats = SchedulerHelpers.getStats();
    
    // Calculate health metrics
    const healthMetrics = {
      overallHealth: calculateOverallHealth(alertStatus, schedulerStats),
      alertSystemStatus: alertStatus.activeAlerts > 0 ? 'active_alerts' : 'normal',
      schedulerStatus: schedulerStats.status,
      lastCheckAge: schedulerStats.lastSuccessfulCheck ? 
        Date.now() - schedulerStats.lastSuccessfulCheck.getTime() : null
    };
    
    const response = {
      status: 'success',
      timestamp: new Date().toISOString(),
      alertStatus,
      schedulerStats,
      healthMetrics,
      summary: {
        totalAlerts: alertStatus.totalAlerts,
        activeAlerts: alertStatus.activeAlerts,
        schedulerUptime: schedulerStats.uptime,
        successRate: schedulerStats.totalChecks > 0 ? 
          (schedulerStats.successfulChecks / schedulerStats.totalChecks) * 100 : 0,
        lastOrphanedCount: schedulerStats.lastCheckResults?.orphanedCount || 0
      }
    };
    
    return NextResponse.json(response, {
      status: 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
    
  } catch (error) {
    logger.error('Failed to retrieve orphaned report alerts status', error as Error, {
      url: request.url,
      method: request.method
    });
    
    return NextResponse.json({
      status: 'error',
      error: 'Failed to retrieve alert status',
      timestamp: new Date().toISOString()
    }, {
      status: 500
    });
  }
}

/**
 * POST /api/alerts/orphaned-reports/trigger
 * Manually trigger orphaned report detection check
 */
export async function POST(request: NextRequest) {
  try {
    const { pathname } = new URL(request.url);
    
    if (pathname.endsWith('/trigger')) {
      const body = await request.json().catch(() => ({}));
      const immediate = body.immediate !== false; // Default to immediate
      
      logger.info('Manual orphaned report check triggered', {
        immediate,
        userAgent: request.headers.get('user-agent'),
        ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip')
      });
      
      const startTime = Date.now();
      const result = await SchedulerHelpers.triggerCheck();
      const duration = Date.now() - startTime;
      
      return NextResponse.json({
        status: 'success',
        message: 'Orphaned report check completed',
        result: {
          orphanedCount: result.orphanedCount,
          alertsTriggered: result.alertsTriggered,
          alertsSuppressed: result.alertsSuppressed,
          duration
        },
        timestamp: new Date().toISOString()
      });
    }
    
    if (pathname.endsWith('/resolve')) {
      const body = await request.json();
      const { alertId, reason } = body;
      
      if (!alertId) {
        return NextResponse.json({
          status: 'error',
          error: 'Missing required field: alertId'
        }, { status: 400 });
      }
      
      logger.info('Manual alert resolution requested', {
        alertId,
        reason,
        userAgent: request.headers.get('user-agent')
      });
      
      const resolved = AlertHelpers.resolveAlert(alertId, reason);
      
      if (resolved) {
        return NextResponse.json({
          status: 'success',
          message: 'Alert resolved successfully',
          alertId,
          reason,
          timestamp: new Date().toISOString()
        });
      } else {
        return NextResponse.json({
          status: 'error',
          error: 'Alert not found or already resolved',
          alertId
        }, { status: 404 });
      }
    }
    
    return NextResponse.json({
      status: 'error',
      error: 'Invalid endpoint'
    }, { status: 404 });
    
  } catch (error) {
    logger.error('Failed to process orphaned report alert request', error as Error, {
      url: request.url,
      method: request.method
    });
    
    return NextResponse.json({
      status: 'error',
      error: 'Failed to process request',
      timestamp: new Date().toISOString()
    }, {
      status: 500
    });
  }
}

/**
 * PUT /api/alerts/orphaned-reports/config
 * Update alert configuration
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { config } = body;
    
    if (!config) {
      return NextResponse.json({
        status: 'error',
        error: 'Missing configuration data'
      }, { status: 400 });
    }
    
    logger.info('Alert configuration update requested', {
      config,
      userAgent: request.headers.get('user-agent')
    });
    
    // Validate configuration structure
    const validationResult = validateAlertConfig(config);
    if (!validationResult.valid) {
      return NextResponse.json({
        status: 'error',
        error: 'Invalid configuration',
        details: validationResult.errors
      }, { status: 400 });
    }
    
    // Update scheduler configuration
    SchedulerHelpers.updateConfig(config);
    
    return NextResponse.json({
      status: 'success',
      message: 'Alert configuration updated successfully',
      config,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Failed to update alert configuration', error as Error, {
      url: request.url,
      method: request.method
    });
    
    return NextResponse.json({
      status: 'error',
      error: 'Failed to update configuration',
      timestamp: new Date().toISOString()
    }, {
      status: 500
    });
  }
}

/**
 * Calculate overall health score based on alert and scheduler status
 */
function calculateOverallHealth(alertStatus: any, schedulerStats: any): {
  score: number;
  grade: 'excellent' | 'good' | 'fair' | 'poor';
  factors: {
    schedulerHealth: number;
    alertVolume: number;
    successRate: number;
    recency: number;
  };
} {
  // Scheduler health factor (0-100)
  let schedulerHealth = 0;
  if (schedulerStats.status === 'running') {
    schedulerHealth = 100;
    if (schedulerStats.consecutiveFailures > 0) {
      schedulerHealth -= schedulerStats.consecutiveFailures * 20;
    }
  } else if (schedulerStats.status === 'error') {
    schedulerHealth = 20;
  }
  schedulerHealth = Math.max(0, schedulerHealth);
  
  // Alert volume factor (0-100, lower is better for active alerts)
  let alertVolume = 100;
  if (alertStatus.activeAlerts > 0) {
    alertVolume = Math.max(0, 100 - (alertStatus.activeAlerts * 10));
  }
  
  // Success rate factor (0-100)
  const successRate = schedulerStats.totalChecks > 0 ? 
    (schedulerStats.successfulChecks / schedulerStats.totalChecks) * 100 : 50;
  
  // Recency factor (0-100, based on time since last successful check)
  let recency = 100;
  if (schedulerStats.lastSuccessfulCheck) {
    const timeSinceLastCheck = Date.now() - schedulerStats.lastSuccessfulCheck.getTime();
    const hoursSinceLastCheck = timeSinceLastCheck / (60 * 60 * 1000);
    if (hoursSinceLastCheck > 2) {
      recency = Math.max(0, 100 - (hoursSinceLastCheck - 2) * 25);
    }
  } else {
    recency = 0;
  }
  
  const factors = {
    schedulerHealth,
    alertVolume,
    successRate,
    recency
  };
  
  // Calculate weighted overall score
  const score = (
    schedulerHealth * 0.3 +
    alertVolume * 0.3 +
    successRate * 0.2 +
    recency * 0.2
  );
  
  let grade: 'excellent' | 'good' | 'fair' | 'poor';
  if (score >= 90) grade = 'excellent';
  else if (score >= 75) grade = 'good';
  else if (score >= 60) grade = 'fair';
  else grade = 'poor';
  
  return { score: Math.round(score), grade, factors };
}

/**
 * Validate alert configuration structure
 */
function validateAlertConfig(config: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Check basic structure
  if (typeof config !== 'object') {
    errors.push('Configuration must be an object');
    return { valid: false, errors };
  }
  
  // Validate schedules if present
  if (config.schedules) {
    if (typeof config.schedules !== 'object') {
      errors.push('schedules must be an object');
    } else {
      // Validate schedule intervals
      ['quickCheck', 'comprehensive', 'healthCheck'].forEach(scheduleType => {
        const schedule = config.schedules[scheduleType];
        if (schedule && schedule.intervalMinutes) {
          if (typeof schedule.intervalMinutes !== 'number' || schedule.intervalMinutes < 1) {
            errors.push(`${scheduleType}.intervalMinutes must be a positive number`);
          }
        }
      });
    }
  }
  
  // Validate thresholds if present
  if (config.thresholds) {
    if (typeof config.thresholds !== 'object') {
      errors.push('thresholds must be an object');
    } else {
      // Validate threshold values
      const thresholdFields = [
        'hourlyOrphanedReportsWarning',
        'hourlyOrphanedReportsCritical',
        'dailyOrphanedReportsWarning',
        'dailyOrphanedReportsCritical',
        'totalOrphanedReportsWarning',
        'totalOrphanedReportsCritical'
      ];
      
      thresholdFields.forEach(field => {
        const value = config.thresholds[field];
        if (value !== undefined && (typeof value !== 'number' || value < 0)) {
          errors.push(`thresholds.${field} must be a non-negative number`);
        }
      });
      
      // Validate percentage thresholds
      ['orphanedReportRateWarning', 'orphanedReportRateCritical', 'resolutionFailureRateWarning', 'resolutionFailureRateCritical'].forEach(field => {
        const value = config.thresholds[field];
        if (value !== undefined && (typeof value !== 'number' || value < 0 || value > 1)) {
          errors.push(`thresholds.${field} must be a number between 0 and 1`);
        }
      });
    }
  }
  
  // Validate quiet hours if present
  if (config.quietHours) {
    if (typeof config.quietHours !== 'object') {
      errors.push('quietHours must be an object');
    } else {
      if (config.quietHours.startHour !== undefined) {
        if (typeof config.quietHours.startHour !== 'number' || config.quietHours.startHour < 0 || config.quietHours.startHour > 23) {
          errors.push('quietHours.startHour must be a number between 0 and 23');
        }
      }
      if (config.quietHours.endHour !== undefined) {
        if (typeof config.quietHours.endHour !== 'number' || config.quietHours.endHour < 0 || config.quietHours.endHour > 23) {
          errors.push('quietHours.endHour must be a number between 0 and 23');
        }
      }
    }
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * OPTIONS /api/alerts/orphaned-reports
 * Handle CORS preflight requests
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    }
  });
} 