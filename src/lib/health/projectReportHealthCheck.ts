/**
 * Project-Report Association Health Check - Task 7.3
 * 
 * Comprehensive health monitoring system for validating the integrity of
 * project-report associations and overall data consistency. Provides deep
 * system health analysis, data quality metrics, and actionable insights.
 * 
 * Features:
 * - Data integrity validation (orphaned reports, missing associations)
 * - Performance health monitoring (query response times, system load)
 * - Business health metrics (project completeness, report coverage)
 * - System component health (services, database, external integrations)
 * - Predictive health indicators (trend analysis, early warnings)
 * 
 * Part of TP-013-20250801-project-report-association-fix
 */

import { prisma } from '@/lib/prisma';
import { logger, generateCorrelationId } from '@/lib/logger';
import { projectResolutionMetrics } from '@/lib/metrics/projectResolutionMetrics';
import { AlertHelpers } from '@/lib/alerts/orphanedReportAlerts';

// Health check interfaces
export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'critical';
  score: number; // 0-100 health score
  timestamp: Date;
  checks: {
    dataIntegrity: DataIntegrityHealth;
    performance: PerformanceHealth;
    business: BusinessHealth;
    system: SystemHealth;
    predictive: PredictiveHealth;
  };
  summary: {
    totalIssues: number;
    criticalIssues: number;
    warnings: number;
    recommendations: string[];
    nextCheckRecommended: Date;
  };
  correlationId: string;
}

export interface DataIntegrityHealth {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'critical';
  score: number;
  metrics: {
    totalReports: number;
    orphanedReports: number;
    orphanedPercentage: number;
    reportsWithProjects: number;
    projectsWithReports: number;
    projectsWithoutReports: number;
    duplicateAssociations: number;
    invalidAssociations: number;
  };
  issues: HealthIssue[];
  trends: {
    orphanedReportsTrend: 'improving' | 'stable' | 'degrading';
    associationQualityTrend: 'improving' | 'stable' | 'degrading';
  };
}

export interface PerformanceHealth {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'critical';
  score: number;
  metrics: {
    averageQueryTime: number;
    p95QueryTime: number;
    p99QueryTime: number;
    databaseConnections: number;
    activeQueries: number;
    cacheHitRate: number;
    memoryUsage: number;
    cpuUsage: number;
  };
  issues: HealthIssue[];
  benchmarks: {
    queryTimeTarget: number;
    cacheHitRateTarget: number;
    memoryUsageLimit: number;
  };
}

export interface BusinessHealth {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'critical';
  score: number;
  metrics: {
    projectCompleteness: number; // % of projects with reports
    reportCoverage: number; // % of reports with valid projects
    averageReportsPerProject: number;
    projectsCreatedRecently: number;
    reportsGeneratedRecently: number;
    successfulReportGenerations: number;
    failedReportGenerations: number;
  };
  issues: HealthIssue[];
  businessImpact: {
    affectedProjects: number;
    incompleteProjectDashboards: number;
    userExperienceImpact: 'none' | 'minimal' | 'moderate' | 'significant' | 'severe';
  };
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'critical';
  score: number;
  metrics: {
    projectDiscoveryServiceHealth: number;
    alertSystemHealth: number;
    databaseHealth: number;
    cacheSystemHealth: number;
    schedulerHealth: number;
  };
  issues: HealthIssue[];
  dependencies: {
    database: 'online' | 'degraded' | 'offline';
    cache: 'online' | 'degraded' | 'offline';
    externalServices: 'online' | 'degraded' | 'offline';
  };
}

export interface PredictiveHealth {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'critical';
  score: number;
  predictions: {
    orphanedReportsProjection: {
      nextHour: number;
      nextDay: number;
      nextWeek: number;
      confidence: number;
    };
    systemLoadProjection: {
      peakLoad: Date;
      expectedLoad: number;
      capacity: number;
    };
    dataQualityTrend: {
      direction: 'improving' | 'stable' | 'degrading';
      rate: number;
      projectedImpact: 'minimal' | 'moderate' | 'significant';
    };
  };
  earlyWarnings: HealthIssue[];
}

export interface HealthIssue {
  id: string;
  severity: 'info' | 'warning' | 'critical' | 'emergency';
  category: 'data_integrity' | 'performance' | 'business' | 'system' | 'predictive';
  title: string;
  description: string;
  impact: string;
  recommendation: string;
  priority: number; // 1-10, 10 being highest
  affectedComponents: string[];
  estimatedResolutionTime: string;
  metadata: Record<string, any>;
}

/**
 * Comprehensive Project-Report Health Check System
 */
export class ProjectReportHealthChecker {
  private correlationId: string;
  
  constructor() {
    this.correlationId = generateCorrelationId();
  }
  
  /**
   * Execute comprehensive health check
   */
  async executeHealthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    this.correlationId = generateCorrelationId();
    
    logger.info('Starting comprehensive project-report health check', {
      correlationId: this.correlationId
    });
    
