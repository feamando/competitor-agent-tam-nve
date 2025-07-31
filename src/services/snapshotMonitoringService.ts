import { logger, generateCorrelationId, trackCorrelation, trackError } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

/**
 * SnapshotMonitoringService - Task 7.3: Add monitoring and alerting for snapshot collection failures
 * Comprehensive monitoring, alerting, and health checking for snapshot operations
 */

export interface SnapshotFailureAlert {
  id: string;
  operationType: string;
  competitorId?: string;
  projectId?: string;
  errorMessage: string;
  errorType: string;
  severity: 'critical' | 'warning' | 'info';
  count: number;
  firstOccurrence: Date;
  lastOccurrence: Date;
  resolved: boolean;
  correlationId: string;
}

export interface SystemHealthMetrics {
  overallHealth: 'healthy' | 'degraded' | 'critical';
  snapshotSuccessRate: number;
  averageProcessingTime: number;
  activeFailures: number;
  criticalAlerts: number;
  warningAlerts: number;
  lastSuccessfulSnapshot: Date | null;
  systemUptime: number;
}

export class SnapshotMonitoringService {
  private static instance: SnapshotMonitoringService;
  private alerts = new Map<string, SnapshotFailureAlert>();
  private readonly CRITICAL_THRESHOLD = 10; // failures in time window
  private readonly WARNING_THRESHOLD = 5;   // failures in time window
  private readonly TIME_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
  private readonly HEALTH_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.initializeMonitoring();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): SnapshotMonitoringService {
    if (!SnapshotMonitoringService.instance) {
      SnapshotMonitoringService.instance = new SnapshotMonitoringService();
    }
    return SnapshotMonitoringService.instance;
  }

  /**
   * Task 7.3: Record a snapshot operation failure
   */
  public recordFailure(
    operationType: string,
    error: Error,
    context: {
      competitorId?: string;
      projectId?: string;
      correlationId?: string;
    } = {}
  ): void {
    const correlationId = context.correlationId || generateCorrelationId();
    const alertKey = this.generateAlertKey(operationType, context.competitorId, context.projectId);
    
    const logContext = {
      operation: 'recordFailure',
      operationType,
      competitorId: context.competitorId,
      projectId: context.projectId,
      correlationId,
      errorType: error.constructor.name
    };

    try {
      logger.warn('Recording snapshot operation failure', {
        ...logContext,
        errorMessage: error.message
      });

      const existingAlert = this.alerts.get(alertKey);
      const now = new Date();

      if (existingAlert && !existingAlert.resolved) {
        // Update existing alert
        existingAlert.count++;
        existingAlert.lastOccurrence = now;
        existingAlert.errorMessage = error.message; // Update with latest error
        
        logger.info('Updated existing failure alert', {
          ...logContext,
          alertId: existingAlert.id,
          totalCount: existingAlert.count
        });
      } else {
        // Create new alert
        const newAlert: SnapshotFailureAlert = {
          id: generateCorrelationId(),
          operationType,
          competitorId: context.competitorId,
          projectId: context.projectId,
          errorMessage: error.message,
          errorType: error.constructor.name,
          severity: 'info', // Will be updated based on frequency
          count: 1,
          firstOccurrence: now,
          lastOccurrence: now,
          resolved: false,
          correlationId
        };

        this.alerts.set(alertKey, newAlert);
        
        logger.info('Created new failure alert', {
          ...logContext,
          alertId: newAlert.id
        });
      }

      // Check if severity should be escalated
      const alert = this.alerts.get(alertKey)!;
      this.updateAlertSeverity(alert);

      // Track correlation for dashboard
      trackCorrelation(correlationId, 'snapshot_failure_recorded', {
        ...logContext,
        alertId: alert.id,
        severity: alert.severity,
        failureCount: alert.count
      });

    } catch (monitoringError) {
      logger.error('Failed to record snapshot failure', monitoringError as Error, logContext);
    }
  }

  /**
   * Task 7.3: Record successful snapshot operation (for success rate calculation)
   */
  public recordSuccess(
    operationType: string,
    context: {
      competitorId?: string;
      projectId?: string;
      processingTimeMs?: number;
      correlationId?: string;
    } = {}
  ): void {
    const correlationId = context.correlationId || generateCorrelationId();
    
    const logContext = {
      operation: 'recordSuccess',
      operationType,
      competitorId: context.competitorId,
      projectId: context.projectId,
      processingTimeMs: context.processingTimeMs,
      correlationId
    };

    try {
      logger.debug('Recording snapshot operation success', logContext);

      // Check if this resolves any existing alerts
      const alertKey = this.generateAlertKey(operationType, context.competitorId, context.projectId);
      const existingAlert = this.alerts.get(alertKey);

      if (existingAlert && !existingAlert.resolved) {
        // Mark alert as resolved if we haven't had failures recently
        const timeSinceLastFailure = Date.now() - existingAlert.lastOccurrence.getTime();
        const resolveThreshold = 10 * 60 * 1000; // 10 minutes without failures

        if (timeSinceLastFailure > resolveThreshold) {
          existingAlert.resolved = true;
          
          logger.info('Resolved snapshot failure alert', {
            ...logContext,
            alertId: existingAlert.id,
            resolvedAfter: Math.floor(timeSinceLastFailure / 60000) + ' minutes'
          });

          trackCorrelation(correlationId, 'snapshot_alert_resolved', {
            ...logContext,
            alertId: existingAlert.id
          });
        }
      }

      // Track success for metrics
      trackCorrelation(correlationId, 'snapshot_success_recorded', logContext);

    } catch (monitoringError) {
      logger.error('Failed to record snapshot success', monitoringError as Error, logContext);
    }
  }

  /**
   * Generate unique key for alerts
   */
  private generateAlertKey(operationType: string, competitorId?: string, projectId?: string): string {
    return `${operationType}:${competitorId || 'global'}:${projectId || 'global'}`;
  }

  /**
   * Update alert severity based on failure frequency
   */
  private updateAlertSeverity(alert: SnapshotFailureAlert): void {
    const now = Date.now();
    const windowStart = now - this.TIME_WINDOW_MS;
    
    // Only consider failures within the time window
    if (alert.firstOccurrence.getTime() < windowStart) {
      alert.count = 1; // Reset if outside window
      alert.firstOccurrence = new Date();
    }

    const previousSeverity = alert.severity;

    if (alert.count >= this.CRITICAL_THRESHOLD) {
      alert.severity = 'critical';
    } else if (alert.count >= this.WARNING_THRESHOLD) {
      alert.severity = 'warning';
    } else {
      alert.severity = 'info';
    }

    // Trigger alerts when severity escalates
    if (alert.severity !== previousSeverity) {
      if (alert.severity === 'critical') {
        this.triggerCriticalAlert(alert);
      } else if (alert.severity === 'warning' && previousSeverity === 'info') {
        this.triggerWarningAlert(alert);
      }
    }
  }

  /**
   * Task 7.3: Trigger critical alerts
   */
  private triggerCriticalAlert(alert: SnapshotFailureAlert): void {
    const alertContext = {
      alertType: 'CRITICAL',
      alertId: alert.id,
      operationType: alert.operationType,
      failureCount: alert.count,
      timeWindow: '30 minutes',
      competitorId: alert.competitorId,
      projectId: alert.projectId,
      errorType: alert.errorType,
      severity: 'critical'
    };

    logger.error(`🚨 CRITICAL ALERT: Snapshot ${alert.operationType} failing persistently`, 
      new Error(alert.errorMessage), alertContext);

    // In production, integrate with alerting systems
    console.error(`🚨 CRITICAL: ${alert.operationType} failed ${alert.count} times in 30 minutes`);
    
    trackError(new Error(`Critical snapshot alert: ${alert.operationType}`), 'critical_snapshot_alert', alertContext);
  }

  /**
   * Task 7.3: Trigger warning alerts
   */
  private triggerWarningAlert(alert: SnapshotFailureAlert): void {
    const alertContext = {
      alertType: 'WARNING',
      alertId: alert.id,
      operationType: alert.operationType,
      failureCount: alert.count,
      timeWindow: '30 minutes',
      competitorId: alert.competitorId,
      projectId: alert.projectId,
      errorType: alert.errorType,
      severity: 'warning'
    };

    logger.warn(`⚠️ WARNING ALERT: Snapshot ${alert.operationType} experiencing issues`, alertContext);

    // In production, send to monitoring channels
    console.warn(`⚠️  WARNING: ${alert.operationType} has ${alert.count} failures in 30 minutes`);
  }

  /**
   * Task 7.3: Get current system health metrics
   */
  public async getSystemHealthMetrics(): Promise<SystemHealthMetrics> {
    const correlationId = generateCorrelationId();
    const logContext = { operation: 'getSystemHealthMetrics', correlationId };

    try {
      logger.debug('Calculating system health metrics', logContext);

      // Calculate success rate from recent snapshots
      const recentCutoff = new Date(Date.now() - this.TIME_WINDOW_MS);
      
      const [totalSnapshots, successfulSnapshots, lastSuccessful] = await Promise.all([
        prisma.snapshot.count({
          where: {
            createdAt: { gte: recentCutoff }
          }
        }),
        prisma.snapshot.count({
          where: {
            createdAt: { gte: recentCutoff },
            captureSuccess: true
          }
        }),
        prisma.snapshot.findFirst({
          where: {
            captureSuccess: true
          },
          select: {
            createdAt: true
          },
          orderBy: {
            createdAt: 'desc'
          }
        })
      ]);

      const successRate = totalSnapshots > 0 ? (successfulSnapshots / totalSnapshots) * 100 : 100;

      // Count active alerts by severity
      const activeAlerts = Array.from(this.alerts.values()).filter(alert => !alert.resolved);
      const criticalAlerts = activeAlerts.filter(alert => alert.severity === 'critical').length;
      const warningAlerts = activeAlerts.filter(alert => alert.severity === 'warning').length;

      // Determine overall health
      let overallHealth: 'healthy' | 'degraded' | 'critical';
      if (criticalAlerts > 0 || successRate < 50) {
        overallHealth = 'critical';
      } else if (warningAlerts > 0 || successRate < 80) {
        overallHealth = 'degraded';
      } else {
        overallHealth = 'healthy';
      }

      const metrics: SystemHealthMetrics = {
        overallHealth,
        snapshotSuccessRate: Math.round(successRate * 100) / 100,
        averageProcessingTime: 15000, // Would calculate from actual data
        activeFailures: activeAlerts.length,
        criticalAlerts,
        warningAlerts,
        lastSuccessfulSnapshot: lastSuccessful?.createdAt || null,
        systemUptime: process.uptime() * 1000
      };

      logger.info('System health metrics calculated', {
        ...logContext,
        ...metrics
      });

      return metrics;

    } catch (error) {
      logger.error('Failed to calculate system health metrics', error as Error, logContext);
      
      return {
        overallHealth: 'critical',
        snapshotSuccessRate: 0,
        averageProcessingTime: 0,
        activeFailures: 0,
        criticalAlerts: 0,
        warningAlerts: 0,
        lastSuccessfulSnapshot: null,
        systemUptime: 0
      };
    }
  }

  /**
   * Get all active alerts
   */
  public getActiveAlerts(): SnapshotFailureAlert[] {
    return Array.from(this.alerts.values())
      .filter(alert => !alert.resolved)
      .sort((a, b) => {
        // Sort by severity, then by count
        const severityOrder = { critical: 3, warning: 2, info: 1 };
        const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
        return severityDiff !== 0 ? severityDiff : b.count - a.count;
      });
  }

  /**
   * Get alerts for specific operation type
   */
  public getAlertsForOperation(operationType: string): SnapshotFailureAlert[] {
    return Array.from(this.alerts.values())
      .filter(alert => alert.operationType === operationType && !alert.resolved);
  }

  /**
   * Resolve an alert manually
   */
  public resolveAlert(alertId: string, reason: string): boolean {
    for (const [key, alert] of this.alerts.entries()) {
      if (alert.id === alertId) {
        alert.resolved = true;
        
        logger.info('Alert manually resolved', {
          alertId,
          operationType: alert.operationType,
          reason,
          failureCount: alert.count
        });

        return true;
      }
    }
    return false;
  }

  /**
   * Initialize monitoring system
   */
  private initializeMonitoring(): void {
    logger.info('Snapshot monitoring service initialized', {
      criticalThreshold: this.CRITICAL_THRESHOLD,
      warningThreshold: this.WARNING_THRESHOLD,
      timeWindowMinutes: this.TIME_WINDOW_MS / 60000
    });

    // Start periodic health check
    setInterval(() => {
      this.performHealthCheck();
    }, this.HEALTH_CHECK_INTERVAL);
  }

  /**
   * Periodic health check
   */
  private async performHealthCheck(): Promise<void> {
    try {
      const health = await this.getSystemHealthMetrics();
      
      logger.debug('Periodic health check completed', {
        overallHealth: health.overallHealth,
        successRate: health.snapshotSuccessRate,
        activeFailures: health.activeFailures
      });

      // Log warnings for degraded health
      if (health.overallHealth === 'critical') {
        logger.warn('System health is CRITICAL', {
          criticalAlerts: health.criticalAlerts,
          successRate: health.snapshotSuccessRate,
          activeFailures: health.activeFailures
        });
      } else if (health.overallHealth === 'degraded') {
        logger.info('System health is DEGRADED', {
          warningAlerts: health.warningAlerts,
          successRate: health.snapshotSuccessRate
        });
      }

    } catch (error) {
      logger.error('Health check failed', error as Error);
    }
  }

  /**
   * Clean up old resolved alerts
   */
  public cleanupOldAlerts(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
    const cutoff = Date.now() - maxAgeMs;
    let cleanedCount = 0;

    for (const [key, alert] of this.alerts.entries()) {
      if (alert.resolved && alert.lastOccurrence.getTime() < cutoff) {
        this.alerts.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info('Cleaned up old resolved alerts', { cleanedCount });
    }

    return cleanedCount;
  }
} 