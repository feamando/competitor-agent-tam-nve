import { logger, generateCorrelationId, trackBusinessEvent } from '@/lib/logger';  
import { cronJobRecoveryService } from '@/lib/recovery/cronJobRecoveryService';
import { stuckJobRecoveryMechanism } from '@/lib/recovery/stuckJobRecoveryMechanism';

export interface HealthMonitoringConfig {
  checkInterval: number; // milliseconds
  maxConsecutiveFailures: number;
  autoRestartEnabled: boolean;
  healthThresholds: {
    warningThreshold: number; // percentage
    criticalThreshold: number; // percentage
  };
  alertingEnabled: boolean;
  stuckJobDetection: {
    enabled: boolean;
    maxExecutionTime: number; // milliseconds
    forceKillTimeout: number; // milliseconds
  };
}

export interface HealthCheckResult {
  timestamp: Date;
  overallHealth: 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'DEGRADED';
  healthScore: number; // 0-100
  totalJobs: number;
  healthyJobs: number;
  unhealthyJobs: number;
  stuckJobs: number;
  autoRestartAttempts: number;
  issues: HealthIssue[];
  recommendations: string[];
}

export interface HealthIssue {
  jobId: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  type: 'DISCONNECTED' | 'STUCK' | 'FAILING' | 'OVERDUE' | 'ZOMBIE';
  description: string;
  actionTaken?: string;
  timestamp: Date;
}

export interface AutoRestartResult {
  success: boolean;
  jobId: string;
  attempt: number;
  restartTime: number;
  error?: string;
}

export class ProactiveCronHealthMonitor {
  private static instance: ProactiveCronHealthMonitor;
  private monitoringInterval?: NodeJS.Timeout;
  private isMonitoring = false;
  private healthHistory: HealthCheckResult[] = [];
  private consecutiveFailures: Map<string, number> = new Map();
  private restartAttempts: Map<string, number> = new Map();
  private config?: HealthMonitoringConfig;

  public static getInstance(): ProactiveCronHealthMonitor {
    if (!ProactiveCronHealthMonitor.instance) {
      ProactiveCronHealthMonitor.instance = new ProactiveCronHealthMonitor();
    }
    return ProactiveCronHealthMonitor.instance;
  }

