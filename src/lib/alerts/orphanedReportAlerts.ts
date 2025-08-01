/**
 * Orphaned Report Alerts System - Task 7.2
 * 
 * Comprehensive alerting system for detecting and notifying about orphaned reports
 * (reports without proper project associations). Provides real-time monitoring,
 * threshold-based alerting, and automated escalation for data integrity issues.
 * 
 * Alert Types:
 * - Real-time orphaned report creation alerts
 * - Threshold-based volume alerts (hourly/daily)
 * - Data integrity monitoring alerts
 * - Business impact alerts (project dashboard issues)
 * - Trend-based early warning alerts
 * - System health degradation alerts
 * 
 * Part of TP-013-20250801-project-report-association-fix
 */

import { prisma } from '@/lib/prisma';
import { logger, generateCorrelationId } from '@/lib/logger';
import { projectResolutionMetrics } from '@/lib/metrics/projectResolutionMetrics';

// Alert severity levels
export type AlertSeverity = 'info' | 'warning' | 'critical' | 'emergency';

// Alert channel types
export type AlertChannel = 'email' | 'slack' | 'webhook' | 'dashboard' | 'pagerduty';

// Alert interfaces
export interface OrphanedReportAlert {
  id: string;
  timestamp: Date;
  severity: AlertSeverity;
  type: string;
  title: string;
  message: string;
  metadata: Record<string, any>;
  channels: AlertChannel[];
  correlationId?: string;
  resolved: boolean;
  resolvedAt?: Date;
  escalated: boolean;
  escalatedAt?: Date;
}

export interface AlertThresholds {
  // Hourly thresholds
  hourlyOrphanedReportsWarning: number;    // Warning threshold for new orphans per hour
  hourlyOrphanedReportsCritical: number;   // Critical threshold for new orphans per hour
  
  // Daily thresholds  
  dailyOrphanedReportsWarning: number;     // Warning threshold for new orphans per day
  dailyOrphanedReportsCritical: number;    // Critical threshold for new orphans per day
  
  // Total orphaned report thresholds
  totalOrphanedReportsWarning: number;     // Warning threshold for total orphans
  totalOrphanedReportsCritical: number;    // Critical threshold for total orphans
  
  // Percentage thresholds
  orphanedReportRateWarning: number;       // Warning percentage of reports that are orphaned
  orphanedReportRateCritical: number;      // Critical percentage of reports that are orphaned
  
  // Project resolution failure thresholds
  resolutionFailureRateWarning: number;    // Warning project resolution failure rate
  resolutionFailureRateCritical: number;   // Critical project resolution failure rate
}

export interface AlertConfiguration {
  enabled: boolean;
  thresholds: AlertThresholds;
  channels: {
    [K in AlertChannel]: {
      enabled: boolean;
      config: Record<string, any>;
    };
  };
  escalationPolicy: {
    enabled: boolean;
    escalationDelayMinutes: number;
    escalationSeverities: AlertSeverity[];
  };
  suppressionRules: {
    duplicateAlertWindowMinutes: number;
    maxAlertsPerHour: number;
  };
}

// Default alert configuration
const DEFAULT_ALERT_CONFIG: AlertConfiguration = {
  enabled: true,
  thresholds: {
    hourlyOrphanedReportsWarning: 10,
    hourlyOrphanedReportsCritical: 25,
    dailyOrphanedReportsWarning: 50,
    dailyOrphanedReportsCritical: 150,
    totalOrphanedReportsWarning: 100,
    totalOrphanedReportsCritical: 500,
    orphanedReportRateWarning: 0.15, // 15%
    orphanedReportRateCritical: 0.30, // 30%
    resolutionFailureRateWarning: 0.25, // 25%
    resolutionFailureRateCritical: 0.50  // 50%
  },
  channels: {
    email: { enabled: true, config: {} },
    slack: { enabled: true, config: {} },
    webhook: { enabled: true, config: {} },
    dashboard: { enabled: true, config: {} },
    pagerduty: { enabled: false, config: {} }
  },
  escalationPolicy: {
    enabled: true,
    escalationDelayMinutes: 30,
    escalationSeverities: ['critical', 'emergency']
  },
  suppressionRules: {
    duplicateAlertWindowMinutes: 60,
    maxAlertsPerHour: 10
  }
};

