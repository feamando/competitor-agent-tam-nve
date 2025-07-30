/**
 * Task 5.2: Comprehensive Report Generation Monitoring System
 * Implements metrics for successful vs failed report generations, alerting for failures,
 * performance dashboards, and end-to-end correlation ID tracking
 */

import { logger, generateCorrelationId, createCorrelationLogger, trackBusinessEvent } from '@/lib/logger';
import { createId } from '@paralleldrive/cuid2';

// Report generation monitoring interfaces
export interface ReportGenerationMetric {
  id: string;
  correlationId: string;
  reportId?: string;
  projectId: string;
  reportType: 'comparative' | 'intelligent' | 'initial' | 'scheduled';
  status: 'started' | 'processing' | 'completed' | 'failed';
  startTime: Date;
  endTime?: Date;
  duration?: number; // milliseconds
  phase: string; // Current processing phase
  error?: string;
  metadata: {
    competitorIds?: string[];
    userId?: string;
    queueName?: string;
    retryCount?: number;
    priority?: 'high' | 'normal' | 'low';
    sourceService?: string;
    processingSteps?: ReportProcessingStep[];
  };
}

export interface ReportProcessingStep {
  name: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  status: 'started' | 'completed' | 'failed';
  error?: string;
  metadata?: any;
}

export interface ReportAlert {
  id: string;
  type: 'failure_rate' | 'processing_time' | 'queue_backlog' | 'correlation_break' | 'service_degradation';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  timestamp: Date;
  correlationId: string;
  relatedMetrics: string[]; // IDs of related metrics
  resolved: boolean;
  resolvedAt?: Date;
  metadata: {
    projectId?: string;
    reportType?: string;
    failureRate?: number;
    thresholdBreached?: string;
    recommendation?: string;
  };
}

export interface ReportPerformanceMetrics {
  // Success/Failure Metrics
  totalReports: number;
  successfulReports: number;
  failedReports: number;
  successRate: number;
  failureRate: number;
  
  // Performance Metrics
  averageProcessingTime: number;
  medianProcessingTime: number;
  p95ProcessingTime: number;
  p99ProcessingTime: number;
  
  // Queue Metrics
  queueDepth: number;
  averageQueueWaitTime: number;
  processingRate: number; // reports per minute
  
  // Correlation Metrics
  correlationBreaks: number;
  endToEndTrackingRate: number;
  
  // Time-based Analysis
  reportsLast1Hour: number;
  reportsLast24Hours: number;
  failuresLast1Hour: number;
  failuresLast24Hours: number;
  
  // Alert Summary
  activeAlerts: number;
  recentAlerts: ReportAlert[];
  
  // Trends
  trends: {
    successRateTrend: 'improving' | 'stable' | 'degrading';
    performanceTrend: 'improving' | 'stable' | 'degrading';
    volumeTrend: 'increasing' | 'stable' | 'decreasing';
  };
}

export interface ReportTypeBreakdown {
  reportType: string;
  count: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  averageProcessingTime: number;
}

export interface CorrelationTrace {
  correlationId: string;
  projectId: string;
  reportType: string;
  startTime: Date;
  endTime?: Date;
  totalDuration?: number;
  steps: ReportProcessingStep[];
  status: 'active' | 'completed' | 'failed' | 'abandoned';
  metadata: {
    userId?: string;
    sourceEndpoint?: string;
    queueTransitions?: string[];
    serviceChain?: string[];
  };
}

/**
 * Comprehensive Report Generation Monitor
 */
export class ReportGenerationMonitor {
  private static instance: ReportGenerationMonitor;
  private metrics: Map<string, ReportGenerationMetric> = new Map();
  private alerts: Map<string, ReportAlert> = new Map();
  private correlationTraces: Map<string, CorrelationTrace> = new Map();
  private performanceBuffer: number[] = []; // Processing times for percentile calculations
  private alertingInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;

  // Configuration
  private readonly MAX_METRICS = 10000; // Maximum metrics to keep in memory
  private readonly MAX_ALERTS = 1000;   // Maximum alerts to keep
  private readonly MAX_TRACES = 5000;   // Maximum correlation traces
  private readonly ALERTING_INTERVAL = 60000; // 1 minute
  private readonly CLEANUP_INTERVAL = 300000; // 5 minutes
  private readonly PERFORMANCE_BUFFER_SIZE = 1000; // For percentile calculations

