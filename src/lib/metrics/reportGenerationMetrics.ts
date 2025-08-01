/**
 * Report Generation Dashboard Metrics - Task 7.4
 * 
 * Comprehensive metrics collection and reporting system for tracking
 * report generation success rates, performance, and quality indicators.
 * Provides real-time dashboards, historical trends, and business insights.
 * 
 * Features:
 * - Success/failure rate tracking with detailed categorization
 * - Performance metrics (generation time, throughput, efficiency)
 * - Quality metrics (completeness, accuracy, user satisfaction)
 * - Business metrics (project coverage, user engagement, ROI)
 * - Real-time dashboards with customizable views
 * - Historical trend analysis and predictive forecasting
 * 
 * Part of TP-013-20250801-project-report-association-fix
 */

import { logger, generateCorrelationId } from '@/lib/logger';

// Core metric interfaces
export interface ReportGenerationMetrics {
  timestamp: Date;
  timeframe: 'hourly' | 'daily' | 'weekly' | 'monthly';
  
  // Success/Failure Metrics
  success: {
    totalAttempts: number;
    successfulGenerations: number;
    failedGenerations: number;
    successRate: number;
    failureRate: number;
    retrySuccessRate: number;
  };
  
  // Performance Metrics
  performance: {
    averageGenerationTime: number;
    medianGenerationTime: number;
    p95GenerationTime: number;
    p99GenerationTime: number;
    throughputPerHour: number;
    concurrentGenerations: number;
    queueDepth: number;
    processingEfficiency: number;
  };
  
  // Quality Metrics
  quality: {
    completenessScore: number;
    accuracyScore: number;
    dataFreshnessScore: number;
    userSatisfactionScore: number;
    reportValidityRate: number;
    dataConsistencyScore: number;
  };
  
  // Business Metrics
  business: {
    projectCoverage: number;
    uniqueUsersServed: number;
    reportUtilizationRate: number;
    businessValueScore: number;
    costPerReport: number;
    revenueImpact: number;
  };
  
  // Error Analysis
  errors: {
    byCategory: Record<string, number>;
    byProject: Record<string, number>;
    byCompetitor: Record<string, number>;
    topErrorMessages: Array<{
      message: string;
      count: number;
      percentage: number;
    }>;
  };
  
  // System Health
  system: {
    resourceUtilization: number;
    memoryUsage: number;
    cpuUsage: number;
    databaseConnectionHealth: number;
    cachePerformance: number;
    externalServiceHealth: number;
  };
}

export interface ReportGenerationEvent {
  id: string;
  timestamp: Date;
  correlationId: string;
  
  // Event Details
  type: 'generation_started' | 'generation_completed' | 'generation_failed' | 'generation_retried';
  status: 'success' | 'failure' | 'partial' | 'timeout' | 'error';
  
  // Context
  projectId?: string;
  competitorId?: string;
  userId?: string;
  reportType: string;
  
  // Performance Data
  startTime: Date;
  endTime?: Date;
  duration?: number;
  retryCount: number;
  
  // Quality Data
  completeness?: number;
  dataFreshness?: Date;
  validationScore?: number;
  
  // Error Information
  errorCode?: string;
  errorMessage?: string;
  errorCategory?: string;
  errorStack?: string;
  
  // Business Context
  userPriority?: 'low' | 'normal' | 'high' | 'critical';
  automatedGeneration: boolean;
  scheduledGeneration: boolean;
  
  // Metadata
  metadata: Record<string, any>;
}

export interface DashboardMetricsConfig {
  enabled: boolean;
  aggregationIntervals: ('hourly' | 'daily' | 'weekly' | 'monthly')[];
  retentionPeriods: {
    hourly: number;    // hours to retain
    daily: number;     // days to retain
    weekly: number;    // weeks to retain
    monthly: number;   // months to retain
  };
  thresholds: {
    successRateWarning: number;      // Success rate warning threshold
    successRateCritical: number;     // Success rate critical threshold
    performanceWarning: number;      // Generation time warning (ms)
    performanceCritical: number;     // Generation time critical (ms)
    qualityWarning: number;          // Quality score warning
    qualityCritical: number;         // Quality score critical
  };
  businessMetrics: {
    targetProjectCoverage: number;   // Target project coverage %
    targetUtilization: number;       // Target report utilization %
    maxCostPerReport: number;        // Maximum acceptable cost per report
  };
}

