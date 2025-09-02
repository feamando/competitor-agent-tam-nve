/**
 * TP-024 Task 3.3: Report Alerting System
 * 
 * Alerting system for failed scheduled report execution
 * Addresses root causes identified in A-002 analysis
 */

import { logger, generateCorrelationId } from '@/lib/logger';
import { reportMonitoringService, MonitoringAlert } from '@/lib/monitoring/reportMonitoring';

export interface AlertDestination {
  type: 'console' | 'webhook' | 'email';
  config: {
    url?: string;
    email?: string;
    threshold?: 'low' | 'medium' | 'high' | 'critical';
  };
}

export interface AlertingConfig {
  enabled: boolean;
  destinations: AlertDestination[];
  throttleMinutes: number; // Prevent spam
  batchAlerts: boolean; // Send multiple alerts together
}

/**
 * TP-024 Task 3.3: Alerting service for report generation failures
 */
export class ReportAlertingService {
  private lastAlertTimes: Map<string, Date> = new Map();
  private config: AlertingConfig;

  constructor(config?: Partial<AlertingConfig>) {
    this.config = {
      enabled: true,
      destinations: [
        { type: 'console', config: { threshold: 'medium' } }
      ],
      throttleMinutes: 15, // Don't send same alert more than once per 15 minutes
      batchAlerts: true,
      ...config
    };
  }

  /**
   * TP-024: Send alert for critical report generation issues
   */
  async sendAlert(alert: MonitoringAlert): Promise<boolean> {
    if (!this.config.enabled) return false;

    const correlationId = generateCorrelationId();
    const context = { 
      correlationId, 
      operation: 'sendAlert',
      alertId: alert.id,
      alertType: alert.alertType,
      severity: alert.severity
    };

    try {
      // Check throttling
      const throttleKey = `${alert.projectId}-${alert.alertType}`;
      const lastAlertTime = this.lastAlertTimes.get(throttleKey);
      const now = new Date();
      
      if (lastAlertTime) {
        const timeSinceLastAlert = now.getTime() - lastAlertTime.getTime();
        const throttleMs = this.config.throttleMinutes * 60 * 1000;
        
        if (timeSinceLastAlert < throttleMs) {
          logger.debug('TP-024: Alert throttled', { ...context, timeSinceLastAlert });
          return false;
        }
      }

      logger.info('TP-024: Sending alert', context);

      // Send to all configured destinations
      const sendPromises = this.config.destinations.map(destination => 
        this.sendToDestination(alert, destination, context)
      );

      const results = await Promise.allSettled(sendPromises);
      
      // Check if at least one destination succeeded
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      const success = successCount > 0;

      if (success) {
        this.lastAlertTimes.set(throttleKey, now);
      }

      logger.info('TP-024: Alert sending completed', {
        ...context,
        destinationCount: this.config.destinations.length,
        successCount,
        success
      });

      return success;

    } catch (error) {
      logger.error('TP-024: Alert sending failed', error as Error, context);
      return false;
    }
  }

  /**
   * TP-024: Send batch of alerts (for efficiency)
   */
  async sendBatchAlerts(alerts: MonitoringAlert[]): Promise<number> {
    if (!this.config.enabled || alerts.length === 0) return 0;

    const correlationId = generateCorrelationId();
    const context = { 
      correlationId, 
      operation: 'sendBatchAlerts',
      alertCount: alerts.length
    };

    try {
      logger.info('TP-024: Sending batch alerts', context);

      if (this.config.batchAlerts && alerts.length > 1) {
        // Send as batch
        return await this.sendBatchAlert(alerts, context);
      } else {
        // Send individually
        let successCount = 0;
        for (const alert of alerts) {
          const success = await this.sendAlert(alert);
          if (success) successCount++;
        }
        return successCount;
      }

    } catch (error) {
      logger.error('TP-024: Batch alert sending failed', error as Error, context);
      return 0;
    }
  }

  /**
   * TP-024: Check for new alerts and send them
   */
  async checkAndSendAlerts(): Promise<number> {
    const correlationId = generateCorrelationId();
    const context = { correlationId, operation: 'checkAndSendAlerts' };

    try {
      logger.info('TP-024: Checking for new alerts to send', context);

      // Run monitoring check to get new alerts
      const { newAlerts } = await reportMonitoringService.runMonitoringCheck();

      if (newAlerts.length === 0) {
        logger.debug('TP-024: No new alerts to send', context);
        return 0;
      }

      // Filter alerts by severity threshold
      const alertsToSend = newAlerts.filter(alert => 
        this.shouldSendAlert(alert)
      );

      if (alertsToSend.length === 0) {
        logger.debug('TP-024: No alerts meet sending threshold', {
          ...context,
          totalAlerts: newAlerts.length
        });
        return 0;
      }

      // Send alerts
      const sentCount = await this.sendBatchAlerts(alertsToSend);

      logger.info('TP-024: Alert check completed', {
        ...context,
        newAlerts: newAlerts.length,
        alertsToSend: alertsToSend.length,
        sentCount
      });

      return sentCount;

    } catch (error) {
      logger.error('TP-024: Alert check failed', error as Error, context);
      return 0;
    }
  }

