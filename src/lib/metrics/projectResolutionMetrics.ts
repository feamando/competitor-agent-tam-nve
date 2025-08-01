/**
 * Project Resolution Metrics - Task 7.1
 * 
 * Comprehensive metrics collection and reporting for project resolution success/failure rates.
 * Tracks performance, reliability, and effectiveness of the project discovery service.
 * 
 * Key Metrics Tracked:
 * - Project resolution success/failure rates
 * - Resolution confidence level distributions
 * - Resolution method effectiveness
 * - Performance metrics (latency, cache hit rates)
 * - Error categorization and trends
 * - Business impact metrics
 * 
 * Part of TP-013-20250801-project-report-association-fix
 */

import { logger, generateCorrelationId } from '../logger';

// Metric interfaces
export interface ProjectResolutionAttempt {
  correlationId: string;
  competitorId: string;
  timestamp: Date;
  success: boolean;
  projectId?: string;
  confidence?: 'high' | 'medium' | 'low' | 'failed';
  resolutionMethod?: string;
  latencyMs: number;
  errorType?: string;
  errorMessage?: string;
  cacheHit: boolean;
  multipleProjectsFound?: number;
  requestSource: 'api' | 'migration' | 'background' | 'manual';
}

export interface ProjectResolutionMetrics {
  // Success/Failure Rates
  totalAttempts: number;
  successfulResolutions: number;
  failedResolutions: number;
  successRate: number;
  
  // Confidence Distribution
  highConfidenceCount: number;
  mediumConfidenceCount: number;
  lowConfidenceCount: number;
  
  // Resolution Methods
  resolutionMethods: Record<string, number>;
  
  // Performance Metrics
  averageLatencyMs: number;
  p95LatencyMs: number;
  cacheHitRate: number;
  
  // Error Analysis
  errorTypes: Record<string, number>;
  
  // Business Metrics
  orphanedReportsFixed: number;
  reportsWithoutProject: number;
  
  // Time Range
  periodStart: Date;
  periodEnd: Date;
}

export interface MetricsAggregation {
  hourly: ProjectResolutionMetrics;
  daily: ProjectResolutionMetrics;
  weekly: ProjectResolutionMetrics;
  monthly: ProjectResolutionMetrics;
}

/**
 * Project Resolution Metrics Collector
 * Collects, aggregates, and reports on project resolution performance
 */
export class ProjectResolutionMetricsCollector {
  private metrics: ProjectResolutionAttempt[] = [];
  private maxRetainedMetrics = 10000; // Retain last 10k attempts for analysis
  
  /**
   * Record a project resolution attempt
   */
  recordResolutionAttempt(attempt: Omit<ProjectResolutionAttempt, 'timestamp' | 'correlationId'>): void {
    const fullAttempt: ProjectResolutionAttempt = {
      ...attempt,
      timestamp: new Date(),
      correlationId: attempt.correlationId || generateCorrelationId()
    };
    
    this.metrics.push(fullAttempt);
    
    // Maintain metric size limit
    if (this.metrics.length > this.maxRetainedMetrics) {
      this.metrics = this.metrics.slice(-this.maxRetainedMetrics);
    }
    
    // Log metric for external systems
    logger.info('Project resolution attempt recorded', {
      correlationId: fullAttempt.correlationId,
      competitorId: fullAttempt.competitorId,
      success: fullAttempt.success,
      confidence: fullAttempt.confidence,
      latencyMs: fullAttempt.latencyMs,
      cacheHit: fullAttempt.cacheHit,
      requestSource: fullAttempt.requestSource
    });
    
    // Emit custom event for monitoring systems
    this.emitMetricEvent(fullAttempt);
  }
  
  /**
   * Record successful project resolution
   */
  recordSuccess(data: {
    competitorId: string;
    projectId: string;
    confidence: 'high' | 'medium' | 'low';
    resolutionMethod: string;
    latencyMs: number;
    cacheHit: boolean;
    multipleProjectsFound?: number;
    requestSource: ProjectResolutionAttempt['requestSource'];
    correlationId?: string;
  }): void {
    this.recordResolutionAttempt({
      ...data,
      success: true,
      correlationId: data.correlationId || generateCorrelationId()
    });
  }
  
  /**
   * Record failed project resolution
   */
  recordFailure(data: {
    competitorId: string;
    errorType: string;
    errorMessage: string;
    latencyMs: number;
    cacheHit: boolean;
    requestSource: ProjectResolutionAttempt['requestSource'];
    correlationId?: string;
  }): void {
    this.recordResolutionAttempt({
      ...data,
      success: false,
      confidence: 'failed',
      correlationId: data.correlationId || generateCorrelationId()
    });
  }
  