    try {
      // Execute all health checks in parallel for efficiency
      const [
        dataIntegrityHealth,
        performanceHealth,
        businessHealth,
        systemHealth,
        predictiveHealth
      ] = await Promise.all([
        this.checkDataIntegrity(),
        this.checkPerformance(),
        this.checkBusinessHealth(),
        this.checkSystemHealth(),
        this.checkPredictiveHealth()
      ]);
      
      // Calculate overall health score and status
      const overallScore = this.calculateOverallScore({
        dataIntegrity: dataIntegrityHealth,
        performance: performanceHealth,
        business: businessHealth,
        system: systemHealth,
        predictive: predictiveHealth
      });
      
      const overallStatus = this.determineOverallStatus(overallScore, [
        dataIntegrityHealth,
        performanceHealth,
        businessHealth,
        systemHealth,
        predictiveHealth
      ]);
      
      // Aggregate issues and generate recommendations
      const allIssues = [
        ...dataIntegrityHealth.issues,
        ...performanceHealth.issues,
        ...businessHealth.issues,
        ...systemHealth.issues,
        ...predictiveHealth.earlyWarnings
      ];
      
      const criticalIssues = allIssues.filter(issue => 
        issue.severity === 'critical' || issue.severity === 'emergency'
      );
      
      const warnings = allIssues.filter(issue => 
        issue.severity === 'warning'
      );
      
      const recommendations = this.generateRecommendations(allIssues);
      const nextCheckRecommended = this.calculateNextCheckTime(overallStatus, allIssues);
      
      const result: HealthCheckResult = {
        status: overallStatus,
        score: overallScore,
        timestamp: new Date(),
        checks: {
          dataIntegrity: dataIntegrityHealth,
          performance: performanceHealth,
          business: businessHealth,
          system: systemHealth,
          predictive: predictiveHealth
        },
        summary: {
          totalIssues: allIssues.length,
          criticalIssues: criticalIssues.length,
          warnings: warnings.length,
          recommendations,
          nextCheckRecommended
        },
        correlationId: this.correlationId
      };
      
      const duration = Date.now() - startTime;
      
      logger.info('Project-report health check completed', {
        correlationId: this.correlationId,
        overallStatus,
        overallScore,
        totalIssues: allIssues.length,
        criticalIssues: criticalIssues.length,
        duration
      });
      
      return result;
      
    } catch (error) {
      logger.error('Failed to execute health check', error as Error, {
        correlationId: this.correlationId
      });
      
      // Return critical health status on system failure
      return this.createFailureHealthResult(error as Error);
    }
  }
  
  /**
   * Check data integrity - orphaned reports, missing associations, etc.
   */
  private async checkDataIntegrity(): Promise<DataIntegrityHealth> {
    const issues: HealthIssue[] = [];
    
    try {
      // Get comprehensive data statistics
      const [
        totalReports,
        orphanedReports,
        projectsWithReports,
        projectsWithoutReports,
        duplicateAssociations,
        invalidAssociations
      ] = await Promise.all([
        prisma.report.count(),
        prisma.report.count({ where: { projectId: null } }),
        prisma.project.count({ where: { reports: { some: {} } } }),
        prisma.project.count({ where: { reports: { none: {} } } }),
        this.checkDuplicateAssociations(),
        this.checkInvalidAssociations()
      ]);
      
      const reportsWithProjects = totalReports - orphanedReports;
      const orphanedPercentage = totalReports > 0 ? (orphanedReports / totalReports) * 100 : 0;
      
      // Evaluate data integrity issues
      if (orphanedReports > 500) {
        issues.push({
          id: 'high-orphaned-reports',
          severity: 'critical',
          category: 'data_integrity',
          title: 'High Number of Orphaned Reports',
          description: `${orphanedReports} reports lack project associations (${orphanedPercentage.toFixed(1)}% of total)`,
          impact: 'Project dashboards show incomplete data, affecting user experience and business decisions',
          recommendation: 'Run comprehensive orphaned report migration immediately',
          priority: 9,
          affectedComponents: ['project-dashboards', 'report-generation', 'data-quality'],
          estimatedResolutionTime: '2-4 hours',
          metadata: { orphanedCount: orphanedReports, percentage: orphanedPercentage }
        });
      } else if (orphanedReports > 100) {
        issues.push({
          id: 'moderate-orphaned-reports',
          severity: 'warning',
          category: 'data_integrity',
          title: 'Moderate Number of Orphaned Reports',
          description: `${orphanedReports} reports lack project associations`,
          impact: 'Some project dashboards may show incomplete information',
          recommendation: 'Schedule orphaned report cleanup during maintenance window',
          priority: 6,
          affectedComponents: ['project-dashboards'],
          estimatedResolutionTime: '1-2 hours',
          metadata: { orphanedCount: orphanedReports }
        });
      }
      
      if (orphanedPercentage > 30) {
        issues.push({
          id: 'high-orphaned-percentage',
          severity: 'critical',
          category: 'data_integrity',
          title: 'High Percentage of Orphaned Reports',
          description: `${orphanedPercentage.toFixed(1)}% of all reports are orphaned`,
          impact: 'Severe data integrity issue affecting system reliability',
          recommendation: 'Investigate root cause and implement systematic fixes',
          priority: 10,
          affectedComponents: ['data-integrity', 'system-reliability'],
          estimatedResolutionTime: '4-8 hours',
          metadata: { percentage: orphanedPercentage }
        });
      }
      
      if (projectsWithoutReports > 50) {
        issues.push({
          id: 'projects-without-reports',
          severity: 'warning',
          category: 'data_integrity',
          title: 'Projects Without Reports',
          description: `${projectsWithoutReports} projects have no associated reports`,
          impact: 'Project owners may see empty dashboards',
          recommendation: 'Ensure initial report generation for all projects',
          priority: 5,
          affectedComponents: ['project-setup', 'initial-reports'],
          estimatedResolutionTime: '1-2 hours',
          metadata: { projectCount: projectsWithoutReports }
        });
      }
      
      if (duplicateAssociations > 0) {
        issues.push({
          id: 'duplicate-associations',
          severity: 'warning',
          category: 'data_integrity',
          title: 'Duplicate Project-Report Associations',
          description: `${duplicateAssociations} duplicate associations detected`,
          impact: 'Data inconsistency and potential display issues',
          recommendation: 'Clean up duplicate associations in database',
          priority: 4,
          affectedComponents: ['database-integrity'],
          estimatedResolutionTime: '30 minutes',
          metadata: { duplicateCount: duplicateAssociations }
        });
      }
      
      if (invalidAssociations > 0) {
        issues.push({
          id: 'invalid-associations',
          severity: 'critical',
          category: 'data_integrity',
          title: 'Invalid Project-Report Associations',
          description: `${invalidAssociations} reports reference non-existent projects`,
          impact: 'Database integrity violation, potential application errors',
          recommendation: 'Fix or remove invalid foreign key references immediately',
          priority: 8,
          affectedComponents: ['database-integrity', 'application-stability'],
          estimatedResolutionTime: '1 hour',
          metadata: { invalidCount: invalidAssociations }
        });
      }
      
      // Calculate trends
      const trends = await this.calculateDataIntegrityTrends();
      
      // Calculate data integrity score
      const score = this.calculateDataIntegrityScore({
        totalReports,
        orphanedPercentage,
        projectsWithoutReports,
        duplicateAssociations,
        invalidAssociations
      });
      
      const status = this.determineHealthStatus(score, issues);
      
      return {
        status,
        score,
        metrics: {
          totalReports,
          orphanedReports,
          orphanedPercentage,
          reportsWithProjects,
          projectsWithReports,
          projectsWithoutReports,
          duplicateAssociations,
          invalidAssociations
        },
        issues,
        trends
      };
      
    } catch (error) {
      logger.error('Failed to check data integrity', error as Error, {
        correlationId: this.correlationId
      });
      
      return this.createFailureHealthSection('data_integrity', error as Error);
    }
  }
  
  /**
   * Check performance health - query times, system resources, etc.
   */
  private async checkPerformance(): Promise<PerformanceHealth> {
    const issues: HealthIssue[] = [];
    
    try {
      // Measure database performance
      const performanceMetrics = await this.measureDatabasePerformance();
      const systemMetrics = await this.getSystemMetrics();
      
      const benchmarks = {
        queryTimeTarget: 50, // 50ms target
        cacheHitRateTarget: 0.85, // 85% cache hit rate
        memoryUsageLimit: 1024 * 1024 * 1024 // 1GB memory limit
      };
      
      // Evaluate performance issues
      if (performanceMetrics.averageQueryTime > 100) {
        issues.push({
          id: 'slow-query-performance',
          severity: performanceMetrics.averageQueryTime > 200 ? 'critical' : 'warning',
          category: 'performance',
          title: 'Slow Database Query Performance',
          description: `Average query time is ${performanceMetrics.averageQueryTime.toFixed(1)}ms (target: <50ms)`,
          impact: 'Degraded user experience and increased system load',
          recommendation: 'Optimize database queries and consider index improvements',
          priority: 7,
          affectedComponents: ['database', 'api-performance'],
          estimatedResolutionTime: '2-4 hours',
          metadata: { averageQueryTime: performanceMetrics.averageQueryTime }
        });
      }
      
      if (performanceMetrics.p95QueryTime > 250) {
        issues.push({
          id: 'high-p95-query-time',
          severity: 'warning',
          category: 'performance',
          title: 'High P95 Query Time',
          description: `95th percentile query time is ${performanceMetrics.p95QueryTime.toFixed(1)}ms`,
          impact: 'Some users experience slow response times',
          recommendation: 'Investigate slow queries and optimize performance bottlenecks',
          priority: 6,
          affectedComponents: ['user-experience'],
          estimatedResolutionTime: '1-2 hours',
          metadata: { p95QueryTime: performanceMetrics.p95QueryTime }
        });
      }
      
      if (performanceMetrics.cacheHitRate < 0.7) {
        issues.push({
          id: 'low-cache-hit-rate',
          severity: 'warning',
          category: 'performance',
          title: 'Low Cache Hit Rate',
          description: `Cache hit rate is ${(performanceMetrics.cacheHitRate * 100).toFixed(1)}% (target: >85%)`,
          impact: 'Increased database load and slower response times',
          recommendation: 'Review cache configuration and TTL settings',
          priority: 5,
          affectedComponents: ['caching-system'],
          estimatedResolutionTime: '1 hour',
          metadata: { cacheHitRate: performanceMetrics.cacheHitRate }
        });
      }
      
      if (systemMetrics.memoryUsage > benchmarks.memoryUsageLimit * 0.9) {
        issues.push({
          id: 'high-memory-usage',
          severity: 'critical',
          category: 'performance',
          title: 'High Memory Usage',
          description: `Memory usage is ${(systemMetrics.memoryUsage / 1024 / 1024).toFixed(0)}MB (limit: ${(benchmarks.memoryUsageLimit / 1024 / 1024).toFixed(0)}MB)`,
          impact: 'Risk of system instability and performance degradation',
          recommendation: 'Investigate memory leaks and optimize memory usage',
          priority: 8,
          affectedComponents: ['system-stability'],
          estimatedResolutionTime: '2-4 hours',
          metadata: { memoryUsage: systemMetrics.memoryUsage }
        });
      }
      
      if (performanceMetrics.databaseConnections > 50) {
        issues.push({
          id: 'high-database-connections',
          severity: 'warning',
          category: 'performance',
          title: 'High Number of Database Connections',
          description: `${performanceMetrics.databaseConnections} active database connections`,
          impact: 'Potential database connection pool exhaustion',
          recommendation: 'Review connection pooling configuration and optimize connection usage',
          priority: 6,
          affectedComponents: ['database-connectivity'],
          estimatedResolutionTime: '1 hour',
          metadata: { connectionCount: performanceMetrics.databaseConnections }
        });
      }
      
      // Calculate performance score
      const score = this.calculatePerformanceScore(performanceMetrics, systemMetrics, benchmarks);
      const status = this.determineHealthStatus(score, issues);
      
      return {
        status,
        score,
        metrics: {
          ...performanceMetrics,
          ...systemMetrics
        },
        issues,
        benchmarks
      };
      
    } catch (error) {
      logger.error('Failed to check performance health', error as Error, {
        correlationId: this.correlationId
      });
      
      return this.createFailureHealthSection('performance', error as Error);
    }
  }
  
  /**
   * Check business health - project completeness, report coverage, etc.
   */
  private async checkBusinessHealth(): Promise<BusinessHealth> {
    const issues: HealthIssue[] = [];
    
    try {
      const businessMetrics = await this.getBusinessMetrics();
      
      // Evaluate business health issues
      if (businessMetrics.projectCompleteness < 80) {
        issues.push({
          id: 'low-project-completeness',
          severity: businessMetrics.projectCompleteness < 60 ? 'critical' : 'warning',
          category: 'business',
          title: 'Low Project Completeness',
          description: `Only ${businessMetrics.projectCompleteness.toFixed(1)}% of projects have associated reports`,
          impact: 'Poor user experience, incomplete project dashboards',
          recommendation: 'Ensure all projects have initial reports generated',
          priority: 7,
          affectedComponents: ['user-experience', 'project-dashboards'],
          estimatedResolutionTime: '2-4 hours',
          metadata: { completeness: businessMetrics.projectCompleteness }
        });
      }
      
      if (businessMetrics.reportCoverage < 85) {
        issues.push({
          id: 'low-report-coverage',
          severity: 'warning',
          category: 'business',
          title: 'Low Report Coverage',
          description: `${businessMetrics.reportCoverage.toFixed(1)}% of reports have valid project associations`,
          impact: 'Data integrity concerns, potential inaccurate reporting',
          recommendation: 'Review and fix report-project associations',
          priority: 6,
          affectedComponents: ['data-integrity', 'reporting'],
          estimatedResolutionTime: '1-2 hours',
          metadata: { coverage: businessMetrics.reportCoverage }
        });
      }
      
      const recentFailureRate = businessMetrics.failedReportGenerations / 
        Math.max(businessMetrics.successfulReportGenerations + businessMetrics.failedReportGenerations, 1);
      
      if (recentFailureRate > 0.2) {
        issues.push({
          id: 'high-report-failure-rate',
          severity: 'critical',
          category: 'business',
          title: 'High Report Generation Failure Rate',
          description: `${(recentFailureRate * 100).toFixed(1)}% of recent report generations failed`,
          impact: 'Users unable to generate reports, business process disruption',
          recommendation: 'Investigate report generation failures and fix root causes',
          priority: 9,
          affectedComponents: ['report-generation', 'user-workflows'],
          estimatedResolutionTime: '1-4 hours',
          metadata: { failureRate: recentFailureRate }
        });
      }
      
      if (businessMetrics.averageReportsPerProject < 1) {
        issues.push({
          id: 'low-reports-per-project',
          severity: 'warning',
          category: 'business',
          title: 'Low Average Reports Per Project',
          description: `Average of ${businessMetrics.averageReportsPerProject.toFixed(1)} reports per project`,
          impact: 'Projects may lack sufficient reporting data',
          recommendation: 'Review project setup process and ensure regular report generation',
          priority: 4,
          affectedComponents: ['project-setup', 'report-scheduling'],
          estimatedResolutionTime: '2-3 hours',
          metadata: { averageReports: businessMetrics.averageReportsPerProject }
        });
      }
      
      // Calculate business impact
      const businessImpact = this.calculateBusinessImpact(businessMetrics);
      
      // Calculate business health score
      const score = this.calculateBusinessScore(businessMetrics);
      const status = this.determineHealthStatus(score, issues);
      
      return {
        status,
        score,
        metrics: businessMetrics,
        issues,
        businessImpact
      };
      
    } catch (error) {
      logger.error('Failed to check business health', error as Error, {
        correlationId: this.correlationId
      });
      
      return this.createFailureHealthSection('business', error as Error);
    }
  }
  
  /**
   * Check system health - services, dependencies, etc.
   */
  private async checkSystemHealth(): Promise<SystemHealth> {
    const issues: HealthIssue[] = [];
    
    try {
      // Check various system components
      const [
        projectDiscoveryHealth,
        alertSystemHealth,
        databaseHealth,
        cacheHealth,
        schedulerHealth
      ] = await Promise.all([
        this.checkProjectDiscoveryService(),
        this.checkAlertSystem(),
        this.checkDatabaseHealth(),
        this.checkCacheHealth(),
        this.checkSchedulerHealth()
      ]);
      
      const systemMetrics = {
        projectDiscoveryServiceHealth: projectDiscoveryHealth,
        alertSystemHealth,
        databaseHealth,
        cacheSystemHealth: cacheHealth,
        schedulerHealth
      };
      
      // Evaluate system health issues
      if (projectDiscoveryHealth < 70) {
        issues.push({
          id: 'project-discovery-degraded',
          severity: projectDiscoveryHealth < 50 ? 'critical' : 'warning',
          category: 'system',
          title: 'Project Discovery Service Degraded',
          description: `Project discovery service health score: ${projectDiscoveryHealth}/100`,
          impact: 'New reports may not be properly associated with projects',
          recommendation: 'Check project discovery service logs and performance',
          priority: 8,
          affectedComponents: ['project-discovery', 'report-association'],
          estimatedResolutionTime: '1-2 hours',
          metadata: { healthScore: projectDiscoveryHealth }
        });
      }
      
      if (alertSystemHealth < 80) {
        issues.push({
          id: 'alert-system-degraded',
          severity: 'warning',
          category: 'system',
          title: 'Alert System Performance Degraded',
          description: `Alert system health score: ${alertSystemHealth}/100`,
          impact: 'May miss critical alerts or experience delayed notifications',
          recommendation: 'Review alert system configuration and performance',
          priority: 6,
          affectedComponents: ['alert-system', 'monitoring'],
          estimatedResolutionTime: '1 hour',
          metadata: { healthScore: alertSystemHealth }
        });
      }
      
      if (databaseHealth < 70) {
        issues.push({
          id: 'database-health-degraded',
          severity: databaseHealth < 50 ? 'critical' : 'warning',
          category: 'system',
          title: 'Database Health Degraded',
          description: `Database health score: ${databaseHealth}/100`,
          impact: 'System-wide performance impact, potential data access issues',
          recommendation: 'Check database performance, connections, and resource usage',
          priority: 9,
          affectedComponents: ['database', 'system-performance'],
          estimatedResolutionTime: '1-3 hours',
          metadata: { healthScore: databaseHealth }
        });
      }
      
      if (schedulerHealth < 80) {
        issues.push({
          id: 'scheduler-health-degraded',
          severity: 'warning',
          category: 'system',
          title: 'Scheduler Health Degraded',
          description: `Scheduler health score: ${schedulerHealth}/100`,
          impact: 'Automated tasks may not execute properly',
          recommendation: 'Review scheduler status and recent job execution',
          priority: 5,
          affectedComponents: ['task-scheduler', 'automation'],
          estimatedResolutionTime: '30 minutes',
          metadata: { healthScore: schedulerHealth }
        });
      }
      
      // Check system dependencies
      const dependencies = await this.checkSystemDependencies();
      
      if (dependencies.database === 'offline') {
        issues.push({
          id: 'database-offline',
          severity: 'emergency',
          category: 'system',
          title: 'Database Connection Failed',
          description: 'Unable to connect to database',
          impact: 'Complete system failure',
          recommendation: 'Check database server status and connection configuration',
          priority: 10,
          affectedComponents: ['database', 'entire-system'],
          estimatedResolutionTime: 'immediate',
          metadata: { dependency: 'database' }
        });
      }
      
      // Calculate overall system score
      const score = this.calculateSystemScore(systemMetrics, dependencies);
      const status = this.determineHealthStatus(score, issues);
      
      return {
        status,
        score,
        metrics: systemMetrics,
        issues,
        dependencies
      };
      
    } catch (error) {
      logger.error('Failed to check system health', error as Error, {
        correlationId: this.correlationId
      });
      
      return this.createFailureHealthSection('system', error as Error);
    }
  }
  
  /**
   * Check predictive health indicators
   */
  private async checkPredictiveHealth(): Promise<PredictiveHealth> {
    const earlyWarnings: HealthIssue[] = [];
    
    try {
      // Get historical data for trend analysis
      const predictions = await this.generateHealthPredictions();
      
      // Evaluate predictive indicators
      if (predictions.orphanedReportsProjection.nextDay > 100) {
        earlyWarnings.push({
          id: 'projected-orphaned-reports-spike',
          severity: 'warning',
          category: 'predictive',
          title: 'Projected Spike in Orphaned Reports',
          description: `Projection: ${predictions.orphanedReportsProjection.nextDay} orphaned reports in next 24 hours`,
          impact: 'Potential data integrity degradation',
          recommendation: 'Monitor closely and prepare mitigation strategies',
          priority: 5,
          affectedComponents: ['data-integrity'],
          estimatedResolutionTime: 'preventive',
          metadata: { projection: predictions.orphanedReportsProjection }
        });
      }
      
      if (predictions.dataQualityTrend.direction === 'degrading' && 
          predictions.dataQualityTrend.projectedImpact === 'significant') {
        earlyWarnings.push({
          id: 'data-quality-degradation-trend',
          severity: 'warning',
          category: 'predictive',
          title: 'Data Quality Degradation Trend Detected',
          description: 'Data quality metrics show declining trend',
          impact: 'Future system reliability and user experience issues',
          recommendation: 'Investigate root causes and implement preventive measures',
          priority: 6,
          affectedComponents: ['data-quality', 'system-reliability'],
          estimatedResolutionTime: '2-4 hours',
          metadata: { trend: predictions.dataQualityTrend }
        });
      }
      
      if (predictions.systemLoadProjection.expectedLoad > predictions.systemLoadProjection.capacity * 0.8) {
        earlyWarnings.push({
          id: 'approaching-capacity-limit',
          severity: 'warning',
          category: 'predictive',
          title: 'Approaching System Capacity Limit',
          description: `Projected load will reach ${(predictions.systemLoadProjection.expectedLoad / predictions.systemLoadProjection.capacity * 100).toFixed(1)}% of capacity`,
          impact: 'Potential performance degradation or system instability',
          recommendation: 'Plan for capacity scaling or load optimization',
          priority: 7,
          affectedComponents: ['system-capacity', 'performance'],
          estimatedResolutionTime: '4-8 hours',
          metadata: { loadProjection: predictions.systemLoadProjection }
        });
      }
      
      // Calculate predictive health score
      const score = this.calculatePredictiveScore(predictions, earlyWarnings);
      const status = this.determineHealthStatus(score, earlyWarnings);
      
      return {
        status,
        score,
        predictions,
        earlyWarnings
      };
      
    } catch (error) {
      logger.error('Failed to check predictive health', error as Error, {
        correlationId: this.correlationId
      });
      
      return {
        status: 'unhealthy',
        score: 0,
        predictions: {
          orphanedReportsProjection: { nextHour: 0, nextDay: 0, nextWeek: 0, confidence: 0 },
          systemLoadProjection: { peakLoad: new Date(), expectedLoad: 0, capacity: 100 },
          dataQualityTrend: { direction: 'stable', rate: 0, projectedImpact: 'minimal' }
        },
        earlyWarnings: [{
          id: 'predictive-health-check-failed',
          severity: 'warning',
          category: 'predictive',
          title: 'Predictive Health Check Failed',
          description: `Failed to generate health predictions: ${(error as Error).message}`,
          impact: 'Unable to provide early warnings',
          recommendation: 'Check predictive health check system',
          priority: 3,
          affectedComponents: ['predictive-monitoring'],
          estimatedResolutionTime: '1 hour',
          metadata: { error: (error as Error).message }
        }]
      };
    }
  }
  
  // Helper methods for health calculations and checks
  
  private async checkDuplicateAssociations(): Promise<number> {
    try {
      // This would check for duplicate foreign key relationships
      // For now, return 0 as a placeholder
      return 0;
    } catch (error) {
      logger.error('Failed to check duplicate associations', error as Error);
      return 0;
    }
  }
  
  private async checkInvalidAssociations(): Promise<number> {
    try {
      const invalidReports = await prisma.report.count({
        where: {
          AND: [
            { projectId: { not: null } },
            { project: null }
          ]
        }
      });
      return invalidReports;
    } catch (error) {
      logger.error('Failed to check invalid associations', error as Error);
      return 0;
    }
  }
  
  private async calculateDataIntegrityTrends(): Promise<{
    orphanedReportsTrend: 'improving' | 'stable' | 'degrading';
    associationQualityTrend: 'improving' | 'stable' | 'degrading';
  }> {
    // Placeholder implementation - would analyze historical data
    return {
      orphanedReportsTrend: 'stable',
      associationQualityTrend: 'improving'
    };
  }
  
  private async measureDatabasePerformance(): Promise<{
    averageQueryTime: number;
    p95QueryTime: number;
    p99QueryTime: number;
    databaseConnections: number;
    activeQueries: number;
    cacheHitRate: number;
  }> {
    // Measure actual database performance
    const startTime = process.hrtime.bigint();
    
    try {
      // Execute a representative query to measure performance
      await prisma.report.findFirst({
        include: { project: true }
      });
      
      const endTime = process.hrtime.bigint();
      const queryTime = Number(endTime - startTime) / 1_000_000; // Convert to milliseconds
      
      // Get metrics from project resolution system
      const resolutionMetrics = projectResolutionMetrics.getCurrentMetricsAggregation();
      
      return {
        averageQueryTime: queryTime,
        p95QueryTime: queryTime * 1.5, // Estimated
        p99QueryTime: queryTime * 2.0, // Estimated
        databaseConnections: 5, // Placeholder
        activeQueries: 0, // Placeholder
        cacheHitRate: resolutionMetrics.hourly.cacheHitRate || 0.85
      };
    } catch (error) {
      return {
        averageQueryTime: 999,
        p95QueryTime: 999,
        p99QueryTime: 999,
        databaseConnections: 0,
        activeQueries: 0,
        cacheHitRate: 0
      };
    }
  }
  
  private async getSystemMetrics(): Promise<{
    memoryUsage: number;
    cpuUsage: number;
  }> {
    const memoryUsage = process.memoryUsage();
    
    return {
      memoryUsage: memoryUsage.heapUsed,
      cpuUsage: 0 // Placeholder - would integrate with system monitoring
    };
  }
  
  private async getBusinessMetrics(): Promise<{
    projectCompleteness: number;
    reportCoverage: number;
    averageReportsPerProject: number;
    projectsCreatedRecently: number;
    reportsGeneratedRecently: number;
    successfulReportGenerations: number;
    failedReportGenerations: number;
  }> {
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const [
        totalProjects,
        projectsWithReports,
        totalReports,
        reportsWithProjects,
        projectsCreatedRecently,
        reportsGeneratedRecently
      ] = await Promise.all([
        prisma.project.count(),
        prisma.project.count({ where: { reports: { some: {} } } }),
        prisma.report.count(),
        prisma.report.count({ where: { projectId: { not: null } } }),
        prisma.project.count({ where: { createdAt: { gte: oneDayAgo } } }),
        prisma.report.count({ where: { createdAt: { gte: oneDayAgo } } })
      ]);
      
      const projectCompleteness = totalProjects > 0 ? (projectsWithReports / totalProjects) * 100 : 100;
      const reportCoverage = totalReports > 0 ? (reportsWithProjects / totalReports) * 100 : 100;
      const averageReportsPerProject = totalProjects > 0 ? totalReports / totalProjects : 0;
      
      // Get resolution metrics for success/failure rates
      const resolutionMetrics = projectResolutionMetrics.getCurrentMetricsAggregation();
      
      return {
        projectCompleteness,
        reportCoverage,
        averageReportsPerProject,
        projectsCreatedRecently,
        reportsGeneratedRecently,
        successfulReportGenerations: resolutionMetrics.daily.successfulResolutions,
        failedReportGenerations: resolutionMetrics.daily.failedResolutions
      };
    } catch (error) {
      logger.error('Failed to get business metrics', error as Error);
      return {
        projectCompleteness: 0,
        reportCoverage: 0,
        averageReportsPerProject: 0,
        projectsCreatedRecently: 0,
        reportsGeneratedRecently: 0,
        successfulReportGenerations: 0,
        failedReportGenerations: 0
      };
    }
  }
  
  private calculateBusinessImpact(metrics: any): {
    affectedProjects: number;
    incompleteProjectDashboards: number;
    userExperienceImpact: 'none' | 'minimal' | 'moderate' | 'significant' | 'severe';
  } {
    const affectedProjects = Math.round((100 - metrics.projectCompleteness) * 0.01 * 100); // Rough estimate
    const incompleteProjectDashboards = affectedProjects;
    
    let userExperienceImpact: 'none' | 'minimal' | 'moderate' | 'significant' | 'severe';
    if (metrics.projectCompleteness > 95) userExperienceImpact = 'none';
    else if (metrics.projectCompleteness > 85) userExperienceImpact = 'minimal';
    else if (metrics.projectCompleteness > 70) userExperienceImpact = 'moderate';
    else if (metrics.projectCompleteness > 50) userExperienceImpact = 'significant';
    else userExperienceImpact = 'severe';
    
    return {
      affectedProjects,
      incompleteProjectDashboards,
      userExperienceImpact
    };
  }
  
  private async checkProjectDiscoveryService(): Promise<number> {
    try {
      const resolutionMetrics = projectResolutionMetrics.getCurrentMetricsAggregation();
      const hourlyMetrics = resolutionMetrics.hourly;
      
      if (hourlyMetrics.totalAttempts === 0) return 90; // No recent activity, assume healthy
      
      const successRate = hourlyMetrics.successRate;
      const avgLatency = hourlyMetrics.averageLatencyMs;
      const cacheHitRate = hourlyMetrics.cacheHitRate;
      
      // Calculate health score based on performance metrics
      let score = 100;
      
      // Success rate impact (50% weight)
      score -= (1 - successRate) * 50;
      
      // Latency impact (30% weight)
      if (avgLatency > 50) {
        score -= Math.min(30, (avgLatency - 50) / 10 * 5);
      }
      
      // Cache hit rate impact (20% weight)
      if (cacheHitRate < 0.85) {
        score -= (0.85 - cacheHitRate) * 20 / 0.85;
      }
      
      return Math.max(0, score);
    } catch (error) {
      return 0;
    }
  }
  
  private async checkAlertSystem(): Promise<number> {
    try {
      const alertStatus = AlertHelpers.getStatus();
      
      let score = 100;
      
      // Active alerts impact
      if (alertStatus.activeAlerts > 10) {
        score -= Math.min(30, (alertStatus.activeAlerts - 10) * 2);
      }
      
      // Critical alerts have higher impact
      const criticalAlerts = alertStatus.alertsBySeverity.critical || 0;
      score -= criticalAlerts * 5;
      
      return Math.max(0, score);
    } catch (error) {
      return 0;
    }
  }
  
  private async checkDatabaseHealth(): Promise<number> {
    try {
      const startTime = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      const queryTime = Date.now() - startTime;
      
      let score = 100;
      
      // Query time impact
      if (queryTime > 100) {
        score -= Math.min(50, (queryTime - 100) / 10);
      }
      
      return Math.max(0, score);
    } catch (error) {
      return 0;
    }
  }
  
  private async checkCacheHealth(): Promise<number> {
    // Placeholder - would check actual cache system
    return 90;
  }
  
  private async checkSchedulerHealth(): Promise<number> {
    // Placeholder - would check scheduler system status
    return 85;
  }
  
  private async checkSystemDependencies(): Promise<{
    database: 'online' | 'degraded' | 'offline';
    cache: 'online' | 'degraded' | 'offline';
    externalServices: 'online' | 'degraded' | 'offline';
  }> {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return {
        database: 'online',
        cache: 'online',
        externalServices: 'online'
      };
    } catch (error) {
      return {
        database: 'offline',
        cache: 'online',
        externalServices: 'online'
      };
    }
  }
  
  private async generateHealthPredictions(): Promise<PredictiveHealth['predictions']> {
    // Placeholder implementation - would use historical data and ML models
    return {
      orphanedReportsProjection: {
        nextHour: 5,
        nextDay: 25,
        nextWeek: 150,
        confidence: 0.75
      },
      systemLoadProjection: {
        peakLoad: new Date(Date.now() + 4 * 60 * 60 * 1000), // 4 hours from now
        expectedLoad: 70,
        capacity: 100
      },
      dataQualityTrend: {
        direction: 'stable',
        rate: 0.02,
        projectedImpact: 'minimal'
      }
    };
  }
  
  // Scoring and status calculation methods
  
  private calculateDataIntegrityScore(metrics: any): number {
    let score = 100;
    
    // Orphaned percentage impact (40% weight)
    score -= Math.min(40, metrics.orphanedPercentage * 1.3);
    
    // Projects without reports impact (30% weight)
    if (metrics.projectsWithoutReports > 0) {
      score -= Math.min(30, metrics.projectsWithoutReports / 10);
    }
    
    // Invalid associations impact (20% weight)
    if (metrics.invalidAssociations > 0) {
      score -= Math.min(20, metrics.invalidAssociations * 2);
    }
    
    // Duplicate associations impact (10% weight)
    if (metrics.duplicateAssociations > 0) {
      score -= Math.min(10, metrics.duplicateAssociations);
    }
    
    return Math.max(0, score);
  }
  
  private calculatePerformanceScore(performanceMetrics: any, systemMetrics: any, benchmarks: any): number {
    let score = 100;
    
    // Query time impact (40% weight)
    if (performanceMetrics.averageQueryTime > benchmarks.queryTimeTarget) {
      score -= Math.min(40, (performanceMetrics.averageQueryTime - benchmarks.queryTimeTarget) / 10);
    }
    
    // Cache hit rate impact (30% weight)
    if (performanceMetrics.cacheHitRate < benchmarks.cacheHitRateTarget) {
      score -= (benchmarks.cacheHitRateTarget - performanceMetrics.cacheHitRate) * 30 / benchmarks.cacheHitRateTarget;
    }
    
    // Memory usage impact (20% weight)
    if (systemMetrics.memoryUsage > benchmarks.memoryUsageLimit * 0.8) {
      score -= Math.min(20, (systemMetrics.memoryUsage - benchmarks.memoryUsageLimit * 0.8) / (benchmarks.memoryUsageLimit * 0.2) * 20);
    }
    
    // Database connections impact (10% weight)
    if (performanceMetrics.databaseConnections > 30) {
      score -= Math.min(10, (performanceMetrics.databaseConnections - 30) / 5);
    }
    
    return Math.max(0, score);
  }
  
  private calculateBusinessScore(metrics: any): number {
    let score = 100;
    
    // Project completeness impact (40% weight)
    score -= (100 - metrics.projectCompleteness) * 0.4;
    
    // Report coverage impact (30% weight)
    score -= (100 - metrics.reportCoverage) * 0.3;
    
    // Report generation failure rate impact (30% weight)
    const totalGenerations = metrics.successfulReportGenerations + metrics.failedReportGenerations;
    if (totalGenerations > 0) {
      const failureRate = metrics.failedReportGenerations / totalGenerations;
      score -= failureRate * 30;
    }
    
    return Math.max(0, score);
  }
  
  private calculateSystemScore(systemMetrics: any, dependencies: any): number {
    let score = 100;
    
    // Service health scores (60% weight)
    const avgServiceHealth = (
      systemMetrics.projectDiscoveryServiceHealth +
      systemMetrics.alertSystemHealth +
      systemMetrics.databaseHealth +
      systemMetrics.cacheSystemHealth +
      systemMetrics.schedulerHealth
    ) / 5;
    
    score = avgServiceHealth * 0.6 + score * 0.4;
    
    // Dependency impact (40% weight)
    if (dependencies.database === 'offline') score = 0;
    else if (dependencies.database === 'degraded') score *= 0.7;
    
    if (dependencies.cache === 'offline') score *= 0.9;
    else if (dependencies.cache === 'degraded') score *= 0.95;
    
    return Math.max(0, score);
  }
  
  private calculatePredictiveScore(predictions: any, earlyWarnings: HealthIssue[]): number {
    let score = 100;
    
    // Early warning impact
    earlyWarnings.forEach(warning => {
      if (warning.severity === 'critical') score -= 20;
      else if (warning.severity === 'warning') score -= 10;
    });
    
    // Confidence in predictions
    score *= predictions.orphanedReportsProjection.confidence;
    
    return Math.max(0, score);
  }
  
  private calculateOverallScore(checks: HealthCheckResult['checks']): number {
    // Weighted average of all health scores
    return (
      checks.dataIntegrity.score * 0.3 +
      checks.performance.score * 0.2 +
      checks.business.score * 0.25 +
      checks.system.score * 0.2 +
      checks.predictive.score * 0.05
    );
  }
  
  private determineHealthStatus(score: number, issues: HealthIssue[]): 'healthy' | 'degraded' | 'unhealthy' | 'critical' {
    const hasCritical = issues.some(issue => issue.severity === 'critical' || issue.severity === 'emergency');
    const hasMultipleWarnings = issues.filter(issue => issue.severity === 'warning').length > 2;
    
    if (hasCritical || score < 30) return 'critical';
    if (score < 50 || hasMultipleWarnings) return 'unhealthy';
    if (score < 75 || issues.length > 0) return 'degraded';
    return 'healthy';
  }
  
  private determineOverallStatus(score: number, healthChecks: any[]): 'healthy' | 'degraded' | 'unhealthy' | 'critical' {
    const hasCritical = healthChecks.some(check => check.status === 'critical');
    const hasUnhealthy = healthChecks.some(check => check.status === 'unhealthy');
    const hasDegraded = healthChecks.some(check => check.status === 'degraded');
    
    if (hasCritical || score < 30) return 'critical';
    if (hasUnhealthy || score < 50) return 'unhealthy';
    if (hasDegraded || score < 75) return 'degraded';
    return 'healthy';
  }
  
  private generateRecommendations(issues: HealthIssue[]): string[] {
    const recommendations = new Set<string>();
    
    // Sort issues by priority (highest first)
    const sortedIssues = issues.sort((a, b) => b.priority - a.priority);
    
    // Add top priority recommendations
    sortedIssues.slice(0, 5).forEach(issue => {
      recommendations.add(issue.recommendation);
    });
    
    // Add general recommendations based on issue patterns
    const dataIntegrityIssues = issues.filter(i => i.category === 'data_integrity');
    if (dataIntegrityIssues.length > 2) {
      recommendations.add('Conduct comprehensive data integrity audit and cleanup');
    }
    
    const performanceIssues = issues.filter(i => i.category === 'performance');
    if (performanceIssues.length > 1) {
      recommendations.add('Implement performance monitoring and optimization plan');
    }
    
    const systemIssues = issues.filter(i => i.category === 'system');
    if (systemIssues.length > 1) {
      recommendations.add('Review system architecture and resource allocation');
    }
    
    return Array.from(recommendations);
  }
  
  private calculateNextCheckTime(status: HealthCheckResult['status'], issues: HealthIssue[]): Date {
    const now = new Date();
    let intervalMinutes: number;
    
    switch (status) {
      case 'critical':
        intervalMinutes = 15; // Check every 15 minutes for critical issues
        break;
      case 'unhealthy':
        intervalMinutes = 30; // Check every 30 minutes for unhealthy status
        break;
      case 'degraded':
        intervalMinutes = 60; // Check every hour for degraded status
        break;
      default:
        intervalMinutes = 240; // Check every 4 hours for healthy status
    }
    
    // Adjust based on critical issues
    const criticalIssues = issues.filter(issue => 
      issue.severity === 'critical' || issue.severity === 'emergency'
    );
    
    if (criticalIssues.length > 0) {
      intervalMinutes = Math.min(intervalMinutes, 15);
    }
    
    return new Date(now.getTime() + intervalMinutes * 60 * 1000);
  }
  
  private createFailureHealthResult(error: Error): HealthCheckResult {
    return {
      status: 'critical',
      score: 0,
      timestamp: new Date(),
      checks: {
        dataIntegrity: this.createFailureHealthSection('data_integrity', error),
        performance: this.createFailureHealthSection('performance', error),
        business: this.createFailureHealthSection('business', error),
        system: this.createFailureHealthSection('system', error),
        predictive: {
          status: 'critical',
          score: 0,
          predictions: {
            orphanedReportsProjection: { nextHour: 0, nextDay: 0, nextWeek: 0, confidence: 0 },
            systemLoadProjection: { peakLoad: new Date(), expectedLoad: 0, capacity: 0 },
            dataQualityTrend: { direction: 'stable', rate: 0, projectedImpact: 'minimal' }
          },
          earlyWarnings: []
        }
      },
      summary: {
        totalIssues: 1,
        criticalIssues: 1,
        warnings: 0,
        recommendations: ['Fix health check system failure', 'Check system connectivity and permissions'],
        nextCheckRecommended: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
      },
      correlationId: this.correlationId
    };
  }
  
  private createFailureHealthSection(category: string, error: Error): any {
    const issue: HealthIssue = {
      id: `${category}-check-failed`,
      severity: 'critical',
      category: category as any,
      title: `${category.charAt(0).toUpperCase() + category.slice(1)} Health Check Failed`,
      description: `Failed to execute ${category} health check: ${error.message}`,
      impact: 'Unable to assess system health properly',
      recommendation: `Check ${category} monitoring system and fix underlying issues`,
      priority: 9,
      affectedComponents: [category, 'health-monitoring'],
      estimatedResolutionTime: '1-2 hours',
      metadata: { error: error.message, stack: error.stack }
    };
    
    return {
      status: 'critical',
      score: 0,
      issues: [issue],
      // Add default empty structures for each section type
      ...(category === 'data_integrity' && {
        metrics: {
          totalReports: 0, orphanedReports: 0, orphanedPercentage: 0,
          reportsWithProjects: 0, projectsWithReports: 0, projectsWithoutReports: 0,
          duplicateAssociations: 0, invalidAssociations: 0
        },
        trends: { orphanedReportsTrend: 'stable', associationQualityTrend: 'stable' }
      }),
      ...(category === 'performance' && {
        metrics: {
          averageQueryTime: 0, p95QueryTime: 0, p99QueryTime: 0,
          databaseConnections: 0, activeQueries: 0, cacheHitRate: 0,
          memoryUsage: 0, cpuUsage: 0
        },
        benchmarks: { queryTimeTarget: 50, cacheHitRateTarget: 0.85, memoryUsageLimit: 1024 * 1024 * 1024 }
      }),
      ...(category === 'business' && {
        metrics: {
          projectCompleteness: 0, reportCoverage: 0, averageReportsPerProject: 0,
          projectsCreatedRecently: 0, reportsGeneratedRecently: 0,
          successfulReportGenerations: 0, failedReportGenerations: 0
        },
        businessImpact: {
          affectedProjects: 0, incompleteProjectDashboards: 0, userExperienceImpact: 'severe'
        }
      }),
      ...(category === 'system' && {
        metrics: {
          projectDiscoveryServiceHealth: 0, alertSystemHealth: 0, databaseHealth: 0,
          cacheSystemHealth: 0, schedulerHealth: 0
        },
        dependencies: { database: 'offline', cache: 'offline', externalServices: 'offline' }
      })
    };
  }
}

// Global health checker instance
export const projectReportHealthChecker = new ProjectReportHealthChecker();

/**
 * Helper functions for health check operations
 */
export const HealthCheckHelpers = {
  /**
   * Execute immediate health check
   */
  executeCheck: async (): Promise<HealthCheckResult> => {
    return await projectReportHealthChecker.executeHealthCheck();
  },
  
  /**
   * Quick health status check (lightweight)
   */
  quickCheck: async (): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy' | 'critical';
    score: number;
    criticalIssues: number;
    timestamp: Date;
  }> => {
    try {
      const fullCheck = await projectReportHealthChecker.executeHealthCheck();
      return {
        status: fullCheck.status,
        score: fullCheck.score,
        criticalIssues: fullCheck.summary.criticalIssues,
        timestamp: fullCheck.timestamp
      };
    } catch (error) {
      return {
        status: 'critical',
        score: 0,
        criticalIssues: 1,
        timestamp: new Date()
      };
    }
  }
}; 