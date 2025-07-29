/**
 * Enhanced ReportProcessor Sub-service - Task 5.4
 * Migrates async processing from AsyncReportProcessingService
 * Handles queue processing, timeout management, and error recovery
 */

import Bull from 'bull';
import { createId } from '@paralleldrive/cuid2';
import { logger, generateCorrelationId, trackBusinessEvent, trackErrorWithCorrelation } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import {
  IReportProcessor,
  IReportGenerator,
  ReportTask,
  QueueOptions,
  ReportTaskResult,
  ComparativeReportResponse,
  IntelligentReportResponse,
  InitialReportResponse,
  ReportStatus,
  QueueHealthStatus,
  ReportProcessorConfig,
  TaskType,
  TaskStatus,
  Priority
} from './types';

/**
 * Enhanced ReportProcessor Implementation - Task 5.4
 * Migrated from AsyncReportProcessingService with sophisticated fallback mechanisms
 */
export class ReportProcessor implements IReportProcessor {
  private queue: Bull.Queue;
  private reportGenerator: IReportGenerator;
  private analysisService: any; // AnalysisService instance
  private config: ReportProcessorConfig;
  
  // Processing tracking
  private processingStats: Map<string, { startTime: number; timeout: number }> = new Map();
  private concurrentProcessingCount = 0;
  private activeTaskStatus: Map<string, ReportStatus> = new Map();
  
  // Constants migrated from AsyncReportProcessingService
  private readonly DEFAULT_TIMEOUT = 180000; // 3 minutes
  private readonly QUEUE_FALLBACK_TIMEOUT = 300000; // 5 minutes
  private readonly MAX_CONCURRENT_PROCESSING = 3;
  private readonly MAX_RETRIES = 3;

  constructor(config: ReportProcessorConfig) {
    this.config = config;
    this.queue = config.queue;
    this.reportGenerator = config.reportGenerator;
    this.analysisService = config.analysisService;
    
    // Setup queue processing and event handlers
    this.setupQueueProcessing();
    this.setupQueueEventHandlers();
    
    logger.info('ReportProcessor initialized', {
      service: 'ReportProcessor',
      processingTimeout: config.processingTimeout,
      comparativeOnly: config.comparativeOnly,
      maxRetries: config.retryConfig.maxAttempts
    });
  }

  /**
   * Queue report for processing - migrated from AsyncReportProcessingService.scheduleInQueue()
   */
  async queueReport(task: ReportTask, options?: QueueOptions): Promise<ReportTaskResult> {
    const correlationId = generateCorrelationId();
    const context = { 
      taskId: task.id, 
      projectId: task.projectId, 
      type: task.type,
      correlationId 
    };

    try {
      logger.info('Queueing report task', context);

      // Validate task type for comparative reports only (Task 5.4)
      if (task.type !== 'comparative') {
        throw new Error('Only comparative report processing is supported in unified ReportingService');
      }

      // Check queue capacity
      const queueStats = await this.getQueueHealth();
      if (queueStats.status === 'critical') {
        throw new Error('Queue is at critical capacity, cannot accept new tasks');
      }

      // Set task status
      this.updateTaskStatus(task.id, {
        status: 'queued',
        progress: 0,
        currentStep: 'Queued for processing',
        queuedAt: new Date()
      });

      // Add to queue with appropriate priority and options
      const queueOptions: Bull.JobOptions = {
        priority: this.getPriorityScore(task.priority || 'normal'),
        delay: options?.delay || 0,
        attempts: options?.attempts || this.config.retryConfig.maxAttempts,
        backoff: options?.backoff || 'exponential',
        timeout: options?.timeout || this.config.processingTimeout,
        removeOnComplete: 100,
        removeOnFail: 50
      };

      await this.queue.add(task.type, task, queueOptions);

      // Calculate queue position and estimated completion
      const queuePosition = await this.queue.waiting() + 1;
      const estimatedCompletion = new Date(
        Date.now() + (queuePosition * this.QUEUE_FALLBACK_TIMEOUT)
      );

      trackBusinessEvent('report_task_queued', {
        ...context,
        queuePosition,
        estimatedCompletion: estimatedCompletion.toISOString()
      });

      logger.info('Report task queued successfully', {
        ...context,
        queuePosition,
        estimatedCompletion: estimatedCompletion.toISOString()
      });

      return {
        taskId: task.id,
        status: 'queued',
        queuePosition,
        estimatedCompletion,
        projectId: task.projectId
      };

    } catch (error) {
      logger.error('Failed to queue report task', error as Error, context);
      
      trackErrorWithCorrelation(
        error as Error,
        correlationId,
        'report_task_queue_failed',
        context
      );

      this.updateTaskStatus(task.id, {
        status: 'failed',
        error: (error as Error).message,
        completedAt: new Date()
      });

      throw error;
    }
  }