  // Alert Thresholds
  private readonly FAILURE_RATE_THRESHOLD = 0.15; // 15% failure rate triggers alert
  private readonly PROCESSING_TIME_THRESHOLD = 300000; // 5 minutes
  private readonly QUEUE_BACKLOG_THRESHOLD = 100; // 100 reports in queue
  private readonly CORRELATION_BREAK_THRESHOLD = 0.90; // 90% correlation tracking rate

  private constructor() {
    this.startAlerting();
    this.startCleanup();
    this.setupProcessHandlers();
  }

  public static getInstance(): ReportGenerationMonitor {
    if (!ReportGenerationMonitor.instance) {
      ReportGenerationMonitor.instance = new ReportGenerationMonitor();
    }
    return ReportGenerationMonitor.instance;
  }

  /**
   * Track report generation start
   */
  public trackReportStart(
    projectId: string, 
    reportType: ReportGenerationMetric['reportType'],
    correlationId?: string,
    metadata: ReportGenerationMetric['metadata'] = {}
  ): string {
    const metricId = createId();
    const corrId = correlationId || generateCorrelationId();
    const correlatedLogger = createCorrelationLogger(corrId);

    const metric: ReportGenerationMetric = {
      id: metricId,
      correlationId: corrId,
      projectId,
      reportType,
      status: 'started',
      startTime: new Date(),
      phase: 'initialization',
      metadata: {
        ...metadata,
        processingSteps: []
      }
    };

    this.metrics.set(metricId, metric);

    // Start correlation trace
    const trace: CorrelationTrace = {
      correlationId: corrId,
      projectId,
      reportType,
      startTime: new Date(),
      steps: [],
      status: 'active',
      metadata: {
        userId: metadata.userId,
        sourceEndpoint: metadata.sourceService,
        queueTransitions: [],
        serviceChain: []
      }
    };

    this.correlationTraces.set(corrId, trace);

    correlatedLogger.info('Report generation tracking started', {
      metricId,
      projectId,
      reportType,
      metadata
    });

    trackBusinessEvent('report_generation_tracking_started', {
      metricId,
      correlationId: corrId,
      projectId,
      reportType
    });

    return metricId;
  }

  /**
   * Track report generation step
   */
  public trackReportStep(
    metricId: string,
    stepName: string,
    status: ReportProcessingStep['status'],
    metadata?: any
  ): void {
    const metric = this.metrics.get(metricId);
    if (!metric) {
      logger.warn('Metric not found for step tracking', { metricId, stepName });
      return;
    }

    const correlatedLogger = createCorrelationLogger(metric.correlationId);
    const existingStep = metric.metadata.processingSteps?.find(s => s.name === stepName);

    if (existingStep) {
      // Update existing step
      if (status === 'completed' || status === 'failed') {
        existingStep.endTime = new Date();
        existingStep.duration = existingStep.endTime.getTime() - existingStep.startTime.getTime();
        existingStep.status = status;
        if (status === 'failed' && metadata?.error) {
          existingStep.error = metadata.error;
        }
      }
    } else {
      // Create new step
      const step: ReportProcessingStep = {
        name: stepName,
        startTime: new Date(),
        status,
        metadata
      };

      if (status === 'completed' || status === 'failed') {
        step.endTime = new Date();
        step.duration = 0; // Immediate completion
        if (status === 'failed' && metadata?.error) {
          step.error = metadata.error;
        }
      }

      metric.metadata.processingSteps = metric.metadata.processingSteps || [];
      metric.metadata.processingSteps.push(step);
    }

    metric.phase = stepName;

    // Update correlation trace
    const trace = this.correlationTraces.get(metric.correlationId);
    if (trace) {
      const existingTraceStep = trace.steps.find(s => s.name === stepName);
      if (existingTraceStep) {
        Object.assign(existingTraceStep, {
          endTime: existingStep?.endTime,
          duration: existingStep?.duration,
          status,
          error: existingStep?.error
        });
      } else {
        trace.steps.push({
          name: stepName,
          startTime: new Date(),
          endTime: status === 'completed' || status === 'failed' ? new Date() : undefined,
          duration: status === 'completed' || status === 'failed' ? 0 : undefined,
          status,
          error: status === 'failed' ? metadata?.error : undefined,
          metadata
        });
      }
    }

    correlatedLogger.debug('Report step tracked', {
      metricId,
      stepName,
      status,
      phase: metric.phase
    });
  }

