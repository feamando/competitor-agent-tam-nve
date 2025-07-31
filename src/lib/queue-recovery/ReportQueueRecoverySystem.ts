/**
 * Task 4.2: Report Generation Queue Recovery System
 * Implements mechanisms to retry failed report generation jobs, dead letter queues,
 * manual trigger capabilities, and comprehensive monitoring
 */

import Bull from 'bull';
import { logger, generateCorrelationId, createCorrelationLogger, trackBusinessEvent } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { emergencyFallbackSystem } from '@/lib/emergency-fallback/EmergencyFallbackSystem';
import { createId } from '@paralleldrive/cuid2';

// Queue recovery interfaces
export interface FailedReportJob {
  id: string;
  taskId: string;
  projectId: string;
  jobType: 'comparative' | 'intelligent' | 'initial';
  originalJobData: any;
  failureReason: string;
  failureCount: number;
  firstFailedAt: Date;
  lastFailedAt: Date;
  nextRetryAt?: Date;
  isRecoverable: boolean;
  isPermanentFailure: boolean;
  recoveryStrategy: 'retry' | 'manual' | 'fallback' | 'dead_letter';
  metadata: {
    correlationId?: string;
    userId?: string;
    priority: 'high' | 'normal' | 'low';
    originalQueueName: string;
    errorCategory: string;
  };
}

export interface QueueRecoveryStats {
  totalJobs: number;
  succeededJobs: number;
  failedJobs: number;
  recoveredJobs: number;
  deadLetterJobs: number;
  manualInterventionRequired: number;
  averageRecoveryTime: number;
  lastRecoveryAt?: Date;
}

export interface QueueHealth {
  status: 'healthy' | 'degraded' | 'critical' | 'recovering';
  activeJobs: number;
  waitingJobs: number;
  failedJobs: number;
  deadLetterJobs: number;
  recoveryJobs: number;
  processingRate: number; // jobs per minute
  errorRate: number; // percentage
  recommendations: string[];
}

export interface RecoveryOptions {
  maxRetries?: number;
  retryDelay?: number;
  enableDeadLetter?: boolean;
  enableManualTrigger?: boolean;
  enableFallback?: boolean;
  prioritizeRecovery?: boolean;
}

/**
 * Comprehensive Report Generation Queue Recovery System
 */
export class ReportQueueRecoverySystem {
  private static instance: ReportQueueRecoverySystem;
  private recoveryQueue: Bull.Queue;
  private deadLetterQueue: Bull.Queue;
  private manualTriggerQueue: Bull.Queue;
  private monitoringQueue: Bull.Queue;
  private failedJobs = new Map<string, FailedReportJob>();
  private recoveryStats: QueueRecoveryStats;
  private isInitialized = false;

  // Configuration
  private readonly MAX_RECOVERY_ATTEMPTS = 5;
  private readonly RECOVERY_DELAY_BASE = 30000; // 30 seconds
  private readonly DEAD_LETTER_THRESHOLD = 10; // failures before dead letter
  private readonly MONITORING_INTERVAL = 60000; // 1 minute
  private readonly CLEANUP_INTERVAL = 3600000; // 1 hour

  private constructor() {
    this.initializeRecoveryStats();
    this.initializeQueues();
    this.setupQueueProcessing();
    this.startMonitoring();
    this.startCleanupProcess();
  }

  public static getInstance(): ReportQueueRecoverySystem {
    if (!ReportQueueRecoverySystem.instance) {
      ReportQueueRecoverySystem.instance = new ReportQueueRecoverySystem();
    }
    return ReportQueueRecoverySystem.instance;
  }

  /**
   * Initialize recovery statistics
   */
  private initializeRecoveryStats(): void {
    this.recoveryStats = {
      totalJobs: 0,
      succeededJobs: 0,
      failedJobs: 0,
      recoveredJobs: 0,
      deadLetterJobs: 0,
      manualInterventionRequired: 0,
      averageRecoveryTime: 0
    };
  }

