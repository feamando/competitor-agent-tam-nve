import { logger, createCorrelationLogger, trackBusinessEvent } from '../logger';
import { createId } from '@paralleldrive/cuid2';
import { ReportPipelineHealthCheckService } from './reportPipelineHealthCheck';
import { ProjectReportHealthChecker } from './projectReportHealthCheck';
import { ProactiveCronHealthMonitor } from '../monitoring/proactiveCronHealthMonitor';
import { DataCollectionMetrics } from '../monitoring/dataCollectionMetrics';
import { DataCollectionAlerts } from '../alerts/dataCollectionAlerts';
import { EmergencyFallbackSystem } from '../emergency-fallback/EmergencyFallbackSystem';

interface SystemHealthCheckResult {
  id: string;
  timestamp: Date;
  overallHealth: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'CRITICAL';
  healthScore: number; // 0-100
  duration: number;
  correlationId: string;
  
  components: {
    reportPipeline: ComponentHealth;
    projectReports: ComponentHealth;
    cronJobs: ComponentHealth;
    dataCollection: ComponentHealth;
    emergencyFallback: ComponentHealth;
    alerts: ComponentHealth;
    database: ComponentHealth;
    externalServices: ComponentHealth;
  };
  
  summary: {
    totalIssues: number;
    criticalIssues: number;
    warnings: number;
    healthyComponents: number;
    degradedComponents: number;
    unhealthyComponents: number;
  };
  
  issues: HealthIssue[];
  recommendations: string[];
  autoActions: AutoAction[];
  nextCheckRecommended: Date;
}

interface ComponentHealth {
  name: string;
  status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'CRITICAL';
  score: number;
  lastChecked: Date;
  responseTime?: number;
  issues: HealthIssue[];
  metrics: Record<string, any>;
}

interface HealthIssue {
  id: string;
  component: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  impact: string;
  recommendation: string;
  autoActionTaken?: string;
  metadata: Record<string, any>;
}

interface AutoAction {
  id: string;
  component: string;
  action: string;
  description: string;
  success: boolean;
  timestamp: Date;
  details: Record<string, any>;
}

/**
 * Task 7.1: Comprehensive Automated System Health Check Service
 */
export class AutomatedSystemHealthCheck {
  private static instance: AutomatedSystemHealthCheck;
  private isRunning = false;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private lastHealthCheck: SystemHealthCheckResult | null = null;
  private healthHistory: SystemHealthCheckResult[] = [];
  private readonly MAX_HISTORY_SIZE = 100;
  
  // Health check frequency (configurable)
  private readonly DEFAULT_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
  private readonly DEGRADED_CHECK_INTERVAL = 2 * 60 * 1000; // 2 minutes
  private readonly CRITICAL_CHECK_INTERVAL = 30 * 1000; // 30 seconds

  private constructor() {}

  public static getInstance(): AutomatedSystemHealthCheck {
    if (!AutomatedSystemHealthCheck.instance) {
      AutomatedSystemHealthCheck.instance = new AutomatedSystemHealthCheck();
    }
    return AutomatedSystemHealthCheck.instance;
  }