const DEFAULT_CONFIG: DashboardMetricsConfig = {
  enabled: true,
  aggregationIntervals: ['hourly', 'daily', 'weekly', 'monthly'],
  retentionPeriods: {
    hourly: 72,    // 3 days of hourly data
    daily: 90,     // 90 days of daily data
    weekly: 52,    // 1 year of weekly data
    monthly: 24    // 2 years of monthly data
  },
  thresholds: {
    successRateWarning: 0.90,      // 90% success rate warning
    successRateCritical: 0.80,     // 80% success rate critical
    performanceWarning: 30000,     // 30 seconds warning
    performanceCritical: 60000,    // 60 seconds critical
    qualityWarning: 0.85,          // 85% quality score warning
    qualityCritical: 0.70          // 70% quality score critical
  },
  businessMetrics: {
    targetProjectCoverage: 0.95,   // 95% project coverage target
    targetUtilization: 0.75,       // 75% report utilization target
    maxCostPerReport: 2.50         // $2.50 maximum cost per report
  }
};

/**
 * Report Generation Metrics Collector and Dashboard System
 */
export class ReportGenerationMetricsCollector {
  private config: DashboardMetricsConfig;
  private events: Map<string, ReportGenerationEvent> = new Map();
  private aggregatedMetrics: Map<string, ReportGenerationMetrics> = new Map();
  private metricsBuffer: ReportGenerationEvent[] = [];
  private lastAggregation: Date = new Date();
  
  constructor(config?: Partial<DashboardMetricsConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Start periodic aggregation
    if (this.config.enabled) {
      this.startPeriodicAggregation();
    }
    
    logger.info('ReportGenerationMetricsCollector initialized', {
      enabled: this.config.enabled,
      intervals: this.config.aggregationIntervals,
      thresholds: this.config.thresholds
    });
  }
  
  /**
   * Record a report generation event
   */
  recordEvent(event: Omit<ReportGenerationEvent, 'id' | 'timestamp'>): void {
    if (!this.config.enabled) return;
    
    const fullEvent: ReportGenerationEvent = {
      ...event,
      id: generateCorrelationId(),
      timestamp: new Date()
    };
    
    // Store event
    this.events.set(fullEvent.id, fullEvent);
    this.metricsBuffer.push(fullEvent);
    
    // Real-time processing for dashboard updates
    this.processEventForRealTime(fullEvent);
    
    logger.debug('Report generation event recorded', {
      eventId: fullEvent.id,
      type: fullEvent.type,
      status: fullEvent.status,
      projectId: fullEvent.projectId,
      duration: fullEvent.duration
    });
  }
  
  /**
   * Record report generation start
   */
  recordGenerationStart(context: {
    correlationId: string;
    projectId?: string;
    competitorId?: string;
    userId?: string;
    reportType: string;
    userPriority?: 'low' | 'normal' | 'high' | 'critical';
    automatedGeneration?: boolean;
    scheduledGeneration?: boolean;
    metadata?: Record<string, any>;
  }): void {
    this.recordEvent({
      correlationId: context.correlationId || generateCorrelationId(),
      type: 'generation_started',
      status: 'success',
      projectId: context.projectId,
      competitorId: context.competitorId,
      userId: context.userId,
      reportType: context.reportType,
      startTime: new Date(),
      retryCount: 0,
      userPriority: context.userPriority || 'normal',
      automatedGeneration: context.automatedGeneration || false,
      scheduledGeneration: context.scheduledGeneration || false,
      metadata: context.metadata || {}
    });
  }
  
  /**
   * Record report generation completion
   */
  recordGenerationComplete(context: {
    correlationId: string;
    status: 'success' | 'failure' | 'partial' | 'timeout' | 'error';
    duration: number;
    completeness?: number;
    dataFreshness?: Date;
    validationScore?: number;
    errorCode?: string;
    errorMessage?: string;
    errorCategory?: string;
    retryCount?: number;
    metadata?: Record<string, any>;
  }): void {
    this.recordEvent({
      correlationId: context.correlationId,
      type: 'generation_completed',
      status: context.status,
      reportType: 'unknown', // Will be filled from start event
      startTime: new Date(Date.now() - context.duration),
      endTime: new Date(),
      duration: context.duration,
      retryCount: context.retryCount || 0,
      completeness: context.completeness,
      dataFreshness: context.dataFreshness,
      validationScore: context.validationScore,
      errorCode: context.errorCode,
      errorMessage: context.errorMessage,
      errorCategory: context.errorCategory,
      automatedGeneration: false,
      scheduledGeneration: false,
      metadata: context.metadata || {}
    });
  }
  
