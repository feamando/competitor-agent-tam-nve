import { logger, createCorrelationLogger, trackBusinessEvent } from '../logger';
import { createId } from '@paralleldrive/cuid2';
import { DataCollectionMetrics } from '../monitoring/dataCollectionMetrics';

interface AlertRule {
  id: string;
  name: string;
  enabled: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  condition: (metrics: any) => boolean;
  description: string;
  threshold: number;
  timeWindow: number; // minutes
  cooldownPeriod: number; // minutes
  lastTriggered: Date | null;
  triggerCount: number;
}

interface Alert {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  projectId?: string;
  operationType?: string;
  triggeredAt: Date;
  resolvedAt?: Date;
  isResolved: boolean;
  metadata: Record<string, any>;
  escalated: boolean;
}

/**
 * Task 6.2: Data Collection Failure Alerting System
 */
export class DataCollectionAlerts {
  private static instance: DataCollectionAlerts;
  private alertRules: Map<string, AlertRule> = new Map();
  private activeAlerts: Map<string, Alert> = new Map();
  private alertHistory: Alert[] = [];
  private readonly MAX_ALERT_HISTORY = 500;
  private metricsService: DataCollectionMetrics;

  private constructor() {
    this.metricsService = DataCollectionMetrics.getInstance();
    this.initializeDefaultAlertRules();
    this.startPeriodicAlertChecking();
  }

  public static getInstance(): DataCollectionAlerts {
    if (!DataCollectionAlerts.instance) {
      DataCollectionAlerts.instance = new DataCollectionAlerts();
    }
    return DataCollectionAlerts.instance;
  }

  /**
   * Task 6.2: Initialize default alert rules for data collection failures
   */
  private initializeDefaultAlertRules(): void {
    const defaultRules: Omit<AlertRule, 'id' | 'lastTriggered' | 'triggerCount'>[] = [
      {
        name: 'High Failure Rate',
        enabled: true,
        severity: 'high',
        condition: (metrics) => metrics.rates.overallSuccessRate < 70,
        description: 'Data collection success rate has dropped below 70%',
        threshold: 70,
        timeWindow: 15,
        cooldownPeriod: 30
      },
      {
        name: 'Critical Failure Rate',
        enabled: true,
        severity: 'critical',
        condition: (metrics) => metrics.rates.overallSuccessRate < 50,
        description: 'Data collection success rate has dropped below 50% - critical system issue',
        threshold: 50,
        timeWindow: 10,
        cooldownPeriod: 60
      },
      {
        name: 'Product Data Collection Failure',
        enabled: true,
        severity: 'medium',
        condition: (metrics) => metrics.rates.productDataSuccessRate < 80,
        description: 'Product data collection success rate below 80%',
        threshold: 80,
        timeWindow: 20,
        cooldownPeriod: 30
      },
      {
        name: 'Competitor Data Collection Failure',
        enabled: true,
        severity: 'medium',
        condition: (metrics) => metrics.rates.competitorDataSuccessRate < 75,
        description: 'Competitor data collection success rate below 75%',
        threshold: 75,
        timeWindow: 20,
        cooldownPeriod: 30
      },
      {
        name: 'Low Data Quality Alert',
        enabled: true,
        severity: 'medium',
        condition: (metrics) => metrics.summary.averageDataQuality < 70,
        description: 'Average data quality has dropped below 70%',
        threshold: 70,
        timeWindow: 30,
        cooldownPeriod: 45
      },
      {
        name: 'Slow Collection Performance',
        enabled: true,
        severity: 'low',
        condition: (metrics) => metrics.rates.fastOperationRate < 80,
        description: 'More than 20% of operations are running slowly',
        threshold: 80,
        timeWindow: 30,
        cooldownPeriod: 60
      },
      {
        name: 'Excessive Critical Failures',
        enabled: true,
        severity: 'critical',
        condition: (metrics) => metrics.summary.criticalFailureRate > 10,
        description: 'Critical failure rate exceeds 10%',
        threshold: 10,
        timeWindow: 10,
        cooldownPeriod: 30
      },
      {
        name: 'Data Freshness Issues',
        enabled: true,
        severity: 'medium',
        condition: (metrics) => metrics.summary.dataFreshnessRate < 60,
        description: 'Data freshness rate below 60%',
        threshold: 60,
        timeWindow: 45,
        cooldownPeriod: 60
      }
    ];

    defaultRules.forEach(rule => {
      const alertRule: AlertRule = {
        ...rule,
        id: createId(),
        lastTriggered: null,
        triggerCount: 0
      };
      this.alertRules.set(alertRule.id, alertRule);
    });

    logger.info('Initialized data collection alert rules', {
      ruleCount: this.alertRules.size
    });
  }