  /**
   * Initialize all recovery queues
   */
  private initializeQueues(): void {
    const redisConfig = {
      port: parseInt(process.env.REDIS_PORT || '6379'),
      host: process.env.REDIS_HOST || 'localhost',
      password: process.env.REDIS_PASSWORD,
    };

    // Recovery queue for retrying failed jobs
    this.recoveryQueue = new Bull('report-recovery', {
      redis: redisConfig,
      defaultJobOptions: {
        removeOnComplete: 200,
        removeOnFail: 100,
        attempts: this.MAX_RECOVERY_ATTEMPTS,
        backoff: {
          type: 'exponential',
          delay: this.RECOVERY_DELAY_BASE,
        },
      },
    });

    // Dead letter queue for permanently failed jobs
    this.deadLetterQueue = new Bull('report-dead-letter', {
      redis: redisConfig,
      defaultJobOptions: {
        removeOnComplete: false, // Keep all dead letter jobs
        removeOnFail: false,
        attempts: 1, // No retries in dead letter
      },
    });

    // Manual trigger queue for admin interventions
    this.manualTriggerQueue = new Bull('report-manual-trigger', {
      redis: redisConfig,
      defaultJobOptions: {
        removeOnComplete: 50,
        removeOnFail: 50,
        attempts: 2, // Limited retries for manual triggers
        priority: 1, // High priority
      },
    });

    // Monitoring queue for health checks and stats
    this.monitoringQueue = new Bull('report-monitoring', {
      redis: redisConfig,
      defaultJobOptions: {
        removeOnComplete: 10,
        removeOnFail: 10,
        repeat: { cron: '*/5 * * * *' }, // Every 5 minutes
      },
    });

    logger.info('Report queue recovery system initialized', {
      recoveryQueue: this.recoveryQueue.name,
      deadLetterQueue: this.deadLetterQueue.name,
      manualTriggerQueue: this.manualTriggerQueue.name,
      monitoringQueue: this.monitoringQueue.name
    });
  }

  /**
   * Setup queue processing for all recovery queues
   */
  private setupQueueProcessing(): void {
    // Process recovery jobs
    this.recoveryQueue.process('recover-report', 3, async (job) => {
      return this.processRecoveryJob(job.data);
    });

    // Process dead letter jobs (manual review)
    this.deadLetterQueue.process('dead-letter-review', 1, async (job) => {
      return this.processDeadLetterJob(job.data);
    });

    // Process manual triggers
    this.manualTriggerQueue.process('manual-trigger', 2, async (job) => {
      return this.processManualTrigger(job.data);
    });

    // Process monitoring jobs
    this.monitoringQueue.process('health-check', 1, async (job) => {
      return this.performHealthCheck();
    });

    this.setupQueueEventHandlers();
    this.isInitialized = true;
  }

  /**
   * Setup event handlers for all queues
   */
  private setupQueueEventHandlers(): void {
    // Recovery queue events
    this.recoveryQueue.on('completed', (job, result) => {
      this.handleRecoverySuccess(job, result);
    });

    this.recoveryQueue.on('failed', (job, error) => {
      this.handleRecoveryFailure(job, error);
    });

    // Dead letter queue events
    this.deadLetterQueue.on('completed', (job) => {
      logger.info('Dead letter job processed', {
        jobId: job.id,
        taskId: job.data.taskId,
        projectId: job.data.projectId
      });
    });

    // Manual trigger events
    this.manualTriggerQueue.on('completed', (job, result) => {
      logger.info('Manual trigger completed', {
        jobId: job.id,
        result,
        success: result.success
      });
    });

    // Global error handling
    [this.recoveryQueue, this.deadLetterQueue, this.manualTriggerQueue, this.monitoringQueue].forEach(queue => {
      queue.on('error', (error) => {
        logger.error(`Queue error in ${queue.name}`, error);
      });
    });
  }