  /**
   * Track report generation completion
   */
  public trackReportCompletion(
    metricId: string,
    status: 'completed' | 'failed',
    reportId?: string,
    error?: string
  ): void {
    const metric = this.metrics.get(metricId);
    if (!metric) {
      logger.warn('Metric not found for completion tracking', { metricId });
      return;
    }

    const correlatedLogger = createCorrelationLogger(metric.correlationId);
    const endTime = new Date();
    const duration = endTime.getTime() - metric.startTime.getTime();

    // Update metric
    metric.status = status;
    metric.endTime = endTime;
    metric.duration = duration;
    metric.reportId = reportId;
    if (error) {
      metric.error = error;
    }

    // Update correlation trace
    const trace = this.correlationTraces.get(metric.correlationId);
    if (trace) {
      trace.endTime = endTime;
      trace.totalDuration = duration;
      trace.status = status === 'completed' ? 'completed' : 'failed';
    }

    // Update performance buffer for percentile calculations
    if (status === 'completed') {
      this.performanceBuffer.push(duration);
      if (this.performanceBuffer.length > this.PERFORMANCE_BUFFER_SIZE) {
        this.performanceBuffer = this.performanceBuffer.slice(-this.PERFORMANCE_BUFFER_SIZE);
      }
    }

    correlatedLogger.info('Report generation tracking completed', {
      metricId,
      status,
      duration: `${duration}ms`,
      reportId,
      error
    });

    trackBusinessEvent('report_generation_tracking_completed', {
      metricId,
      correlationId: metric.correlationId,
      projectId: metric.projectId,
      reportType: metric.reportType,
      status,
      duration,
      success: status === 'completed'
    });

    // Trigger immediate alert check if failed
    if (status === 'failed') {
      this.checkForAlerts();
    }
  }

  /**
   * Get comprehensive performance metrics
   */
  public getPerformanceMetrics(timeWindow: '1h' | '24h' | '7d' = '24h'): ReportPerformanceMetrics {
    const cutoffTime = this.getTimeWindowCutoff(timeWindow);
    const recentMetrics = Array.from(this.metrics.values())
      .filter(m => m.startTime >= cutoffTime);

    const totalReports = recentMetrics.length;
    const completedMetrics = recentMetrics.filter(m => m.status === 'completed');
    const failedMetrics = recentMetrics.filter(m => m.status === 'failed');
    
    const successfulReports = completedMetrics.length;
    const failedReports = failedMetrics.length;
    const successRate = totalReports > 0 ? (successfulReports / totalReports) : 1;
    const failureRate = totalReports > 0 ? (failedReports / totalReports) : 0;

    // Performance calculations
    const completedDurations = completedMetrics
      .filter(m => m.duration)
      .map(m => m.duration!)
      .sort((a, b) => a - b);

    const averageProcessingTime = completedDurations.length > 0 
      ? completedDurations.reduce((sum, d) => sum + d, 0) / completedDurations.length 
      : 0;

    const medianProcessingTime = completedDurations.length > 0
      ? completedDurations[Math.floor(completedDurations.length / 2)]
      : 0;

    const p95ProcessingTime = completedDurations.length > 0
      ? completedDurations[Math.floor(completedDurations.length * 0.95)]
      : 0;

    const p99ProcessingTime = completedDurations.length > 0
      ? completedDurations[Math.floor(completedDurations.length * 0.99)]
      : 0;

    // Queue and correlation metrics
    const activeMetrics = recentMetrics.filter(m => m.status === 'started' || m.status === 'processing');
    const queueDepth = activeMetrics.length;

    const correlationTraces = Array.from(this.correlationTraces.values())
      .filter(t => t.startTime >= cutoffTime);
    const trackedReports = correlationTraces.length;
    const endToEndTrackingRate = totalReports > 0 ? (trackedReports / totalReports) : 1;
    const correlationBreaks = Math.max(0, totalReports - trackedReports);

    // Time-based breakdowns
    const oneHourAgo = new Date(Date.now() - 3600000);
    const reportsLast1Hour = recentMetrics.filter(m => m.startTime >= oneHourAgo).length;
    const failuresLast1Hour = recentMetrics.filter(m => 
      m.startTime >= oneHourAgo && m.status === 'failed'
    ).length;

    // Processing rate (reports per minute)
    const timeWindowMinutes = (Date.now() - cutoffTime.getTime()) / 60000;
    const processingRate = timeWindowMinutes > 0 ? (totalReports / timeWindowMinutes) : 0;

    // Recent alerts
    const recentAlerts = Array.from(this.alerts.values())
      .filter(a => a.timestamp >= cutoffTime)
      .slice(0, 10); // Latest 10 alerts

    const activeAlerts = Array.from(this.alerts.values())
      .filter(a => !a.resolved).length;

    // Trend analysis
    const trends = this.calculateTrends(timeWindow);

    return {
      totalReports,
      successfulReports,
      failedReports,
      successRate,
      failureRate,
      averageProcessingTime,
      medianProcessingTime,
      p95ProcessingTime,
      p99ProcessingTime,
      queueDepth,
      averageQueueWaitTime: 0, // Would need queue-specific metrics
      processingRate,
      correlationBreaks,
      endToEndTrackingRate,
      reportsLast1Hour,
      reportsLast24Hours: timeWindow === '24h' ? totalReports : 
        recentMetrics.filter(m => m.startTime >= new Date(Date.now() - 86400000)).length,
      failuresLast1Hour,
      failuresLast24Hours: timeWindow === '24h' ? failedReports :
        recentMetrics.filter(m => 
          m.startTime >= new Date(Date.now() - 86400000) && m.status === 'failed'
        ).length,
      activeAlerts,
      recentAlerts,
      trends
    };
  }

