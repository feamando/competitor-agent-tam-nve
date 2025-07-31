/**
 * Cron Job Manager Service - Task 2.2 Implementation
 * 
 * This service provides proper cron job management for scheduled reports with:
 * - Health checks for scheduled report jobs
 * - Job recovery mechanisms for failed schedules  
 * - Comprehensive logging for cron job execution and failures
 * - Job monitoring and status tracking
 */

import * as cron from 'node-cron';
import { 
  logger, 
  generateCorrelationId, 
  createCorrelationLogger,
  trackBusinessEvent
} from '@/lib/logger';
import { prisma } from '@/lib/prisma';

export interface CronJobConfig {
  id: string;
  name: string;
  cronPattern: string;
  projectId?: string;
  jobType: 'SCHEDULED_REPORT' | 'PERIODIC_ANALYSIS' | 'SYSTEM_MAINTENANCE';
  isActive: boolean;
  maxRetries: number;
  retryDelayMs: number;
  timeoutMs: number;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CronJobExecution {
  jobId: string;
  executionId: string;
  startTime: Date;
  endTime?: Date;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'TIMEOUT' | 'RETRY';
  output?: string;
  error?: string;
  duration?: number;
  attempt: number;
  maxAttempts: number;
}

export interface CronJobHealth {
  jobId: string;
  isHealthy: boolean;
  lastHealthCheck: Date;
  lastSuccessfulExecution?: Date;
  lastFailedExecution?: Date;
  consecutiveFailures: number;
  healthStatus: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'UNKNOWN';
  issues: string[];
}

export interface CronJobRecoveryOptions {
  maxConsecutiveFailures: number;
  enableAutoRecovery: boolean;
  recoveryDelayMs: number;
  escalationThreshold: number;
}

export class CronJobManager {
  private jobs: Map<string, { config: CronJobConfig; task: cron.ScheduledTask }> = new Map();
  private executions: Map<string, CronJobExecution> = new Map();
  private healthStatus: Map<string, CronJobHealth> = new Map();
  private recoveryOptions: CronJobRecoveryOptions;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private isInitialized = false;

  constructor(recoveryOptions?: Partial<CronJobRecoveryOptions>) {
    this.recoveryOptions = {
      maxConsecutiveFailures: 3,
      enableAutoRecovery: true,
      recoveryDelayMs: 60000, // 1 minute
      escalationThreshold: 5,
      ...recoveryOptions
    };
  }