  /**
   * Task 6.2: Start periodic alert checking
   */
  private startPeriodicAlertChecking(): void {
    // Check every 5 minutes
    setInterval(() => {
      this.checkAllAlertRules();
    }, 5 * 60 * 1000);

    logger.info('Started periodic alert checking for data collection failures');
  }

  /**
   * Task 6.2: Check all alert rules against current metrics
   */
  public async checkAllAlertRules(): Promise<void> {
    const correlationId = createId();
    const correlatedLogger = createCorrelationLogger(correlationId);
    
    try {
      const metrics = this.metricsService.getSuccessMetrics();
      const now = new Date();

      correlatedLogger.debug('Checking data collection alert rules', {
        ruleCount: this.alertRules.size,
        totalOperations: metrics.summary.totalOperations
      });

      for (const [ruleId, rule] of this.alertRules) {
        if (!rule.enabled) continue;

        // Check cooldown period
        if (rule.lastTriggered && 
            (now.getTime() - rule.lastTriggered.getTime()) < (rule.cooldownPeriod * 60 * 1000)) {
          continue;
        }

        // Evaluate rule condition
        if (rule.condition(metrics)) {
          await this.triggerAlert(rule, metrics, correlationId);
        }
      }

      // Check for alert resolution
      await this.checkAlertResolution(metrics, correlationId);

    } catch (error) {
      correlatedLogger.error('Failed to check alert rules', error as Error);
    }
  }

  /**
   * Task 6.2: Trigger an alert based on rule condition
   */
  private async triggerAlert(
    rule: AlertRule, 
    metrics: any, 
    correlationId: string
  ): Promise<void> {
    const correlatedLogger = createCorrelationLogger(correlationId);
    
    const alertId = createId();
    const alert: Alert = {
      id: alertId,
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      message: rule.description,
      triggeredAt: new Date(),
      isResolved: false,
      escalated: false,
      metadata: {
        metrics: {
          successRate: metrics.rates.overallSuccessRate,
          averageDataQuality: metrics.summary.averageDataQuality,
          totalOperations: metrics.summary.totalOperations,
          lastFailureTime: metrics.summary.lastFailureTime
        },
        threshold: rule.threshold,
        correlationId
      }
    };

    // Update rule tracking
    rule.lastTriggered = new Date();
    rule.triggerCount++;

    // Store alert
    this.activeAlerts.set(alertId, alert);

         correlatedLogger.warn(`Data collection alert triggered: ${rule.name}`, {
       alertId,
       severity: rule.severity,
       threshold: rule.threshold,
       currentValue: this.getCurrentValueForRule(rule, metrics),
       ruleDescription: rule.description
     });

    // Send notifications based on severity
    await this.sendAlertNotifications(alert, correlatedLogger);

    // Track business event
    trackBusinessEvent('data_collection_alert_triggered', {
      alertId,
      ruleName: rule.name,
      severity: rule.severity,
      successRate: metrics.rates.overallSuccessRate,
      correlationId
    });

    // Auto-escalate critical alerts
    if (rule.severity === 'critical') {
      await this.escalateAlert(alertId, correlationId);
    }
  }