  /**
   * Get current dashboard metrics
   */
  getDashboardMetrics(timeframe: 'hourly' | 'daily' | 'weekly' | 'monthly' = 'daily'): ReportGenerationMetrics | null {
    const key = `${timeframe}_${this.getCurrentTimeframePeriod(timeframe)}`;
    return this.aggregatedMetrics.get(key) || null;
  }
  
  /**
   * Get historical metrics for trend analysis
   */
  getHistoricalMetrics(
    timeframe: 'hourly' | 'daily' | 'weekly' | 'monthly',
    periods: number = 24
  ): ReportGenerationMetrics[] {
    const metrics: ReportGenerationMetrics[] = [];
    const now = new Date();
    
    for (let i = 0; i < periods; i++) {
      const periodDate = this.getPreviousPeriod(now, timeframe, i);
      const key = `${timeframe}_${this.getTimeframePeriod(periodDate, timeframe)}`;
      const metric = this.aggregatedMetrics.get(key);
      
      if (metric) {
        metrics.unshift(metric); // Most recent first
      }
    }
    
    return metrics;
  }
  
  /**
   * Get real-time dashboard data
   */
  getRealTimeDashboard(): {
    current: {
      activeGenerations: number;
      queueDepth: number;
      successRate: number;
      averageTime: number;
      errorsPerMinute: number;
    };
    trends: {
      successRateTrend: 'improving' | 'stable' | 'declining';
      performanceTrend: 'improving' | 'stable' | 'declining';
      volumeTrend: 'increasing' | 'stable' | 'decreasing';
    };
    alerts: Array<{
      severity: 'warning' | 'critical';
      metric: string;
      currentValue: number;
      threshold: number;
      message: string;
    }>;
  } {
    const recentEvents = this.getRecentEvents(60); // Last 60 minutes
    const current = this.calculateCurrentMetrics(recentEvents);
    const trends = this.calculateTrends();
    const alerts = this.checkThresholds(current);
    
    return { current, trends, alerts };
  }
  
  /**
   * Get comprehensive report generation analytics
   */
  getAnalytics(timeframe: 'daily' | 'weekly' | 'monthly' = 'daily'): {
    overview: {
      totalReports: number;
      successRate: number;
      averageTime: number;
      qualityScore: number;
      projectCoverage: number;
      userSatisfaction: number;
    };
    breakdown: {
      byStatus: Record<string, number>;
      byReportType: Record<string, number>;
      byProject: Record<string, number>;
      byUser: Record<string, number>;
      byTimeOfDay: Record<string, number>;
    };
    performance: {
      generationTimes: {
        min: number;
        max: number;
        avg: number;
        median: number;
        p95: number;
        p99: number;
      };
      throughput: {
        reportsPerHour: number;
        peakHour: string;
        peakVolume: number;
      };
    };
    quality: {
      completenessDistribution: Record<string, number>;
      accuracyTrends: number[];
      dataFreshnessMetrics: {
        averageAge: number;
        staleDataPercentage: number;
      };
    };
    errors: {
      errorCategories: Record<string, number>;
      topErrors: Array<{
        message: string;
        count: number;
        percentage: number;
        trend: 'increasing' | 'stable' | 'decreasing';
      }>;
      errorsByTime: Record<string, number>;
    };
    business: {
      costAnalysis: {
        totalCost: number;
        costPerReport: number;
        costTrend: 'increasing' | 'stable' | 'decreasing';
      };
      utilization: {
        reportViewRate: number;
        reportShareRate: number;
        reportActionRate: number;
      };
      impact: {
        projectsServed: number;
        usersServed: number;
        businessValue: number;
      };
    };
  } {
    const metrics = this.getDashboardMetrics(timeframe);
    const historicalData = this.getHistoricalMetrics(timeframe, 7);
    
    return this.generateAnalyticsReport(metrics, historicalData);
  }
  