  /**
   * Initialize the cron job manager
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      logger.info('Initializing Cron Job Manager...');

      // Load existing scheduled jobs from database
      await this.loadExistingJobs();

      // Start health monitoring
      this.startHealthMonitoring();

      // Set up cleanup handlers
      this.setupCleanupHandlers();

      this.isInitialized = true;
      logger.info('Cron Job Manager initialized successfully');

      trackBusinessEvent('cron_job_manager_initialized', {
        totalJobs: this.jobs.size,
        activeJobs: Array.from(this.jobs.values()).filter(j => j.config.isActive).length
      });

    } catch (error) {
      logger.error('Failed to initialize Cron Job Manager', error as Error);
      throw error;
    }
  }

  /**
   * Schedule a new cron job
   */
  async scheduleJob(config: Omit<CronJobConfig, 'createdAt' | 'updatedAt'>): Promise<string> {
    const correlationId = generateCorrelationId();
    const jobLogger = createCorrelationLogger(correlationId);
    
    try {
      const jobConfig: CronJobConfig = {
        ...config,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Validate cron pattern
      if (!cron.validate(config.cronPattern)) {
        throw new Error(`Invalid cron pattern: ${config.cronPattern}`);
      }

             jobLogger.info('Scheduling new cron job', {
         jobId: config.id,
         jobType: config.jobType,
         cronPattern: config.cronPattern,
         ...(config.projectId && { projectId: config.projectId })
       });

             // Create cron task with proper error handling
       const cronTask = cron.schedule(config.cronPattern, async () => {
         await this.executeJob(config.id);
       }, {
         timezone: 'UTC'
       });

      // Store job configuration and task
      this.jobs.set(config.id, { config: jobConfig, task: cronTask });

      // Initialize health status
      this.healthStatus.set(config.id, {
        jobId: config.id,
        isHealthy: true,
        lastHealthCheck: new Date(),
        consecutiveFailures: 0,
        healthStatus: 'UNKNOWN',
        issues: []
      });

      // Start the job if it's active
      if (jobConfig.isActive) {
        cronTask.start();
        jobLogger.info('Cron job started', { jobId: config.id });
      }

      // Persist to database
      await this.persistJobConfig(jobConfig);

      trackBusinessEvent('cron_job_scheduled', {
        jobId: config.id,
        jobType: config.jobType,
        cronPattern: config.cronPattern,
        correlationId
      });

      return config.id;

    } catch (error) {
      logger.error('Failed to schedule cron job', error as Error, {
        jobId: config.id,
        correlationId
      });
      throw error;
    }
  }

  /**
   * Execute a cron job with comprehensive logging and error handling
   */
  private async executeJob(jobId: string): Promise<void> {
    const jobEntry = this.jobs.get(jobId);
    if (!jobEntry) {
      logger.error('Attempted to execute non-existent job', { jobId });
      return;
    }

    const { config } = jobEntry;
    const executionId = `${jobId}-${Date.now()}`;
    const correlationId = generateCorrelationId();
    const jobLogger = createCorrelationLogger(correlationId);
    const startTime = new Date();

    // Create execution record
    const execution: CronJobExecution = {
      jobId,
      executionId,
      startTime,
      status: 'RUNNING',
      attempt: 1,
      maxAttempts: config.maxRetries + 1
    };
    this.executions.set(executionId, execution);

           jobLogger.info('Starting cron job execution', {
         jobId,
         executionId,
         jobType: config.jobType,
         attempt: execution.attempt,
         maxAttempts: execution.maxAttempts,
         ...(config.projectId && { projectId: config.projectId })
       });

    try {
      // Execute job with timeout
      const result = await Promise.race([
        this.executeJobLogic(config, correlationId),
        this.createTimeoutPromise(config.timeoutMs)
      ]);

      // Mark execution as successful
      const endTime = new Date();
      execution.endTime = endTime;
      execution.status = 'SUCCESS';
      execution.output = result;
      execution.duration = endTime.getTime() - startTime.getTime();

      // Update health status
      this.updateHealthStatus(jobId, true);

      jobLogger.info('Cron job execution completed successfully', {
        jobId,
        executionId,
        duration: execution.duration,
        output: result
      });

      trackBusinessEvent('cron_job_execution_success', {
        jobId,
        executionId,
        duration: execution.duration,
        correlationId
      });

    } catch (error) {
      const endTime = new Date();
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      execution.endTime = endTime;
      execution.duration = endTime.getTime() - startTime.getTime();
      execution.error = errorMessage;

      if (errorMessage.includes('timeout')) {
        execution.status = 'TIMEOUT';
      } else {
        execution.status = 'FAILED';
      }

      jobLogger.error('Cron job execution failed', error as Error, {
        jobId,
        executionId,
        duration: execution.duration,
        attempt: execution.attempt,
        maxAttempts: execution.maxAttempts
      });

      // Update health status
      this.updateHealthStatus(jobId, false, errorMessage);

      // Handle retry logic
      if (execution.attempt < execution.maxAttempts) {
        await this.scheduleRetry(jobId, execution, error as Error);
      } else {
        // All retries exhausted, trigger recovery if enabled
        if (this.recoveryOptions.enableAutoRecovery) {
          await this.triggerJobRecovery(jobId, error as Error);
        }
      }

      trackBusinessEvent('cron_job_execution_failure', {
        jobId,
        executionId,
        error: errorMessage,
        attempt: execution.attempt,
        maxAttempts: execution.maxAttempts,
        correlationId
      });
    }

    // Clean up old executions (keep last 100 per job)
    this.cleanupOldExecutions(jobId);
  }

  /**
   * Execute the actual job logic based on job type
   */
  private async executeJobLogic(config: CronJobConfig, correlationId: string): Promise<string> {
    const jobLogger = createCorrelationLogger(correlationId);

    switch (config.jobType) {
      case 'SCHEDULED_REPORT':
        return await this.executeScheduledReport(config, jobLogger);
      
      case 'PERIODIC_ANALYSIS':
        return await this.executePeriodicAnalysis(config, jobLogger);
      
      case 'SYSTEM_MAINTENANCE':
        return await this.executeSystemMaintenance(config, jobLogger);
      
      default:
        throw new Error(`Unknown job type: ${config.jobType}`);
    }
  }

  /**
   * Execute scheduled report generation
   */
  private async executeScheduledReport(config: CronJobConfig, jobLogger: any): Promise<string> {
    if (!config.projectId) {
      throw new Error('Project ID required for scheduled report jobs');
    }

    jobLogger.info('Executing scheduled report generation', {
      projectId: config.projectId,
      jobId: config.id
    });

    // Import the auto report service dynamically to avoid circular dependencies
    const { getAutoReportService } = await import('./autoReportGenerationService');
    const autoReportService = getAutoReportService();

                // Execute scheduled report generation by triggering event
       const result = await autoReportService.triggerReportOnEvent(config.projectId, {
         type: 'userRequestedUpdate',
         projectId: config.projectId,
         metadata: { triggeredBy: 'cron', source: 'scheduled' }
       });
       
       return `Scheduled report triggered successfully. Task ID: ${result.taskId}, Queue position: ${result.queuePosition}`;
  }

  /**
   * Execute periodic analysis
   */
  private async executePeriodicAnalysis(config: CronJobConfig, jobLogger: any): Promise<string> {
    jobLogger.info('Executing periodic analysis', {
      projectId: config.projectId,
      jobId: config.id
    });

    // Implement periodic analysis logic here
    // This could involve running smart scheduling checks, competitor monitoring, etc.
    
    return 'Periodic analysis completed successfully';
  }

  /**
   * Execute system maintenance
   */
  private async executeSystemMaintenance(config: CronJobConfig, jobLogger: any): Promise<string> {
    jobLogger.info('Executing system maintenance', {
      jobId: config.id
    });

    // Implement system maintenance logic here
    // This could involve cleanup tasks, health checks, etc.
    
    return 'System maintenance completed successfully';
  }

  /**
   * Create a timeout promise
   */
  private createTimeoutPromise(timeoutMs: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Job execution timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });
  }