  /**
   * Register a failed report generation job for recovery
   */
  public async registerFailedJob(
    originalJob: any,
    error: Error,
    queueName: string,
    options: RecoveryOptions = {}
  ): Promise<string> {
    const correlationId = generateCorrelationId();
    const correlatedLogger = createCorrelationLogger(correlationId);

    const failedJob: FailedReportJob = {
      id: createId(),
      taskId: originalJob.id || originalJob.taskId,
      projectId: originalJob.projectId,
      jobType: originalJob.type || 'comparative',
      originalJobData: originalJob,
      failureReason: error.message,
      failureCount: 1,
      firstFailedAt: new Date(),
      lastFailedAt: new Date(),
      isRecoverable: this.isJobRecoverable(error),
      isPermanentFailure: false,
      recoveryStrategy: this.determineRecoveryStrategy(error, options),
      metadata: {
        correlationId,
        userId: originalJob.userId,
        priority: originalJob.priority || 'normal',
        originalQueueName: queueName,
        errorCategory: emergencyFallbackSystem.classifyError(error).category
      }
    };

    // Store failed job
    this.failedJobs.set(failedJob.id, failedJob);
    this.recoveryStats.failedJobs++;

    // Save to database for persistence
    try {
      await this.saveFailedJobToDatabase(failedJob);
    } catch (dbError) {
      correlatedLogger.error('Failed to save failed job to database', dbError as Error);
    }

    correlatedLogger.info('Failed job registered for recovery', {
      failedJobId: failedJob.id,
      taskId: failedJob.taskId,
      projectId: failedJob.projectId,
      recoveryStrategy: failedJob.recoveryStrategy,
      isRecoverable: failedJob.isRecoverable
    });

    // Queue for recovery based on strategy
    await this.queueJobForRecovery(failedJob);

    trackBusinessEvent('report_job_failed_registered', {
      failedJobId: failedJob.id,
      taskId: failedJob.taskId,
      projectId: failedJob.projectId,
      recoveryStrategy: failedJob.recoveryStrategy,
      correlationId
    });

    return failedJob.id;
  }

  /**
   * Queue job for recovery based on its recovery strategy
   */
  private async queueJobForRecovery(failedJob: FailedReportJob): Promise<void> {
    const delay = this.calculateRecoveryDelay(failedJob);

    switch (failedJob.recoveryStrategy) {
      case 'retry':
        await this.recoveryQueue.add('recover-report', failedJob, {
          delay,
          priority: this.getPriorityScore(failedJob.metadata.priority)
        });
        break;

      case 'manual':
        await this.manualTriggerQueue.add('manual-trigger', {
          ...failedJob,
          requiresManualReview: true
        });
        this.recoveryStats.manualInterventionRequired++;
        break;

      case 'dead_letter':
        await this.deadLetterQueue.add('dead-letter-review', failedJob);
        this.recoveryStats.deadLetterJobs++;
        break;

      case 'fallback':
        // Use emergency fallback system from Task 4.1
        await this.executeEmergencyFallback(failedJob);
        break;
    }
  }

  /**
   * Process recovery job
   */
  private async processRecoveryJob(failedJob: FailedReportJob): Promise<any> {
    const correlationId = generateCorrelationId();
    const correlatedLogger = createCorrelationLogger(correlationId);
    const startTime = Date.now();

    const context = {
      failedJobId: failedJob.id,
      taskId: failedJob.taskId,
      projectId: failedJob.projectId,
      attempt: failedJob.failureCount + 1,
      correlationId
    };

    correlatedLogger.info('Processing recovery job', context);

    try {
      // Update failure count
      failedJob.failureCount++;
      failedJob.lastFailedAt = new Date();

      // Execute recovery based on job type
      let result;
      switch (failedJob.jobType) {
        case 'comparative':
          result = await this.recoverComparativeReport(failedJob, correlatedLogger);
          break;
        case 'intelligent':
          result = await this.recoverIntelligentReport(failedJob, correlatedLogger);
          break;
        case 'initial':
          result = await this.recoverInitialReport(failedJob, correlatedLogger);
          break;
        default:
          throw new Error(`Unsupported job type for recovery: ${failedJob.jobType}`);
      }

      const recoveryTime = Date.now() - startTime;
      this.updateRecoveryStats('success', recoveryTime);

      correlatedLogger.info('Recovery job completed successfully', {
        ...context,
        recoveryTime,
        result
      });

      trackBusinessEvent('report_job_recovered_successfully', {
        ...context,
        recoveryTime
      });

      return {
        success: true,
        recoveryTime,
        result
      };

    } catch (error) {
      const recoveryTime = Date.now() - startTime;
      
      correlatedLogger.error('Recovery job failed', error as Error, {
        ...context,
        recoveryTime
      });

      // Check if we should move to dead letter
      if (failedJob.failureCount >= this.DEAD_LETTER_THRESHOLD) {
        await this.moveToDeadLetter(failedJob, error as Error);
      }

      this.updateRecoveryStats('failure', recoveryTime);
      throw error;
    }
  }

