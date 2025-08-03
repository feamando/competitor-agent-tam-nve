import prisma from '../prisma';
import { logger } from '../logger';
import { ReportValidationService } from '../reportValidation';
import { ZombieReportAlertService } from '../alerts/zombieReportAlerts';
import { SmartDataCollectionService } from '../../services/reports/smartDataCollectionService';
import { InitialComparativeReportService } from '../../services/reports/initialComparativeReportService';

/**
 * Report Generation Pipeline Health Check System
 * Task 5.4: Add health check for report generation pipeline integrity
 */
export class ReportPipelineHealthCheckService {
  
  // Health check thresholds
  private static readonly HEALTH_THRESHOLDS = {
    ZOMBIE_REPORT_MAX: 0,           // No zombie reports should exist
    RECENT_FAILURES_MAX: 5,         // Max 5 failures in last hour
    AVERAGE_GENERATION_TIME_MAX: 300000, // Max 5 minutes average
    SUCCESS_RATE_MIN: 0.95,         // Minimum 95% success rate
    DATABASE_RESPONSE_TIME_MAX: 1000 // Max 1 second for DB queries
  };
  
  /**
   * Perform comprehensive health check of report generation pipeline
   * @returns Promise<ReportPipelineHealthResult>
   */
  static async performHealthCheck(): Promise<ReportPipelineHealthResult> {
    const healthCheckId = `health-check-${Date.now()}`;
    const startTime = Date.now();
    
    const context = {
      healthCheckId,
      startTime: new Date().toISOString(),
      operation: 'reportPipelineHealthCheck'
    };
    
    logger.info('Starting comprehensive report pipeline health check', context);
    
    const healthResult: ReportPipelineHealthResult = {
      healthCheckId,
      timestamp: new Date(),
      overallHealth: 'UNKNOWN',
      componentHealths: {},
      issues: [],
      recommendations: [],
      metrics: {},
      checkDuration: 0
    };
    
    try {
      // 1. Database Health Check
      healthResult.componentHealths.database = await this.checkDatabaseHealth();
      
      // 2. Zombie Report Detection
      healthResult.componentHealths.zombieReports = await this.checkZombieReports();
      
      // 3. Recent Report Generation Performance
      healthResult.componentHealths.reportGeneration = await this.checkReportGenerationHealth();
      
      // 4. Smart Data Collection Service Health
      healthResult.componentHealths.dataCollection = await this.checkDataCollectionHealth();
      
      // 5. Report Storage Integrity
      healthResult.componentHealths.storage = await this.checkStorageIntegrity();
      
      // 6. Pipeline Dependencies Health
      healthResult.componentHealths.dependencies = await this.checkDependenciesHealth();
      
      // Calculate overall health status
      healthResult.overallHealth = this.calculateOverallHealth(healthResult.componentHealths);
      
      // Generate issues and recommendations
      healthResult.issues = this.generateIssues(healthResult.componentHealths);
      healthResult.recommendations = this.generateRecommendations(healthResult.issues);
      
      // Calculate metrics
      healthResult.metrics = this.calculateHealthMetrics(healthResult.componentHealths);
      
      healthResult.checkDuration = Date.now() - startTime;
      
      // Log results
      if (healthResult.overallHealth === 'HEALTHY') {
        logger.info('Report pipeline health check completed - System is healthy', {
          ...context,
          overallHealth: healthResult.overallHealth,
          checkDuration: healthResult.checkDuration
        });
      } else {
        logger.warn('Report pipeline health check completed - Issues detected', {
          ...context,
          overallHealth: healthResult.overallHealth,
          issuesCount: healthResult.issues.length,
          checkDuration: healthResult.checkDuration
        });
      }
      
      return healthResult;
      
    } catch (error) {
      logger.error('Report pipeline health check failed', error as Error, context);
      
      healthResult.overallHealth = 'CRITICAL';
      healthResult.issues.push({
        component: 'HEALTH_CHECK_SYSTEM',
        severity: 'CRITICAL',
        description: `Health check system failure: ${(error as Error).message}`,
        impact: 'Unable to monitor pipeline health',
        recommendation: 'Investigate health check system immediately'
      });
      healthResult.checkDuration = Date.now() - startTime;
      
      return healthResult;
    }
  }
  
