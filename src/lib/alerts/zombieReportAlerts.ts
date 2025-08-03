import prisma from '../prisma';
import { logger } from '../logger';
import { ReportValidationService, ZombieReportDetectionResult } from '../reportValidation';

/**
 * Zombie Report Monitoring Alert System
 * Task 5.3: Create monitoring alert for reports without ReportVersions
 */
export class ZombieReportAlertService {
  
  // Alert thresholds
  private static readonly ALERT_THRESHOLDS = {
    IMMEDIATE: 1, // Alert immediately if any zombie reports found
    CRITICAL: 5,  // Critical alert if 5+ zombie reports found
    WARNING: 3    // Warning alert if 3+ zombie reports found
  };
  
  // Alert channels configuration
  private static readonly ALERT_CHANNELS = {
    EMAIL: process.env.ZOMBIE_REPORT_ALERT_EMAIL || 'admin@example.com',
    SLACK_WEBHOOK: process.env.SLACK_WEBHOOK_URL,
    MONITORING_DASHBOARD: true
  };
  
  /**
   * Monitor for zombie reports and trigger alerts
   * @param projectId - Optional specific project to monitor
   * @returns Promise<ZombieReportMonitoringResult>
   */
  static async monitorAndAlert(projectId?: string): Promise<ZombieReportMonitoringResult> {
    const context = { 
      projectId: projectId || 'ALL_PROJECTS', 
      operation: 'zombieReportMonitoring',
      timestamp: new Date().toISOString()
    };
    
    try {
      logger.info('Starting zombie report monitoring sweep', context);
      
      // Detect zombie reports
      const detectionResult = await ReportValidationService.detectZombieReports(projectId);
      
      const monitoringResult: ZombieReportMonitoringResult = {
        detectionResult,
        alertsTriggered: [],
        monitoringTimestamp: new Date(),
        projectScope: projectId || 'ALL_PROJECTS'
      };
      
      // Determine alert severity
      const alertSeverity = this.determineAlertSeverity(detectionResult.zombiesFound);
      
      if (detectionResult.zombiesFound > 0) {
        // Trigger alerts based on severity
        const alertResult = await this.triggerAlerts(detectionResult, alertSeverity, context);
        monitoringResult.alertsTriggered = alertResult.alertsTriggered;
        
        // Log critical information
        logger.error('ZOMBIE REPORTS DETECTED - Alerts triggered', undefined, {
          ...context,
          zombiesFound: detectionResult.zombiesFound,
          alertSeverity,
          affectedReports: detectionResult.reports.map(r => r.reportId),
          alertsTriggered: alertResult.alertsTriggered.length
        });
        
      } else {
        logger.info('Zombie report monitoring completed - No issues detected', context);
      }
      
      return monitoringResult;
      
    } catch (error) {
      logger.error('Zombie report monitoring failed', error as Error, context);
      
      // Trigger monitoring failure alert
      await this.triggerMonitoringFailureAlert(error as Error, context);
      
      return {
        detectionResult: {
          zombiesFound: 0,
          reports: [],
          scannedAt: new Date(),
          error: (error as Error).message
        },
        alertsTriggered: [],
        monitoringTimestamp: new Date(),
        projectScope: projectId || 'ALL_PROJECTS',
        monitoringError: (error as Error).message
      };
    }
  }
  
  /**
   * Trigger real-time alert when a zombie report is created
   * @param reportId - The ID of the zombie report
   * @param projectId - The project ID
   * @param context - Additional context
   */
  static async triggerImmediateZombieAlert(
    reportId: string,
    projectId: string,
    context: any = {}
  ): Promise<void> {
    const alertContext = {
      reportId,
      projectId,
      operation: 'immediateZombieAlert',
      timestamp: new Date().toISOString(),
      ...context
    };
    
    try {
      logger.error('IMMEDIATE ZOMBIE REPORT ALERT - Report created without ReportVersion', undefined, alertContext);
      
      // Create immediate alert
      const alertMessage = `🚨 CRITICAL: Zombie Report Detected!\n` +
        `Report ID: ${reportId}\n` +
        `Project ID: ${projectId}\n` +
        `Status: COMPLETED but no viewable content\n` +
        `Time: ${new Date().toISOString()}\n` +
        `Action Required: Investigate and fix immediately`;
      
      // Trigger multiple alert channels
      const alertPromises = [
        this.sendEmailAlert(alertMessage, 'CRITICAL'),
        this.sendSlackAlert(alertMessage, 'CRITICAL'),
        this.logToDashboard(alertMessage, 'CRITICAL', alertContext)
      ];
      
      await Promise.allSettled(alertPromises);
      
      logger.info('Immediate zombie report alert triggered successfully', alertContext);
      
    } catch (error) {
      logger.error('Failed to trigger immediate zombie report alert', error as Error, alertContext);
    }
  }
  
  /**
   * Create scheduled monitoring job for continuous zombie report detection
   * @param intervalMinutes - How often to run monitoring (default: 15 minutes)
   */
  static async scheduleMonitoring(intervalMinutes: number = 15): Promise<void> {
    const context = { 
      operation: 'scheduleZombieReportMonitoring',
      intervalMinutes,
      scheduledAt: new Date().toISOString()
    };
    
    logger.info('Scheduling zombie report monitoring', context);
    
    // Initial monitoring run
    await this.monitorAndAlert();
    
    // Schedule recurring monitoring
    setInterval(async () => {
      try {
        await this.monitorAndAlert();
      } catch (error) {
        logger.error('Scheduled zombie report monitoring failed', error as Error, context);
      }
    }, intervalMinutes * 60 * 1000);
    
    logger.info('Zombie report monitoring scheduled successfully', context);
  }
  