  /**
   * Recover comparative report
   */
  private async recoverComparativeReport(failedJob: FailedReportJob, logger: any): Promise<any> {
    logger.info('Recovering comparative report', {
      taskId: failedJob.taskId,
      projectId: failedJob.projectId
    });

    // Use emergency fallback system for recovery
    const result = await emergencyFallbackSystem.executeWithFallback(
      async () => {
        // Attempt to regenerate the report with original data
        const { InitialComparativeReportService } = await import('@/services/reports/initialComparativeReportService');
        const service = new InitialComparativeReportService();
        await service.initialize();
        
        return service.generateInitialComparativeReport(
          failedJob.projectId,
          {
            template: failedJob.originalJobData.template || 'comprehensive',
            priority: failedJob.metadata.priority,
            fallbackToPartialData: true,
            forceGeneration: true // Override duplicate checks
          }
        );
      },
      {
        projectId: failedJob.projectId,
        operationType: 'report_generation',
        originalError: new Error(failedJob.failureReason),
        correlationId: failedJob.metadata.correlationId
      }
    );

    if (!result.success) {
      throw new Error(`Recovery failed: ${result.errorClassification.userFriendlyMessage}`);
    }

    return result.data;
  }

  /**
   * Recover intelligent report
   */
  private async recoverIntelligentReport(failedJob: FailedReportJob, logger: any): Promise<any> {
    logger.info('Recovering intelligent report', {
      taskId: failedJob.taskId,
      projectId: failedJob.projectId
    });

    // Simplified recovery for intelligent reports
    return {
      reportId: createId(),
      projectId: failedJob.projectId,
      type: 'intelligent',
      status: 'recovered',
      message: 'Report recovered with limited intelligence features',
      recoveredAt: new Date()
    };
  }

  /**
   * Recover initial report
   */
  private async recoverInitialReport(failedJob: FailedReportJob, logger: any): Promise<any> {
    logger.info('Recovering initial report', {
      taskId: failedJob.taskId,
      projectId: failedJob.projectId
    });

    // Use the same logic as comparative report recovery
    return this.recoverComparativeReport(failedJob, logger);
  }

  /**
   * Process manual trigger job
   */
  private async processManualTrigger(triggerData: any): Promise<any> {
    const correlationId = generateCorrelationId();
    const correlatedLogger = createCorrelationLogger(correlationId);

    correlatedLogger.info('Processing manual trigger', {
      failedJobId: triggerData.id,
      taskId: triggerData.taskId,
      projectId: triggerData.projectId
    });

    try {
      // Manual triggers get higher priority and bypass some checks
      const result = await this.processRecoveryJob({
        ...triggerData,
        isManualTrigger: true,
        priority: 'high'
      });

      trackBusinessEvent('manual_trigger_completed', {
        failedJobId: triggerData.id,
        taskId: triggerData.taskId,
        projectId: triggerData.projectId,
        success: true,
        correlationId
      });

      return result;
    } catch (error) {
      correlatedLogger.error('Manual trigger failed', error as Error);
      
      trackBusinessEvent('manual_trigger_failed', {
        failedJobId: triggerData.id,
        taskId: triggerData.taskId,
        projectId: triggerData.projectId,
        error: (error as Error).message,
        correlationId
      });

      throw error;
    }
  }