  /**
   * Start queue processing - migrated from AsyncReportProcessingService.setupQueueProcessing()
   */
  processQueue(): void {
    try {
      // Process comparative reports (primary workflow)
      this.queue.process('comparative', this.MAX_CONCURRENT_PROCESSING, async (job: Bull.Job<ReportTask>) => {
        return await this.processComparativeReportWithTracking(job.data);
      });

      // Process intelligent reports if needed
      this.queue.process('intelligent', Math.max(1, Math.floor(this.MAX_CONCURRENT_PROCESSING / 2)), async (job: Bull.Job<ReportTask>) => {
        return await this.processIntelligentReportWithTracking(job.data);
      });

      // Process initial reports
      this.queue.process('initial', Math.max(1, Math.floor(this.MAX_CONCURRENT_PROCESSING / 2)), async (job: Bull.Job<ReportTask>) => {
        return await this.processInitialReportWithTracking(job.data);
      });

      logger.info('Queue processing started', {
        maxConcurrency: this.MAX_CONCURRENT_PROCESSING,
        queueName: this.queue.name
      });

    } catch (error) {
      logger.error('Failed to start queue processing', error as Error);
      throw error;
    }
  }

  /**
   * Process comparative report task - enhanced with full tracking
   */
  async processComparativeReport(task: ReportTask): Promise<ComparativeReportResponse> {
    const startTime = Date.now();
    const context = { taskId: task.id, projectId: task.projectId, operation: 'processComparativeReport' };

    try {
      logger.info('Processing comparative report task', context);

      // Update status
      this.updateTaskStatus(task.id, {
        status: 'processing',
        progress: 10,
        currentStep: 'Starting analysis',
        startedAt: new Date()
      });

      // Validate project readiness
      const project = await prisma.project.findUnique({
        where: { id: task.projectId },
        include: {
          product: true,
          competitors: true
        }
      });

      if (!project || !project.product || !project.competitors?.length) {
        throw new Error(`Project ${task.projectId} not ready for report generation`);
      }

      this.updateTaskStatus(task.id, {
        progress: 30,
        currentStep: 'Project validated, generating analysis'
      });

      // Generate analysis using the consolidated AnalysisService
      const analysisRequest = {
        analysisType: 'comparative_analysis',
        productData: project.product,
        competitorData: project.competitors,
        options: {
          analysisDepth: task.options?.analysisDepth || 'comprehensive',
          focusArea: task.options?.focusArea || 'overall'
        }
      };

      const analysis = await this.analysisService.analyzeProduct(analysisRequest);

      this.updateTaskStatus(task.id, {
        progress: 60,
        currentStep: 'Analysis complete, generating report'
      });

      // Generate report using the consolidated ReportGenerator
      const reportRequest = {
        taskId: task.id,
        projectId: task.projectId,
        reportType: 'comparative',
        analysis,
        product: project.product,
        productSnapshot: null, // TODO: Get from snapshot service
        options: task.options
      };

      const reportResult = await this.reportGenerator.generateComparativeReport(reportRequest);

      if (!reportResult.success) {
        throw new Error(`Report generation failed: ${reportResult.error}`);
      }

      this.updateTaskStatus(task.id, {
        progress: 100,
        currentStep: 'Report generated successfully',
        completedAt: new Date()
      });

      const processingTime = Date.now() - startTime;

      trackBusinessEvent('comparative_report_processed', {
        ...context,
        processingTime,
        success: true
      });

      logger.info('Comparative report processing completed successfully', {
        ...context,
        processingTime,
        reportId: reportResult.report?.id
      });

      return {
        success: true,
        taskId: task.id,
        projectId: task.projectId,
        processingTime,
        report: reportResult.report,
        dataFreshness: reportResult.dataFreshness,
        correlationId: task.correlationId
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('Failed to process comparative report', error as Error, context);
      
      this.updateTaskStatus(task.id, {
        status: 'failed',
        error: (error as Error).message,
        completedAt: new Date()
      });

      trackErrorWithCorrelation(
        error as Error,
        task.correlationId || generateCorrelationId(),
        'comparative_report_processing_failed',
        { ...context, processingTime }
      );

      return {
        success: false,
        taskId: task.id,
        projectId: task.projectId,
        processingTime,
        error: (error as Error).message,
        dataFreshness: {
          overallStatus: 'STALE',
          lastUpdated: new Date()
        },
        correlationId: task.correlationId
      };
    }
  }

  /**
   * Process intelligent report task
   */
  async processIntelligentReport(task: ReportTask): Promise<IntelligentReportResponse> {
    const startTime = Date.now();
    const context = { taskId: task.id, projectId: task.projectId, operation: 'processIntelligentReport' };
    
    try {
      logger.info('Processing intelligent report task', context);

      // Update status
      this.updateTaskStatus(task.id, {
        status: 'processing',
        progress: 10,
        currentStep: 'Starting intelligent analysis',
        startedAt: new Date()
      });

      // Generate intelligent report using ReportGenerator
      const reportRequest = {
        taskId: task.id,
        projectId: task.projectId,
        enhanceWithAI: true,
        options: task.options
      };

      const reportResult = await this.reportGenerator.generateIntelligentReport(reportRequest);

      this.updateTaskStatus(task.id, {
        progress: 100,
        currentStep: 'Intelligent report generated successfully',
        completedAt: new Date()
      });

      const processingTime = Date.now() - startTime;

      trackBusinessEvent('intelligent_report_processed', {
        ...context,
        processingTime,
        success: true
      });

      return {
        success: true,
        report: reportResult.report,
        taskId: task.id,
        projectId: task.projectId,
        dataFreshnessIndicators: reportResult.dataFreshnessIndicators,
        competitiveActivityAlerts: reportResult.competitiveActivityAlerts,
        marketChangeDetection: reportResult.marketChangeDetection,
        actionableInsights: reportResult.actionableInsights,
        enhancedContent: reportResult.enhancedContent,
        processingTime,
        correlationId: task.correlationId
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('Failed to process intelligent report', error as Error, context);
      
      this.updateTaskStatus(task.id, {
        status: 'failed',
        error: (error as Error).message,
        completedAt: new Date()
      });

      throw error;
    }
  }

  /**
   * Process initial report task
   */
  async processInitialReport(task: ReportTask): Promise<InitialReportResponse> {
    const startTime = Date.now();
    const context = { taskId: task.id, projectId: task.projectId, operation: 'processInitialReport' };
    
    try {
      logger.info('Processing initial report task', context);

      // Update status
      this.updateTaskStatus(task.id, {
        status: 'processing',
        progress: 10,
        currentStep: 'Starting initial report generation',
        startedAt: new Date()
      });

      // Generate initial report using ReportGenerator
      const reportRequest = {
        taskId: task.id,
        projectId: task.projectId,
        options: task.options
      };

      const reportResult = await this.reportGenerator.generateInitialReport(reportRequest);

      this.updateTaskStatus(task.id, {
        progress: 100,
        currentStep: 'Initial report generated successfully',
        completedAt: new Date()
      });

      const processingTime = Date.now() - startTime;

      trackBusinessEvent('initial_report_processed', {
        ...context,
        processingTime,
        success: reportResult.success
      });

      return reportResult;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('Failed to process initial report', error as Error, context);
      
      this.updateTaskStatus(task.id, {
        status: 'failed',
        error: (error as Error).message,
        completedAt: new Date()
      });

      throw error;
    }
  }

  /**
   * Get task status
   */
  async getTaskStatus(taskId: string): Promise<ReportStatus> {
    const status = this.activeTaskStatus.get(taskId);
    
    if (!status) {
      // Check if task exists in queue
      const job = await this.queue.getJob(taskId);
      if (job) {
        return {
          status: job.finishedOn ? 'completed' : (job.processedOn ? 'processing' : 'queued'),
          progress: 0,
          currentStep: 'Task found in queue',
          queuedAt: new Date(job.timestamp)
        };
      }
      
      return {
        status: 'not_found',
        progress: 0,
        currentStep: 'Task not found'
      };
    }
    
    return status;
  }

  /**
   * Get queue health status
   */
  async getQueueHealth(): Promise<QueueHealthStatus> {
    try {
      const waiting = await this.queue.waiting();
      const active = await this.queue.active();
      const completed = await this.queue.completed();
      const failed = await this.queue.failed();

      const totalJobs = waiting + active;
      const healthStatus = totalJobs > 100 ? 'critical' : (totalJobs > 50 ? 'degraded' : 'healthy');

      return {
        status: healthStatus,
        waitingJobs: waiting,
        activeJobs: active,
        completedJobs: completed,
        failedJobs: failed,
        processingCapacity: this.MAX_CONCURRENT_PROCESSING,
        lastHealthCheck: new Date()
      };

    } catch (error) {
      logger.error('Failed to get queue health', error as Error);
      
      return {
        status: 'critical',
        waitingJobs: 0,
        activeJobs: 0,
        completedJobs: 0,
        failedJobs: 0,
        processingCapacity: this.MAX_CONCURRENT_PROCESSING,
        lastHealthCheck: new Date(),
        error: (error as Error).message
      };
    }
  }

  /**
   * Retry failed task
   */
  async retryFailedTask(taskId: string): Promise<void> {
    const correlationId = generateCorrelationId();
    const context = { taskId, correlationId };

    try {
      logger.info('Retrying failed task', context);

      const job = await this.queue.getJob(taskId);
      if (!job) {
        throw new Error(`Task ${taskId} not found in queue`);
      }

      if (job.failedReason) {
        // Update retry count and retry
        const task = job.data as ReportTask;
        task.retryCount = (task.retryCount || 0) + 1;
        
        if (task.retryCount > this.MAX_RETRIES) {
          throw new Error(`Task ${taskId} has exceeded maximum retry attempts`);
        }

        await job.retry();
        
        this.updateTaskStatus(taskId, {
          status: 'queued',
          progress: 0,
          currentStep: `Retrying (attempt ${task.retryCount + 1})`,
          queuedAt: new Date()
        });

        logger.info('Task retry initiated', { ...context, retryCount: task.retryCount });
      } else {
        throw new Error(`Task ${taskId} is not in a failed state`);
      }

    } catch (error) {
      logger.error('Failed to retry task', error as Error, context);
      throw error;
    }
  }

  /**
   * Cancel task
   */
  async cancelTask(taskId: string): Promise<void> {
    const correlationId = generateCorrelationId();
    const context = { taskId, correlationId };

    try {
      logger.info('Cancelling task', context);

      const job = await this.queue.getJob(taskId);
      if (!job) {
        throw new Error(`Task ${taskId} not found in queue`);
      }

      await job.remove();
      
      this.updateTaskStatus(taskId, {
        status: 'cancelled',
        progress: 0,
        currentStep: 'Task cancelled',
        completedAt: new Date()
      });

      this.activeTaskStatus.delete(taskId);

      logger.info('Task cancelled successfully', context);

    } catch (error) {
      logger.error('Failed to cancel task', error as Error, context);
      throw error;
    }
  }

  // Helper methods

  /**
   * Process comparative report with comprehensive tracking
   */
  private async processComparativeReportWithTracking(task: ReportTask): Promise<any> {
    const startTime = Date.now();
    const context = { taskId: task.id, projectId: task.projectId };

    try {
      this.concurrentProcessingCount++;
      this.processingStats.set(task.id, { 
        startTime, 
        timeout: task.options?.timeout || this.DEFAULT_TIMEOUT 
      });

      const result = await this.processComparativeReport(task);

      this.processingStats.delete(task.id);
      this.concurrentProcessingCount--;

      return result;

    } catch (error) {
      this.processingStats.delete(task.id);
      this.concurrentProcessingCount--;
      
      logger.error('Comparative report processing failed in queue', error as Error, context);
      throw error;
    }
  }

  /**
   * Process intelligent report with tracking
   */
  private async processIntelligentReportWithTracking(task: ReportTask): Promise<any> {
    const startTime = Date.now();
    const context = { taskId: task.id, projectId: task.projectId };

    try {
      this.concurrentProcessingCount++;
      const result = await this.processIntelligentReport(task);
      this.concurrentProcessingCount--;
      return result;

    } catch (error) {
      this.concurrentProcessingCount--;
      logger.error('Intelligent report processing failed in queue', error as Error, context);
      throw error;
    }
  }

  /**
   * Process initial report with tracking
   */
  private async processInitialReportWithTracking(task: ReportTask): Promise<any> {
    const startTime = Date.now();
    const context = { taskId: task.id, projectId: task.projectId };

    try {
      this.concurrentProcessingCount++;
      const result = await this.processInitialReport(task);
      this.concurrentProcessingCount--;
      return result;

    } catch (error) {
      this.concurrentProcessingCount--;
      logger.error('Initial report processing failed in queue', error as Error, context);
      throw error;
    }
  }

  /**
   * Update task status in tracking
   */
  private updateTaskStatus(taskId: string, status: Partial<ReportStatus>): void {
    const currentStatus = this.activeTaskStatus.get(taskId) || {
      status: 'queued',
      progress: 0,
      currentStep: 'Initialized'
    };

    this.activeTaskStatus.set(taskId, {
      ...currentStatus,
      ...status
    });
  }

  /**
   * Setup queue event handlers - migrated from AsyncReportProcessingService
   */
  private setupQueueEventHandlers(): void {
    this.queue.on('completed', (job, result) => {
      logger.info('Queue job completed', { 
        jobId: job.id, 
        taskId: job.data.id,
        processingTime: Date.now() - job.processedOn 
      });
    });

    this.queue.on('failed', (job, err) => {
      logger.error('Queue job failed', err, { 
        jobId: job.id, 
        taskId: job.data.id,
        attemptsMade: job.attemptsMade 
      });
    });

    this.queue.on('stalled', (job) => {
      logger.warn('Queue job stalled', { 
        jobId: job.id, 
        taskId: job.data.id 
      });
    });

    this.queue.on('progress', (job, progress) => {
      this.updateTaskStatus(job.data.id, {
        progress: typeof progress === 'number' ? progress : 0
      });
    });
  }

  /**
   * Get priority score for queue ordering
   */
  private getPriorityScore(priority: Priority): number {
    switch (priority) {
      case 'high':
        return 1;
      case 'normal':
        return 2;
      case 'low':
        return 3;
      default:
        return 2;
    }
  }
} 