  /**
   * Get metrics for a specific time period
   */
  getMetrics(periodStart: Date, periodEnd: Date): ProjectResolutionMetrics {
    const periodMetrics = this.metrics.filter(m => 
      m.timestamp >= periodStart && m.timestamp <= periodEnd
    );
    
    if (periodMetrics.length === 0) {
      return this.createEmptyMetrics(periodStart, periodEnd);
    }
    
    const successful = periodMetrics.filter(m => m.success);
    const failed = periodMetrics.filter(m => !m.success);
    
    // Calculate latency percentiles
    const latencies = periodMetrics.map(m => m.latencyMs).sort((a, b) => a - b);
    const p95Index = Math.floor(latencies.length * 0.95);
    
    // Aggregate resolution methods
    const resolutionMethods: Record<string, number> = {};
    successful.forEach(m => {
      if (m.resolutionMethod) {
        resolutionMethods[m.resolutionMethod] = (resolutionMethods[m.resolutionMethod] || 0) + 1;
      }
    });
    
    // Aggregate error types
    const errorTypes: Record<string, number> = {};
    failed.forEach(m => {
      if (m.errorType) {
        errorTypes[m.errorType] = (errorTypes[m.errorType] || 0) + 1;
      }
    });
    
    return {
      totalAttempts: periodMetrics.length,
      successfulResolutions: successful.length,
      failedResolutions: failed.length,
      successRate: successful.length / periodMetrics.length,
      
      highConfidenceCount: successful.filter(m => m.confidence === 'high').length,
      mediumConfidenceCount: successful.filter(m => m.confidence === 'medium').length,
      lowConfidenceCount: successful.filter(m => m.confidence === 'low').length,
      
      resolutionMethods,
      
      averageLatencyMs: latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length,
      p95LatencyMs: latencies[p95Index] || 0,
      cacheHitRate: periodMetrics.filter(m => m.cacheHit).length / periodMetrics.length,
      
      errorTypes,
      
      orphanedReportsFixed: successful.filter(m => m.requestSource === 'migration').length,
      reportsWithoutProject: failed.filter(m => m.errorType === 'no_projects_found').length,
      
      periodStart,
      periodEnd
    };
  }
  