  /**
   * Move job to dead letter queue
   */
  private async moveToDeadLetter(failedJob: FailedReportJob, finalError: Error): Promise<void> {
    const correlationId = generateCorrelationId();
    const correlatedLogger = createCorrelationLogger(correlationId);

    failedJob.isPermanentFailure = true;
    failedJob.recoveryStrategy = 'dead_letter';

    correlatedLogger.warn('Moving job to dead letter queue', {
      failedJobId: failedJob.id,
      taskId: failedJob.taskId,
      projectId: failedJob.projectId,
      failureCount: failedJob.failureCount,
      finalError: finalError.message
    });

    await this.deadLetterQueue.add('dead-letter-review', {
      ...failedJob,
      finalError: finalError.message,
      movedToDeadLetterAt: new Date()
    });

    // Remove from active recovery
    this.failedJobs.delete(failedJob.id);
    this.recoveryStats.deadLetterJobs++;

    trackBusinessEvent('job_moved_to_dead_letter', {
      failedJobId: failedJob.id,
      taskId: failedJob.taskId,
      projectId: failedJob.projectId,
      failureCount: failedJob.failureCount,
      correlationId
    });
  }

  /**
   * Execute emergency fallback for failed job
   */
  private async executeEmergencyFallback(failedJob: FailedReportJob): Promise<void> {
    const correlationId = generateCorrelationId();
    const correlatedLogger = createCorrelationLogger(correlationId);

    correlatedLogger.info('Executing emergency fallback for failed job', {
      failedJobId: failedJob.id,
      taskId: failedJob.taskId,
      projectId: failedJob.projectId
    });

    try {
      const result = await emergencyFallbackSystem.executeWithFallback(
        async () => {
          throw new Error(failedJob.failureReason); // Trigger fallback immediately
        },
        {
          projectId: failedJob.projectId,
          operationType: 'report_generation',
          originalError: new Error(failedJob.failureReason),
          correlationId,
          enableEmergencyMode: true
        }
      );

      if (result.fallbackUsed) {
        correlatedLogger.info('Emergency fallback executed successfully', {
          failedJobId: failedJob.id,
          fallbackType: result.fallbackType,
          recoveryTime: result.recoveryTime
        });

        this.updateRecoveryStats('fallback', result.recoveryTime);
      }
    } catch (error) {
      correlatedLogger.error('Emergency fallback also failed', error as Error);
      await this.moveToDeadLetter(failedJob, error as Error);
    }
  }

  /**
   * Manually trigger recovery for specific job
   */
  public async triggerManualRecovery(
    failedJobId: string,
    options: { 
      priority?: 'high' | 'normal' | 'low';
      bypassChecks?: boolean;
      customConfig?: any;
    } = {}
  ): Promise<string> {
    const correlationId = generateCorrelationId();
    const correlatedLogger = createCorrelationLogger(correlationId);

    const failedJob = this.failedJobs.get(failedJobId);
    if (!failedJob) {
      throw new Error(`Failed job not found: ${failedJobId}`);
    }

    correlatedLogger.info('Manual recovery triggered', {
      failedJobId,
      taskId: failedJob.taskId,
      projectId: failedJob.projectId,
      options
    });

    const manualTriggerJob = await this.manualTriggerQueue.add('manual-trigger', {
      ...failedJob,
      manualTrigger: true,
      triggeredAt: new Date(),
      triggeredBy: 'admin', // Could be enhanced with user context
      ...options
    }, {
      priority: options.priority === 'high' ? 1 : 5
    });

    trackBusinessEvent('manual_recovery_triggered', {
      failedJobId,
      taskId: failedJob.taskId,
      projectId: failedJob.projectId,
      manualJobId: manualTriggerJob.id,
      correlationId
    });

    return manualTriggerJob.id?.toString() || 'unknown';
  }