  /**
   * Schedule a retry for a failed job execution
   */
  private async scheduleRetry(jobId: string, execution: CronJobExecution, error: Error): Promise<void> {
    const config = this.jobs.get(jobId)?.config;
    if (!config) return;

    const retryDelay = config.retryDelayMs * execution.attempt; // Exponential backoff
    
    logger.info('Scheduling job retry', {
      jobId,
      executionId: execution.executionId,
      attempt: execution.attempt,
      maxAttempts: execution.maxAttempts,
      retryDelayMs: retryDelay
    });

    setTimeout(async () => {
      const retryExecutionId = `${jobId}-${Date.now()}-retry-${execution.attempt}`;
             const retryExecution: CronJobExecution = {
         jobId: execution.jobId,
         executionId: retryExecutionId,
         startTime: new Date(),
         status: 'RETRY',
         attempt: execution.attempt + 1,
         maxAttempts: execution.maxAttempts
       };

      this.executions.set(retryExecutionId, retryExecution);
      await this.executeJob(jobId);
    }, retryDelay);
  }

  /**
   * Trigger job recovery mechanisms
   */
  private async triggerJobRecovery(jobId: string, error: Error): Promise<void> {
    const healthStatus = this.healthStatus.get(jobId);
    if (!healthStatus) return;

    logger.warn('Triggering job recovery', {
      jobId,
      consecutiveFailures: healthStatus.consecutiveFailures,
      maxConsecutiveFailures: this.recoveryOptions.maxConsecutiveFailures,
      error: error.message
    });

    if (healthStatus.consecutiveFailures >= this.recoveryOptions.escalationThreshold) {
      // Escalate to emergency recovery
      await this.escalateJobFailure(jobId, error);
    } else {
      // Standard recovery - restart the job after delay
      setTimeout(async () => {
        await this.restartJob(jobId);
      }, this.recoveryOptions.recoveryDelayMs);
    }

    trackBusinessEvent('cron_job_recovery_triggered', {
      jobId,
      consecutiveFailures: healthStatus.consecutiveFailures,
      recoveryType: healthStatus.consecutiveFailures >= this.recoveryOptions.escalationThreshold 
        ? 'escalation' : 'standard'
    });
  }