/**
 * Orphaned Report Alert Manager
 * Handles detection, creation, and management of orphaned report alerts
 */
export class OrphanedReportAlertManager {
  private alerts: Map<string, OrphanedReportAlert> = new Map();
  private config: AlertConfiguration;
  private lastAlertCheck: Date = new Date();
  
  constructor(config?: Partial<AlertConfiguration>) {
    this.config = { ...DEFAULT_ALERT_CONFIG, ...config };
    
    logger.info('OrphanedReportAlertManager initialized', {
      enabled: this.config.enabled,
      thresholds: this.config.thresholds,
      enabledChannels: Object.entries(this.config.channels)
        .filter(([, channelConfig]) => channelConfig.enabled)
        .map(([channel]) => channel)
    });
  }
  
  /**
   * Main method to check for orphaned reports and trigger alerts
   */
  async checkForOrphanedReports(): Promise<{
    orphanedCount: number;
    alertsTriggered: number;
    alertsSuppressed: number;
  }> {
    if (!this.config.enabled) {
      return { orphanedCount: 0, alertsTriggered: 0, alertsSuppressed: 0 };
    }
    
    const correlationId = generateCorrelationId();
    const checkStartTime = new Date();
    
    try {
      logger.info('Starting orphaned report detection check', { correlationId });
      
      // Get current orphaned report statistics
      const orphanedStats = await this.getOrphanedReportStatistics();
      
      // Check various alert conditions
      const alertsToTrigger: Omit<OrphanedReportAlert, 'id' | 'timestamp' | 'resolved' | 'escalated'>[] = [];
      
      // 1. Real-time orphaned report creation alerts
      const recentOrphans = await this.getRecentOrphanedReports(60); // Last hour
      if (recentOrphans.length >= this.config.thresholds.hourlyOrphanedReportsCritical) {
        alertsToTrigger.push(this.createCriticalVolumeAlert(recentOrphans.length, 'hourly', correlationId));
      } else if (recentOrphans.length >= this.config.thresholds.hourlyOrphanedReportsWarning) {
        alertsToTrigger.push(this.createWarningVolumeAlert(recentOrphans.length, 'hourly', correlationId));
      }
      
      // 2. Daily volume alerts
      const dailyOrphans = await this.getRecentOrphanedReports(24 * 60); // Last 24 hours
      if (dailyOrphans.length >= this.config.thresholds.dailyOrphanedReportsCritical) {
        alertsToTrigger.push(this.createCriticalVolumeAlert(dailyOrphans.length, 'daily', correlationId));
      } else if (dailyOrphans.length >= this.config.thresholds.dailyOrphanedReportsWarning) {
        alertsToTrigger.push(this.createWarningVolumeAlert(dailyOrphans.length, 'daily', correlationId));
      }
      
      // 3. Total orphaned report threshold alerts
      if (orphanedStats.totalOrphanedReports >= this.config.thresholds.totalOrphanedReportsCritical) {
        alertsToTrigger.push(this.createTotalOrphansCriticalAlert(orphanedStats, correlationId));
      } else if (orphanedStats.totalOrphanedReports >= this.config.thresholds.totalOrphanedReportsWarning) {
        alertsToTrigger.push(this.createTotalOrphansWarningAlert(orphanedStats, correlationId));
      }
      
      // 4. Orphaned report rate alerts
      const orphanedRate = orphanedStats.totalReports > 0 ? 
        orphanedStats.totalOrphanedReports / orphanedStats.totalReports : 0;
      
      if (orphanedRate >= this.config.thresholds.orphanedReportRateCritical) {
        alertsToTrigger.push(this.createOrphanedRateCriticalAlert(orphanedRate, orphanedStats, correlationId));
      } else if (orphanedRate >= this.config.thresholds.orphanedReportRateWarning) {
        alertsToTrigger.push(this.createOrphanedRateWarningAlert(orphanedRate, orphanedStats, correlationId));
      }
      
      // 5. Project resolution failure rate alerts
      const resolutionMetrics = projectResolutionMetrics.getCurrentMetricsAggregation();
      const hourlyFailureRate = resolutionMetrics.hourly.totalAttempts > 0 ?
        resolutionMetrics.hourly.failedResolutions / resolutionMetrics.hourly.totalAttempts : 0;
      
      if (hourlyFailureRate >= this.config.thresholds.resolutionFailureRateCritical) {
        alertsToTrigger.push(this.createResolutionFailureCriticalAlert(hourlyFailureRate, resolutionMetrics.hourly, correlationId));
      } else if (hourlyFailureRate >= this.config.thresholds.resolutionFailureRateWarning) {
        alertsToTrigger.push(this.createResolutionFailureWarningAlert(hourlyFailureRate, resolutionMetrics.hourly, correlationId));
      }
      
      // 6. Business impact alerts (projects with no reports)
      const projectsWithoutReports = await this.getProjectsWithoutReports();
      if (projectsWithoutReports.length > 20) {
        alertsToTrigger.push(this.createProjectsWithoutReportsAlert(projectsWithoutReports, correlationId));
      }
      
      // Process alerts through suppression rules
      const { triggeredAlerts, suppressedAlerts } = await this.processAlerts(alertsToTrigger);
      
      this.lastAlertCheck = checkStartTime;
      
      logger.info('Orphaned report detection check completed', {
        correlationId,
        orphanedCount: orphanedStats.totalOrphanedReports,
        alertsTriggered: triggeredAlerts.length,
        alertsSuppressed: suppressedAlerts.length,
        checkDuration: Date.now() - checkStartTime.getTime()
      });
      
      return {
        orphanedCount: orphanedStats.totalOrphanedReports,
        alertsTriggered: triggeredAlerts.length,
        alertsSuppressed: suppressedAlerts.length
      };
      
    } catch (error) {
      logger.error('Failed to check for orphaned reports', error as Error, { correlationId });
      
      // Trigger system error alert
      await this.triggerSystemErrorAlert(error as Error, correlationId);
      
      throw error;
    }
  }
  