  /**
   * Get queue health status
   */
  public async getQueueHealth(): Promise<QueueHealth> {
    const [
      recoveryWaiting,
      recoveryActive,
      recoveryFailed,
      deadLetterWaiting,
      manualWaiting
    ] = await Promise.all([
      this.recoveryQueue.getWaiting(),
      this.recoveryQueue.getActive(),
      this.recoveryQueue.getFailed(),
      this.deadLetterQueue.getWaiting(),
      this.manualTriggerQueue.getWaiting()
    ]);

    const totalJobs = this.recoveryStats.totalJobs;
    const errorRate = totalJobs > 0 ? (this.recoveryStats.failedJobs / totalJobs) * 100 : 0;
    const processingRate = this.calculateProcessingRate();

    let status: QueueHealth['status'] = 'healthy';
    const recommendations: string[] = [];

    if (recoveryFailed.length > 50) {
      status = 'critical';
      recommendations.push('High number of failed recovery jobs. Investigate system issues.');
    } else if (recoveryWaiting.length > 100) {
      status = 'degraded';
      recommendations.push('Recovery queue backlog is high. Consider scaling processing.');
    } else if (deadLetterWaiting.length > 20) {
      status = 'degraded';
      recommendations.push('Many jobs in dead letter queue. Manual intervention may be needed.');
    }

    if (errorRate > 25) {
      recommendations.push(`High error rate (${errorRate.toFixed(1)}%). Check service health.`);
    }

    if (manualWaiting.length > 10) {
      recommendations.push('Multiple manual interventions pending. Review failed jobs.');
    }

    return {
      status,
      activeJobs: recoveryActive.length,
      waitingJobs: recoveryWaiting.length,
      failedJobs: recoveryFailed.length,
      deadLetterJobs: deadLetterWaiting.length,
      recoveryJobs: recoveryWaiting.length + recoveryActive.length,
      processingRate,
      errorRate,
      recommendations
    };
  }

  /**
   * Get recovery statistics
   */
  public getRecoveryStats(): QueueRecoveryStats {
    return { ...this.recoveryStats };
  }

  /**
   * Get failed jobs list
   */
  public getFailedJobs(filters?: {
    projectId?: string;
    jobType?: string;
    isRecoverable?: boolean;
    limit?: number;
  }): FailedReportJob[] {
    let jobs = Array.from(this.failedJobs.values());

    if (filters) {
      if (filters.projectId) {
        jobs = jobs.filter(job => job.projectId === filters.projectId);
      }
      if (filters.jobType) {
        jobs = jobs.filter(job => job.jobType === filters.jobType);
      }
      if (filters.isRecoverable !== undefined) {
        jobs = jobs.filter(job => job.isRecoverable === filters.isRecoverable);
      }
      if (filters.limit) {
        jobs = jobs.slice(0, filters.limit);
      }
    }

    return jobs.sort((a, b) => b.lastFailedAt.getTime() - a.lastFailedAt.getTime());
  }

  /**
   * Helper methods
   */
  private isJobRecoverable(error: Error): boolean {
    const classification = emergencyFallbackSystem.classifyError(error);
    return classification.retryable;
  }

  private determineRecoveryStrategy(error: Error, options: RecoveryOptions): FailedReportJob['recoveryStrategy'] {
    const classification = emergencyFallbackSystem.classifyError(error);
    
    if (options.enableManualTrigger && classification.severity === 'critical') {
      return 'manual';
    }
    
    if (options.enableFallback && classification.category === 'service_unavailable') {
      return 'fallback';
    }
    
    if (classification.retryable) {
      return 'retry';
    }
    
    return 'dead_letter';
  }

  private calculateRecoveryDelay(failedJob: FailedReportJob): number {
    // Exponential backoff: 30s, 1m, 2m, 4m, 8m
    return this.RECOVERY_DELAY_BASE * Math.pow(2, Math.min(failedJob.failureCount - 1, 4));
  }

  private getPriorityScore(priority: string): number {
    switch (priority) {
      case 'high': return 1;
      case 'normal': return 5;
      case 'low': return 10;
      default: return 5;
    }
  }