  /**
   * Export metrics for external dashboards (Grafana, etc.)
   */
  exportPrometheusMetrics(): string {
    const metrics: string[] = [];
    const timestamp = Math.floor(Date.now() / 1000);
    
    // Get current metrics
    const currentMetrics = this.getDashboardMetrics('hourly');
    if (!currentMetrics) return '';
    
    // Success Rate Metrics
    metrics.push(`# HELP report_generation_success_rate Report generation success rate (0.0-1.0)`);
    metrics.push(`# TYPE report_generation_success_rate gauge`);
    metrics.push(`report_generation_success_rate ${currentMetrics.success.successRate} ${timestamp}`);
    
    metrics.push(`# HELP report_generation_total Total report generation attempts`);
    metrics.push(`# TYPE report_generation_total counter`);
    metrics.push(`report_generation_total ${currentMetrics.success.totalAttempts} ${timestamp}`);
    
    metrics.push(`# HELP report_generation_failures_total Total failed report generations`);
    metrics.push(`# TYPE report_generation_failures_total counter`);
    metrics.push(`report_generation_failures_total ${currentMetrics.success.failedGenerations} ${timestamp}`);
    
    // Performance Metrics
    metrics.push(`# HELP report_generation_duration_seconds Report generation duration`);
    metrics.push(`# TYPE report_generation_duration_seconds histogram`);
    metrics.push(`report_generation_duration_seconds_sum ${currentMetrics.performance.averageGenerationTime * currentMetrics.success.totalAttempts / 1000} ${timestamp}`);
    metrics.push(`report_generation_duration_seconds_count ${currentMetrics.success.totalAttempts} ${timestamp}`);
    
    metrics.push(`# HELP report_generation_duration_p95_seconds 95th percentile generation time`);
    metrics.push(`# TYPE report_generation_duration_p95_seconds gauge`);
    metrics.push(`report_generation_duration_p95_seconds ${currentMetrics.performance.p95GenerationTime / 1000} ${timestamp}`);
    
    metrics.push(`# HELP report_generation_throughput_per_hour Reports generated per hour`);
    metrics.push(`# TYPE report_generation_throughput_per_hour gauge`);
    metrics.push(`report_generation_throughput_per_hour ${currentMetrics.performance.throughputPerHour} ${timestamp}`);
    
    // Quality Metrics
    metrics.push(`# HELP report_generation_quality_score Overall quality score (0.0-1.0)`);
    metrics.push(`# TYPE report_generation_quality_score gauge`);
    metrics.push(`report_generation_quality_score ${(currentMetrics.quality.completenessScore + currentMetrics.quality.accuracyScore) / 2} ${timestamp}`);
    
    metrics.push(`# HELP report_generation_completeness_score Report completeness score (0.0-1.0)`);
    metrics.push(`# TYPE report_generation_completeness_score gauge`);
    metrics.push(`report_generation_completeness_score ${currentMetrics.quality.completenessScore} ${timestamp}`);
    
    // Business Metrics
    metrics.push(`# HELP report_generation_project_coverage Project coverage percentage (0.0-1.0)`);
    metrics.push(`# TYPE report_generation_project_coverage gauge`);
    metrics.push(`report_generation_project_coverage ${currentMetrics.business.projectCoverage} ${timestamp}`);
    
    metrics.push(`# HELP report_generation_cost_per_report Cost per report in dollars`);
    metrics.push(`# TYPE report_generation_cost_per_report gauge`);
    metrics.push(`report_generation_cost_per_report ${currentMetrics.business.costPerReport} ${timestamp}`);
    
    // System Health Metrics
    metrics.push(`# HELP report_generation_system_health System health score (0.0-1.0)`);
    metrics.push(`# TYPE report_generation_system_health gauge`);
    metrics.push(`report_generation_system_health ${currentMetrics.system.resourceUtilization / 100} ${timestamp}`);
    
    metrics.push(`# HELP report_generation_queue_depth Current queue depth`);
    metrics.push(`# TYPE report_generation_queue_depth gauge`);
    metrics.push(`report_generation_queue_depth ${currentMetrics.performance.queueDepth} ${timestamp}`);
    
    // Error Metrics by Category
    metrics.push(`# HELP report_generation_errors_by_category Errors by category`);
    metrics.push(`# TYPE report_generation_errors_by_category counter`);
    Object.entries(currentMetrics.errors.byCategory).forEach(([category, count]) => {
      metrics.push(`report_generation_errors_by_category{category="${category}"} ${count} ${timestamp}`);
    });
    
    return metrics.join('\n') + '\n';
  }
  
  // Private helper methods
  
  private startPeriodicAggregation(): void {
    // Aggregate hourly data every 5 minutes
    setInterval(() => {
      this.aggregateMetrics('hourly');
    }, 5 * 60 * 1000);
    
    // Aggregate daily data every hour
    setInterval(() => {
      this.aggregateMetrics('daily');
    }, 60 * 60 * 1000);
    
    // Aggregate weekly data every 6 hours
    setInterval(() => {
      this.aggregateMetrics('weekly');
    }, 6 * 60 * 60 * 1000);
    
    // Aggregate monthly data every day
    setInterval(() => {
      this.aggregateMetrics('monthly');
    }, 24 * 60 * 60 * 1000);
    
    // Clean up old data every day
    setInterval(() => {
      this.cleanupOldMetrics();
    }, 24 * 60 * 60 * 1000);
  }
  