  /**
   * Get report type breakdown
   */
  public getReportTypeBreakdown(timeWindow: '1h' | '24h' | '7d' = '24h'): ReportTypeBreakdown[] {
    const cutoffTime = this.getTimeWindowCutoff(timeWindow);
    const recentMetrics = Array.from(this.metrics.values())
      .filter(m => m.startTime >= cutoffTime);

    const typeMap = new Map<string, ReportGenerationMetric[]>();
    
    recentMetrics.forEach(metric => {
      const type = metric.reportType;
      if (!typeMap.has(type)) {
        typeMap.set(type, []);
      }
      typeMap.get(type)!.push(metric);
    });

    return Array.from(typeMap.entries()).map(([reportType, metrics]) => {
      const count = metrics.length;
      const successCount = metrics.filter(m => m.status === 'completed').length;
      const failureCount = metrics.filter(m => m.status === 'failed').length;
      const successRate = count > 0 ? (successCount / count) : 1;
      
      const completedMetrics = metrics.filter(m => m.status === 'completed' && m.duration);
      const averageProcessingTime = completedMetrics.length > 0
        ? completedMetrics.reduce((sum, m) => sum + m.duration!, 0) / completedMetrics.length
        : 0;

      return {
        reportType,
        count,
        successCount,
        failureCount,
        successRate,
        averageProcessingTime
      };
    });
  }

  /**
   * Get correlation trace
   */
  public getCorrelationTrace(correlationId: string): CorrelationTrace | null {
    return this.correlationTraces.get(correlationId) || null;
  }

