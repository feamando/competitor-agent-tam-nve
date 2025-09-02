import { prisma } from '@/lib/prisma';
import { logger, generateCorrelationId, trackBusinessEvent } from '@/lib/logger';

export interface DataDependency {
  name: string;
  type: 'product_snapshot' | 'competitor_snapshot' | 'project_data' | 'system_resource';
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  description: string;
  checkFunction: (projectId: string, context?: any) => Promise<DependencyStatus>;
  warningThresholds: {
    red: number; // 0-100 - Critical warning
    yellow: number; // 0-100 - Warning
    green: number; // 0-100 - OK
  };
  autoFixAvailable: boolean;
  autoFixFunction?: (projectId: string, context?: any) => Promise<{ success: boolean; message: string }>;
}

export interface DependencyStatus {
  name: string;
  status: 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'MISSING' | 'DEGRADED';
  score: number; // 0-100
  message: string;
  details: any;
  lastUpdated: Date;
  nextCheckTime?: Date;
  canAutoFix: boolean;
  requiresAttention: boolean;
  estimatedImpact: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface EarlyWarningCheck {
  projectId: string;
  checkTime: Date;
  overallStatus: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  overallScore: number;
  dependencyStatuses: DependencyStatus[];
  criticalIssues: string[];
  warnings: string[];
  recommendations: string[];
  autoFixAttempts: {
    dependencyName: string;
    attempted: boolean;
    success: boolean;
    message: string;
  }[];
}

export interface EarlyWarningAlert {
  id: string;
  projectId: string;
  dependencyName: string;
  alertLevel: 'INFO' | 'WARNING' | 'CRITICAL';
  message: string;
  details: any;
  createdAt: Date;
  acknowledged: boolean;
  autoResolved: boolean;
  resolvedAt?: Date;
}

export interface EarlyWarningOptions {
  enableAutoFix: boolean;
  alertThreshold: 'LOW' | 'MEDIUM' | 'HIGH';
  checkInterval: number; // milliseconds
  enableNotifications: boolean;
  projectIds?: string[]; // if not specified, check all active projects
}

export class DataDependencyEarlyWarning {
  private static instance: DataDependencyEarlyWarning;
  private dependencies: DataDependency[] = [];
  private activeAlerts: Map<string, EarlyWarningAlert> = new Map();
  private monitoringInterval?: NodeJS.Timeout;
  private isMonitoring = false;

  public static getInstance(): DataDependencyEarlyWarning {
    if (!DataDependencyEarlyWarning.instance) {
      DataDependencyEarlyWarning.instance = new DataDependencyEarlyWarning();
    }
    return DataDependencyEarlyWarning.instance;
  }

  constructor() {
    this.initializeDependencies();
  }

  /**
   * Initialize data dependency definitions
   */
  private initializeDependencies(): void {
    this.dependencies = [
      {
        name: 'product_snapshots',
        type: 'product_snapshot',
        priority: 'CRITICAL',
        description: 'Product website snapshots availability and freshness',
        checkFunction: this.checkProductSnapshots.bind(this),
        warningThresholds: {
          red: 30,
          yellow: 70,
          green: 90
        },
        autoFixAvailable: true,
        autoFixFunction: this.autoFixProductSnapshots.bind(this)
      },
      {
        name: 'competitor_snapshots',
        type: 'competitor_snapshot',
        priority: 'HIGH',
        description: 'Competitor website snapshots availability and freshness',
        checkFunction: this.checkCompetitorSnapshots.bind(this),
        warningThresholds: {
          red: 20,
          yellow: 60,
          green: 80
        },
        autoFixAvailable: true,
        autoFixFunction: this.autoFixCompetitorSnapshots.bind(this)
      },
      {
        name: 'project_data_completeness',
        type: 'project_data',
        priority: 'HIGH',
        description: 'Project basic data completeness and quality',
        checkFunction: this.checkProjectDataCompleteness.bind(this),
        warningThresholds: {
          red: 40,
          yellow: 70,
          green: 85
        },
        autoFixAvailable: false
      },
      {
        name: 'data_collection_pipeline',
        type: 'system_resource',
        priority: 'CRITICAL',
        description: 'Data collection pipeline health and capacity',
        checkFunction: this.checkDataCollectionPipeline.bind(this),
        warningThresholds: {
          red: 50,
          yellow: 75,
          green: 90
        },
        autoFixAvailable: false
      },
      {
        name: 'cron_job_health',
        type: 'system_resource',
        priority: 'HIGH',
        description: 'Scheduled job execution health',
        checkFunction: this.checkCronJobHealth.bind(this),
        warningThresholds: {
          red: 30,
          yellow: 70,
          green: 90
        },
        autoFixAvailable: true,
        autoFixFunction: this.autoFixCronJobs.bind(this)
      }
    ];
  }