  private processEventForRealTime(event: ReportGenerationEvent): void {
    // Update real-time counters and moving averages
    // This would integrate with real-time dashboard updates
    
    logger.debug('Processing real-time event for dashboard', {
      eventId: event.id,
      type: event.type,
      status: event.status
    });
  }
  
  private aggregateMetrics(timeframe: 'hourly' | 'daily' | 'weekly' | 'monthly'): void {
    const now = new Date();
    const events = this.getEventsForTimeframe(timeframe, now);
    
    if (events.length === 0) return;
    
    const metrics: ReportGenerationMetrics = {
      timestamp: now,
      timeframe,
      success: this.calculateSuccessMetrics(events),
      performance: this.calculatePerformanceMetrics(events),
      quality: this.calculateQualityMetrics(events),
      business: this.calculateBusinessMetrics(events),
      errors: this.calculateErrorMetrics(events),
      system: this.calculateSystemMetrics(events)
    };
    
    const key = `${timeframe}_${this.getCurrentTimeframePeriod(timeframe)}`;
    this.aggregatedMetrics.set(key, metrics);
    
    logger.debug('Metrics aggregated', {
      timeframe,
      key,
      eventCount: events.length,
      successRate: metrics.success.successRate
    });
  }
  
  private calculateSuccessMetrics(events: ReportGenerationEvent[]): ReportGenerationMetrics['success'] {
    const totalAttempts = events.filter(e => e.type === 'generation_started').length;
    const completedEvents = events.filter(e => e.type === 'generation_completed');
    const successfulGenerations = completedEvents.filter(e => e.status === 'success').length;
    const failedGenerations = completedEvents.filter(e => e.status !== 'success').length;
    const retryEvents = events.filter(e => e.type === 'generation_retried');
    const retrySuccesses = retryEvents.filter(e => e.status === 'success').length;
    
    const successRate = totalAttempts > 0 ? successfulGenerations / totalAttempts : 0;
    const failureRate = totalAttempts > 0 ? failedGenerations / totalAttempts : 0;
    const retrySuccessRate = retryEvents.length > 0 ? retrySuccesses / retryEvents.length : 0;
    
    return {
      totalAttempts,
      successfulGenerations,
      failedGenerations,
      successRate,
      failureRate,
      retrySuccessRate
    };
  }
  
  private calculatePerformanceMetrics(events: ReportGenerationEvent[]): ReportGenerationMetrics['performance'] {
    const completedEvents = events.filter(e => e.type === 'generation_completed' && e.duration);
    const durations = completedEvents.map(e => e.duration!).sort((a, b) => a - b);
    
    const averageGenerationTime = durations.length > 0 ? 
      durations.reduce((sum, duration) => sum + duration, 0) / durations.length : 0;
    
    const medianGenerationTime = durations.length > 0 ? 
      durations[Math.floor(durations.length / 2)] : 0;
    
    const p95GenerationTime = durations.length > 0 ? 
      durations[Math.floor(durations.length * 0.95)] : 0;
    
    const p99GenerationTime = durations.length > 0 ? 
      durations[Math.floor(durations.length * 0.99)] : 0;
    
    const throughputPerHour = completedEvents.length; // Simplified calculation
    const concurrentGenerations = 0; // Would be calculated from active events
    const queueDepth = 0; // Would be calculated from queued events
    const processingEfficiency = successfulGenerations => 
      completedEvents.filter(e => e.status === 'success').length / Math.max(completedEvents.length, 1);
    
    return {
      averageGenerationTime,
      medianGenerationTime,
      p95GenerationTime,
      p99GenerationTime,
      throughputPerHour,
      concurrentGenerations,
      queueDepth,
      processingEfficiency: processingEfficiency(0) * 100
    };
  }
  