  /**
   * Start proactive health monitoring
   * Task 3.3: Main monitoring and auto-restart functionality
   */
  public startHealthMonitoring(config: HealthMonitoringConfig): void {
    if (this.isMonitoring) {
      logger.warn('Health monitoring is already running');
      return;
    }

    this.config = config;
    const correlationId = generateCorrelationId();
    const context = { correlationId, operation: 'startHealthMonitoring' };

    logger.info('Starting proactive cron job health monitoring', {
      ...context,
      checkInterval: config.checkInterval,
      autoRestartEnabled: config.autoRestartEnabled,
      stuckDetectionEnabled: config.stuckJobDetection.enabled
    });

    this.isMonitoring = true;

    // Start stuck job monitoring if enabled
    if (config.stuckJobDetection.enabled) {
      stuckJobRecoveryMechanism.startStuckJobMonitoring({
        maxExecutionTime: config.stuckJobDetection.maxExecutionTime,
        checkInterval: Math.min(config.checkInterval, 30000), // Check stuck jobs more frequently
        stuckThreshold: 3,
        enableAutoRecovery: config.autoRestartEnabled,
        forceKillTimeout: config.stuckJobDetection.forceKillTimeout
      });
    }

    // Start periodic health checks
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        logger.error('Error during health check', error as Error, context);
      }
    }, config.checkInterval);

    trackBusinessEvent('proactive_health_monitoring_started', {
      correlationId,
      config: {
        checkInterval: config.checkInterval,
        autoRestartEnabled: config.autoRestartEnabled,
        stuckDetectionEnabled: config.stuckJobDetection.enabled
      }
    });
  }

  /**
   * Stop health monitoring
   */
  public stopHealthMonitoring(): void {
    if (!this.isMonitoring) {
      logger.warn('Health monitoring is not running');
      return;
    }

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }

    // Stop stuck job monitoring
    stuckJobRecoveryMechanism.stopStuckJobMonitoring();

    this.isMonitoring = false;
    this.config = undefined;
    
    logger.info('Stopped proactive cron job health monitoring');

    trackBusinessEvent('proactive_health_monitoring_stopped', {
      correlationId: generateCorrelationId()
    });
  }

  /**
   * Perform comprehensive health check
   */
  private async performHealthCheck(): Promise<HealthCheckResult> {
    const correlationId = generateCorrelationId();
    const context = { correlationId, operation: 'performHealthCheck' };
    
    logger.debug('Performing health check', context);

    const result: HealthCheckResult = {
      timestamp: new Date(),
      overallHealth: 'HEALTHY',
      healthScore: 100,
      totalJobs: 0,
      healthyJobs: 0,
      unhealthyJobs: 0,
      stuckJobs: 0,
      autoRestartAttempts: 0,
      issues: [],
      recommendations: []
    };

    try {
      // Get current job health status
      const cronHealthStatus = await cronJobRecoveryService.getHealthStatus();
      const stuckJobsStatus = stuckJobRecoveryMechanism.getRunningJobsStatus();
      
      result.totalJobs = cronHealthStatus.length;
      result.stuckJobs = stuckJobsStatus.filter(job => job.isStuck).length;

      // Analyze each cron job
      for (const jobHealth of cronHealthStatus) {
        if (jobHealth.healthStatus === 'HEALTHY') {
          result.healthyJobs++;
        } else {
          result.unhealthyJobs++;
          
          // Create health issue
          const issue: HealthIssue = {
            jobId: jobHealth.jobId,
            severity: this.determineSeverity(jobHealth.healthStatus),
            type: this.mapHealthStatusToIssueType(jobHealth.healthStatus),
            description: jobHealth.issues.join('; ') || `Job is ${jobHealth.healthStatus}`,
            timestamp: new Date()
          };

          result.issues.push(issue);

          // Attempt auto-restart if enabled
          if (this.config?.autoRestartEnabled && this.shouldAttemptRestart(jobHealth)) {
            const restartResult = await this.attemptAutoRestart(jobHealth);
            if (restartResult.success) {
              issue.actionTaken = `Auto-restarted (attempt ${restartResult.attempt})`;
              result.autoRestartAttempts++;
            } else {
              issue.actionTaken = `Auto-restart failed: ${restartResult.error}`;
            }
          }
        }
      }

      // Calculate health score
      result.healthScore = this.calculateHealthScore(result);

      // Determine overall health
      result.overallHealth = this.determineOverallHealth(result);

      // Generate recommendations
      result.recommendations = this.generateRecommendations(result);

      // Store in history (keep last 100 checks)
      this.healthHistory.push(result);
      if (this.healthHistory.length > 100) {
        this.healthHistory.shift();
      }

      // Log health status
      if (result.overallHealth !== 'HEALTHY') {
        logger.warn('Cron job health check detected issues', {
          ...context,
          overallHealth: result.overallHealth,
          healthScore: result.healthScore,
          totalJobs: result.totalJobs,
          unhealthyJobs: result.unhealthyJobs,
          issueCount: result.issues.length
        });
      } else {
        logger.debug('Cron job health check passed', {
          ...context,
          healthScore: result.healthScore,
          totalJobs: result.totalJobs
        });
      }

      // Track health metrics
      trackBusinessEvent('health_check_completed', {
        correlationId,
        overallHealth: result.overallHealth,
        healthScore: result.healthScore,
        totalJobs: result.totalJobs,
        unhealthyJobs: result.unhealthyJobs,
        autoRestartAttempts: result.autoRestartAttempts
      });

      return result;

    } catch (error) {
      logger.error('Health check failed', error as Error, context);
      
      result.overallHealth = 'CRITICAL';
      result.healthScore = 0;
      result.issues.push({
        jobId: 'SYSTEM',
        severity: 'CRITICAL',
        type: 'FAILING',
        description: `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date()
      });

      return result;
    }
  }

  /**
   * Determine if a job should be auto-restarted
   */
  private shouldAttemptRestart(jobHealth: any): boolean {
    if (!this.config?.autoRestartEnabled) return false;

    const consecutiveFailures = this.consecutiveFailures.get(jobHealth.jobId) || 0;
    const restartAttempts = this.restartAttempts.get(jobHealth.jobId) || 0;

    // Don't restart if we've already tried too many times
    if (restartAttempts >= this.config.maxConsecutiveFailures) {
      return false;
    }

    // Only restart for certain health statuses
    const restartableStatuses = ['DISCONNECTED', 'DEGRADED', 'UNHEALTHY'];
    return restartableStatuses.includes(jobHealth.healthStatus);
  }

  /**
   * Attempt to auto-restart a job
   */
  private async attemptAutoRestart(jobHealth: any): Promise<AutoRestartResult> {
    const startTime = Date.now();
    const attemptNumber = (this.restartAttempts.get(jobHealth.jobId) || 0) + 1;
    
    const context = { 
      jobId: jobHealth.jobId, 
      attempt: attemptNumber,
      operation: 'attemptAutoRestart'
    };

    logger.info('Attempting auto-restart of unhealthy job', context);

    try {
      // Use cron job recovery service to fix the job
      const recoveryResult = await cronJobRecoveryService.fixDegradedCronJobs({
        forceRestart: true,
        cleanupZombieJobs: true
      });

      const restartTime = Date.now() - startTime;
      
      // Track restart attempt
      this.restartAttempts.set(jobHealth.jobId, attemptNumber);

      if (recoveryResult.success && recoveryResult.jobsFixed > 0) {
        // Reset consecutive failures on successful restart
        this.consecutiveFailures.delete(jobHealth.jobId);
        
        logger.info('Auto-restart succeeded', {
          ...context,
          restartTime,
          jobsFixed: recoveryResult.jobsFixed
        });

        trackBusinessEvent('auto_restart_succeeded', {
          jobId: jobHealth.jobId,
          attempt: attemptNumber,
          restartTime,
          correlationId: generateCorrelationId()
        });

        return {
          success: true,
          jobId: jobHealth.jobId,
          attempt: attemptNumber,
          restartTime
        };
      } else {
        // Increment consecutive failures
        this.consecutiveFailures.set(jobHealth.jobId, 
          (this.consecutiveFailures.get(jobHealth.jobId) || 0) + 1);

        const error = `Recovery failed: ${recoveryResult.errors.join(', ') || 'Unknown reason'}`;
        
        logger.warn('Auto-restart failed', {
          ...context,
          error,
          restartTime
        });

        trackBusinessEvent('auto_restart_failed', {
          jobId: jobHealth.jobId,
          attempt: attemptNumber,
          error,
          correlationId: generateCorrelationId()
        });

        return {
          success: false,
          jobId: jobHealth.jobId,
          attempt: attemptNumber,
          restartTime,
          error
        };
      }

    } catch (error) {
      const restartTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Increment consecutive failures
      this.consecutiveFailures.set(jobHealth.jobId, 
        (this.consecutiveFailures.get(jobHealth.jobId) || 0) + 1);

      logger.error('Auto-restart threw error', error as Error, context);

      return {
        success: false,
        jobId: jobHealth.jobId,
        attempt: attemptNumber,
        restartTime,
        error: errorMessage
      };
    }
  }

  /**
   * Calculate overall health score
   */
  private calculateHealthScore(result: HealthCheckResult): number {
    if (result.totalJobs === 0) return 100;

    const healthyRatio = result.healthyJobs / result.totalJobs;
    const stuckPenalty = Math.min(result.stuckJobs * 10, 50); // Up to 50% penalty for stuck jobs
    
    return Math.max(0, Math.round((healthyRatio * 100) - stuckPenalty));
  }

  /**
   * Determine overall health status
   */
  private determineOverallHealth(result: HealthCheckResult): 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'DEGRADED' {
    if (!this.config) return 'DEGRADED';

    if (result.healthScore >= this.config.healthThresholds.warningThreshold) {
      return 'HEALTHY';
    } else if (result.healthScore >= this.config.healthThresholds.criticalThreshold) {
      return 'WARNING';
    } else if (result.totalJobs > 0) {
      return 'CRITICAL';
    } else {
      return 'DEGRADED';
    }
  }

  /**
   * Generate health recommendations
   */
  private generateRecommendations(result: HealthCheckResult): string[] {
    const recommendations: string[] = [];

    if (result.unhealthyJobs > 0) {
      recommendations.push(`${result.unhealthyJobs} jobs need attention`);
    }

    if (result.stuckJobs > 0) {
      recommendations.push(`${result.stuckJobs} jobs appear to be stuck`);
    }

    if (result.healthScore < 50) {
      recommendations.push('System health is critical - immediate action required');
    }

    if (result.autoRestartAttempts === 0 && result.unhealthyJobs > 0) {
      recommendations.push('Consider enabling auto-restart for automatic recovery');
    }

    const highSeverityIssues = result.issues.filter(i => i.severity === 'CRITICAL' || i.severity === 'HIGH').length;
    if (highSeverityIssues > 0) {
      recommendations.push(`${highSeverityIssues} high-priority issues require manual intervention`);
    }

    return recommendations;
  }

  /**
   * Map health status to issue type
   */
  private mapHealthStatusToIssueType(healthStatus: string): HealthIssue['type'] {
    switch (healthStatus) {
      case 'DISCONNECTED': return 'DISCONNECTED';
      case 'ZOMBIE': return 'ZOMBIE';
      case 'DEGRADED': return 'FAILING';
      case 'UNHEALTHY': return 'OVERDUE';
      default: return 'FAILING';
    }
  }

  /**
   * Determine issue severity
   */
  private determineSeverity(healthStatus: string): HealthIssue['severity'] {
    switch (healthStatus) {
      case 'ZOMBIE': return 'HIGH';
      case 'DISCONNECTED': return 'HIGH';
      case 'UNHEALTHY': return 'MEDIUM';
      case 'DEGRADED': return 'LOW';
      default: return 'MEDIUM';
    }
  }

  /**
   * Get current health status
   */
  public async getCurrentHealth(): Promise<HealthCheckResult | null> {
    if (!this.isMonitoring) {
      return null;
    }

    return this.performHealthCheck();
  }

  /**
   * Get health history
   */
  public getHealthHistory(limit: number = 50): HealthCheckResult[] {
    return this.healthHistory.slice(-limit);
  }

  /**
   * Get monitoring status
   */
  public getMonitoringStatus(): {
    isMonitoring: boolean;
    config?: HealthMonitoringConfig;
    lastCheckTime?: Date;
    historyCount: number;
  } {
    return {
      isMonitoring: this.isMonitoring,
      config: this.config,
      lastCheckTime: this.healthHistory.length > 0 ? 
        this.healthHistory[this.healthHistory.length - 1].timestamp : undefined,
      historyCount: this.healthHistory.length
    };
  }

  /**
   * Force a health check now
   */
  public async forceHealthCheck(): Promise<HealthCheckResult> {
    return this.performHealthCheck();
  }

  /**
   * Reset restart attempts for a job
   */
  public resetRestartAttempts(jobId?: string): void {
    if (jobId) {
      this.restartAttempts.delete(jobId);
      this.consecutiveFailures.delete(jobId);
      logger.info('Reset restart attempts for job', { jobId });
    } else {
      this.restartAttempts.clear();
      this.consecutiveFailures.clear();
      logger.info('Reset all restart attempts');
    }
  }
}

// Export singleton instance
export const proactiveCronHealthMonitor = ProactiveCronHealthMonitor.getInstance(); 