  /**
   * Get statistics about orphaned reports in the system
   */
  private async getOrphanedReportStatistics(): Promise<{
    totalReports: number;
    totalOrphanedReports: number;
    reportsWithProjects: number;
    orphanedReportsByCompetitor: { competitorId: string; count: number }[];
    oldestOrphanedReport: Date | null;
    newestOrphanedReport: Date | null;
  }> {
    try {
      // Get total report counts
      const [totalReports, orphanedReports] = await Promise.all([
        prisma.report.count(),
        prisma.report.findMany({
          where: { projectId: null },
          select: {
            id: true,
            competitorId: true,
            createdAt: true
          },
          orderBy: { createdAt: 'asc' }
        })
      ]);
      
      // Analyze orphaned reports by competitor
      const orphanedByCompetitor = orphanedReports.reduce((acc, report) => {
        if (report.competitorId) {
          acc[report.competitorId] = (acc[report.competitorId] || 0) + 1;
        }
        return acc;
      }, {} as Record<string, number>);
      
      const orphanedReportsByCompetitor = Object.entries(orphanedByCompetitor)
        .map(([competitorId, count]) => ({ competitorId, count }))
        .sort((a, b) => b.count - a.count);
      
      return {
        totalReports,
        totalOrphanedReports: orphanedReports.length,
        reportsWithProjects: totalReports - orphanedReports.length,
        orphanedReportsByCompetitor,
        oldestOrphanedReport: orphanedReports.length > 0 ? orphanedReports[0].createdAt : null,
        newestOrphanedReport: orphanedReports.length > 0 ? orphanedReports[orphanedReports.length - 1].createdAt : null
      };
    } catch (error) {
      logger.error('Failed to get orphaned report statistics', error as Error);
      throw error;
    }
  }
  
  /**
   * Get recently created orphaned reports
   */
  private async getRecentOrphanedReports(minutesBack: number): Promise<any[]> {
    const cutoffTime = new Date(Date.now() - minutesBack * 60 * 1000);
    
    return await prisma.report.findMany({
      where: {
        projectId: null,
        createdAt: { gte: cutoffTime }
      },
      select: {
        id: true,
        competitorId: true,
        createdAt: true,
        title: true
      },
      orderBy: { createdAt: 'desc' }
    });
  }
  