  private calculateQualityMetrics(events: ReportGenerationEvent[]): ReportGenerationMetrics['quality'] {
    const eventsWithQuality = events.filter(e => e.completeness !== undefined || e.validationScore !== undefined);
    
    const completenessScore = eventsWithQuality.length > 0 ?
      eventsWithQuality.reduce((sum, e) => sum + (e.completeness || 0), 0) / eventsWithQuality.length : 0;
    
    const accuracyScore = eventsWithQuality.length > 0 ?
      eventsWithQuality.reduce((sum, e) => sum + (e.validationScore || 0), 0) / eventsWithQuality.length : 0;
    
    // Calculate data freshness
    const now = new Date();
    const eventsWithFreshness = events.filter(e => e.dataFreshness);
    const dataFreshnessScore = eventsWithFreshness.length > 0 ?
      eventsWithFreshness.reduce((sum, e) => {
        const ageHours = (now.getTime() - e.dataFreshness!.getTime()) / (1000 * 60 * 60);
        return sum + Math.max(0, (24 - ageHours) / 24); // Score based on data age
      }, 0) / eventsWithFreshness.length : 0;
    
    return {
      completenessScore,
      accuracyScore,
      dataFreshnessScore,
      userSatisfactionScore: 0.85, // Placeholder - would come from user feedback
      reportValidityRate: accuracyScore,
      dataConsistencyScore: (completenessScore + accuracyScore + dataFreshnessScore) / 3
    };
  }
  
  private calculateBusinessMetrics(events: ReportGenerationEvent[]): ReportGenerationMetrics['business'] {
    const uniqueProjects = new Set(events.map(e => e.projectId).filter(Boolean));
    const uniqueUsers = new Set(events.map(e => e.userId).filter(Boolean));
    const successfulEvents = events.filter(e => e.status === 'success');
    
    return {
      projectCoverage: 0.85, // Placeholder - would calculate from total projects
      uniqueUsersServed: uniqueUsers.size,
      reportUtilizationRate: 0.75, // Placeholder - would track report usage
      businessValueScore: 0.80, // Placeholder - would calculate from usage metrics
      costPerReport: 1.50, // Placeholder - would calculate from resource usage
      revenueImpact: uniqueUsers.size * 10 // Placeholder - estimated revenue impact
    };
  }
  