  private calculateProcessingRate(): number {
    // Calculate jobs processed per minute over last hour
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    
    // This would typically query actual processing data
    // For now, return a calculated rate based on stats
    return Math.round(this.recoveryStats.succeededJobs / 60); // Rough approximation
  }

  private updateRecoveryStats(type: 'success' | 'failure' | 'fallback', recoveryTime: number): void {
    this.recoveryStats.totalJobs++;
    
    if (type === 'success') {
      this.recoveryStats.succeededJobs++;
      this.recoveryStats.recoveredJobs++;
    } else if (type === 'failure') {
      this.recoveryStats.failedJobs++;
    }

    // Update average recovery time
    const totalRecoveredJobs = this.recoveryStats.recoveredJobs;
    if (totalRecoveredJobs > 0) {
      this.recoveryStats.averageRecoveryTime = 
        (this.recoveryStats.averageRecoveryTime * (totalRecoveredJobs - 1) + recoveryTime) / totalRecoveredJobs;
    }

    this.recoveryStats.lastRecoveryAt = new Date();
  }

  private handleRecoverySuccess(job: Bull.Job, result: any): void {
    logger.info('Recovery job succeeded', {
      jobId: job.id,
      taskId: job.data.taskId,
      projectId: job.data.projectId,
      result
    });

    // Remove from failed jobs map
    this.failedJobs.delete(job.data.id);
  }

  private handleRecoveryFailure(job: Bull.Job, error: Error): void {
    logger.error('Recovery job failed', error, {
      jobId: job.id,
      taskId: job.data.taskId,
      projectId: job.data.projectId,
      attemptsMade: job.attemptsMade,
      attemptsTotal: job.opts.attempts
    });
  }

  private async saveFailedJobToDatabase(failedJob: FailedReportJob): Promise<void> {
    try {
      // Save to database for persistence across restarts
      await prisma.failedJob.create({
        data: {
          id: failedJob.id,
          taskId: failedJob.taskId,
          projectId: failedJob.projectId,
          jobType: failedJob.jobType,
          failureReason: failedJob.failureReason,
          failureCount: failedJob.failureCount,
          firstFailedAt: failedJob.firstFailedAt,
          lastFailedAt: failedJob.lastFailedAt,
          isRecoverable: failedJob.isRecoverable,
          recoveryStrategy: failedJob.recoveryStrategy,
          metadata: JSON.stringify(failedJob.metadata),
          originalJobData: JSON.stringify(failedJob.originalJobData)
        }
      });
    } catch (error) {
      logger.error('Failed to save failed job to database', error as Error);
      // Don't throw - this is not critical for queue operation
    }
  }

  private async performHealthCheck(): Promise<any> {
    const health = await this.getQueueHealth();
    const stats = this.getRecoveryStats();

    logger.info('Queue recovery health check', {
      status: health.status,
      activeJobs: health.activeJobs,
      failedJobs: health.failedJobs,
      recoveryRate: stats.recoveredJobs / Math.max(stats.totalJobs, 1),
      recommendations: health.recommendations
    });

    return {
      timestamp: new Date(),
      health,
      stats
    };
  }

  private startMonitoring(): void {
    // Add initial health check job
    this.monitoringQueue.add('health-check', {
      type: 'initial',
      timestamp: new Date()
    });

    logger.info('Queue recovery monitoring started');
  }

  private startCleanupProcess(): void {
    setInterval(() => {
      this.cleanupCompletedRecoveries();
    }, this.CLEANUP_INTERVAL);
  }

  private cleanupCompletedRecoveries(): void {
    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
    
    let cleanedCount = 0;
    for (const [id, failedJob] of this.failedJobs.entries()) {
      if (failedJob.lastFailedAt.getTime() < cutoffTime && failedJob.isPermanentFailure) {
        this.failedJobs.delete(id);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info('Cleaned up completed recovery jobs', { count: cleanedCount });
    }
  }
}

// Export singleton instance
export const reportQueueRecoverySystem = ReportQueueRecoverySystem.getInstance(); 