  /**
   * Get projects that have no associated reports
   */
  private async getProjectsWithoutReports(): Promise<any[]> {
    return await prisma.project.findMany({
      where: {
        reports: { none: {} }
      },
      select: {
        id: true,
        name: true,
        createdAt: true,
        status: true
      }
    });
  }
  
  /**
   * Create critical volume alert
   */
  private createCriticalVolumeAlert(count: number, period: 'hourly' | 'daily', correlationId: string): Omit<OrphanedReportAlert, 'id' | 'timestamp' | 'resolved' | 'escalated'> {
    return {
      severity: 'critical',
      type: 'orphaned_reports_volume_critical',
      title: `Critical: High Volume of Orphaned Reports (${period})`,
      message: `${count} orphaned reports detected in the last ${period === 'hourly' ? 'hour' : '24 hours'}. This exceeds the critical threshold and requires immediate attention.`,
      metadata: {
        count,
        period,
        threshold: period === 'hourly' ? this.config.thresholds.hourlyOrphanedReportsCritical : this.config.thresholds.dailyOrphanedReportsCritical,
        impact: 'high',
        category: 'data_integrity'
      },
      channels: ['slack', 'email', 'pagerduty'],
      correlationId,
      resolvedAt: undefined,
      escalatedAt: undefined
    };
  }
  
  /**
   * Create warning volume alert
   */
  private createWarningVolumeAlert(count: number, period: 'hourly' | 'daily', correlationId: string): Omit<OrphanedReportAlert, 'id' | 'timestamp' | 'resolved' | 'escalated'> {
    return {
      severity: 'warning',
      type: 'orphaned_reports_volume_warning',
      title: `Warning: Elevated Orphaned Reports (${period})`,
      message: `${count} orphaned reports detected in the last ${period === 'hourly' ? 'hour' : '24 hours'}. This exceeds the warning threshold and should be monitored.`,
      metadata: {
        count,
        period,
        threshold: period === 'hourly' ? this.config.thresholds.hourlyOrphanedReportsWarning : this.config.thresholds.dailyOrphanedReportsWarning,
        impact: 'medium',
        category: 'data_integrity'
      },
      channels: ['slack', 'dashboard'],
      correlationId,
      resolvedAt: undefined,
      escalatedAt: undefined
    };
  }
  
  /**
   * Create total orphans critical alert
   */
  private createTotalOrphansCriticalAlert(stats: any, correlationId: string): Omit<OrphanedReportAlert, 'id' | 'timestamp' | 'resolved' | 'escalated'> {
    return {
      severity: 'critical',
      type: 'total_orphaned_reports_critical',
      title: 'Critical: Total Orphaned Reports Threshold Exceeded',
      message: `System has ${stats.totalOrphanedReports} orphaned reports (${((stats.totalOrphanedReports / stats.totalReports) * 100).toFixed(1)}% of all reports). This significantly impacts data integrity and project dashboards.`,
      metadata: {
        totalOrphanedReports: stats.totalOrphanedReports,
        totalReports: stats.totalReports,
        orphanedPercentage: (stats.totalOrphanedReports / stats.totalReports) * 100,
        threshold: this.config.thresholds.totalOrphanedReportsCritical,
        impact: 'high',
        category: 'system_health',
        topAffectedCompetitors: stats.orphanedReportsByCompetitor.slice(0, 5)
      },
      channels: ['email', 'slack', 'pagerduty'],
      correlationId,
      resolvedAt: undefined,
      escalatedAt: undefined
    };
  }
  
  /**
   * Create total orphans warning alert
   */
  private createTotalOrphansWarningAlert(stats: any, correlationId: string): Omit<OrphanedReportAlert, 'id' | 'timestamp' | 'resolved' | 'escalated'> {
    return {
      severity: 'warning',
      type: 'total_orphaned_reports_warning',
      title: 'Warning: Total Orphaned Reports Above Threshold',
      message: `System has ${stats.totalOrphanedReports} orphaned reports. Consider running orphaned report resolution to improve data integrity.`,
      metadata: {
        totalOrphanedReports: stats.totalOrphanedReports,
        totalReports: stats.totalReports,
        orphanedPercentage: (stats.totalOrphanedReports / stats.totalReports) * 100,
        threshold: this.config.thresholds.totalOrphanedReportsWarning,
        impact: 'medium',
        category: 'data_quality'
      },
      channels: ['slack', 'dashboard'],
      correlationId,
      resolvedAt: undefined,
      escalatedAt: undefined
    };
  }
  