  /**
   * Task 6.2: Check for alert resolution
   */
  private async checkAlertResolution(metrics: any, correlationId: string): Promise<void> {
    const correlatedLogger = createCorrelationLogger(correlationId);

    for (const [alertId, alert] of this.activeAlerts) {
      if (alert.isResolved) continue;

      const rule = this.alertRules.get(alert.ruleId);
      if (!rule) continue;

      // Check if condition is no longer met (with some buffer to prevent flapping)
      const conditionMet = rule.condition(metrics);
      const bufferMet = this.checkResolutionBuffer(rule, metrics);

      if (!conditionMet && bufferMet) {
        await this.resolveAlert(alertId, correlationId);
      }
    }
  }

  /**
   * Task 6.2: Resolve an alert
   */
  private async resolveAlert(alertId: string, correlationId: string): Promise<void> {
    const correlatedLogger = createCorrelationLogger(correlationId);
    const alert = this.activeAlerts.get(alertId);
    
    if (!alert || alert.isResolved) return;

    alert.isResolved = true;
    alert.resolvedAt = new Date();

    // Move to history
    this.moveAlertToHistory(alert);
    this.activeAlerts.delete(alertId);

    const duration = alert.resolvedAt.getTime() - alert.triggeredAt.getTime();

    correlatedLogger.info(`Data collection alert resolved: ${alert.ruleName}`, {
      alertId,
      duration: `${Math.round(duration / 1000 / 60)}m`,
      severity: alert.severity
    });

    // Send resolution notifications
    await this.sendAlertResolutionNotifications(alert, correlatedLogger);

    trackBusinessEvent('data_collection_alert_resolved', {
      alertId,
      ruleName: alert.ruleName,
      severity: alert.severity,
      durationMinutes: Math.round(duration / 1000 / 60),
      correlationId
    });
  }

  /**
   * Task 6.2: Escalate critical alerts
   */
  private async escalateAlert(alertId: string, correlationId: string): Promise<void> {
    const correlatedLogger = createCorrelationLogger(correlationId);
    const alert = this.activeAlerts.get(alertId);
    
    if (!alert || alert.escalated) return;

    alert.escalated = true;

    correlatedLogger.error(`Escalating critical data collection alert: ${alert.ruleName}`, new Error(`Critical alert escalation: ${alert.ruleName}`), {
      alertId,
      severity: alert.severity,
      triggeredAt: alert.triggeredAt
    });

    // Send escalation notifications (implement based on your notification system)
    await this.sendEscalationNotifications(alert, correlatedLogger);

    trackBusinessEvent('data_collection_alert_escalated', {
      alertId,
      ruleName: alert.ruleName,
      severity: alert.severity,
      correlationId
    });
  }

  /**
   * Task 6.2: Send alert notifications
   */
  private async sendAlertNotifications(alert: Alert, logger: any): Promise<void> {
    try {
      // Implement your notification logic here (email, Slack, PagerDuty, etc.)
      logger.info(`Sending ${alert.severity} alert notifications`, {
        alertId: alert.id,
        ruleName: alert.ruleName
      });

      // Example notification payload
      const notificationPayload = {
        title: `Data Collection Alert: ${alert.ruleName}`,
        message: alert.message,
        severity: alert.severity,
        timestamp: alert.triggeredAt,
        metadata: alert.metadata
      };

      // Track notification attempt
      trackBusinessEvent('data_collection_alert_notification_sent', {
        alertId: alert.id,
        severity: alert.severity,
        notificationMethod: 'system_log'
      });

    } catch (error) {
      logger.error('Failed to send alert notifications', error as Error);
    }
  }

  /**
   * Task 6.2: Send alert resolution notifications
   */
  private async sendAlertResolutionNotifications(alert: Alert, logger: any): Promise<void> {
    try {
      logger.info(`Sending alert resolution notifications`, {
        alertId: alert.id,
        ruleName: alert.ruleName,
        duration: alert.resolvedAt ? alert.resolvedAt.getTime() - alert.triggeredAt.getTime() : 0
      });

    } catch (error) {
      logger.error('Failed to send alert resolution notifications', error as Error);
    }
  }