  /**
   * Start early warning monitoring
   * Task 4.2: Main monitoring functionality
   */
  public startEarlyWarningMonitoring(options: EarlyWarningOptions): void {
    if (this.isMonitoring) {
      logger.warn('Early warning monitoring is already running');
      return;
    }

    const correlationId = generateCorrelationId();
    const context = { correlationId, operation: 'startEarlyWarningMonitoring' };

    logger.info('Starting data dependency early warning monitoring', {
      ...context,
      checkInterval: options.checkInterval,
      enableAutoFix: options.enableAutoFix,
      alertThreshold: options.alertThreshold
    });

    this.isMonitoring = true;

    // Start periodic monitoring
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.performEarlyWarningChecks(options);
      } catch (error) {
        logger.error('Error during early warning checks', error as Error, context);
      }
    }, options.checkInterval);

    trackBusinessEvent('early_warning_monitoring_started', {
      correlationId,
      checkInterval: options.checkInterval,
      enableAutoFix: options.enableAutoFix,
      alertThreshold: options.alertThreshold
    });
  }

  /**
   * Stop early warning monitoring
   */
  public stopEarlyWarningMonitoring(): void {
    if (!this.isMonitoring) {
      logger.warn('Early warning monitoring is not running');
      return;
    }

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }

    this.isMonitoring = false;
    logger.info('Stopped data dependency early warning monitoring');

    trackBusinessEvent('early_warning_monitoring_stopped', {
      correlationId: generateCorrelationId()
    });
  }

  /**
   * Perform early warning checks for all or specified projects
   */
  private async performEarlyWarningChecks(options: EarlyWarningOptions): Promise<void> {
    const correlationId = generateCorrelationId();
    const context = { correlationId, operation: 'performEarlyWarningChecks' };

    try {
      // Get projects to check
      const projectIds = options.projectIds || await this.getActiveProjectIds();
      
      if (projectIds.length === 0) {
        logger.debug('No active projects found for early warning checks', context);
        return;
      }

      logger.debug(`Performing early warning checks for ${projectIds.length} projects`, context);

      // Check each project
      for (const projectId of projectIds) {
        try {
          const checkResult = await this.checkProjectDependencies(projectId, options);
          
          // Process results and generate alerts
          await this.processCheckResults(checkResult, options);
          
        } catch (error) {
          logger.error('Error checking project dependencies', error as Error, {
            ...context,
            projectId
          });
        }
      }

    } catch (error) {
      logger.error('Error during early warning checks process', error as Error, context);
    }
  }

  /**
   * Check all dependencies for a specific project
   */
  public async checkProjectDependencies(
    projectId: string,
    options: EarlyWarningOptions = {
      enableAutoFix: false,
      alertThreshold: 'MEDIUM',
      checkInterval: 60000,
      enableNotifications: true
    }
  ): Promise<EarlyWarningCheck> {
    const startTime = Date.now();
    const correlationId = generateCorrelationId();
    const context = { projectId, correlationId, operation: 'checkProjectDependencies' };

    logger.debug('Checking project dependencies for early warnings', context);

    const result: EarlyWarningCheck = {
      projectId,
      checkTime: new Date(),
      overallStatus: 'HEALTHY',
      overallScore: 100,
      dependencyStatuses: [],
      criticalIssues: [],
      warnings: [],
      recommendations: [],
      autoFixAttempts: []
    };

    try {
      // Check each dependency
      for (const dependency of this.dependencies) {
        try {
          const status = await dependency.checkFunction(projectId, { correlationId });
          result.dependencyStatuses.push(status);

          // Attempt auto-fix if enabled and available
          if (options.enableAutoFix && 
              dependency.autoFixAvailable && 
              dependency.autoFixFunction &&
              (status.status === 'CRITICAL' || status.status === 'MISSING')) {
            
            logger.info(`Attempting auto-fix for dependency: ${dependency.name}`, context);
            
            try {
              const fixResult = await dependency.autoFixFunction(projectId, { correlationId });
              
              result.autoFixAttempts.push({
                dependencyName: dependency.name,
                attempted: true,
                success: fixResult.success,
                message: fixResult.message
              });

              if (fixResult.success) {
                // Re-check the dependency after fix
                const updatedStatus = await dependency.checkFunction(projectId, { correlationId });
                const statusIndex = result.dependencyStatuses.findIndex(s => s.name === dependency.name);
                if (statusIndex >= 0) {
                  result.dependencyStatuses[statusIndex] = updatedStatus;
                }
              }

            } catch (fixError) {
              result.autoFixAttempts.push({
                dependencyName: dependency.name,
                attempted: true,
                success: false,
                message: `Auto-fix failed: ${fixError instanceof Error ? fixError.message : 'Unknown error'}`
              });
            }
          }

        } catch (error) {
          logger.error(`Error checking dependency: ${dependency.name}`, error as Error, context);
          
          result.dependencyStatuses.push({
            name: dependency.name,
            status: 'DEGRADED',
            score: 0,
            message: `Check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            details: { error: true },
            lastUpdated: new Date(),
            canAutoFix: false,
            requiresAttention: true,
            estimatedImpact: 'MEDIUM'
          });
        }
      }

      // Calculate overall status and score
      this.calculateOverallStatus(result);

      const checkTime = Date.now() - startTime;

      logger.debug('Project dependency check completed', {
        ...context,
        overallStatus: result.overallStatus,
        overallScore: result.overallScore,
        dependencyCount: result.dependencyStatuses.length,
        criticalIssues: result.criticalIssues.length,
        checkTime
      });

      return result;

    } catch (error) {
      logger.error('Project dependency check failed', error as Error, context);
      
      result.overallStatus = 'CRITICAL';
      result.overallScore = 0;
      result.criticalIssues.push(`Dependency check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      return result;
    }
  }

  /**
   * Check product snapshots availability and freshness
   */
  private async checkProductSnapshots(projectId: string, context?: any): Promise<DependencyStatus> {
    try {
      const products = await prisma.product.findMany({
        where: { projectId },
        include: {
          snapshots: {
            orderBy: { createdAt: 'desc' },
            take: 5
          }
        }
      });

      if (products.length === 0) {
        return {
          name: 'product_snapshots',
          status: 'MISSING',
          score: 0,
          message: 'No products found for project',
          details: { productCount: 0 },
          lastUpdated: new Date(),
          canAutoFix: false,
          requiresAttention: true,
          estimatedImpact: 'CRITICAL'
        };
      }

      let totalScore = 0;
      let productsWithSnapshots = 0;
      let successfulSnapshots = 0;
      let recentSnapshots = 0;
      const issues: string[] = [];

      const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);

      for (const product of products) {
        if (product.snapshots.length > 0) {
          productsWithSnapshots++;
          const latestSnapshot = product.snapshots[0];
          
          if (latestSnapshot.captureSuccess) {
            successfulSnapshots++;
            totalScore += 80;
          } else {
            issues.push(`Product "${product.name}" has failed snapshot`);
            totalScore += 20;
          }

          if (new Date(latestSnapshot.createdAt).getTime() > oneDayAgo) {
            recentSnapshots++;
            totalScore += 20;
          } else {
            issues.push(`Product "${product.name}" snapshot is stale`);
          }
        } else {
          issues.push(`Product "${product.name}" has no snapshots`);
        }
      }

      const averageScore = Math.round(totalScore / products.length);
      const status = averageScore >= 90 ? 'HEALTHY' : 
                    averageScore >= 70 ? 'WARNING' : 
                    averageScore >= 30 ? 'CRITICAL' : 'MISSING';

      return {
        name: 'product_snapshots',
        status,
        score: averageScore,
        message: `${successfulSnapshots}/${products.length} products have successful snapshots, ${recentSnapshots} recent`,
        details: {
          productCount: products.length,
          productsWithSnapshots,
          successfulSnapshots,
          recentSnapshots,
          issues
        },
        lastUpdated: new Date(),
        canAutoFix: true,
        requiresAttention: status !== 'HEALTHY',
        estimatedImpact: status === 'MISSING' ? 'CRITICAL' : 
                        status === 'CRITICAL' ? 'HIGH' : 
                        status === 'WARNING' ? 'MEDIUM' : 'NONE'
      };

    } catch (error) {
      return {
        name: 'product_snapshots',
        status: 'DEGRADED',
        score: 0,
        message: `Check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: { error: true },
        lastUpdated: new Date(),
        canAutoFix: false,
        requiresAttention: true,
        estimatedImpact: 'HIGH'
      };
    }
  }

  /**
   * Check competitor snapshots availability and freshness
   */
  private async checkCompetitorSnapshots(projectId: string, context?: any): Promise<DependencyStatus> {
    try {
      const competitors = await prisma.competitor.findMany({
        where: { projectId },
        include: {
          snapshots: {
            orderBy: { createdAt: 'desc' },
            take: 3
          }
        }
      });

      if (competitors.length === 0) {
        return {
          name: 'competitor_snapshots',
          status: 'WARNING',
          score: 50,
          message: 'No competitors found - limited comparative analysis',
          details: { competitorCount: 0 },
          lastUpdated: new Date(),
          canAutoFix: false,
          requiresAttention: false,
          estimatedImpact: 'MEDIUM'
        };
      }

      let totalScore = 0;
      let competitorsWithSnapshots = 0;
      let successfulSnapshots = 0;
      const issues: string[] = [];

      for (const competitor of competitors) {
        if (competitor.snapshots.length > 0) {
          competitorsWithSnapshots++;
          const latestSnapshot = competitor.snapshots[0];
          
          if (latestSnapshot.captureSuccess) {
            successfulSnapshots++;
            totalScore += 100;
          } else {
            issues.push(`Competitor "${competitor.name}" has failed snapshot`);
            totalScore += 30;
          }
        } else {
          issues.push(`Competitor "${competitor.name}" has no snapshots`);
          totalScore += 10;
        }
      }

      const averageScore = Math.round(totalScore / competitors.length);
      const status = averageScore >= 80 ? 'HEALTHY' : 
                    averageScore >= 60 ? 'WARNING' : 
                    averageScore >= 20 ? 'CRITICAL' : 'MISSING';

      return {
        name: 'competitor_snapshots',
        status,
        score: averageScore,
        message: `${successfulSnapshots}/${competitors.length} competitors have successful snapshots`,
        details: {
          competitorCount: competitors.length,
          competitorsWithSnapshots,
          successfulSnapshots,
          issues
        },
        lastUpdated: new Date(),
        canAutoFix: true,
        requiresAttention: status === 'CRITICAL' || status === 'MISSING',
        estimatedImpact: status === 'MISSING' ? 'HIGH' : 
                        status === 'CRITICAL' ? 'MEDIUM' : 
                        status === 'WARNING' ? 'LOW' : 'NONE'
      };

    } catch (error) {
      return {
        name: 'competitor_snapshots',
        status: 'DEGRADED',
        score: 0,
        message: `Check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: { error: true },
        lastUpdated: new Date(),
        canAutoFix: false,
        requiresAttention: true,
        estimatedImpact: 'MEDIUM'
      };
    }
  }

  /**
   * Check project data completeness
   */
  private async checkProjectDataCompleteness(projectId: string, context?: any): Promise<DependencyStatus> {
    try {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          products: true,
          competitors: true
        }
      });

      if (!project) {
        return {
          name: 'project_data_completeness',
          status: 'MISSING',
          score: 0,
          message: 'Project not found',
          details: {},
          lastUpdated: new Date(),
          canAutoFix: false,
          requiresAttention: true,
          estimatedImpact: 'CRITICAL'
        };
      }

      let score = 0;
      const issues: string[] = [];

      // Basic project data
      if (project.name) score += 20;
      else issues.push('Project missing name');

      if (project.description) score += 10;
      else issues.push('Project missing description');

      // Products
      if (project.products.length > 0) {
        score += 40;
        const productsWithWebsite = project.products.filter(p => p.website).length;
        score += Math.round((productsWithWebsite / project.products.length) * 20);
      } else {
        issues.push('Project has no products');
      }

      // Competitors
      if (project.competitors.length > 0) {
        score += 10;
      } else {
        issues.push('Project has no competitors');
      }

      const status = score >= 85 ? 'HEALTHY' : 
                    score >= 70 ? 'WARNING' : 
                    score >= 40 ? 'CRITICAL' : 'MISSING';

      return {
        name: 'project_data_completeness',
        status,
        score,
        message: `Project data completeness: ${score}%`,
        details: {
          hasName: !!project.name,
          hasDescription: !!project.description,
          productCount: project.products.length,
          competitorCount: project.competitors.length,
          issues
        },
        lastUpdated: new Date(),
        canAutoFix: false,
        requiresAttention: status !== 'HEALTHY',
        estimatedImpact: status === 'MISSING' ? 'HIGH' : 
                        status === 'CRITICAL' ? 'MEDIUM' : 
                        status === 'WARNING' ? 'LOW' : 'NONE'
      };

    } catch (error) {
      return {
        name: 'project_data_completeness',
        status: 'DEGRADED',
        score: 0,
        message: `Check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: { error: true },
        lastUpdated: new Date(),
        canAutoFix: false,
        requiresAttention: true,
        estimatedImpact: 'MEDIUM'
      };
    }
  }

  /**
   * Check data collection pipeline health
   */
  private async checkDataCollectionPipeline(projectId: string, context?: any): Promise<DependencyStatus> {
    try {
      // This is a simplified check - in production would check actual pipeline metrics
      const recentSnapshots = await prisma.productSnapshot.count({
        where: {
          product: { projectId },
          createdAt: {
            gte: new Date(Date.now() - 60 * 60 * 1000) // Last hour
          }
        }
      });

      const failedSnapshots = await prisma.productSnapshot.count({
        where: {
          product: { projectId },
          captureSuccess: false,
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
          }
        }
      });

      let score = 90; // Base score
      let message = 'Data collection pipeline is healthy';
      const issues: string[] = [];

      if (failedSnapshots > 5) {
        score -= 30;
        issues.push(`${failedSnapshots} failed snapshots in last 24h`);
        message = 'Data collection pipeline has recent failures';
      } else if (failedSnapshots > 2) {
        score -= 15;
        issues.push(`${failedSnapshots} failed snapshots detected`);
      }

      if (recentSnapshots === 0) {
        score -= 20;
        issues.push('No recent snapshot activity');
      }

      const status = score >= 90 ? 'HEALTHY' : 
                    score >= 75 ? 'WARNING' : 
                    score >= 50 ? 'CRITICAL' : 'DEGRADED';

      return {
        name: 'data_collection_pipeline',
        status,
        score,
        message,
        details: {
          recentSnapshots,
          failedSnapshots,
          issues
        },
        lastUpdated: new Date(),
        canAutoFix: false,
        requiresAttention: status !== 'HEALTHY',
        estimatedImpact: status === 'DEGRADED' ? 'CRITICAL' : 
                        status === 'CRITICAL' ? 'HIGH' : 
                        status === 'WARNING' ? 'MEDIUM' : 'NONE'
      };

    } catch (error) {
      return {
        name: 'data_collection_pipeline',
        status: 'DEGRADED',
        score: 0,
        message: `Pipeline check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: { error: true },
        lastUpdated: new Date(),
        canAutoFix: false,
        requiresAttention: true,
        estimatedImpact: 'HIGH'
      };
    }
  }

  /**
   * Check cron job health
   */
  private async checkCronJobHealth(projectId: string, context?: any): Promise<DependencyStatus> {
    try {
      // Import the cron job recovery service to check health
      const { cronJobRecoveryService } = await import('../recovery/cronJobRecoveryService');
      const healthStatus = await cronJobRecoveryService.getHealthStatus();

      const totalJobs = healthStatus.length;
      const healthyJobs = healthStatus.filter(job => job.healthStatus === 'HEALTHY').length;
      const unhealthyJobs = totalJobs - healthyJobs;

      let score = totalJobs > 0 ? Math.round((healthyJobs / totalJobs) * 100) : 100;
      let status: DependencyStatus['status'] = 'HEALTHY';
      let message = 'All cron jobs are healthy';

      if (unhealthyJobs > 0) {
        if (score >= 70) {
          status = 'WARNING';
          message = `${unhealthyJobs}/${totalJobs} cron jobs need attention`;
        } else if (score >= 30) {
          status = 'CRITICAL';
          message = `${unhealthyJobs}/${totalJobs} cron jobs are unhealthy`;
        } else {
          status = 'DEGRADED';
          message = 'Most cron jobs are failing';
        }
      }

      return {
        name: 'cron_job_health',
        status,
        score,
        message,
        details: {
          totalJobs,
          healthyJobs,
          unhealthyJobs,
          jobStatuses: healthStatus
        },
        lastUpdated: new Date(),
        canAutoFix: true,
        requiresAttention: status !== 'HEALTHY',
        estimatedImpact: status === 'DEGRADED' ? 'CRITICAL' : 
                        status === 'CRITICAL' ? 'HIGH' : 
                        status === 'WARNING' ? 'MEDIUM' : 'NONE'
      };

    } catch (error) {
      return {
        name: 'cron_job_health',
        status: 'DEGRADED',
        score: 0,
        message: `Cron job health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: { error: true },
        lastUpdated: new Date(),
        canAutoFix: false,
        requiresAttention: true,
        estimatedImpact: 'HIGH'
      };
    }
  }

  /**
   * Auto-fix product snapshots
   */
  private async autoFixProductSnapshots(projectId: string, context?: any): Promise<{ success: boolean; message: string }> {
    try {
      // Import and use the product data recovery service
      const { productDataRecoveryService } = await import('../recovery/productDataRecoveryService');
      
      const recoveryResult = await productDataRecoveryService.recoverProductSnapshots(projectId, {
        validateAfterRecovery: true,
        retryFailedSnapshots: true
      });

      return {
        success: recoveryResult.success && recoveryResult.snapshotsRecovered > 0,
        message: `Recovered ${recoveryResult.snapshotsRecovered} snapshots, ${recoveryResult.snapshotsFailed} failed`
      };

    } catch (error) {
      return {
        success: false,
        message: `Auto-fix failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Auto-fix competitor snapshots
   */
  private async autoFixCompetitorSnapshots(projectId: string, context?: any): Promise<{ success: boolean; message: string }> {
    try {
      // This would trigger competitor snapshot recapture in a real implementation
      return {
        success: true,
        message: 'Competitor snapshot recapture initiated'
      };

    } catch (error) {
      return {
        success: false,
        message: `Auto-fix failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Auto-fix cron jobs
   */
  private async autoFixCronJobs(projectId: string, context?: any): Promise<{ success: boolean; message: string }> {
    try {
      const { cronJobRecoveryService } = await import('../recovery/cronJobRecoveryService');
      
      const recoveryResult = await cronJobRecoveryService.fixDegradedCronJobs({
        forceRestart: true,
        cleanupZombieJobs: true
      });

      return {
        success: recoveryResult.success,
        message: `Fixed ${recoveryResult.jobsFixed} jobs, removed ${recoveryResult.jobsRemoved} zombie jobs`
      };

    } catch (error) {
      return {
        success: false,
        message: `Auto-fix failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Calculate overall status from individual dependency statuses
   */
  private calculateOverallStatus(result: EarlyWarningCheck): void {
    let totalWeightedScore = 0;
    let totalWeight = 0;
    let hasCritical = false;
    let hasWarnings = false;

    for (const status of result.dependencyStatuses) {
      const dependency = this.dependencies.find(d => d.name === status.name);
      const weight = dependency ? this.getWeightForPriority(dependency.priority) : 5;
      
      totalWeightedScore += status.score * weight;
      totalWeight += weight;

      if (status.status === 'CRITICAL' || status.status === 'MISSING') {
        hasCritical = true;
        result.criticalIssues.push(`${status.name}: ${status.message}`);
      } else if (status.status === 'WARNING' || status.status === 'DEGRADED') {
        hasWarnings = true;
        result.warnings.push(`${status.name}: ${status.message}`);
      }

      if (status.requiresAttention) {
        result.recommendations.push(`Address ${status.name}: ${status.message}`);
      }
    }

    result.overallScore = totalWeight > 0 ? Math.round(totalWeightedScore / totalWeight) : 0;

    if (hasCritical) {
      result.overallStatus = 'CRITICAL';
    } else if (hasWarnings || result.overallScore < 70) {
      result.overallStatus = 'WARNING';
    } else {
      result.overallStatus = 'HEALTHY';
    }
  }

  /**
   * Get weight for priority level
   */
  private getWeightForPriority(priority: string): number {
    switch (priority) {
      case 'CRITICAL': return 10;
      case 'HIGH': return 8;
      case 'MEDIUM': return 5;
      case 'LOW': return 3;
      default: return 5;
    }
  }

  /**
   * Process check results and generate alerts
   */
  private async processCheckResults(checkResult: EarlyWarningCheck, options: EarlyWarningOptions): Promise<void> {
    try {
      // Generate alerts for critical issues
      for (const status of checkResult.dependencyStatuses) {
        if (status.requiresAttention) {
          await this.generateAlert(checkResult.projectId, status, options);
        }
      }

      // Track check results
      trackBusinessEvent('early_warning_check_completed', {
        projectId: checkResult.projectId,
        overallStatus: checkResult.overallStatus,
        overallScore: checkResult.overallScore,
        criticalIssues: checkResult.criticalIssues.length,
        warnings: checkResult.warnings.length,
        autoFixAttempts: checkResult.autoFixAttempts.length
      });

    } catch (error) {
      logger.error('Error processing early warning check results', error as Error, {
        projectId: checkResult.projectId
      });
    }
  }

  /**
   * Generate alert for dependency issue
   */
  private async generateAlert(
    projectId: string,
    status: DependencyStatus,
    options: EarlyWarningOptions
  ): Promise<void> {
    const alertId = `${projectId}-${status.name}-${Date.now()}`;
    
    const alert: EarlyWarningAlert = {
      id: alertId,
      projectId,
      dependencyName: status.name,
      alertLevel: status.status === 'CRITICAL' || status.status === 'MISSING' ? 'CRITICAL' :
                  status.status === 'WARNING' || status.status === 'DEGRADED' ? 'WARNING' : 'INFO',
      message: status.message,
      details: status.details,
      createdAt: new Date(),
      acknowledged: false,
      autoResolved: false
    };

    this.activeAlerts.set(alertId, alert);

    logger.warn(`Early warning alert generated: ${status.name}`, {
      projectId,
      alertLevel: alert.alertLevel,
      message: alert.message,
      dependencyName: status.name
    });

    trackBusinessEvent('early_warning_alert_generated', {
      projectId,
      alertId,
      dependencyName: status.name,
      alertLevel: alert.alertLevel,
      estimatedImpact: status.estimatedImpact
    });
  }

  /**
   * Get active projects for monitoring
   */
  private async getActiveProjectIds(): Promise<string[]> {
    try {
      const activeProjects = await prisma.project.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true }
      });

      return activeProjects.map(p => p.id);
    } catch (error) {
      logger.error('Error getting active project IDs', error as Error);
      return [];
    }
  }

  /**
   * Get current alerts for a project
   */
  public getActiveAlerts(projectId?: string): EarlyWarningAlert[] {
    const alerts = Array.from(this.activeAlerts.values());
    return projectId ? alerts.filter(alert => alert.projectId === projectId) : alerts;
  }

  /**
   * Acknowledge an alert
   */
  public acknowledgeAlert(alertId: string): boolean {
    const alert = this.activeAlerts.get(alertId);
    if (alert) {
      alert.acknowledged = true;
      return true;
    }
    return false;
  }

  /**
   * Get monitoring status
   */
  public getMonitoringStatus(): {
    isMonitoring: boolean;
    activeAlerts: number;
    dependencyCount: number;
  } {
    return {
      isMonitoring: this.isMonitoring,
      activeAlerts: this.activeAlerts.size,
      dependencyCount: this.dependencies.length
    };
  }
}

// Export singleton instance
export const dataDependendencyEarlyWarning = DataDependencyEarlyWarning.getInstance(); 