  /**
   * Private helper methods
   */
  private async sendToDestination(
    alert: MonitoringAlert, 
    destination: AlertDestination,
    context: any
  ): Promise<void> {
    // Check if alert meets destination threshold
    if (!this.meetsThreshold(alert.severity, destination.config.threshold || 'medium')) {
      return;
    }

    switch (destination.type) {
      case 'console':
        this.sendConsoleAlert(alert, context);
        break;
      
      case 'webhook':
        await this.sendWebhookAlert(alert, destination, context);
        break;
      
      case 'email':
        await this.sendEmailAlert(alert, destination, context);
        break;
      
      default:
        logger.warn('TP-024: Unknown alert destination type', {
          ...context,
          destinationType: destination.type
        });
    }
  }

  private sendConsoleAlert(alert: MonitoringAlert, context: any): void {
    const emoji = this.getSeverityEmoji(alert.severity);
    const message = `${emoji} TP-024 ALERT: ${alert.message}`;
    
    console.log('\n' + '='.repeat(80));
    console.log(message);
    console.log(`Project: ${alert.projectName} (${alert.projectId})`);
    console.log(`Type: ${alert.alertType} | Severity: ${alert.severity.toUpperCase()}`);
    console.log(`Time: ${alert.createdAt.toISOString()}`);
    
    if (Object.keys(alert.details).length > 0) {
      console.log('Details:', JSON.stringify(alert.details, null, 2));
    }
    
    console.log('='.repeat(80) + '\n');

    logger.info('TP-024: Console alert sent', context);
  }

  private async sendWebhookAlert(
    alert: MonitoringAlert, 
    destination: AlertDestination,
    context: any
  ): Promise<void> {
    if (!destination.config.url) {
      throw new Error('Webhook URL not configured');
    }

    const payload = {
      timestamp: new Date().toISOString(),
      alert: {
        id: alert.id,
        type: alert.alertType,
        severity: alert.severity,
        message: alert.message,
        project: {
          id: alert.projectId,
          name: alert.projectName
        },
        details: alert.details,
        createdAt: alert.createdAt
      },
      source: 'TP-024-report-monitoring'
    };

    // In a real implementation, we would use fetch or axios
    logger.info('TP-024: Webhook alert would be sent', {
      ...context,
      webhookUrl: destination.config.url,
      payload: JSON.stringify(payload)
    });
  }

  private async sendEmailAlert(
    alert: MonitoringAlert, 
    destination: AlertDestination,
    context: any
  ): Promise<void> {
    if (!destination.config.email) {
      throw new Error('Email address not configured');
    }

    const subject = `TP-024 Alert: ${alert.alertType} - ${alert.severity.toUpperCase()}`;
    const body = `
Alert: ${alert.message}
Project: ${alert.projectName} (${alert.projectId})
Severity: ${alert.severity.toUpperCase()}
Time: ${alert.createdAt.toISOString()}

Details:
${JSON.stringify(alert.details, null, 2)}

This is an automated alert from the TP-024 report monitoring system.
`;

    // In a real implementation, we would integrate with an email service
    logger.info('TP-024: Email alert would be sent', {
      ...context,
      email: destination.config.email,
      subject,
      body
    });
  }

  private async sendBatchAlert(alerts: MonitoringAlert[], context: any): Promise<number> {
    const criticalAlerts = alerts.filter(a => a.severity === 'critical');
    const highAlerts = alerts.filter(a => a.severity === 'high');
    const mediumAlerts = alerts.filter(a => a.severity === 'medium');

    const emoji = criticalAlerts.length > 0 ? '🚨' : highAlerts.length > 0 ? '⚠️' : '📊';
    
    console.log('\n' + '='.repeat(80));
    console.log(`${emoji} TP-024 BATCH ALERT: ${alerts.length} Report Issues Detected`);
    console.log(`Critical: ${criticalAlerts.length} | High: ${highAlerts.length} | Medium: ${mediumAlerts.length}`);
    console.log(`Time: ${new Date().toISOString()}`);
    console.log('-'.repeat(80));

    alerts.forEach((alert, index) => {
      const alertEmoji = this.getSeverityEmoji(alert.severity);
      console.log(`${index + 1}. ${alertEmoji} ${alert.message}`);
      console.log(`   Project: ${alert.projectName} (${alert.severity.toUpperCase()})`);
    });

    console.log('='.repeat(80) + '\n');

    logger.info('TP-024: Batch alert sent', { ...context, alertCount: alerts.length });
    return alerts.length;
  }

  private shouldSendAlert(alert: MonitoringAlert): boolean {
    // Always send critical alerts
    if (alert.severity === 'critical') return true;
    
    // Send high severity alerts for missing reports
    if (alert.severity === 'high' && alert.alertType === 'missing_initial_report') return true;
    
    // Send high severity alerts for overdue scheduled reports
    if (alert.severity === 'high' && alert.alertType === 'overdue_scheduled_report') return true;
    
    return false;
  }

  private meetsThreshold(
    alertSeverity: string, 
    thresholdSeverity: string
  ): boolean {
    const severityLevels = { low: 1, medium: 2, high: 3, critical: 4 };
    const alertLevel = severityLevels[alertSeverity as keyof typeof severityLevels] || 1;
    const thresholdLevel = severityLevels[thresholdSeverity as keyof typeof severityLevels] || 2;
    
    return alertLevel >= thresholdLevel;
  }

  private getSeverityEmoji(severity: string): string {
    switch (severity) {
      case 'critical': return '🚨';
      case 'high': return '⚠️';
      case 'medium': return '📊';
      case 'low': return '📝';
      default: return '📋';
    }
  }
}

// Default alerting service instance
export const reportAlertingService = new ReportAlertingService(); 