  /**
   * Task 6.2: Send escalation notifications
   */
  private async sendEscalationNotifications(alert: Alert, logger: any): Promise<void> {
    try {
      logger.error(`Sending alert escalation notifications`, {
        alertId: alert.id,
        ruleName: alert.ruleName,
        severity: alert.severity
      });

      // Critical alerts would trigger immediate notifications to on-call team
      
    } catch (error) {
      logger.error('Failed to send escalation notifications', error as Error);
    }
  }

  // Helper methods

  private getCurrentValueForRule(rule: AlertRule, metrics: any): number {
    // Extract current value based on rule type for logging
    if (rule.name.includes('Success Rate')) {
      return metrics.rates.overallSuccessRate;
    }
    if (rule.name.includes('Data Quality')) {
      return metrics.summary.averageDataQuality;
    }
    if (rule.name.includes('Critical Failure')) {
      return metrics.summary.criticalFailureRate;
    }
    return 0;
  }

  private checkResolutionBuffer(rule: AlertRule, metrics: any): boolean {
    // Add 5% buffer to prevent alert flapping
    const buffer = rule.threshold * 0.05;
    const currentValue = this.getCurrentValueForRule(rule, metrics);
    
    if (rule.name.includes('below')) {
      return currentValue > (rule.threshold + buffer);
    } else {
      return currentValue < (rule.threshold - buffer);
    }
  }

  private moveAlertToHistory(alert: Alert): void {
    this.alertHistory.push(alert);
    if (this.alertHistory.length > this.MAX_ALERT_HISTORY) {
      this.alertHistory.shift();
    }
  }

  /**
   * Task 6.2: Get alert status and statistics
   */
  public getAlertStatus(): {
    summary: any;
    activeAlerts: Alert[];
    rules: AlertRule[];
    statistics: any;
  } {
    const activeAlertsByseverity = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0
    };

    Array.from(this.activeAlerts.values()).forEach(alert => {
      activeAlertsByseverity[alert.severity]++;
    });

    const summary = {
      totalActiveAlerts: this.activeAlerts.size,
      alertsBySeity: activeAlertsByseverity,
      totalRules: this.alertRules.size,
      enabledRules: Array.from(this.alertRules.values()).filter(r => r.enabled).length
    };

    const statistics = {
      totalTriggeredToday: this.calculateDailyAlertCount(),
      averageResolutionTime: this.calculateAverageResolutionTime(),
      topTriggeringRules: this.getTopTriggeringRules()
    };

    return {
      summary,
      activeAlerts: Array.from(this.activeAlerts.values()),
      rules: Array.from(this.alertRules.values()),
      statistics
    };
  }

  private calculateDailyAlertCount(): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return this.alertHistory.filter(alert => 
      alert.triggeredAt >= today
    ).length;
  }

  private calculateAverageResolutionTime(): number {
    const resolvedAlerts = this.alertHistory.filter(alert => 
      alert.isResolved && alert.resolvedAt
    );

    if (resolvedAlerts.length === 0) return 0;

    const totalTime = resolvedAlerts.reduce((sum, alert) => {
      return sum + (alert.resolvedAt!.getTime() - alert.triggeredAt.getTime());
    }, 0);

    return Math.round(totalTime / resolvedAlerts.length / 1000 / 60); // minutes
  }

  private getTopTriggeringRules(): Array<{ ruleName: string; count: number }> {
    const ruleCounts = new Map<string, number>();
    
    this.alertHistory.forEach(alert => {
      const current = ruleCounts.get(alert.ruleName) || 0;
      ruleCounts.set(alert.ruleName, current + 1);
    });

    return Array.from(ruleCounts.entries())
      .map(([ruleName, count]) => ({ ruleName, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }
} 