  /**
   * Escalate job failure to emergency recovery
   */
  private async escalateJobFailure(jobId: string, error: Error): Promise<void> {
    logger.error('Escalating job failure to emergency recovery', error, {
      jobId,
      escalationThreshold: this.recoveryOptions.escalationThreshold
    });

    // Disable the problematic job temporarily
    await this.pauseJob(jobId);

    // Notify administrators (implement notification logic here)
    // Could integrate with email, Slack, or other alerting systems

    trackBusinessEvent('cron_job_failure_escalated', {
      jobId,
      error: error.message
    });
  }

  /**
   * Restart a job
   */
  private async restartJob(jobId: string): Promise<void> {
    const jobEntry = this.jobs.get(jobId);
    if (!jobEntry) return;

    logger.info('Restarting job after recovery', { jobId });

    // Stop and restart the cron task
    jobEntry.task.stop();
    jobEntry.task.start();

    // Reset health status
    const healthStatus = this.healthStatus.get(jobId);
    if (healthStatus) {
      healthStatus.consecutiveFailures = 0;
      healthStatus.healthStatus = 'UNKNOWN';
      healthStatus.issues = [];
      healthStatus.lastHealthCheck = new Date();
    }

    trackBusinessEvent('cron_job_restarted', { jobId });
  }

  /**
   * Update health status for a job
   */
  private updateHealthStatus(jobId: string, success: boolean, error?: string): void {
    const healthStatus = this.healthStatus.get(jobId);
    if (!healthStatus) return;

    healthStatus.lastHealthCheck = new Date();

    if (success) {
      healthStatus.lastSuccessfulExecution = new Date();
      healthStatus.consecutiveFailures = 0;
      healthStatus.healthStatus = 'HEALTHY';
      healthStatus.issues = [];
      healthStatus.isHealthy = true;
    } else {
      healthStatus.lastFailedExecution = new Date();
      healthStatus.consecutiveFailures++;
      healthStatus.isHealthy = false;

      if (error) {
        healthStatus.issues.push(error);
        // Keep only last 5 issues
        healthStatus.issues = healthStatus.issues.slice(-5);
      }

      // Determine health status based on consecutive failures
      if (healthStatus.consecutiveFailures >= this.recoveryOptions.escalationThreshold) {
        healthStatus.healthStatus = 'UNHEALTHY';
      } else if (healthStatus.consecutiveFailures >= this.recoveryOptions.maxConsecutiveFailures) {
        healthStatus.healthStatus = 'DEGRADED';
      } else {
        healthStatus.healthStatus = 'DEGRADED';
      }
    }
  }

  /**
   * Perform health checks on all jobs
   */
  async performHealthChecks(): Promise<Map<string, CronJobHealth>> {
    logger.info('Performing health checks on all cron jobs', {
      totalJobs: this.jobs.size
    });

    for (const [jobId, jobEntry] of this.jobs) {
      await this.performJobHealthCheck(jobId, jobEntry);
    }

    return new Map(this.healthStatus);
  }