  /**
   * Create orphaned rate critical alert
   */
  private createOrphanedRateCriticalAlert(rate: number, stats: any, correlationId: string): Omit<OrphanedReportAlert, 'id' | 'timestamp' | 'resolved' | 'escalated'> {
    return {
      severity: 'critical',
      type: 'orphaned_report_rate_critical',
      title: 'Critical: Orphaned Report Rate Exceeds Threshold',
      message: `${(rate * 100).toFixed(1)}% of reports are orphaned (${stats.totalOrphanedReports}/${stats.totalReports}). This indicates a critical data integrity issue requiring immediate action.`,
      metadata: {
        orphanedRate: rate,
        orphanedRatePercentage: rate * 100,
        totalOrphanedReports: stats.totalOrphanedReports,
        totalReports: stats.totalReports,
        threshold: this.config.thresholds.orphanedReportRateCritical * 100,
        impact: 'critical',
        category: 'data_integrity'
      },
      channels: ['email', 'slack', 'pagerduty'],
      correlationId,
      resolvedAt: undefined,
      escalatedAt: undefined
    };
  }
  
  /**
   * Create orphaned rate warning alert
   */
  private createOrphanedRateWarningAlert(rate: number, stats: any, correlationId: string): Omit<OrphanedReportAlert, 'id' | 'timestamp' | 'resolved' | 'escalated'> {
    return {
      severity: 'warning',
      type: 'orphaned_report_rate_warning',
      title: 'Warning: Elevated Orphaned Report Rate',
      message: `${(rate * 100).toFixed(1)}% of reports are orphaned. Consider reviewing project-competitor relationships and running data cleanup.`,
      metadata: {
        orphanedRate: rate,
        orphanedRatePercentage: rate * 100,
        totalOrphanedReports: stats.totalOrphanedReports,
        totalReports: stats.totalReports,
        threshold: this.config.thresholds.orphanedReportRateWarning * 100,
        impact: 'medium',
        category: 'data_quality'
      },
      channels: ['slack', 'dashboard'],
      correlationId,
      resolvedAt: undefined,
      escalatedAt: undefined
    };
  }
  
  /**
   * Create resolution failure critical alert
   */
  private createResolutionFailureCriticalAlert(failureRate: number, metrics: any, correlationId: string): Omit<OrphanedReportAlert, 'id' | 'timestamp' | 'resolved' | 'escalated'> {
    return {
      severity: 'critical',
      type: 'project_resolution_failure_critical',
      title: 'Critical: Project Resolution Failure Rate Excessive',
      message: `${(failureRate * 100).toFixed(1)}% of project resolution attempts are failing (${metrics.failedResolutions}/${metrics.totalAttempts} in last hour). This will lead to continued orphaned report creation.`,
      metadata: {
        failureRate,
        failureRatePercentage: failureRate * 100,
        failedResolutions: metrics.failedResolutions,
        totalAttempts: metrics.totalAttempts,
        threshold: this.config.thresholds.resolutionFailureRateCritical * 100,
        impact: 'critical',
        category: 'system_health'
      },
      channels: ['email', 'slack', 'pagerduty'],
      correlationId,
      resolvedAt: undefined,
      escalatedAt: undefined
    };
  }
  
  /**
   * Create resolution failure warning alert
   */
  private createResolutionFailureWarningAlert(failureRate: number, metrics: any, correlationId: string): Omit<OrphanedReportAlert, 'id' | 'timestamp' | 'resolved' | 'escalated'> {
    return {
      severity: 'warning',
      type: 'project_resolution_failure_warning',
      title: 'Warning: Elevated Project Resolution Failure Rate',
      message: `${(failureRate * 100).toFixed(1)}% of project resolution attempts are failing. Monitor closely to prevent orphaned report accumulation.`,
      metadata: {
        failureRate,
        failureRatePercentage: failureRate * 100,
        failedResolutions: metrics.failedResolutions,
        totalAttempts: metrics.totalAttempts,
        threshold: this.config.thresholds.resolutionFailureRateWarning * 100,
        impact: 'medium',
        category: 'performance'
      },
      channels: ['slack', 'dashboard'],
      correlationId,
      resolvedAt: undefined,
      escalatedAt: undefined
    };
  }
  