  /**
   * Determine alert severity based on number of zombie reports
   */
  private static determineAlertSeverity(zombieCount: number): AlertSeverity {
    if (zombieCount >= this.ALERT_THRESHOLDS.CRITICAL) {
      return 'CRITICAL';
    } else if (zombieCount >= this.ALERT_THRESHOLDS.WARNING) {
      return 'WARNING';
    } else if (zombieCount >= this.ALERT_THRESHOLDS.IMMEDIATE) {
      return 'IMMEDIATE';
    } else {
      return 'INFO';
    }
  }
  
  /**
   * Trigger appropriate alerts based on detection results
   */
  private static async triggerAlerts(
    detectionResult: ZombieReportDetectionResult,
    severity: AlertSeverity,
    context: any
  ): Promise<{ alertsTriggered: string[] }> {
    
    const alertsTriggered: string[] = [];
    
    const alertMessage = this.formatAlertMessage(detectionResult, severity);
    
    try {
      // Email alert
      if (severity === 'CRITICAL' || severity === 'IMMEDIATE') {
        await this.sendEmailAlert(alertMessage, severity);
        alertsTriggered.push('EMAIL');
      }
      
      // Slack alert
      if (this.ALERT_CHANNELS.SLACK_WEBHOOK) {
        await this.sendSlackAlert(alertMessage, severity);
        alertsTriggered.push('SLACK');
      }
      
      // Dashboard logging
      await this.logToDashboard(alertMessage, severity, context);
      alertsTriggered.push('DASHBOARD');
      
      logger.info('Zombie report alerts triggered successfully', {
        ...context,
        alertsTriggered,
        severity
      });
      
    } catch (error) {
      logger.error('Failed to trigger some zombie report alerts', error as Error, {
        ...context,
        alertsTriggered
      });
    }
    
    return { alertsTriggered };
  }
  
  /**
   * Format alert message based on detection results
   */
  private static formatAlertMessage(
    detectionResult: ZombieReportDetectionResult,
    severity: AlertSeverity
  ): string {
    const emoji = severity === 'CRITICAL' ? '🚨' : severity === 'WARNING' ? '⚠️' : '📊';
    
    let message = `${emoji} ZOMBIE REPORT ALERT [${severity}]\n\n`;
    message += `Detected: ${detectionResult.zombiesFound} zombie reports\n`;
    message += `Scanned At: ${detectionResult.scannedAt.toISOString()}\n\n`;
    
    if (detectionResult.reports.length > 0) {
      message += `Affected Reports:\n`;
      detectionResult.reports.forEach(report => {
        message += `• ${report.reportName} (ID: ${report.reportId})\n`;
        message += `  Project: ${report.projectName} (${report.projectId})\n`;
        message += `  Created: ${report.createdAt.toISOString()}\n\n`;
      });
    }
    
    message += `Action Required: These reports are marked as COMPLETED but have no viewable content.\n`;
    message += `Users cannot access these reports, affecting user experience.\n`;
    message += `Please investigate and fix immediately.`;
    
    return message;
  }
  
  /**
   * Send email alert (placeholder - implement actual email service)
   */
  private static async sendEmailAlert(message: string, severity: AlertSeverity): Promise<void> {
    // TODO: Implement actual email service integration
    logger.info('EMAIL ALERT WOULD BE SENT', {
      recipient: this.ALERT_CHANNELS.EMAIL,
      severity,
      messagePreview: message.substring(0, 100) + '...'
    });
  }
  
  /**
   * Send Slack alert (placeholder - implement actual Slack integration)
   */
  private static async sendSlackAlert(message: string, severity: AlertSeverity): Promise<void> {
    // TODO: Implement actual Slack webhook integration
    logger.info('SLACK ALERT WOULD BE SENT', {
      webhook: this.ALERT_CHANNELS.SLACK_WEBHOOK ? 'CONFIGURED' : 'NOT_CONFIGURED',
      severity,
      messagePreview: message.substring(0, 100) + '...'
    });
  }
  
  /**
   * Log alert to monitoring dashboard
   */
  private static async logToDashboard(
    message: string,
    severity: AlertSeverity,
    context: any
  ): Promise<void> {
    try {
      // Log to application logs with structured data for monitoring systems
      logger.error('ZOMBIE_REPORT_DASHBOARD_ALERT', undefined, {
        alertType: 'ZOMBIE_REPORT',
        severity,
        message,
        context,
        dashboardMetrics: {
          alertCount: 1,
          severity,
          timestamp: new Date().toISOString()
        }
      });
      
    } catch (error) {
      logger.error('Failed to log zombie report alert to dashboard', error as Error, context);
    }
  }
  
  /**
   * Trigger alert when monitoring system itself fails
   */
  private static async triggerMonitoringFailureAlert(
    error: Error,
    context: any
  ): Promise<void> {
    const failureMessage = `🔥 CRITICAL: Zombie Report Monitoring System Failure\n\n` +
      `Error: ${error.message}\n` +
      `Context: ${JSON.stringify(context)}\n` +
      `Time: ${new Date().toISOString()}\n\n` +
      `The zombie report monitoring system has failed.\n` +
      `Manual intervention required immediately.`;
    
    try {
      await this.sendEmailAlert(failureMessage, 'CRITICAL');
      await this.logToDashboard(failureMessage, 'CRITICAL', { ...context, error: error.message });
      
    } catch (alertError) {
      logger.error('Failed to send monitoring failure alert', alertError as Error, context);
    }
  }
}

// Type definitions
export type AlertSeverity = 'INFO' | 'WARNING' | 'IMMEDIATE' | 'CRITICAL';

export interface ZombieReportMonitoringResult {
  detectionResult: ZombieReportDetectionResult;
  alertsTriggered: string[];
  monitoringTimestamp: Date;
  projectScope: string;
  monitoringError?: string;
} 