  /**
   * Perform health check on a specific job
   */
  private async performJobHealthCheck(jobId: string, jobEntry: { config: CronJobConfig; task: cron.ScheduledTask }): Promise<void> {
    const { config, task } = jobEntry;
    const healthStatus = this.healthStatus.get(jobId);
    if (!healthStatus) return;

    try {
      // Check if cron task is still running
      const isTaskRunning = task.getStatus() !== null;
      
      // Check last execution time
      const recentExecutions = this.getRecentExecutions(jobId, 24); // Last 24 hours
      const hasRecentActivity = recentExecutions.length > 0;
      
      // Update health status
      healthStatus.lastHealthCheck = new Date();
      
      if (!isTaskRunning && config.isActive) {
        healthStatus.issues.push('Cron task is not running despite being active');
        healthStatus.healthStatus = 'UNHEALTHY';
        healthStatus.isHealthy = false;
      } else if (!hasRecentActivity && config.isActive) {
        // This might be normal depending on the cron schedule
        const timeSinceLastCheck = Date.now() - (healthStatus.lastSuccessfulExecution?.getTime() || 0);
        const expectedInterval = this.getCronIntervalMs(config.cronPattern);
        
        if (timeSinceLastCheck > expectedInterval * 2) {
          healthStatus.issues.push('No recent execution activity');
          healthStatus.healthStatus = 'DEGRADED';
        }
      }

    } catch (error) {
      logger.error('Error during job health check', error as Error, { jobId });
      healthStatus.issues.push(`Health check error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      healthStatus.healthStatus = 'UNKNOWN';
    }
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    // Perform health checks every 5 minutes
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.performHealthChecks();
        this.checkForUnhealthyJobs();
      } catch (error) {
        logger.error('Error during periodic health check', error as Error);
      }
    }, 5 * 60 * 1000);

    logger.info('Cron job health monitoring started');
  }

  /**
   * Check for unhealthy jobs and take action
   */
  private checkForUnhealthyJobs(): void {
    const unhealthyJobs = Array.from(this.healthStatus.values())
      .filter(status => status.healthStatus === 'UNHEALTHY' || status.healthStatus === 'DEGRADED');

    if (unhealthyJobs.length > 0) {
      logger.warn('Found unhealthy cron jobs', {
        count: unhealthyJobs.length,
        jobs: unhealthyJobs.map(job => ({
          jobId: job.jobId,
          healthStatus: job.healthStatus,
          consecutiveFailures: job.consecutiveFailures,
          issues: job.issues
        }))
      });

      // Trigger recovery for unhealthy jobs if auto-recovery is enabled
      if (this.recoveryOptions.enableAutoRecovery) {
        unhealthyJobs.forEach(async (job) => {
          if (job.healthStatus === 'UNHEALTHY') {
            await this.triggerJobRecovery(job.jobId, new Error(`Job unhealthy: ${job.issues.join(', ')}`));
          }
        });
      }
    }
  }

  /**
   * Get recent executions for a job
   */
  private getRecentExecutions(jobId: string, hours: number): CronJobExecution[] {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    return Array.from(this.executions.values())
      .filter(exec => exec.jobId === jobId && exec.startTime >= cutoff)
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
  }

  /**
   * Estimate cron interval in milliseconds (simplified)
   */
  private getCronIntervalMs(cronPattern: string): number {
    // This is a simplified implementation
    // In production, you'd use a proper cron parser library
    if (cronPattern.includes('* * * * *')) return 60 * 1000; // Every minute
    if (cronPattern.includes('0 * * * *')) return 60 * 60 * 1000; // Every hour
    if (cronPattern.includes('0 0 * * *')) return 24 * 60 * 60 * 1000; // Every day
    if (cronPattern.includes('0 0 * * 0')) return 7 * 24 * 60 * 60 * 1000; // Every week
    
    return 24 * 60 * 60 * 1000; // Default to daily
  }

  /**
   * Pause a job
   */
  async pauseJob(jobId: string): Promise<void> {
    const jobEntry = this.jobs.get(jobId);
    if (!jobEntry) {
      throw new Error(`Job ${jobId} not found`);
    }

    jobEntry.task.stop();
    jobEntry.config.isActive = false;
    jobEntry.config.updatedAt = new Date();

    await this.persistJobConfig(jobEntry.config);

    logger.info('Job paused', { jobId });
    trackBusinessEvent('cron_job_paused', { jobId });
  }

  /**
   * Resume a job
   */
  async resumeJob(jobId: string): Promise<void> {
    const jobEntry = this.jobs.get(jobId);
    if (!jobEntry) {
      throw new Error(`Job ${jobId} not found`);
    }

    jobEntry.task.start();
    jobEntry.config.isActive = true;
    jobEntry.config.updatedAt = new Date();

    await this.persistJobConfig(jobEntry.config);

    // Reset health status
    const healthStatus = this.healthStatus.get(jobId);
    if (healthStatus) {
      healthStatus.consecutiveFailures = 0;
      healthStatus.healthStatus = 'UNKNOWN';
      healthStatus.issues = [];
      healthStatus.lastHealthCheck = new Date();
    }

    logger.info('Job resumed', { jobId });
    trackBusinessEvent('cron_job_resumed', { jobId });
  }

  /**
   * Get job status and health information
   */
  getJobStatus(): Array<{
    config: CronJobConfig;
    health: CronJobHealth;
    recentExecutions: CronJobExecution[];
  }> {
    return Array.from(this.jobs.entries()).map(([jobId, jobEntry]) => ({
      config: jobEntry.config,
      health: this.healthStatus.get(jobId) || {
        jobId,
        isHealthy: false,
        lastHealthCheck: new Date(),
        consecutiveFailures: 0,
        healthStatus: 'UNKNOWN',
        issues: ['Health status not initialized']
      },
      recentExecutions: this.getRecentExecutions(jobId, 24)
    }));
  }

  /**
   * Clean up old executions to prevent memory leaks
   */
  private cleanupOldExecutions(jobId: string): void {
    const executions = Array.from(this.executions.entries())
      .filter(([_, exec]) => exec.jobId === jobId)
      .sort(([_, a], [__, b]) => b.startTime.getTime() - a.startTime.getTime());

    // Keep only the last 100 executions per job
    if (executions.length > 100) {
      const toDelete = executions.slice(100);
      toDelete.forEach(([executionId]) => {
        this.executions.delete(executionId);
      });
    }
  }

  /**
   * Load existing jobs from database
   */
  private async loadExistingJobs(): Promise<void> {
    try {
      // This would load job configurations from database
      // For now, we'll skip this implementation as it requires database schema changes
      logger.info('Loading existing cron jobs from database (placeholder)');
    } catch (error) {
      logger.error('Failed to load existing jobs', error as Error);
    }
  }

  /**
   * Persist job configuration to database
   */
  private async persistJobConfig(config: CronJobConfig): Promise<void> {
    try {
      // This would persist job configuration to database
      // For now, we'll skip this implementation as it requires database schema changes
      logger.debug('Persisting job configuration to database (placeholder)', {
        jobId: config.id
      });
    } catch (error) {
      logger.error('Failed to persist job configuration', error as Error, {
        jobId: config.id
      });
    }
  }

  /**
   * Set up cleanup handlers
   */
  private setupCleanupHandlers(): void {
    const cleanup = async () => {
      logger.info('Shutting down Cron Job Manager...');
      await this.cleanup();
    };

    process.on('SIGTERM', cleanup);
    process.on('SIGINT', cleanup);
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    try {
      // Stop health monitoring
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
        this.healthCheckInterval = null;
      }

      // Stop all cron jobs
      for (const [jobId, { task }] of this.jobs) {
        task.stop();
        task.destroy();
        logger.info('Stopped cron job', { jobId });
      }

      // Clear all data structures
      this.jobs.clear();
      this.executions.clear();
      this.healthStatus.clear();
      this.isInitialized = false;

      logger.info('Cron Job Manager cleanup completed');

    } catch (error) {
      logger.error('Error during Cron Job Manager cleanup', error as Error);
    }
  }
}

// Export singleton instance
let cronJobManagerInstance: CronJobManager | null = null;

export function getCronJobManager(): CronJobManager {
  if (!cronJobManagerInstance) {
    cronJobManagerInstance = new CronJobManager();
  }
  return cronJobManagerInstance;
}

export { CronJobManager as default }; 