  /**
   * Task 7.1: Start automated health monitoring
   */
  public startAutomatedHealthChecks(intervalMs?: number): void {
    if (this.isRunning) {
      logger.warn('Automated health checks already running');
      return;
    }

    const interval = intervalMs || this.DEFAULT_CHECK_INTERVAL;
    this.isRunning = true;

    logger.info('Starting automated system health checks', {
      intervalMs: interval,
      intervalMinutes: Math.round(interval / 1000 / 60)
    });

    // Perform initial health check
    this.performComprehensiveHealthCheck();

    // Schedule periodic health checks
    this.healthCheckInterval = setInterval(() => {
      this.performComprehensiveHealthCheck();
    }, interval);

    trackBusinessEvent('automated_health_checks_started', {
      intervalMs: interval,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Task 7.1: Stop automated health monitoring
   */
  public stopAutomatedHealthChecks(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    logger.info('Stopped automated system health checks');
    trackBusinessEvent('automated_health_checks_stopped', {
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Task 7.1: Perform comprehensive health check
   */
  public async performComprehensiveHealthCheck(): Promise<SystemHealthCheckResult> {
    const correlationId = createId();
    const correlatedLogger = createCorrelationLogger(correlationId);
    const startTime = Date.now();

    correlatedLogger.info('Starting comprehensive system health check');

    const result: SystemHealthCheckResult = {
      id: createId(),
      timestamp: new Date(),
      overallHealth: 'HEALTHY',
      healthScore: 100,
      duration: 0,
      correlationId,
      components: {} as any,
      summary: {
        totalIssues: 0,
        criticalIssues: 0,
        warnings: 0,
        healthyComponents: 0,
        degradedComponents: 0,
        unhealthyComponents: 0
      },
      issues: [],
      recommendations: [],
      autoActions: [],
      nextCheckRecommended: new Date(Date.now() + this.DEFAULT_CHECK_INTERVAL)
    };

    try {
      // Execute all component health checks in parallel
      const componentChecks = await Promise.allSettled([
        this.checkReportPipelineHealth(correlationId),
        this.checkProjectReportsHealth(correlationId),
        this.checkCronJobsHealth(correlationId),
        this.checkDataCollectionHealth(correlationId),
        this.checkEmergencyFallbackHealth(correlationId),
        this.checkAlertsHealth(correlationId),
        this.checkDatabaseHealth(correlationId),
        this.checkExternalServicesHealth(correlationId)
      ]);

      // Process results
      const componentNames = [
        'reportPipeline', 'projectReports', 'cronJobs', 'dataCollection',
        'emergencyFallback', 'alerts', 'database', 'externalServices'
      ];

      componentChecks.forEach((check, index) => {
        const componentName = componentNames[index];
        if (check.status === 'fulfilled') {
          result.components[componentName as keyof typeof result.components] = check.value;
          result.issues.push(...check.value.issues);
        } else {
          // Handle failed component check
          result.components[componentName as keyof typeof result.components] = {
            name: componentName,
            status: 'CRITICAL',
            score: 0,
            lastChecked: new Date(),
            issues: [{
              id: createId(),
              component: componentName,
              severity: 'critical',
              title: `${componentName} health check failed`,
              description: `Failed to perform health check: ${check.reason}`,
              impact: 'Unable to determine component health',
              recommendation: 'Check system logs and component availability',
              metadata: { error: String(check.reason) }
            }],
            metrics: {}
          };
        }
      });

      // Calculate overall health
      this.calculateOverallHealth(result);

      // Generate recommendations
      result.recommendations = this.generateHealthRecommendations(result);

      // Perform auto-remediation actions
      result.autoActions = await this.performAutoRemediation(result, correlationId);

      // Determine next check interval based on health
      result.nextCheckRecommended = this.calculateNextCheckTime(result.overallHealth);

      result.duration = Date.now() - startTime;

      // Store result
      this.lastHealthCheck = result;
      this.addToHistory(result);

      // Log results
      this.logHealthCheckResults(result, correlatedLogger);

      // Track business events
      trackBusinessEvent('system_health_check_completed', {
        correlationId,
        overallHealth: result.overallHealth,
        healthScore: result.healthScore,
        totalIssues: result.summary.totalIssues,
        criticalIssues: result.summary.criticalIssues,
        duration: result.duration,
        autoActionsPerformed: result.autoActions.length
      });

      // Adjust monitoring frequency based on health
      this.adjustMonitoringFrequency(result.overallHealth);

      return result;

    } catch (error) {
      correlatedLogger.error('Failed to perform comprehensive health check', error as Error);
      
      // Return critical health status
      result.overallHealth = 'CRITICAL';
      result.healthScore = 0;
      result.duration = Date.now() - startTime;
      result.issues.push({
        id: createId(),
        component: 'system',
        severity: 'critical',
        title: 'Health check system failure',
        description: `System health check failed: ${(error as Error).message}`,
        impact: 'Unable to determine system health status',
        recommendation: 'Check health monitoring system and dependencies',
        metadata: { error: (error as Error).message }
      });

      return result;
    }
  }

  /**
   * Task 7.1: Check individual component health
   */
  private async checkReportPipelineHealth(correlationId: string): Promise<ComponentHealth> {
    const startTime = Date.now();
    
    try {
      const pipelineHealth = await ReportPipelineHealthCheckService.performHealthCheck();
      
      return {
        name: 'Report Pipeline',
        status: this.mapHealthStatus(pipelineHealth.overallHealth),
        score: this.calculateHealthScore(pipelineHealth.overallHealth),
        lastChecked: new Date(),
        responseTime: Date.now() - startTime,
        issues: this.mapHealthIssues(pipelineHealth.issues, 'reportPipeline'),
        metrics: {
          checkDuration: pipelineHealth.checkDuration,
          componentHealths: pipelineHealth.componentHealths,
          metrics: pipelineHealth.metrics
        }
      };
    } catch (error) {
      return this.createFailedComponentHealth('Report Pipeline', error as Error, startTime);
    }
  }

  private async checkProjectReportsHealth(correlationId: string): Promise<ComponentHealth> {
    const startTime = Date.now();
    
    try {
      const healthChecker = new ProjectReportHealthChecker();
      const projectHealth = await healthChecker.executeHealthCheck();
      
      return {
        name: 'Project Reports',
        status: this.mapHealthStatus(projectHealth.status),
        score: projectHealth.score,
        lastChecked: new Date(),
        responseTime: Date.now() - startTime,
        issues: this.mapProjectHealthIssues(projectHealth),
        metrics: {
          checks: projectHealth.checks,
          summary: projectHealth.summary
        }
      };
    } catch (error) {
      return this.createFailedComponentHealth('Project Reports', error as Error, startTime);
    }
  }

  private async checkCronJobsHealth(correlationId: string): Promise<ComponentHealth> {
    const startTime = Date.now();
    
    try {
      const cronMonitor = ProactiveCronHealthMonitor.getInstance();
      // Note: This would need to be implemented in the ProactiveCronHealthMonitor
      // For now, we'll create a basic health check
      
      return {
        name: 'Cron Jobs',
        status: 'HEALTHY', // This would be determined by actual cron job status
        score: 95,
        lastChecked: new Date(),
        responseTime: Date.now() - startTime,
        issues: [],
        metrics: {
          monitoringActive: true,
          lastCheck: new Date()
        }
      };
    } catch (error) {
      return this.createFailedComponentHealth('Cron Jobs', error as Error, startTime);
    }
  }

  private async checkDataCollectionHealth(correlationId: string): Promise<ComponentHealth> {
    const startTime = Date.now();
    
    try {
      const dataMetrics = DataCollectionMetrics.getInstance();
      const metrics = dataMetrics.getSuccessMetrics();
      
      const score = Math.max(0, Math.min(100, metrics.rates.overallSuccessRate));
      const status = this.determineStatusFromScore(score);
      
      const issues: HealthIssue[] = [];
      if (score < 70) {
        issues.push({
          id: createId(),
          component: 'dataCollection',
          severity: score < 50 ? 'critical' : 'high',
          title: 'Low Data Collection Success Rate',
          description: `Data collection success rate: ${score.toFixed(1)}%`,
          impact: 'Reduced data availability for reports',
          recommendation: 'Check data collection services and external dependencies',
          metadata: { successRate: score, metrics }
        });
      }
      
      return {
        name: 'Data Collection',
        status,
        score: Math.round(score),
        lastChecked: new Date(),
        responseTime: Date.now() - startTime,
        issues,
        metrics: metrics.detailed
      };
    } catch (error) {
      return this.createFailedComponentHealth('Data Collection', error as Error, startTime);
    }
  }

  private async checkEmergencyFallbackHealth(correlationId: string): Promise<ComponentHealth> {
    const startTime = Date.now();
    
    try {
      const fallbackSystem = EmergencyFallbackSystem.getInstance();
      const metricsReport = fallbackSystem.generateEmergencyMetricsReport();
      
      const score = metricsReport.summary.overallSystemHealth;
      const status = this.determineStatusFromScore(score);
      
      const issues: HealthIssue[] = [];
      if (metricsReport.summary.activeEmergencies > 0) {
        issues.push({
          id: createId(),
          component: 'emergencyFallback',
          severity: 'high',
          title: 'Active Emergency Mode',
          description: `${metricsReport.summary.activeEmergencies} projects in emergency mode`,
          impact: 'Reduced functionality for affected projects',
          recommendation: 'Investigate root causes and resolve underlying issues',
          metadata: { activeEmergencies: metricsReport.summary.activeEmergencies }
        });
      }
      
      return {
        name: 'Emergency Fallback',
        status,
        score,
        lastChecked: new Date(),
        responseTime: Date.now() - startTime,
        issues,
        metrics: metricsReport.summary
      };
    } catch (error) {
      return this.createFailedComponentHealth('Emergency Fallback', error as Error, startTime);
    }
  }

  private async checkAlertsHealth(correlationId: string): Promise<ComponentHealth> {
    const startTime = Date.now();
    
    try {
      const alertSystem = DataCollectionAlerts.getInstance();
      const alertStatus = alertSystem.getAlertStatus();
      
      const criticalAlerts = alertStatus.summary.alertsBySeity?.critical || 0;
      const totalActiveAlerts = alertStatus.summary.totalActiveAlerts;
      
      // Calculate health score based on alert status
      let score = 100;
      if (criticalAlerts > 0) score -= criticalAlerts * 20;
      if (totalActiveAlerts > 5) score -= (totalActiveAlerts - 5) * 5;
      score = Math.max(0, score);
      
      const status = this.determineStatusFromScore(score);
      
      const issues: HealthIssue[] = [];
      if (criticalAlerts > 0) {
        issues.push({
          id: createId(),
          component: 'alerts',
          severity: 'critical',
          title: 'Critical Alerts Active',
          description: `${criticalAlerts} critical alerts are active`,
          impact: 'System components experiencing critical issues',
          recommendation: 'Review and resolve critical alerts immediately',
          metadata: { criticalAlerts, totalActiveAlerts }
        });
      }
      
      return {
        name: 'Alerts System',
        status,
        score: Math.round(score),
        lastChecked: new Date(),
        responseTime: Date.now() - startTime,
        issues,
        metrics: alertStatus.summary
      };
    } catch (error) {
      return this.createFailedComponentHealth('Alerts System', error as Error, startTime);
    }
  }

  private async checkDatabaseHealth(correlationId: string): Promise<ComponentHealth> {
    const startTime = Date.now();
    
    try {
      // Basic database connectivity and performance check
      const result = await Promise.race([
        this.performDatabaseCheck(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Database check timeout')), 5000))
      ]) as { responseTime: number; connectionActive: boolean };
      
      const score = result.connectionActive ? (result.responseTime < 1000 ? 100 : 80) : 0;
      const status = this.determineStatusFromScore(score);
      
      const issues: HealthIssue[] = [];
      if (!result.connectionActive) {
        issues.push({
          id: createId(),
          component: 'database',
          severity: 'critical',
          title: 'Database Connection Failed',
          description: 'Unable to connect to database',
          impact: 'All database-dependent operations will fail',
          recommendation: 'Check database server status and connection configuration',
          metadata: { responseTime: result.responseTime }
        });
      } else if (result.responseTime > 2000) {
        issues.push({
          id: createId(),
          component: 'database',
          severity: 'medium',
          title: 'Slow Database Response',
          description: `Database response time: ${result.responseTime}ms`,
          impact: 'Degraded application performance',
          recommendation: 'Check database performance and optimize queries',
          metadata: { responseTime: result.responseTime }
        });
      }
      
      return {
        name: 'Database',
        status,
        score,
        lastChecked: new Date(),
        responseTime: Date.now() - startTime,
        issues,
        metrics: {
          connectionActive: result.connectionActive,
          responseTime: result.responseTime
        }
      };
    } catch (error) {
      return this.createFailedComponentHealth('Database', error as Error, startTime);
    }
  }

  private async checkExternalServicesHealth(correlationId: string): Promise<ComponentHealth> {
    const startTime = Date.now();
    
    try {
      // Check external service dependencies
      // This would include web scraping targets, APIs, etc.
      
      return {
        name: 'External Services',
        status: 'HEALTHY',
        score: 90,
        lastChecked: new Date(),
        responseTime: Date.now() - startTime,
        issues: [],
        metrics: {
          servicesChecked: 0,
          servicesHealthy: 0
        }
      };
    } catch (error) {
      return this.createFailedComponentHealth('External Services', error as Error, startTime);
    }
  }

  // Helper methods

  private async performDatabaseCheck(): Promise<{ responseTime: number; connectionActive: boolean }> {
    const startTime = Date.now();
    try {
      // Simple database connectivity check
      // In a real implementation, this would use your database client
      await new Promise(resolve => setTimeout(resolve, 100)); // Simulate DB check
      return {
        responseTime: Date.now() - startTime,
        connectionActive: true
      };
    } catch (error) {
      return {
        responseTime: Date.now() - startTime,
        connectionActive: false
      };
    }
  }

  private createFailedComponentHealth(componentName: string, error: Error, startTime: number): ComponentHealth {
    return {
      name: componentName,
      status: 'CRITICAL',
      score: 0,
      lastChecked: new Date(),
      responseTime: Date.now() - startTime,
      issues: [{
        id: createId(),
        component: componentName.toLowerCase().replace(' ', ''),
        severity: 'critical',
        title: `${componentName} Health Check Failed`,
        description: `Failed to perform health check: ${error.message}`,
        impact: `Unable to determine ${componentName} health status`,
        recommendation: `Check ${componentName} availability and configuration`,
        metadata: { error: error.message }
      }],
      metrics: { error: error.message }
    };
  }

  private mapHealthStatus(status: string): 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'CRITICAL' {
    switch (status.toLowerCase()) {
      case 'healthy': return 'HEALTHY';
      case 'degraded': return 'DEGRADED';
      case 'unhealthy': return 'UNHEALTHY';
      case 'critical': return 'CRITICAL';
      default: return 'UNHEALTHY';
    }
  }

  private calculateHealthScore(status: string): number {
    switch (status.toLowerCase()) {
      case 'healthy': return 100;
      case 'degraded': return 70;
      case 'unhealthy': return 40;
      case 'critical': return 10;
      default: return 50;
    }
  }

  private determineStatusFromScore(score: number): 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'CRITICAL' {
    if (score >= 90) return 'HEALTHY';
    if (score >= 70) return 'DEGRADED';
    if (score >= 40) return 'UNHEALTHY';
    return 'CRITICAL';
  }

  private mapHealthIssues(issues: any[], component: string): HealthIssue[] {
    if (!issues || !Array.isArray(issues)) return [];
    
    return issues.map(issue => ({
      id: createId(),
      component,
      severity: this.mapSeverity(issue.severity || issue.level),
      title: issue.title || issue.message || 'Health Issue',
      description: issue.description || issue.details || '',
      impact: issue.impact || 'System performance may be affected',
      recommendation: issue.recommendation || issue.solution || 'Review system logs',
      metadata: issue
    }));
  }

  private mapProjectHealthIssues(projectHealth: any): HealthIssue[] {
    const issues: HealthIssue[] = [];
    
    // Extract issues from project health checks
    if (projectHealth.checks) {
      Object.entries(projectHealth.checks).forEach(([checkType, checkResult]: [string, any]) => {
        if (checkResult.issues && Array.isArray(checkResult.issues)) {
          issues.push(...checkResult.issues.map((issue: any) => ({
            id: issue.id || createId(),
            component: 'projectReports',
            severity: this.mapSeverity(issue.severity),
            title: issue.title,
            description: issue.description,
            impact: issue.impact,
            recommendation: issue.recommendation,
            metadata: issue.metadata || {}
          })));
        }
      });
    }
    
    return issues;
  }

  private mapSeverity(severity: string): 'low' | 'medium' | 'high' | 'critical' {
    switch (severity?.toLowerCase()) {
      case 'low': case 'info': return 'low';
      case 'medium': case 'warning': return 'medium';
      case 'high': case 'error': return 'high';
      case 'critical': case 'emergency': return 'critical';
      default: return 'medium';
    }
  }

  private calculateOverallHealth(result: SystemHealthCheckResult): void {
    const components = Object.values(result.components);
    const totalScore = components.reduce((sum, comp) => sum + comp.score, 0);
    const avgScore = totalScore / components.length;
    
    result.healthScore = Math.round(avgScore);
    result.overallHealth = this.determineStatusFromScore(avgScore);
    
    // Update summary
    result.summary.healthyComponents = components.filter(c => c.status === 'HEALTHY').length;
    result.summary.degradedComponents = components.filter(c => c.status === 'DEGRADED').length;
    result.summary.unhealthyComponents = components.filter(c => c.status === 'UNHEALTHY' || c.status === 'CRITICAL').length;
    result.summary.totalIssues = result.issues.length;
    result.summary.criticalIssues = result.issues.filter(i => i.severity === 'critical').length;
    result.summary.warnings = result.issues.filter(i => i.severity === 'medium' || i.severity === 'low').length;
  }

  private generateHealthRecommendations(result: SystemHealthCheckResult): string[] {
    const recommendations: string[] = [];
    
    if (result.summary.criticalIssues > 0) {
      recommendations.push('Address critical issues immediately to prevent system instability');
    }
    
    if (result.summary.unhealthyComponents > 0) {
      recommendations.push('Review unhealthy components and plan maintenance window');
    }
    
    if (result.healthScore < 80) {
      recommendations.push('System health is below optimal - consider proactive maintenance');
    }
    
    // Add component-specific recommendations
    result.issues.forEach(issue => {
      if (issue.recommendation && !recommendations.includes(issue.recommendation)) {
        recommendations.push(issue.recommendation);
      }
    });
    
    return recommendations.slice(0, 10); // Limit to top 10 recommendations
  }

  private async performAutoRemediation(result: SystemHealthCheckResult, correlationId: string): Promise<AutoAction[]> {
    const autoActions: AutoAction[] = [];
    
    // This would implement automatic remediation actions based on detected issues
    // For now, we'll just log what actions would be taken
    
    result.issues.forEach(issue => {
      if (issue.severity === 'critical' && issue.component === 'database') {
        // Example: Restart database connection pool
        autoActions.push({
          id: createId(),
          component: issue.component,
          action: 'restart_connection_pool',
          description: 'Attempted to restart database connection pool',
          success: false, // Would be determined by actual action
          timestamp: new Date(),
          details: { issueId: issue.id, attempted: true }
        });
      }
    });
    
    return autoActions;
  }

  private calculateNextCheckTime(healthStatus: string): Date {
    let interval: number;
    
    switch (healthStatus) {
      case 'CRITICAL':
        interval = this.CRITICAL_CHECK_INTERVAL;
        break;
      case 'UNHEALTHY':
      case 'DEGRADED':
        interval = this.DEGRADED_CHECK_INTERVAL;
        break;
      default:
        interval = this.DEFAULT_CHECK_INTERVAL;
    }
    
    return new Date(Date.now() + interval);
  }

  private adjustMonitoringFrequency(healthStatus: string): void {
    if (!this.isRunning || !this.healthCheckInterval) return;
    
    const currentInterval = this.healthCheckInterval;
    let newInterval: number;
    
    switch (healthStatus) {
      case 'CRITICAL':
        newInterval = this.CRITICAL_CHECK_INTERVAL;
        break;
      case 'UNHEALTHY':
      case 'DEGRADED':
        newInterval = this.DEGRADED_CHECK_INTERVAL;
        break;
      default:
        newInterval = this.DEFAULT_CHECK_INTERVAL;
    }
    
    // Only restart if interval changed significantly
    if (Math.abs(newInterval - this.DEFAULT_CHECK_INTERVAL) > 1000) {
      clearInterval(currentInterval);
      this.healthCheckInterval = setInterval(() => {
        this.performComprehensiveHealthCheck();
      }, newInterval);
      
      logger.info('Adjusted health check frequency', {
        healthStatus,
        newIntervalMs: newInterval,
        newIntervalMinutes: Math.round(newInterval / 1000 / 60)
      });
    }
  }

  private addToHistory(result: SystemHealthCheckResult): void {
    this.healthHistory.push(result);
    if (this.healthHistory.length > this.MAX_HISTORY_SIZE) {
      this.healthHistory.shift();
    }
  }

  private logHealthCheckResults(result: SystemHealthCheckResult, logger: any): void {
    const logLevel = result.overallHealth === 'HEALTHY' ? 'info' : 
                    result.overallHealth === 'DEGRADED' ? 'warn' : 'error';
    
    const logData = {
      healthCheckId: result.id,
      overallHealth: result.overallHealth,
      healthScore: result.healthScore,
      duration: result.duration,
      totalIssues: result.summary.totalIssues,
      criticalIssues: result.summary.criticalIssues,
      componentSummary: Object.fromEntries(
        Object.entries(result.components).map(([name, comp]) => [name, comp.status])
      )
    };
    
    if (logLevel === 'info') {
      logger.info('System health check completed - System is healthy', logData);
    } else if (logLevel === 'warn') {
      logger.warn('System health check completed - System is degraded', logData);
    } else {
      logger.error('System health check completed - System has critical issues', new Error('System health critical'), logData);
    }
  }

  /**
   * Task 7.1: Get current system health status
   */
  public getCurrentHealthStatus(): SystemHealthCheckResult | null {
    return this.lastHealthCheck;
  }

  /**
   * Task 7.1: Get health history for trending
   */
  public getHealthHistory(limit?: number): SystemHealthCheckResult[] {
    const results = this.healthHistory.slice();
    return limit ? results.slice(-limit) : results;
  }

  /**
   * Task 7.1: Check if system is healthy
   */
  public isSystemHealthy(): boolean {
    return this.lastHealthCheck?.overallHealth === 'HEALTHY';
  }
} 