  /**
   * Get current metrics aggregated by different time periods
   */
  getCurrentMetricsAggregation(): MetricsAggregation {
    const now = new Date();
    
    return {
      hourly: this.getMetrics(new Date(now.getTime() - 60 * 60 * 1000), now),
      daily: this.getMetrics(new Date(now.getTime() - 24 * 60 * 60 * 1000), now),
      weekly: this.getMetrics(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), now),
      monthly: this.getMetrics(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), now)
    };
  }
  
  /**
   * Generate detailed metrics report
   */
  generateMetricsReport(period: 'hourly' | 'daily' | 'weekly' | 'monthly' = 'daily'): {
    summary: ProjectResolutionMetrics;
    insights: string[];
    alerts: string[];
    recommendations: string[];
  } {
    const aggregation = this.getCurrentMetricsAggregation();
    const metrics = aggregation[period];
    
    const insights = this.generateInsights(metrics);
    const alerts = this.generateAlerts(metrics);
    const recommendations = this.generateRecommendations(metrics);
    
    return {
      summary: metrics,
      insights,
      alerts,
      recommendations
    };
  }
  
  /**
   * Export metrics in Prometheus format
   */
  exportPrometheusMetrics(): string {
    const aggregation = this.getCurrentMetricsAggregation();
    const daily = aggregation.daily;
    
    const metrics = [
      `# HELP project_resolution_success_rate Success rate of project resolution attempts`,
      `# TYPE project_resolution_success_rate gauge`,
      `project_resolution_success_rate ${daily.successRate.toFixed(4)}`,
      ``,
      `# HELP project_resolution_total Total number of project resolution attempts`,
      `# TYPE project_resolution_total counter`,
      `project_resolution_total ${daily.totalAttempts}`,
      ``,
      `# HELP project_resolution_latency_ms Average latency of project resolution in milliseconds`,
      `# TYPE project_resolution_latency_ms gauge`,
      `project_resolution_latency_ms ${daily.averageLatencyMs.toFixed(2)}`,
      ``,
      `# HELP project_resolution_p95_latency_ms 95th percentile latency in milliseconds`,
      `# TYPE project_resolution_p95_latency_ms gauge`,
      `project_resolution_p95_latency_ms ${daily.p95LatencyMs.toFixed(2)}`,
      ``,
      `# HELP project_resolution_cache_hit_rate Cache hit rate for project resolution`,
      `# TYPE project_resolution_cache_hit_rate gauge`,
      `project_resolution_cache_hit_rate ${daily.cacheHitRate.toFixed(4)}`,
      ``
    ];
    
    // Add confidence level metrics
    metrics.push(
      `# HELP project_resolution_confidence_high Number of high confidence resolutions`,
      `# TYPE project_resolution_confidence_high counter`,
      `project_resolution_confidence_high ${daily.highConfidenceCount}`,
      ``,
      `# HELP project_resolution_confidence_medium Number of medium confidence resolutions`,
      `# TYPE project_resolution_confidence_medium counter`,
      `project_resolution_confidence_medium ${daily.mediumConfidenceCount}`,
      ``,
      `# HELP project_resolution_confidence_low Number of low confidence resolutions`,
      `# TYPE project_resolution_confidence_low counter`,
      `project_resolution_confidence_low ${daily.lowConfidenceCount}`,
      ``
    );
    
    // Add error type metrics
    Object.entries(daily.errorTypes).forEach(([errorType, count]) => {
      metrics.push(
        `# HELP project_resolution_errors_${errorType} Number of ${errorType} errors`,
        `# TYPE project_resolution_errors_${errorType} counter`,
        `project_resolution_errors_${errorType} ${count}`,
        ``
      );
    });
    
    return metrics.join('\n');
  }
  
  private createEmptyMetrics(periodStart: Date, periodEnd: Date): ProjectResolutionMetrics {
    return {
      totalAttempts: 0,
      successfulResolutions: 0,
      failedResolutions: 0,
      successRate: 0,
      highConfidenceCount: 0,
      mediumConfidenceCount: 0,
      lowConfidenceCount: 0,
      resolutionMethods: {},
      averageLatencyMs: 0,
      p95LatencyMs: 0,
      cacheHitRate: 0,
      errorTypes: {},
      orphanedReportsFixed: 0,
      reportsWithoutProject: 0,
      periodStart,
      periodEnd
    };
  }
  
  private generateInsights(metrics: ProjectResolutionMetrics): string[] {
    const insights: string[] = [];
    
    if (metrics.totalAttempts > 0) {
      insights.push(`Project resolution success rate: ${(metrics.successRate * 100).toFixed(1)}%`);
      insights.push(`Average resolution latency: ${metrics.averageLatencyMs.toFixed(1)}ms`);
      insights.push(`Cache hit rate: ${(metrics.cacheHitRate * 100).toFixed(1)}%`);
      
      if (metrics.successfulResolutions > 0) {
        const confidenceDistribution = [
          `High: ${metrics.highConfidenceCount} (${((metrics.highConfidenceCount / metrics.successfulResolutions) * 100).toFixed(1)}%)`,
          `Medium: ${metrics.mediumConfidenceCount} (${((metrics.mediumConfidenceCount / metrics.successfulResolutions) * 100).toFixed(1)}%)`,
          `Low: ${metrics.lowConfidenceCount} (${((metrics.lowConfidenceCount / metrics.successfulResolutions) * 100).toFixed(1)}%)`
        ];
        insights.push(`Confidence distribution - ${confidenceDistribution.join(', ')}`);
      }
      
      const topResolutionMethod = Object.entries(metrics.resolutionMethods)
        .sort(([,a], [,b]) => b - a)[0];
      if (topResolutionMethod) {
        insights.push(`Most common resolution method: ${topResolutionMethod[0]} (${topResolutionMethod[1]} uses)`);
      }
      
      if (metrics.failedResolutions > 0) {
        const topErrorType = Object.entries(metrics.errorTypes)
          .sort(([,a], [,b]) => b - a)[0];
        if (topErrorType) {
          insights.push(`Most common error: ${topErrorType[0]} (${topErrorType[1]} occurrences)`);
        }
      }
    } else {
      insights.push('No project resolution attempts recorded in this period');
    }
    
    return insights;
  }
  
  private generateAlerts(metrics: ProjectResolutionMetrics): string[] {
    const alerts: string[] = [];
    
    // Success rate alerts
    if (metrics.successRate < 0.5) {
      alerts.push(`CRITICAL: Project resolution success rate is critically low (${(metrics.successRate * 100).toFixed(1)}%)`);
    } else if (metrics.successRate < 0.7) {
      alerts.push(`WARNING: Project resolution success rate is below optimal (${(metrics.successRate * 100).toFixed(1)}%)`);
    }
    
    // Latency alerts
    if (metrics.averageLatencyMs > 100) {
      alerts.push(`WARNING: High average latency detected (${metrics.averageLatencyMs.toFixed(1)}ms)`);
    }
    if (metrics.p95LatencyMs > 200) {
      alerts.push(`CRITICAL: P95 latency exceeds threshold (${metrics.p95LatencyMs.toFixed(1)}ms)`);
    }
    
    // Cache performance alerts
    if (metrics.cacheHitRate < 0.8) {
      alerts.push(`WARNING: Cache hit rate is suboptimal (${(metrics.cacheHitRate * 100).toFixed(1)}%)`);
    }
    
    // Error rate alerts
    const errorRate = metrics.failedResolutions / metrics.totalAttempts;
    if (errorRate > 0.3) {
      alerts.push(`CRITICAL: High error rate detected (${(errorRate * 100).toFixed(1)}%)`);
    } else if (errorRate > 0.1) {
      alerts.push(`WARNING: Elevated error rate (${(errorRate * 100).toFixed(1)}%)`);
    }
    
    // Business impact alerts
    if (metrics.reportsWithoutProject > 50) {
      alerts.push(`WARNING: High number of reports without project association (${metrics.reportsWithoutProject})`);
    }
    
    return alerts;
  }
  
  private generateRecommendations(metrics: ProjectResolutionMetrics): string[] {
    const recommendations: string[] = [];
    
    if (metrics.successRate < 0.8) {
      recommendations.push('Consider improving project-competitor relationship data quality');
      recommendations.push('Review and enhance project resolution algorithms');
    }
    
    if (metrics.cacheHitRate < 0.9) {
      recommendations.push('Optimize cache TTL settings for better hit rates');
      recommendations.push('Consider implementing cache warming strategies');
    }
    
    if (metrics.averageLatencyMs > 50) {
      recommendations.push('Investigate database query performance optimization');
      recommendations.push('Consider implementing database connection pooling');
    }
    
    const lowConfidenceRate = metrics.lowConfidenceCount / Math.max(metrics.successfulResolutions, 1);
    if (lowConfidenceRate > 0.2) {
      recommendations.push('Improve data quality to increase resolution confidence');
      recommendations.push('Consider implementing additional resolution strategies');
    }
    
    if (metrics.errorTypes['no_projects_found'] > metrics.totalAttempts * 0.1) {
      recommendations.push('Review competitor-project relationship data completeness');
      recommendations.push('Consider implementing project creation workflows for orphaned competitors');
    }
    
    return recommendations;
  }
  
  private emitMetricEvent(attempt: ProjectResolutionAttempt): void {
    // This would integrate with external monitoring systems
    // For now, we'll use structured logging
    const eventData = {
      event: 'project_resolution_attempt',
      timestamp: attempt.timestamp.toISOString(),
      correlationId: attempt.correlationId,
      competitorId: attempt.competitorId,
      success: attempt.success,
      confidence: attempt.confidence,
      resolutionMethod: attempt.resolutionMethod,
      latencyMs: attempt.latencyMs,
      cacheHit: attempt.cacheHit,
      requestSource: attempt.requestSource,
      errorType: attempt.errorType
    };
    
    logger.info('ProjectResolutionMetric', eventData);
  }
}