  /**
   * Check database health and performance
   */
  private static async checkDatabaseHealth(): Promise<ComponentHealth> {
    const startTime = Date.now();
    
    try {
      // Test basic database connectivity
      const dbTestStart = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      const dbResponseTime = Date.now() - dbTestStart;
      
      // Check recent report counts
      const recentReports = await prisma.report.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
          }
        }
      });
      
      // Check ReportVersion consistency
      const reportsWithoutVersions = await prisma.report.count({
        where: {
          status: 'COMPLETED',
          versions: { none: {} }
        }
      });
      
      const issues: ComponentHealthIssue[] = [];
      
      if (dbResponseTime > this.HEALTH_THRESHOLDS.DATABASE_RESPONSE_TIME_MAX) {
        issues.push({
          severity: 'WARNING',
          description: `Database response time is ${dbResponseTime}ms (threshold: ${this.HEALTH_THRESHOLDS.DATABASE_RESPONSE_TIME_MAX}ms)`,
          metric: 'response_time',
          value: dbResponseTime
        });
      }
      
      if (reportsWithoutVersions > 0) {
        issues.push({
          severity: 'CRITICAL',
          description: `Found ${reportsWithoutVersions} zombie reports in database`,
          metric: 'zombie_reports',
          value: reportsWithoutVersions
        });
      }
      
      return {
        status: issues.some(i => i.severity === 'CRITICAL') ? 'CRITICAL' : 
               issues.some(i => i.severity === 'WARNING') ? 'WARNING' : 'HEALTHY',
        issues,
        metrics: {
          responseTime: dbResponseTime,
          recentReports24h: recentReports,
          zombieReports: reportsWithoutVersions
        },
        checkDuration: Date.now() - startTime
      };
      
    } catch (error) {
      return {
        status: 'CRITICAL',
        issues: [{
          severity: 'CRITICAL',
          description: `Database connectivity failed: ${(error as Error).message}`,
          metric: 'connectivity',
          value: 0
        }],
        metrics: {},
        checkDuration: Date.now() - startTime,
        error: (error as Error).message
      };
    }
  }
  
  /**
   * Check for zombie reports
   */
  private static async checkZombieReports(): Promise<ComponentHealth> {
    const startTime = Date.now();
    
    try {
      const detectionResult = await ReportValidationService.detectZombieReports();
      
      const issues: ComponentHealthIssue[] = [];
      
      if (detectionResult.zombiesFound > this.HEALTH_THRESHOLDS.ZOMBIE_REPORT_MAX) {
        issues.push({
          severity: 'CRITICAL',
          description: `Found ${detectionResult.zombiesFound} zombie reports (should be 0)`,
          metric: 'zombie_count',
          value: detectionResult.zombiesFound
        });
      }
      
      return {
        status: issues.length > 0 ? 'CRITICAL' : 'HEALTHY',
        issues,
        metrics: {
          zombieReportsFound: detectionResult.zombiesFound,
          lastScanTime: detectionResult.scannedAt.toISOString()
        },
        checkDuration: Date.now() - startTime
      };
      
    } catch (error) {
      return {
        status: 'WARNING',
        issues: [{
          severity: 'WARNING',
          description: `Zombie report detection failed: ${(error as Error).message}`,
          metric: 'detection_error',
          value: 1
        }],
        metrics: {},
        checkDuration: Date.now() - startTime,
        error: (error as Error).message
      };
    }
  }
  
  /**
   * Check report generation performance and success rates
   */
  private static async checkReportGenerationHealth(): Promise<ComponentHealth> {
    const startTime = Date.now();
    
    try {
      const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      // Get recent reports with generation metadata
      const recentReports = await prisma.report.findMany({
        where: {
          createdAt: { gte: last24Hours }
        },
        include: { versions: true },
        orderBy: { createdAt: 'desc' }
      });
      
      const totalReports = recentReports.length;
      const successfulReports = recentReports.filter(r => 
        r.status === 'COMPLETED' && r.versions.length > 0
      ).length;
      const failedReports = recentReports.filter(r => 
        r.status === 'FAILED' || (r.status === 'COMPLETED' && r.versions.length === 0)
      ).length;
      
      const successRate = totalReports > 0 ? successfulReports / totalReports : 1;
      
      // Calculate average generation time (if available)
      const reportsWithTiming = recentReports.filter(r => 
        r.generationStartTime && r.generationEndTime
      );
      
      const avgGenerationTime = reportsWithTiming.length > 0 
        ? reportsWithTiming.reduce((acc, r) => {
            const duration = r.generationEndTime!.getTime() - r.generationStartTime!.getTime();
            return acc + duration;
          }, 0) / reportsWithTiming.length
        : 0;
      
      const issues: ComponentHealthIssue[] = [];
      
      if (successRate < this.HEALTH_THRESHOLDS.SUCCESS_RATE_MIN) {
        issues.push({
          severity: 'CRITICAL',
          description: `Report generation success rate is ${(successRate * 100).toFixed(1)}% (threshold: ${(this.HEALTH_THRESHOLDS.SUCCESS_RATE_MIN * 100)}%)`,
          metric: 'success_rate',
          value: successRate
        });
      }
      
      if (avgGenerationTime > this.HEALTH_THRESHOLDS.AVERAGE_GENERATION_TIME_MAX) {
        issues.push({
          severity: 'WARNING',
          description: `Average generation time is ${Math.round(avgGenerationTime / 1000)}s (threshold: ${this.HEALTH_THRESHOLDS.AVERAGE_GENERATION_TIME_MAX / 1000}s)`,
          metric: 'avg_generation_time',
          value: avgGenerationTime
        });
      }
      
      if (failedReports > this.HEALTH_THRESHOLDS.RECENT_FAILURES_MAX) {
        issues.push({
          severity: 'WARNING',
          description: `Too many recent failures: ${failedReports} (threshold: ${this.HEALTH_THRESHOLDS.RECENT_FAILURES_MAX})`,
          metric: 'recent_failures',
          value: failedReports
        });
      }
      
      return {
        status: issues.some(i => i.severity === 'CRITICAL') ? 'CRITICAL' : 
               issues.some(i => i.severity === 'WARNING') ? 'WARNING' : 'HEALTHY',
        issues,
        metrics: {
          totalReports24h: totalReports,
          successfulReports: successfulReports,
          failedReports: failedReports,
          successRate: successRate,
          avgGenerationTimeMs: avgGenerationTime
        },
        checkDuration: Date.now() - startTime
      };
      
    } catch (error) {
      return {
        status: 'WARNING',
        issues: [{
          severity: 'WARNING',
          description: `Report generation health check failed: ${(error as Error).message}`,
          metric: 'health_check_error',
          value: 1
        }],
        metrics: {},
        checkDuration: Date.now() - startTime,
        error: (error as Error).message
      };
    }
  }
  
  /**
   * Check Smart Data Collection Service health
   */
  private static async checkDataCollectionHealth(): Promise<ComponentHealth> {
    const startTime = Date.now();
    
    try {
      // Test data collection service instantiation
      const dataCollectionService = new SmartDataCollectionService();
      
      // Check if service has critical methods
      const hasCriticalMethods = [
        'collectProjectData',
        'collectCompetitorData'
      ].every(method => typeof (dataCollectionService as any)[method] === 'function');
      
      const issues: ComponentHealthIssue[] = [];
      
      if (!hasCriticalMethods) {
        issues.push({
          severity: 'CRITICAL',
          description: 'SmartDataCollectionService is missing critical methods',
          metric: 'service_integrity',
          value: 0
        });
      }
      
      return {
        status: issues.length > 0 ? 'CRITICAL' : 'HEALTHY',
        issues,
        metrics: {
          serviceAvailable: true,
          criticalMethodsPresent: hasCriticalMethods
        },
        checkDuration: Date.now() - startTime
      };
      
    } catch (error) {
      return {
        status: 'CRITICAL',
        issues: [{
          severity: 'CRITICAL',
          description: `SmartDataCollectionService initialization failed: ${(error as Error).message}`,
          metric: 'service_availability',
          value: 0
        }],
        metrics: {
          serviceAvailable: false
        },
        checkDuration: Date.now() - startTime,
        error: (error as Error).message
      };
    }
  }
  
  /**
   * Check report storage integrity
   */
  private static async checkStorageIntegrity(): Promise<ComponentHealth> {
    const startTime = Date.now();
    
    try {
      // Check for orphaned ReportVersions (versions without reports)
      const orphanedVersions = await prisma.reportVersion.count({
        where: {
          report: null
        }
      });
      
      // Check for reports without projects
      const orphanedReports = await prisma.report.count({
        where: {
          projectId: null
        }
      });
      
      const issues: ComponentHealthIssue[] = [];
      
      if (orphanedVersions > 0) {
        issues.push({
          severity: 'WARNING',
          description: `Found ${orphanedVersions} orphaned ReportVersions without parent Reports`,
          metric: 'orphaned_versions',
          value: orphanedVersions
        });
      }
      
      if (orphanedReports > 0) {
        issues.push({
          severity: 'WARNING',
          description: `Found ${orphanedReports} reports without associated projects`,
          metric: 'orphaned_reports',
          value: orphanedReports
        });
      }
      
      return {
        status: issues.some(i => i.severity === 'CRITICAL') ? 'CRITICAL' : 
               issues.some(i => i.severity === 'WARNING') ? 'WARNING' : 'HEALTHY',
        issues,
        metrics: {
          orphanedVersions,
          orphanedReports
        },
        checkDuration: Date.now() - startTime
      };
      
    } catch (error) {
      return {
        status: 'WARNING',
        issues: [{
          severity: 'WARNING',
          description: `Storage integrity check failed: ${(error as Error).message}`,
          metric: 'storage_check_error',
          value: 1
        }],
        metrics: {},
        checkDuration: Date.now() - startTime,
        error: (error as Error).message
      };
    }
  }
  
  /**
   * Check pipeline dependencies health
   */
  private static async checkDependenciesHealth(): Promise<ComponentHealth> {
    const startTime = Date.now();
    
    try {
      const issues: ComponentHealthIssue[] = [];
      
      // Test InitialComparativeReportService instantiation
      try {
        const reportService = new InitialComparativeReportService();
        if (!reportService) {
          throw new Error('Service instantiation returned null');
        }
      } catch (error) {
        issues.push({
          severity: 'CRITICAL',
          description: `InitialComparativeReportService initialization failed: ${(error as Error).message}`,
          metric: 'report_service_health',
          value: 0
        });
      }
      
      // Check if required environment variables are set
      const requiredEnvVars = ['DATABASE_URL'];
      const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
      
      if (missingEnvVars.length > 0) {
        issues.push({
          severity: 'WARNING',
          description: `Missing environment variables: ${missingEnvVars.join(', ')}`,
          metric: 'env_config',
          value: missingEnvVars.length
        });
      }
      
      return {
        status: issues.some(i => i.severity === 'CRITICAL') ? 'CRITICAL' : 
               issues.some(i => i.severity === 'WARNING') ? 'WARNING' : 'HEALTHY',
        issues,
        metrics: {
          missingEnvVars: missingEnvVars.length,
          requiredEnvVarsSet: requiredEnvVars.length - missingEnvVars.length
        },
        checkDuration: Date.now() - startTime
      };
      
    } catch (error) {
      return {
        status: 'WARNING',
        issues: [{
          severity: 'WARNING',
          description: `Dependencies health check failed: ${(error as Error).message}`,
          metric: 'dependencies_check_error',
          value: 1
        }],
        metrics: {},
        checkDuration: Date.now() - startTime,
        error: (error as Error).message
      };
    }
  }
  
  /**
   * Calculate overall health status from component healths
   */
  private static calculateOverallHealth(componentHealths: Record<string, ComponentHealth>): HealthStatus {
    const statuses = Object.values(componentHealths).map(ch => ch.status);
    
    if (statuses.includes('CRITICAL')) {
      return 'CRITICAL';
    } else if (statuses.includes('WARNING')) {
      return 'WARNING';
    } else {
      return 'HEALTHY';
    }
  }
  
  /**
   * Generate issues summary from component healths
   */
  private static generateIssues(componentHealths: Record<string, ComponentHealth>): PipelineHealthIssue[] {
    const issues: PipelineHealthIssue[] = [];
    
    Object.entries(componentHealths).forEach(([component, health]) => {
      health.issues.forEach(issue => {
        issues.push({
          component: component.toUpperCase(),
          severity: issue.severity,
          description: issue.description,
          impact: this.getImpactDescription(component, issue.severity),
          recommendation: this.getRecommendation(component, issue)
        });
      });
    });
    
    return issues;
  }
  
  /**
   * Generate recommendations based on issues
   */
  private static generateRecommendations(issues: PipelineHealthIssue[]): string[] {
    const recommendations: string[] = [];
    
    const criticalIssues = issues.filter(i => i.severity === 'CRITICAL');
    const warningIssues = issues.filter(i => i.severity === 'WARNING');
    
    if (criticalIssues.length > 0) {
      recommendations.push('IMMEDIATE ACTION REQUIRED: Address all CRITICAL issues before system becomes unstable');
      criticalIssues.forEach(issue => {
        recommendations.push(`• ${issue.component}: ${issue.recommendation}`);
      });
    }
    
    if (warningIssues.length > 0) {
      recommendations.push('Monitor and address WARNING issues to prevent degradation');
      warningIssues.forEach(issue => {
        recommendations.push(`• ${issue.component}: ${issue.recommendation}`);
      });
    }
    
    if (issues.length === 0) {
      recommendations.push('System is healthy - continue regular monitoring');
    }
    
    return recommendations;
  }
  
  /**
   * Calculate health metrics summary
   */
  private static calculateHealthMetrics(componentHealths: Record<string, ComponentHealth>): Record<string, any> {
    const totalComponents = Object.keys(componentHealths).length;
    const healthyComponents = Object.values(componentHealths).filter(ch => ch.status === 'HEALTHY').length;
    const warningComponents = Object.values(componentHealths).filter(ch => ch.status === 'WARNING').length;
    const criticalComponents = Object.values(componentHealths).filter(ch => ch.status === 'CRITICAL').length;
    
    return {
      totalComponents,
      healthyComponents,
      warningComponents,
      criticalComponents,
      healthScore: healthyComponents / totalComponents,
      totalIssues: Object.values(componentHealths).reduce((acc, ch) => acc + ch.issues.length, 0)
    };
  }
  
  private static getImpactDescription(component: string, severity: string): string {
    const impacts: Record<string, Record<string, string>> = {
      database: {
        CRITICAL: 'Complete system failure - no reports can be generated or accessed',
        WARNING: 'Performance degradation affecting user experience'
      },
      zombieReports: {
        CRITICAL: 'Users cannot access completed reports - poor user experience',
        WARNING: 'Potential report access issues'
      },
      reportGeneration: {
        CRITICAL: 'Report generation may fail consistently',
        WARNING: 'Slower report generation and potential failures'
      },
      dataCollection: {
        CRITICAL: 'Smart data collection will fail - emergency reports only',
        WARNING: 'Data collection performance issues'
      }
    };
    
    return impacts[component]?.[severity] || 'Impact assessment needed';
  }
  
  private static getRecommendation(component: string, issue: ComponentHealthIssue): string {
    if (component === 'zombieReports' && issue.severity === 'CRITICAL') {
      return 'Run zombie report fix migration immediately';
    }
    if (component === 'database' && issue.severity === 'CRITICAL') {
      return 'Check database connectivity and restart database service if needed';
    }
    if (component === 'reportGeneration' && issue.metric === 'success_rate') {
      return 'Investigate recent report generation failures and fix root causes';
    }
    
    return 'Investigate and resolve the underlying issue';
  }
}

// Type definitions
export type HealthStatus = 'HEALTHY' | 'WARNING' | 'CRITICAL';

export interface ComponentHealth {
  status: HealthStatus;
  issues: ComponentHealthIssue[];
  metrics: Record<string, any>;
  checkDuration: number;
  error?: string;
}

export interface ComponentHealthIssue {
  severity: 'WARNING' | 'CRITICAL';
  description: string;
  metric: string;
  value: number;
}

export interface PipelineHealthIssue {
  component: string;
  severity: 'WARNING' | 'CRITICAL';
  description: string;
  impact: string;
  recommendation: string;
}

export interface ReportPipelineHealthResult {
  healthCheckId: string;
  timestamp: Date;
  overallHealth: HealthStatus;
  componentHealths: Record<string, ComponentHealth>;
  issues: PipelineHealthIssue[];
  recommendations: string[];
  metrics: Record<string, any>;
  checkDuration: number;
} 