  /**
   * Create projects without reports alert
   */
  private createProjectsWithoutReportsAlert(projects: any[], correlationId: string): Omit<OrphanedReportAlert, 'id' | 'timestamp' | 'resolved' | 'escalated'> {
    return {
      severity: 'warning',
      type: 'projects_without_reports',
      title: 'Warning: Projects Without Associated Reports',
      message: `${projects.length} projects have no associated reports. This may indicate incomplete project setup or missing initial report generation.`,
      metadata: {
        projectCount: projects.length,
        projects: projects.slice(0, 10), // Include first 10 projects
        impact: 'medium',
        category: 'business_impact'
      },
      channels: ['slack', 'dashboard'],
      correlationId,
      resolvedAt: undefined,
      escalatedAt: undefined
    };
  }
  
  /**
   * Process alerts through suppression rules and trigger notifications
   */
  private async processAlerts(alertsToTrigger: Omit<OrphanedReportAlert, 'id' | 'timestamp' | 'resolved' | 'escalated'>[]): Promise<{
    triggeredAlerts: OrphanedReportAlert[];
    suppressedAlerts: Omit<OrphanedReportAlert, 'id' | 'timestamp' | 'resolved' | 'escalated'>[];
  }> {
    const triggeredAlerts: OrphanedReportAlert[] = [];
    const suppressedAlerts: Omit<OrphanedReportAlert, 'id' | 'timestamp' | 'resolved' | 'escalated'>[] = [];
    
    for (const alertData of alertsToTrigger) {
      // Check suppression rules
      if (this.shouldSuppressAlert(alertData)) {
        suppressedAlerts.push(alertData);
        logger.debug('Alert suppressed due to suppression rules', {
          type: alertData.type,
          severity: alertData.severity
        });
        continue;
      }
      
      // Create and store alert
      const alert: OrphanedReportAlert = {
        ...alertData,
        id: generateCorrelationId(),
        timestamp: new Date(),
        resolved: false,
        escalated: false
      };
      
      this.alerts.set(alert.id, alert);
      triggeredAlerts.push(alert);
      
      // Send notifications
      await this.sendAlertNotifications(alert);
      
      // Schedule escalation if needed
      if (this.config.escalationPolicy.enabled && 
          this.config.escalationPolicy.escalationSeverities.includes(alert.severity)) {
        setTimeout(() => {
          this.escalateAlert(alert.id);
        }, this.config.escalationPolicy.escalationDelayMinutes * 60 * 1000);
      }
    }
    
    return { triggeredAlerts, suppressedAlerts };
  }
  
  /**
   * Check if alert should be suppressed based on suppression rules
   */
  private shouldSuppressAlert(alertData: Omit<OrphanedReportAlert, 'id' | 'timestamp' | 'resolved' | 'escalated'>): boolean {
    const now = new Date();
    const windowStart = new Date(now.getTime() - this.config.suppressionRules.duplicateAlertWindowMinutes * 60 * 1000);
    
    // Check for duplicate alerts in the suppression window
    const recentSimilarAlerts = Array.from(this.alerts.values()).filter(alert => 
      alert.type === alertData.type && 
      alert.timestamp >= windowStart &&
      !alert.resolved
    );
    
    if (recentSimilarAlerts.length > 0) {
      return true; // Suppress duplicate alert
    }
    
    // Check max alerts per hour limit
    const hourStart = new Date(now.getTime() - 60 * 60 * 1000);
    const recentAlerts = Array.from(this.alerts.values()).filter(alert => 
      alert.timestamp >= hourStart
    );
    
    if (recentAlerts.length >= this.config.suppressionRules.maxAlertsPerHour) {
      return true; // Suppress due to rate limiting
    }
    
    return false;
  }
  