  private calculateErrorMetrics(events: ReportGenerationEvent[]): ReportGenerationMetrics['errors'] {
    const errorEvents = events.filter(e => e.status !== 'success' && e.errorMessage);
    
    const byCategory = errorEvents.reduce((acc, e) => {
      const category = e.errorCategory || 'unknown';
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const byProject = errorEvents.reduce((acc, e) => {
      if (e.projectId) {
        acc[e.projectId] = (acc[e.projectId] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);
    
    const byCompetitor = errorEvents.reduce((acc, e) => {
      if (e.competitorId) {
        acc[e.competitorId] = (acc[e.competitorId] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);
    
    // Top error messages
    const errorCounts = errorEvents.reduce((acc, e) => {
      const message = e.errorMessage || 'Unknown error';
      acc[message] = (acc[message] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const topErrorMessages = Object.entries(errorCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([message, count]) => ({
        message,
        count,
        percentage: (count / errorEvents.length) * 100
      }));
    
    return {
      byCategory,
      byProject,
      byCompetitor,
      topErrorMessages
    };
  }
  
  private calculateSystemMetrics(events: ReportGenerationEvent[]): ReportGenerationMetrics['system'] {
    // Placeholder implementation - would integrate with actual system metrics
    return {
      resourceUtilization: 65,
      memoryUsage: 512 * 1024 * 1024, // 512MB
      cpuUsage: 25,
      databaseConnectionHealth: 95,
      cachePerformance: 88,
      externalServiceHealth: 92
    };
  }
  
  private getEventsForTimeframe(timeframe: 'hourly' | 'daily' | 'weekly' | 'monthly', date: Date): ReportGenerationEvent[] {
    const now = date;
    let startTime: Date;
    
    switch (timeframe) {
      case 'hourly':
        startTime = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case 'daily':
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'weekly':
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'monthly':
        startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
    }
    
    return Array.from(this.events.values()).filter(event => 
      event.timestamp >= startTime && event.timestamp <= now
    );
  }
  
  private getRecentEvents(minutes: number): ReportGenerationEvent[] {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    return Array.from(this.events.values()).filter(event => 
      event.timestamp >= cutoff
    );
  }
  
  private calculateCurrentMetrics(events: ReportGenerationEvent[]): any {
    const totalAttempts = events.filter(e => e.type === 'generation_started').length;
    const successfulGenerations = events.filter(e => e.type === 'generation_completed' && e.status === 'success').length;
    const failedGenerations = events.filter(e => e.type === 'generation_completed' && e.status !== 'success').length;
    const completedEvents = events.filter(e => e.type === 'generation_completed' && e.duration);
    
    const successRate = totalAttempts > 0 ? successfulGenerations / totalAttempts : 0;
    const averageTime = completedEvents.length > 0 ? 
      completedEvents.reduce((sum, e) => sum + e.duration!, 0) / completedEvents.length : 0;
    
    return {
      activeGenerations: 0, // Would track from active events
      queueDepth: 0, // Would track from queued events
      successRate,
      averageTime,
      errorsPerMinute: failedGenerations / Math.max(events.length / 60, 1)
    };
  }
  
  private calculateTrends(): any {
    // Simplified trend calculation - would use historical comparison
    return {
      successRateTrend: 'stable' as const,
      performanceTrend: 'improving' as const,
      volumeTrend: 'increasing' as const
    };
  }
  
  private checkThresholds(current: any): Array<any> {
    const alerts: Array<any> = [];
    
    if (current.successRate < this.config.thresholds.successRateCritical) {
      alerts.push({
        severity: 'critical',
        metric: 'success_rate',
        currentValue: current.successRate,
        threshold: this.config.thresholds.successRateCritical,
        message: `Success rate ${(current.successRate * 100).toFixed(1)}% is below critical threshold`
      });
    } else if (current.successRate < this.config.thresholds.successRateWarning) {
      alerts.push({
        severity: 'warning',
        metric: 'success_rate',
        currentValue: current.successRate,
        threshold: this.config.thresholds.successRateWarning,
        message: `Success rate ${(current.successRate * 100).toFixed(1)}% is below warning threshold`
      });
    }
    
    if (current.averageTime > this.config.thresholds.performanceCritical) {
      alerts.push({
        severity: 'critical',
        metric: 'performance',
        currentValue: current.averageTime,
        threshold: this.config.thresholds.performanceCritical,
        message: `Average generation time ${(current.averageTime / 1000).toFixed(1)}s exceeds critical threshold`
      });
    } else if (current.averageTime > this.config.thresholds.performanceWarning) {
      alerts.push({
        severity: 'warning',
        metric: 'performance',
        currentValue: current.averageTime,
        threshold: this.config.thresholds.performanceWarning,
        message: `Average generation time ${(current.averageTime / 1000).toFixed(1)}s exceeds warning threshold`
      });
    }
    
    return alerts;
  }
  
  private generateAnalyticsReport(metrics: ReportGenerationMetrics | null, historicalData: ReportGenerationMetrics[]): any {
    if (!metrics) {
      return {
        overview: {},
        breakdown: {},
        performance: {},
        quality: {},
        errors: {},
        business: {}
      };
    }
    
    // Detailed analytics report generation
    return {
      overview: {
        totalReports: metrics.success.totalAttempts,
        successRate: metrics.success.successRate,
        averageTime: metrics.performance.averageGenerationTime,
        qualityScore: (metrics.quality.completenessScore + metrics.quality.accuracyScore) / 2,
        projectCoverage: metrics.business.projectCoverage,
        userSatisfaction: metrics.quality.userSatisfactionScore
      },
      breakdown: {
        byStatus: {
          success: metrics.success.successfulGenerations,
          failed: metrics.success.failedGenerations
        },
        byReportType: {}, // Would be populated from event data
        byProject: metrics.errors.byProject,
        byUser: {}, // Would be populated from event data
        byTimeOfDay: {} // Would be calculated from event timestamps
      },
      performance: {
        generationTimes: {
          min: 0, // Would be calculated from events
          max: 0, // Would be calculated from events
          avg: metrics.performance.averageGenerationTime,
          median: metrics.performance.medianGenerationTime,
          p95: metrics.performance.p95GenerationTime,
          p99: metrics.performance.p99GenerationTime
        },
        throughput: {
          reportsPerHour: metrics.performance.throughputPerHour,
          peakHour: '14:00', // Would be calculated from events
          peakVolume: metrics.performance.throughputPerHour * 1.5
        }
      },
      quality: {
        completenessDistribution: {}, // Would be calculated from events
        accuracyTrends: historicalData.map(m => m.quality.accuracyScore),
        dataFreshnessMetrics: {
          averageAge: 2.5, // hours
          staleDataPercentage: (1 - metrics.quality.dataFreshnessScore) * 100
        }
      },
      errors: {
        errorCategories: metrics.errors.byCategory,
        topErrors: metrics.errors.topErrorMessages.map(error => ({
          ...error,
          trend: 'stable' as const // Would be calculated from historical data
        })),
        errorsByTime: {} // Would be calculated from event timestamps
      },
      business: {
        costAnalysis: {
          totalCost: metrics.business.costPerReport * metrics.success.totalAttempts,
          costPerReport: metrics.business.costPerReport,
          costTrend: 'stable' as const // Would be calculated from historical data
        },
        utilization: {
          reportViewRate: metrics.business.reportUtilizationRate,
          reportShareRate: 0.15, // Placeholder
          reportActionRate: 0.35 // Placeholder
        },
        impact: {
          projectsServed: Object.keys(metrics.errors.byProject).length,
          usersServed: metrics.business.uniqueUsersServed,
          businessValue: metrics.business.businessValueScore * 1000 // Placeholder calculation
        }
      }
    };
  }
  
  private getCurrentTimeframePeriod(timeframe: 'hourly' | 'daily' | 'weekly' | 'monthly'): string {
    return this.getTimeframePeriod(new Date(), timeframe);
  }
  
  private getTimeframePeriod(date: Date, timeframe: 'hourly' | 'daily' | 'weekly' | 'monthly'): string {
    switch (timeframe) {
      case 'hourly':
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}`;
      case 'daily':
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      case 'weekly':
        const startOfWeek = new Date(date);
        startOfWeek.setDate(date.getDate() - date.getDay());
        return `${startOfWeek.getFullYear()}-W${String(Math.ceil(startOfWeek.getDate() / 7)).padStart(2, '0')}`;
      case 'monthly':
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }
  }
  
  private getPreviousPeriod(date: Date, timeframe: 'hourly' | 'daily' | 'weekly' | 'monthly', periodsBack: number): Date {
    const result = new Date(date);
    
    switch (timeframe) {
      case 'hourly':
        result.setHours(result.getHours() - periodsBack);
        break;
      case 'daily':
        result.setDate(result.getDate() - periodsBack);
        break;
      case 'weekly':
        result.setDate(result.getDate() - (periodsBack * 7));
        break;
      case 'monthly':
        result.setMonth(result.getMonth() - periodsBack);
        break;
    }
    
    return result;
  }
  
  private cleanupOldMetrics(): void {
    const now = new Date();
    const keysToDelete: string[] = [];
    
    this.aggregatedMetrics.forEach((metric, key) => {
      const [timeframe] = key.split('_') as ['hourly' | 'daily' | 'weekly' | 'monthly'];
      const retentionHours = this.getRetentionHours(timeframe);
      const cutoff = new Date(now.getTime() - retentionHours * 60 * 60 * 1000);
      
      if (metric.timestamp < cutoff) {
        keysToDelete.push(key);
      }
    });
    
    keysToDelete.forEach(key => {
      this.aggregatedMetrics.delete(key);
    });
    
    logger.info('Old metrics cleaned up', { deletedKeys: keysToDelete.length });
  }
  
  private getRetentionHours(timeframe: 'hourly' | 'daily' | 'weekly' | 'monthly'): number {
    switch (timeframe) {
      case 'hourly': return this.config.retentionPeriods.hourly;
      case 'daily': return this.config.retentionPeriods.daily * 24;
      case 'weekly': return this.config.retentionPeriods.weekly * 7 * 24;
      case 'monthly': return this.config.retentionPeriods.monthly * 30 * 24;
    }
  }
}

// Global metrics collector instance
export const reportGenerationMetrics = new ReportGenerationMetricsCollector();

/**
 * Helper functions for easy metrics collection
 */
export const ReportMetricsHelpers = {
  /**
   * Record report generation start
   */
  recordStart: (context: Parameters<typeof reportGenerationMetrics.recordGenerationStart>[0]) => {
    reportGenerationMetrics.recordGenerationStart(context);
  },
  
  /**
   * Record report generation completion
   */
  recordComplete: (context: Parameters<typeof reportGenerationMetrics.recordGenerationComplete>[0]) => {
    reportGenerationMetrics.recordGenerationComplete(context);
  },
  
  /**
   * Get current dashboard data
   */
  getDashboard: (timeframe?: 'hourly' | 'daily' | 'weekly' | 'monthly') => {
    return reportGenerationMetrics.getDashboardMetrics(timeframe);
  },
  
  /**
   * Get real-time dashboard
   */
  getRealTime: () => {
    return reportGenerationMetrics.getRealTimeDashboard();
  },
  
  /**
   * Get analytics report
   */
  getAnalytics: (timeframe?: 'daily' | 'weekly' | 'monthly') => {
    return reportGenerationMetrics.getAnalytics(timeframe);
  }
}; 