  /**
   * Get active alerts
   */
  public getActiveAlerts(): ReportAlert[] {
    return Array.from(this.alerts.values())
      .filter(alert => !alert.resolved)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Resolve alert
   */
  public resolveAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = new Date();
      
      logger.info('Report generation alert resolved', {
        alertId,
        type: alert.type,
        severity: alert.severity
      });

      trackBusinessEvent('report_generation_alert_resolved', {
        alertId,
        type: alert.type,
        severity: alert.severity
      });

      return true;
    }
    return false;
  }

  /**
   * Check for alerts based on current metrics
   */
  private checkForAlerts(): void {
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 86400000);
    const recentMetrics = Array.from(this.metrics.values())
      .filter(m => m.startTime >= last24Hours);

    // Check failure rate
    this.checkFailureRateAlert(recentMetrics);
    
    // Check processing time
    this.checkProcessingTimeAlert(recentMetrics);
    
    // Check queue backlog
    this.checkQueueBacklogAlert();
    
    // Check correlation tracking
    this.checkCorrelationTrackingAlert(recentMetrics);
  }

  /**
   * Check failure rate alert
   */
  private checkFailureRateAlert(recentMetrics: ReportGenerationMetric[]): void {
    if (recentMetrics.length < 10) return; // Need sufficient sample size

    const failedCount = recentMetrics.filter(m => m.status === 'failed').length;
    const failureRate = failedCount / recentMetrics.length;

    if (failureRate > this.FAILURE_RATE_THRESHOLD) {
      const existingAlert = Array.from(this.alerts.values())
        .find(a => a.type === 'failure_rate' && !a.resolved);

      if (!existingAlert) {
        this.createAlert({
          type: 'failure_rate',
          severity: failureRate > 0.30 ? 'critical' : failureRate > 0.25 ? 'high' : 'medium',
          title: 'High Report Generation Failure Rate',
          message: `Report generation failure rate is ${(failureRate * 100).toFixed(1)}% (${failedCount}/${recentMetrics.length} reports failed in last 24h)`,
          metadata: {
            failureRate: failureRate * 100,
            thresholdBreached: `${(this.FAILURE_RATE_THRESHOLD * 100).toFixed(1)}%`,
            recommendation: 'Investigate recent failed reports and check service health'
          }
        });
      }
    }
  }

  /**
   * Check processing time alert
   */
  private checkProcessingTimeAlert(recentMetrics: ReportGenerationMetric[]): void {
    const completedMetrics = recentMetrics.filter(m => 
      m.status === 'completed' && m.duration && m.duration > this.PROCESSING_TIME_THRESHOLD
    );

    if (completedMetrics.length > 5) { // More than 5 slow reports
      const existingAlert = Array.from(this.alerts.values())
        .find(a => a.type === 'processing_time' && !a.resolved);

      if (!existingAlert) {
        const averageSlowTime = completedMetrics.reduce((sum, m) => sum + m.duration!, 0) / completedMetrics.length;
        
        this.createAlert({
          type: 'processing_time',
          severity: averageSlowTime > 600000 ? 'high' : 'medium', // 10 minutes
          title: 'Slow Report Generation Detected',
          message: `${completedMetrics.length} reports took longer than ${this.PROCESSING_TIME_THRESHOLD / 1000}s to complete (avg: ${(averageSlowTime / 1000).toFixed(1)}s)`,
          metadata: {
            slowReportCount: completedMetrics.length,
            averageTime: averageSlowTime,
            thresholdBreached: `${this.PROCESSING_TIME_THRESHOLD / 1000}s`,
            recommendation: 'Check system resources and optimize report generation pipeline'
          }
        });
      }
    }
  }

  /**
   * Check queue backlog alert
   */
  private checkQueueBacklogAlert(): void {
    const activeReports = Array.from(this.metrics.values())
      .filter(m => m.status === 'started' || m.status === 'processing').length;

    if (activeReports > this.QUEUE_BACKLOG_THRESHOLD) {
      const existingAlert = Array.from(this.alerts.values())
        .find(a => a.type === 'queue_backlog' && !a.resolved);

      if (!existingAlert) {
        this.createAlert({
          type: 'queue_backlog',
          severity: activeReports > 200 ? 'critical' : 'high',
          title: 'Report Generation Queue Backlog',
          message: `${activeReports} reports are currently queued or processing (threshold: ${this.QUEUE_BACKLOG_THRESHOLD})`,
          metadata: {
            queueDepth: activeReports,
            thresholdBreached: this.QUEUE_BACKLOG_THRESHOLD.toString(),
            recommendation: 'Scale processing capacity or investigate stuck reports'
          }
        });
      }
    }
  }

  /**
   * Check correlation tracking alert
   */
  private checkCorrelationTrackingAlert(recentMetrics: ReportGenerationMetric[]): void {
    if (recentMetrics.length < 20) return; // Need sufficient sample size

    const correlationIds = new Set(recentMetrics.map(m => m.correlationId));
    const trackingRate = correlationIds.size / recentMetrics.length;

    if (trackingRate < this.CORRELATION_BREAK_THRESHOLD) {
      const existingAlert = Array.from(this.alerts.values())
        .find(a => a.type === 'correlation_break' && !a.resolved);

      if (!existingAlert) {
        this.createAlert({
          type: 'correlation_break',
          severity: trackingRate < 0.70 ? 'high' : 'medium',
          title: 'End-to-End Correlation Tracking Issues',
          message: `Correlation tracking rate is ${(trackingRate * 100).toFixed(1)}% (expected: ${(this.CORRELATION_BREAK_THRESHOLD * 100).toFixed(1)}%)`,
          metadata: {
            trackingRate: trackingRate * 100,
            thresholdBreached: `${(this.CORRELATION_BREAK_THRESHOLD * 100).toFixed(1)}%`,
            recommendation: 'Check correlation ID propagation across services'
          }
        });
      }
    }
  }

  /**
   * Create alert
   */
  private createAlert(alertData: Omit<ReportAlert, 'id' | 'timestamp' | 'correlationId' | 'resolved' | 'relatedMetrics'>): void {
    const alert: ReportAlert = {
      id: createId(),
      timestamp: new Date(),
      correlationId: generateCorrelationId(),
      resolved: false,
      relatedMetrics: [], // Could be populated with specific metric IDs
      ...alertData
    };

    this.alerts.set(alert.id, alert);

    logger.warn('Report generation alert created', {
      alertId: alert.id,
      type: alert.type,
      severity: alert.severity,
      message: alert.message
    });

    trackBusinessEvent('report_generation_alert_created', {
      alertId: alert.id,
      type: alert.type,
      severity: alert.severity,
      correlationId: alert.correlationId
    });

    // Limit alerts to prevent memory growth
    if (this.alerts.size > this.MAX_ALERTS) {
      const oldestAlerts = Array.from(this.alerts.entries())
        .sort((a, b) => a[1].timestamp.getTime() - b[1].timestamp.getTime())
        .slice(0, Math.floor(this.MAX_ALERTS * 0.1)); // Remove oldest 10%

      oldestAlerts.forEach(([id]) => this.alerts.delete(id));
    }
  }

  /**
   * Calculate trends
   */
  private calculateTrends(timeWindow: '1h' | '24h' | '7d'): ReportPerformanceMetrics['trends'] {
    // This would implement trend analysis comparing current period to previous period
    // For now, return stable trends
    return {
      successRateTrend: 'stable',
      performanceTrend: 'stable',
      volumeTrend: 'stable'
    };
  }

  /**
   * Get time window cutoff
   */
  private getTimeWindowCutoff(timeWindow: '1h' | '24h' | '7d'): Date {
    const now = Date.now();
    switch (timeWindow) {
      case '1h': return new Date(now - 3600000);
      case '24h': return new Date(now - 86400000);
      case '7d': return new Date(now - 604800000);
      default: return new Date(now - 86400000);
    }
  }

  /**
   * Start alerting process
   */
  private startAlerting(): void {
    this.alertingInterval = setInterval(() => {
      try {
        this.checkForAlerts();
      } catch (error) {
        logger.error('Error in alerting process', error as Error);
      }
    }, this.ALERTING_INTERVAL);

    logger.info('Report generation alerting started', {
      interval: this.ALERTING_INTERVAL
    });
  }

  /**
   * Start cleanup process
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, this.CLEANUP_INTERVAL);

    logger.info('Report generation monitoring cleanup started', {
      interval: this.CLEANUP_INTERVAL
    });
  }

  /**
   * Perform cleanup of old data
   */
  private performCleanup(): void {
    const cutoff = new Date(Date.now() - 604800000); // 7 days

    // Clean old metrics
    const metricsToDelete = Array.from(this.metrics.entries())
      .filter(([_, metric]) => metric.startTime < cutoff)
      .map(([id]) => id);

    metricsToDelete.forEach(id => this.metrics.delete(id));

    // Clean old traces
    const tracesToDelete = Array.from(this.correlationTraces.entries())
      .filter(([_, trace]) => trace.startTime < cutoff)
      .map(([id]) => id);

    tracesToDelete.forEach(id => this.correlationTraces.delete(id));

    // Clean resolved alerts older than 24 hours
    const alertCutoff = new Date(Date.now() - 86400000);
    const alertsToDelete = Array.from(this.alerts.entries())
      .filter(([_, alert]) => alert.resolved && alert.timestamp < alertCutoff)
      .map(([id]) => id);

    alertsToDelete.forEach(id => this.alerts.delete(id));

    if (metricsToDelete.length > 0 || tracesToDelete.length > 0 || alertsToDelete.length > 0) {
      logger.info('Report generation monitoring cleanup completed', {
        metricsDeleted: metricsToDelete.length,
        tracesDeleted: tracesToDelete.length,
        alertsDeleted: alertsToDelete.length
      });
    }
  }

  /**
   * Setup process handlers
   */
  private setupProcessHandlers(): void {
    const cleanup = () => {
      if (this.alertingInterval) {
        clearInterval(this.alertingInterval);
      }
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
      }
      
      logger.info('Report generation monitoring system shutdown completed');
    };

    process.on('SIGTERM', cleanup);
    process.on('SIGINT', cleanup);
    process.on('exit', cleanup);
  }
}

// Export singleton instance
export const reportGenerationMonitor = ReportGenerationMonitor.getInstance(); 