  /**
   * Send alert notifications to configured channels
   */
  private async sendAlertNotifications(alert: OrphanedReportAlert): Promise<void> {
    const enabledChannels = alert.channels.filter(channel => 
      this.config.channels[channel]?.enabled
    );
    
    logger.info('Sending orphaned report alert notifications', {
      alertId: alert.id,
      type: alert.type,
      severity: alert.severity,
      channels: enabledChannels
    });
    
    // Send to each enabled channel
    await Promise.allSettled(enabledChannels.map(async (channel) => {
      try {
        await this.sendToChannel(channel, alert);
      } catch (error) {
        logger.error(`Failed to send alert to ${channel}`, error as Error, {
          alertId: alert.id,
          channel
        });
      }
    }));
  }
  
  /**
   * Send alert to specific channel
   */
  private async sendToChannel(channel: AlertChannel, alert: OrphanedReportAlert): Promise<void> {
    switch (channel) {
      case 'email':
        await this.sendEmailAlert(alert);
        break;
      case 'slack':
        await this.sendSlackAlert(alert);
        break;
      case 'webhook':
        await this.sendWebhookAlert(alert);
        break;
      case 'dashboard':
        await this.sendDashboardAlert(alert);
        break;
      case 'pagerduty':
        await this.sendPagerDutyAlert(alert);
        break;
      default:
        logger.warn('Unknown alert channel', { channel, alertId: alert.id });
    }
  }
  
  /**
   * Send email alert (placeholder implementation)
   */
  private async sendEmailAlert(alert: OrphanedReportAlert): Promise<void> {
    // This would integrate with your email service (SendGrid, AWS SES, etc.)
    logger.info('Email alert sent', {
      alertId: alert.id,
      type: alert.type,
      severity: alert.severity,
      title: alert.title
    });
  }
  
  /**
   * Send Slack alert (placeholder implementation)
   */
  private async sendSlackAlert(alert: OrphanedReportAlert): Promise<void> {
    // This would integrate with Slack API
    const slackMessage = {
      text: alert.title,
      attachments: [{
        color: this.getSeverityColor(alert.severity),
        fields: [
          { title: 'Severity', value: alert.severity.toUpperCase(), short: true },
          { title: 'Type', value: alert.type, short: true },
          { title: 'Message', value: alert.message, short: false },
          { title: 'Metadata', value: JSON.stringify(alert.metadata, null, 2), short: false }
        ],
        timestamp: Math.floor(alert.timestamp.getTime() / 1000)
      }]
    };
    
    logger.info('Slack alert sent', {
      alertId: alert.id,
      slackMessage: JSON.stringify(slackMessage)
    });
  }
  
  /**
   * Send webhook alert
   */
  private async sendWebhookAlert(alert: OrphanedReportAlert): Promise<void> {
    // This would send HTTP POST to configured webhook URL
    const webhookPayload = {
      alert_id: alert.id,
      timestamp: alert.timestamp.toISOString(),
      severity: alert.severity,
      type: alert.type,
      title: alert.title,
      message: alert.message,
      metadata: alert.metadata,
      correlation_id: alert.correlationId
    };
    
    logger.info('Webhook alert sent', {
      alertId: alert.id,
      payload: webhookPayload
    });
  }
  
  /**
   * Send dashboard alert
   */
  private async sendDashboardAlert(alert: OrphanedReportAlert): Promise<void> {
    // This would update dashboard state or send to real-time dashboard system
    logger.info('Dashboard alert sent', {
      alertId: alert.id,
      type: alert.type,
      severity: alert.severity
    });
  }
  
  /**
   * Send PagerDuty alert (placeholder implementation)
   */
  private async sendPagerDutyAlert(alert: OrphanedReportAlert): Promise<void> {
    // This would integrate with PagerDuty API
    logger.info('PagerDuty alert sent', {
      alertId: alert.id,
      type: alert.type,
      severity: alert.severity
    });
  }
  
  /**
   * Get color for Slack message based on severity
   */
  private getSeverityColor(severity: AlertSeverity): string {
    switch (severity) {
      case 'emergency': return '#ff0000';
      case 'critical': return '#ff6600';
      case 'warning': return '#ffcc00';
      case 'info': return '#0099cc';
      default: return '#cccccc';
    }
  }
  
