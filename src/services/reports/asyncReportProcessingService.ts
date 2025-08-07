/**
 * Phase 4.2: Async Report Processing Service
 * Enhanced async processing with sophisticated fallback mechanisms
 */

import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { createId } from '@paralleldrive/cuid2';
import Bull from 'bull';
import { InitialComparativeReportService } from './initialComparativeReportService';
import { realTimeStatusService } from '../realTimeStatusService';
import { ComparativeReport } from '@/types/comparativeReport';
import { ConfigurationManagementService } from '../configurationManagementService'; // PHASE 5.3.1: Configuration Management

// Phase 4.2: Enhanced processing options
export interface AsyncProcessingOptions {
  timeout?: number; // milliseconds - default 45000 (45 seconds per implementation plan)
  priority?: 'high' | 'normal' | 'low';
  retryAttempts?: number;
  fallbackToQueue?: boolean;
  enableGracefulDegradation?: boolean;
  maxConcurrentProcessing?: number;
  notifyOnCompletion?: boolean;
}

// Processing result with enhanced fallback information
export interface AsyncProcessingResult {
  success: boolean;
  reportId?: string;
  report?: ComparativeReport;
  processingMethod: 'immediate' | 'queued' | 'fallback' | 'failed';
  processingTime: number;
  timeoutExceeded: boolean;
  fallbackUsed: boolean;
  queueScheduled: boolean;
  error?: string;
  retryCount: number;
  taskId?: string;
  estimatedQueueCompletion?: Date;
}

// Queue task data structure
interface AsyncReportTask {
  id: string;
  projectId: string;
  taskType: 'initial_report';
  priority: 'high' | 'normal' | 'low';
  options: AsyncProcessingOptions;
  createdAt: Date;
  retryCount: number;
  originalTimeout: number;
  fallbackFromImmediate: boolean;
}

/**
 * Phase 4.2: Async Report Processing Service
 * Implements enhanced async processing with sophisticated fallback mechanisms
 */
export class AsyncReportProcessingService {
  private static instance: AsyncReportProcessingService;
  private reportQueue: Bull.Queue;
  private processingStats: Map<string, { startTime: number; timeout: number }> = new Map();
  private concurrentProcessingCount = 0;
  private configService: ConfigurationManagementService; // PHASE 5.3.1: Configuration Management