// Global metrics collector instance
export const projectResolutionMetrics = new ProjectResolutionMetricsCollector();

/**
 * Helper functions for common metric recording scenarios
 */
export const MetricsHelpers = {
  /**
   * Record successful API-based project resolution
   */
  recordApiSuccess: (data: {
    competitorId: string;
    projectId: string;
    confidence: 'high' | 'medium' | 'low';
    resolutionMethod: string;
    latencyMs: number;
    cacheHit: boolean;
    correlationId?: string;
  }) => {
    projectResolutionMetrics.recordSuccess({
      ...data,
      requestSource: 'api'
    });
  },
  
  /**
   * Record successful migration-based project resolution
   */
  recordMigrationSuccess: (data: {
    competitorId: string;
    projectId: string;
    confidence: 'high' | 'medium' | 'low';
    resolutionMethod: string;
    latencyMs: number;
    correlationId?: string;
  }) => {
    projectResolutionMetrics.recordSuccess({
      ...data,
      cacheHit: false, // Migrations typically don't use cache
      requestSource: 'migration'
    });
  },
  
  /**
   * Record API-based project resolution failure
   */
  recordApiFailure: (data: {
    competitorId: string;
    errorType: 'no_projects_found' | 'multiple_projects_ambiguous' | 'database_error' | 'validation_error';
    errorMessage: string;
    latencyMs: number;
    cacheHit: boolean;
    correlationId?: string;
  }) => {
    projectResolutionMetrics.recordFailure({
      ...data,
      requestSource: 'api'
    });
  },
  
  /**
   * Get current metrics summary
   */
  getCurrentSummary: () => {
    return projectResolutionMetrics.getCurrentMetricsAggregation();
  },
  
  /**
   * Generate metrics report for monitoring dashboards
   */
  getMetricsReport: (period: 'hourly' | 'daily' | 'weekly' | 'monthly' = 'daily') => {
    return projectResolutionMetrics.generateMetricsReport(period);
  }
}; 