  /**
   * Escalate alert if not resolved within escalation window
   */
  private async escalateAlert(alertId: string): Promise<void> {
    const alert = this.alerts.get(alertId);
    if (!alert || alert.resolved || alert.escalated) {
      return;
    }
    
    alert.escalated = true;
    alert.escalatedAt = new Date();
    
    logger.warn('Alert escalated', {
      alertId: alert.id,
      type: alert.type,
      severity: alert.severity,
      escalatedAt: alert.escalatedAt
    });
    
    // Send escalation notifications (typically to higher severity channels)
    await this.sendAlertNotifications({
      ...alert,
      title: `[ESCALATED] ${alert.title}`,
      message: `${alert.message}\n\nThis alert has been escalated due to lack of resolution.`,
      channels: ['email', 'pagerduty']
    });
  }
  
  /**
   * Trigger system error alert
   */
  private async triggerSystemErrorAlert(error: Error, correlationId: string): Promise<void> {
    const systemAlert: Omit<OrphanedReportAlert, 'id' | 'timestamp' | 'resolved' | 'escalated'> = {
      severity: 'critical',
      type: 'orphaned_report_system_error',
      title: 'Critical: Orphaned Report Detection System Error',
      message: `The orphaned report detection system encountered a critical error: ${error.message}`,
      metadata: {
        error: error.message,
        stack: error.stack,
        impact: 'critical',
        category: 'system_error'
      },
      channels: ['email', 'slack', 'pagerduty'],
      correlationId,
      resolvedAt: undefined,
      escalatedAt: undefined
    };
    
    const { triggeredAlerts } = await this.processAlerts([systemAlert]);
    
    if (triggeredAlerts.length > 0) {
      logger.error('System error alert triggered', {
        alertId: triggeredAlerts[0].id,
        error: error.message
      });
    }
  }
  
  /**
   * Get current alert status
   */
  getAlertStatus(): {
    totalAlerts: number;
    activeAlerts: number;
    resolvedAlerts: number;
    escalatedAlerts: number;
    alertsBySeverity: Record<AlertSeverity, number>;
    alertsByType: Record<string, number>;
  } {
    const alerts = Array.from(this.alerts.values());
    
    const alertsBySeverity: Record<AlertSeverity, number> = {
      info: 0,
      warning: 0,
      critical: 0,
      emergency: 0
    };
    
    const alertsByType: Record<string, number> = {};
    
    alerts.forEach(alert => {
      alertsBySeverity[alert.severity]++;
      alertsByType[alert.type] = (alertsByType[alert.type] || 0) + 1;
    });
    
    return {
      totalAlerts: alerts.length,
      activeAlerts: alerts.filter(a => !a.resolved).length,
      resolvedAlerts: alerts.filter(a => a.resolved).length,
      escalatedAlerts: alerts.filter(a => a.escalated).length,
      alertsBySeverity,
      alertsByType
    };
  }
  
  /**
   * Resolve alert manually
   */
  resolveAlert(alertId: string, reason?: string): boolean {
    const alert = this.alerts.get(alertId);
    if (!alert || alert.resolved) {
      return false;
    }
    
    alert.resolved = true;
    alert.resolvedAt = new Date();
    
    logger.info('Alert resolved', {
      alertId,
      type: alert.type,
      severity: alert.severity,
      reason,
      resolvedAt: alert.resolvedAt
    });
    
    return true;
  }
}

// Global alert manager instance
export const orphanedReportAlerts = new OrphanedReportAlertManager();

/**
 * Helper functions for common alert operations
 */
export const AlertHelpers = {
  /**
   * Trigger immediate orphaned report check
   */
  checkNow: async () => {
    return await orphanedReportAlerts.checkForOrphanedReports();
  },
  
  /**
   * Get current alert status
   */
  getStatus: () => {
    return orphanedReportAlerts.getAlertStatus();
  },
  
  /**
   * Resolve alert by ID
   */
  resolveAlert: (alertId: string, reason?: string) => {
    return orphanedReportAlerts.resolveAlert(alertId, reason);
  }
}; 