  private constructor() {
    this.configService = ConfigurationManagementService.getInstance(); // PHASE 5.3.1: Initialize Configuration Management
    // Initialize Bull queue for async processing
    this.reportQueue = new Bull('async-initial-reports', {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD
      },
      defaultJobOptions: {
        removeOnComplete: 50, // Keep last 50 completed jobs
        removeOnFail: 100,    // Keep last 100 failed jobs
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        }
      }
    });

    this.setupQueueProcessing();
    this.setupQueueEventHandlers();
  }

  public static getInstance(): AsyncReportProcessingService {
    if (!AsyncReportProcessingService.instance) {
      AsyncReportProcessingService.instance = new AsyncReportProcessingService();
    }
    return AsyncReportProcessingService.instance;
  }

  /**
   * Phase 4.2: Enhanced async processing with fallback strategy
   * Main method implementing the async processing with fallbacks strategy
   */
  async processInitialReport(
    projectId: string,
    options: AsyncProcessingOptions = {}
  ): Promise<AsyncProcessingResult> {
    const startTime = Date.now();
    const config = this.configService.getCurrentConfig();
    const timeout = options.timeout || config.ANALYSIS_TIMEOUT;
    const taskId = createId();
    
    const context = {
      projectId,
      taskId,
      operation: 'processInitialReport',
      timeout,
      priority: options.priority || 'normal'
    };

    logger.info('Starting async initial report processing', context);

    // Send initial status update
    realTimeStatusService.sendProcessingUpdate(
      projectId,
      'validation',
      5,
      'Starting async report generation...'
    );

    // Step 1: Check if we can process immediately
    const canProcessImmediately = this.canProcessImmediately(options);
    
    const result: AsyncProcessingResult = {
      success: false,
      processingMethod: 'immediate',
      processingTime: 0,
      timeoutExceeded: false,
      fallbackUsed: false,
      queueScheduled: false,
      retryCount: 0
    };

    if (canProcessImmediately) {
      try {
        // Attempt immediate processing with timeout
        result.processingMethod = 'immediate';
        this.trackProcessingStart(projectId, startTime, timeout);
        
        const immediateResult = await this.processImmediate(projectId, options, taskId);
        
        // Success - immediate processing completed
        result.success = true;
        result.reportId = immediateResult.reportId;
        result.report = immediateResult.report;
        result.processingTime = Date.now() - startTime;
        
        logger.info('Immediate async processing completed successfully', {
          ...context,
          processingTime: result.processingTime,
          reportId: result.reportId
        });

        return result;

      } catch (error) {
        const errorMessage = (error as Error).message;
        const processingTime = Date.now() - startTime;
        
        logger.warn('Immediate processing failed, attempting fallback', {
          ...context,
          error: errorMessage,
          processingTime,
          timeoutExceeded: processingTime >= timeout
        });

        // Check if timeout was exceeded
        result.timeoutExceeded = processingTime >= timeout;
        result.processingTime = processingTime;

        // Attempt fallback if enabled
        if (options.fallbackToQueue !== false) {
          return await this.handleFallbackToQueue(projectId, options, taskId, result, error as Error);
        } else {
          result.processingMethod = 'failed';
          result.error = errorMessage;
          return result;
        }
      } finally {
        this.trackProcessingEnd(projectId);
      }
    } else {
      // Step 2: Queue for later processing
      logger.info('Cannot process immediately, scheduling in queue', context);
      return await this.scheduleInQueue(projectId, options, taskId, result);
    }
  }

  /**
   * Phase 4.2: Immediate processing with enhanced timeout handling
   */
  private async processImmediate(
    projectId: string,
    options: AsyncProcessingOptions,
    taskId: string
  ): Promise<{ reportId: string; report: ComparativeReport }> {
    const config = this.configService.getCurrentConfig();
    const timeout = options.timeout || config.ANALYSIS_TIMEOUT;
    
    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Processing timeout exceeded: ${timeout}ms`));
      }, timeout);
    });

    // Create processing promise
    const processingPromise = this.executeReportGeneration(projectId, options, taskId);

    try {
      // Race between processing and timeout
      const result = await Promise.race([processingPromise, timeoutPromise]);
      return result;
    } catch (error) {
      // Clean up any ongoing processing
      this.cleanupProcessing(projectId);
      throw error;
    }
  }

  /**
   * Execute the actual report generation with enhanced error handling
   */
  private async executeReportGeneration(
    projectId: string,
    options: AsyncProcessingOptions,
    taskId: string
  ): Promise<{ reportId: string; report: ComparativeReport }> {
    const context = { projectId, taskId, operation: 'executeReportGeneration' };

    try {
      logger.info('Executing report generation', context);

      // Send progress update
      realTimeStatusService.sendProcessingUpdate(
        projectId,
        'snapshot_capture',
        15,
        'Initializing report generation...'
      );

      const initialReportService = new InitialComparativeReportService();
      
      const report = await initialReportService.generateInitialComparativeReport(
        projectId,
        {
          template: 'comprehensive',
          priority: options.priority || 'high',
          timeout: (options.timeout || this.DEFAULT_TIMEOUT) - 5000, // Reserve 5s for cleanup
          fallbackToPartialData: false, // Let service decide based on data completeness
          notifyOnCompletion: options.notifyOnCompletion !== false,
          requireFreshSnapshots: true
        }
      );

      // Send completion update
      realTimeStatusService.sendCompletionUpdate(
        projectId,
        true,
        report.id,
        report.title,
        'Report generated successfully via async processing'
      );

      logger.info('Report generation completed successfully', {
        ...context,
        reportId: report.id,
        reportTitle: report.title
      });

      return {
        reportId: report.id,
        report
      };

    } catch (error) {
      logger.error('Report generation failed', error as Error, context);
      
      // Send failure update
      realTimeStatusService.sendCompletionUpdate(
        projectId,
        false,
        undefined,
        undefined,
        `Report generation failed: ${(error as Error).message}`
      );

      throw error;
    }
  }

  /**
   * Phase 4.2: Enhanced fallback to queue with graceful degradation
   */
  private async handleFallbackToQueue(
    projectId: string,
    options: AsyncProcessingOptions,
    taskId: string,
    result: AsyncProcessingResult,
    originalError: Error
  ): Promise<AsyncProcessingResult> {
    const context = { projectId, taskId, operation: 'handleFallbackToQueue' };

    try {
      logger.info('Handling fallback to queue processing', {
        ...context,
        originalError: originalError.message,
        timeoutExceeded: result.timeoutExceeded
      });

      // Update user with fallback status
      realTimeStatusService.sendProcessingUpdate(
        projectId,
        'data_collection',
        60,
        result.timeoutExceeded 
          ? 'Processing timeout exceeded, scheduling for queue processing...'
          : 'Immediate processing unavailable, scheduling for queue processing...'
      );

      // Schedule in queue with fallback context
      const queueResult = await this.scheduleInQueue(
        projectId,
        {
          ...options,
          timeout: this.QUEUE_FALLBACK_TIMEOUT, // Longer timeout for queue processing
          priority: 'high' // Boost priority for fallback tasks
        },
        taskId,
        result,
        true // Mark as fallback from immediate
      );

      // Update result with fallback information
      result.fallbackUsed = true;
      result.processingMethod = 'fallback';
      result.queueScheduled = queueResult.queueScheduled;
      result.taskId = queueResult.taskId;
      result.estimatedQueueCompletion = queueResult.estimatedQueueCompletion;
      result.error = `Immediate processing failed (${originalError.message}), scheduled for queue processing`;

      logger.info('Fallback to queue completed', {
        ...context,
        queueScheduled: result.queueScheduled,
        taskId: result.taskId,
        estimatedCompletion: result.estimatedQueueCompletion
      });

      return result;

    } catch (fallbackError) {
      logger.error('Fallback to queue failed', fallbackError as Error, context);
      
      result.processingMethod = 'failed';
      result.error = `Both immediate processing and queue fallback failed. Original: ${originalError.message}, Fallback: ${(fallbackError as Error).message}`;
      
      return result;
    }
  }

  /**
   * Schedule task in queue with enhanced priority handling
   */
  private async scheduleInQueue(
    projectId: string,
    options: AsyncProcessingOptions,
    taskId: string,
    result: AsyncProcessingResult,
    isFallback = false
  ): Promise<AsyncProcessingResult> {
    const context = { projectId, taskId, operation: 'scheduleInQueue', isFallback };

    try {
      logger.info('Scheduling report generation in queue', context);

      const task: AsyncReportTask = {
        id: taskId,
        projectId,
        taskType: 'initial_report',
        priority: options.priority || (isFallback ? 'high' : 'normal'),
        options,
        createdAt: new Date(),
        retryCount: 0,
        originalTimeout: options.timeout || this.DEFAULT_TIMEOUT,
        fallbackFromImmediate: isFallback
      };

      // Add to queue with appropriate priority
      const jobPriority = task.priority === 'high' ? 1 : (task.priority === 'normal' ? 2 : 3);
      const job = await this.reportQueue.add('process-initial-report', task, {
        priority: jobPriority,
        delay: isFallback ? 1000 : 0 // Small delay for fallback to allow cleanup
      });

      // Calculate queue position and estimated completion
      const queueStats = await this.getQueueStatistics();
      const estimatedCompletion = new Date(
        Date.now() + (queueStats.queuePosition * this.QUEUE_FALLBACK_TIMEOUT)
      );

      // Update result
      result.processingMethod = 'queued';
      result.queueScheduled = true;
      result.taskId = taskId;
      result.estimatedQueueCompletion = estimatedCompletion;

      // Send status update
      realTimeStatusService.sendProcessingUpdate(
        projectId,
        'analysis',
        70,
        `Queued for processing (position: ${queueStats.queuePosition}, estimated completion: ${estimatedCompletion.toLocaleTimeString()})`
      );

      logger.info('Report generation scheduled in queue successfully', {
        ...context,
        jobId: job.id,
        queuePosition: queueStats.queuePosition,
        estimatedCompletion
      });

      return result;

    } catch (error) {
      logger.error('Failed to schedule in queue', error as Error, context);
      
      result.processingMethod = 'failed';
      result.error = `Queue scheduling failed: ${(error as Error).message}`;
      
      return result;
    }
  }

  /**
   * Check if immediate processing is possible based on resource constraints
   */
  private canProcessImmediately(options: AsyncProcessingOptions): boolean {
    const maxConcurrent = options.maxConcurrentProcessing || this.MAX_CONCURRENT_PROCESSING;
    
    // Check resource constraints
    if (this.concurrentProcessingCount >= maxConcurrent) {
      logger.info('Cannot process immediately - concurrent processing limit reached', {
        current: this.concurrentProcessingCount,
        max: maxConcurrent
      });
      return false;
    }

    // Check graceful degradation settings
    if (options.enableGracefulDegradation === false) {
      // Force immediate processing even under load
      return true;
    }

    // Additional resource checks could be added here
    // (memory usage, CPU load, etc.)

    return true;
  }

  /**
   * Track processing start for timeout and resource management
   */
  private trackProcessingStart(projectId: string, startTime: number, timeout: number): void {
    this.processingStats.set(projectId, { startTime, timeout });
    this.concurrentProcessingCount++;
  }

  /**
   * Track processing end and cleanup resources
   */
  private trackProcessingEnd(projectId: string): void {
    this.processingStats.delete(projectId);
    this.concurrentProcessingCount = Math.max(0, this.concurrentProcessingCount - 1);
  }

  /**
   * Cleanup any ongoing processing for a project
   */
  private cleanupProcessing(projectId: string): void {
    this.trackProcessingEnd(projectId);
    logger.info('Processing cleanup completed', { projectId });
  }

  /**
   * Get current queue statistics
   */
  private async getQueueStatistics(): Promise<{
    queuePosition: number;
    activeJobs: number;
    waitingJobs: number;
    completedToday: number;
    failedToday: number;
  }> {
    try {
      const [active, waiting, completed, failed] = await Promise.all([
        this.reportQueue.getActive(),
        this.reportQueue.getWaiting(),
        this.reportQueue.getCompleted(),
        this.reportQueue.getFailed()
      ]);

      // Calculate today's metrics
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const completedToday = completed.filter(job => 
        new Date(job.finishedOn || 0) >= today
      ).length;
      
      const failedToday = failed.filter(job => 
        new Date(job.finishedOn || 0) >= today
      ).length;

      return {
        queuePosition: waiting.length + 1,
        activeJobs: active.length,
        waitingJobs: waiting.length,
        completedToday,
        failedToday
      };

    } catch (error) {
      logger.error('Failed to get queue statistics', error as Error);
      return {
        queuePosition: 1,
        activeJobs: 0,
        waitingJobs: 0,
        completedToday: 0,
        failedToday: 0
      };
    }
  }

  /**
   * Setup queue processing with enhanced error handling
   */
  private setupQueueProcessing(): void {
    this.reportQueue.process('process-initial-report', async (job) => {
      const task: AsyncReportTask = job.data;
      const context = {
        taskId: task.id,
        projectId: task.projectId,
        operation: 'queueProcessing',
        retryCount: task.retryCount
      };

      const startTime = Date.now();

      try {
        logger.info('Processing queued initial report', context);

        // Send status update
        realTimeStatusService.sendProcessingUpdate(
          task.projectId,
          'report_generation',
          85,
          'Processing report from queue...'
        );

        // Execute report generation with queue timeout
        const result = await this.executeReportGeneration(
          task.projectId,
          {
            ...task.options,
            timeout: task.originalTimeout
          },
          task.id
        );

        const processingTime = Date.now() - startTime;

        logger.info('Queued report processing completed successfully', {
          ...context,
          reportId: result.reportId,
          processingTime
        });

        return {
          success: true,
          reportId: result.reportId,
          processingTime,
          fallbackFromImmediate: task.fallbackFromImmediate
        };

      } catch (error) {
        const processingTime = Date.now() - startTime;
        
        logger.error('Queued report processing failed', error as Error, {
          ...context,
          processingTime
        });

        // Send failure update
        realTimeStatusService.sendCompletionUpdate(
          task.projectId,
          false,
          undefined,
          undefined,
          `Queue processing failed: ${(error as Error).message}`
        );

        throw error;
      }
    });
  }

  /**
   * Setup queue event handlers for monitoring and logging
   */
  private setupQueueEventHandlers(): void {
    this.reportQueue.on('completed', (job, result) => {
      logger.info('Queue job completed', {
        jobId: job.id,
        taskId: job.data.id,
        projectId: job.data.projectId,
        processingTime: result.processingTime,
        fallbackFromImmediate: result.fallbackFromImmediate
      });
    });

    this.reportQueue.on('failed', (job, error) => {
      logger.error('Queue job failed', error, {
        jobId: job.id,
        taskId: job.data.id,
        projectId: job.data.projectId,
        retryCount: job.attemptsMade,
        maxRetries: job.opts.attempts
      });
    });

    this.reportQueue.on('stalled', (job) => {
      logger.warn('Queue job stalled', {
        jobId: job.id,
        taskId: job.data.id,
        projectId: job.data.projectId,
        stalledAt: new Date()
      });
    });
  }

  /**
   * Get processing statistics for monitoring
   */
  getProcessingStatistics(): {
    concurrentProcessing: number;
    maxConcurrentProcessing: number;
    activeProcesses: string[];
  } {
    return {
      concurrentProcessing: this.concurrentProcessingCount,
      maxConcurrentProcessing: this.MAX_CONCURRENT_PROCESSING,
      activeProcesses: Array.from(this.processingStats.keys())
    };
  }

  /**
   * Cleanup resources when shutting down
   */
  async cleanup(): Promise<void> {
    try {
      await this.reportQueue.close();
      this.processingStats.clear();
      this.concurrentProcessingCount = 0;
      logger.info('AsyncReportProcessingService cleanup completed');
    } catch (error) {
      logger.error('Error during AsyncReportProcessingService cleanup', error as Error);
    }
  }
}

// Export singleton instance
export const asyncReportProcessingService = AsyncReportProcessingService.getInstance(); 