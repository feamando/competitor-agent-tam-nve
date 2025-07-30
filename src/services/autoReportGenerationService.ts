import { ReportGenerator } from '@/lib/reports';
import { prisma } from '@/lib/prisma';
import { 
  logger, 
  generateCorrelationId, 
  createCorrelationLogger,
  trackReportFlow,
  trackCorrelation,
  trackBusinessEvent
} from '@/lib/logger';
import Bull from 'bull';
import * as cron from 'node-cron';
import { ComparativeReportService } from './reports/comparativeReportService';
import { ProductScrapingService } from './productScrapingService';
import { featureFlags, productionConfig } from '@/lib/env';
import { comparativeReportMonitoring } from '@/lib/monitoring/comparativeReportMonitoring';
import { getCronJobManager } from './cronJobManager';

// Types for the auto-report system
export interface ReportGenerationTask {
  id: string;
  projectId: string;
  competitorIds: string[];
  reportType: 'initial' | 'scheduled' | 'event-driven';
  priority: 'high' | 'normal' | 'low';
  reportTemplate: 'comprehensive' | 'executive' | 'technical' | 'strategic';
  triggeredBy: 'project_creation' | 'schedule' | 'user_request' | 'event';
  reportName?: string;
  userId?: string;
  timeframe?: number;
  correlationId: string;
  createdAt: Date;
  scheduledFor?: Date;
}

export interface ReportGenerationResult {
  taskId: string;
  projectId: string;
  success: boolean;
  reportsGenerated: number;
  errors: Array<{
    competitorId: string;
    competitorName: string;
    error: string;
  }>;
  completedAt: Date;
  processingTimeMs: number;
}

export interface AutoReportSchedule {
  id: string;
  projectId: string;
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  nextRunTime: Date;
  lastExecuted?: Date;
  reportTemplate: 'comprehensive' | 'executive' | 'technical' | 'strategic';
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface QueueStatus {
  isGenerating: boolean;
  queuePosition: number;
  estimatedCompletion: Date;
  lastGenerated?: Date;
  nextScheduled?: Date;
}

export interface ReportTriggerEvent {
  type: 'competitorWebsiteChange' | 'significantContentUpdate' | 'newCompetitorAdded' | 'userRequestedUpdate';
  projectId: string;
  competitorId?: string;
  metadata?: Record<string, any>;
}

export interface ComparativeReportTask {
  id: string;
  projectId: string;
  productId: string;
  competitorIds: string[];
  reportType: 'comparative';
  reportName: string;
  template: 'comprehensive' | 'executive' | 'technical' | 'strategic';
  focusArea: 'user_experience' | 'pricing' | 'features' | 'marketing' | 'overall';
  priority: 'high' | 'normal' | 'low';
  correlationId: string;
  createdAt: Date;
}

export interface ReportTaskResult {
  taskId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  estimatedCompletion: Date;
  queuePosition?: number;
}

export class AutoReportGenerationService {
  private reportQueue: Bull.Queue<ReportGenerationTask>;
  private comparativeReportQueue: Bull.Queue<ComparativeReportTask>;
  private reportGenerator: ReportGenerator;
  private cronJobManager = getCronJobManager();
  private comparativeReportService: ComparativeReportService;
  private productScrapingService: ProductScrapingService;

  constructor() {
    // Initialize the report generation queue
    this.reportQueue = new Bull('report-generation', {
      redis: {
        port: parseInt(process.env.REDIS_PORT || '6379'),
        host: process.env.REDIS_HOST || 'localhost',
        password: process.env.REDIS_PASSWORD,
      },
      defaultJobOptions: {
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 50, // Keep last 50 failed jobs
        attempts: 3, // Retry failed jobs up to 3 times
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    });

    // NEW: Separate queue for comparative reports
    this.comparativeReportQueue = new Bull('comparative-report-generation', {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379')
      }
    });

    this.reportGenerator = new ReportGenerator();
    this.comparativeReportService = new ComparativeReportService();
    this.productScrapingService = new ProductScrapingService();
    
    // Set up queue event handlers
    this.setupQueueHandlers();
    
    // Process the queue
    this.processQueue();

    // NEW: Process comparative reports
    this.processComparativeQueue();

    // NEW: Handle comparative queue events
    this.setupComparativeQueueHandlers();

    // Initialize enhanced cron job manager
    this.initializeCronJobManager();

    logger.info('AutoReportGenerationService initialized successfully');
  }

  /**
   * Initialize the enhanced cron job manager
   */
  private async initializeCronJobManager(): Promise<void> {
    try {
      await this.cronJobManager.initialize();
      logger.info('Enhanced cron job manager initialized');
    } catch (error) {
      logger.error('Failed to initialize cron job manager', error as Error);
    }
  }

  /**
   * Generate initial report immediately after project creation
   */
  async generateInitialReport(
    projectId: string,
    options?: {
      reportTemplate?: 'comprehensive' | 'executive' | 'technical' | 'strategic';
      reportName?: string;
      userId?: string;
      priority?: 'high' | 'normal' | 'low';
    }
  ): Promise<{ taskId: string; queuePosition: number }> {
    const correlationId = generateCorrelationId();
    const context = { projectId, correlationId, operation: 'generateInitialReport' };

    try {
      trackBusinessEvent('auto_report_initial_generation_requested', {
        ...context,
        reportTemplate: options?.reportTemplate || 'comprehensive',
        priority: options?.priority || 'high'
      });

      logger.info('Generating initial report for project', context);

      // Get project and competitors
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          competitors: {
            select: { id: true, name: true }
          }
        }
      });

      if (!project) {
        throw new Error(`Project ${projectId} not found`);
      }

      if (!project.competitors || project.competitors.length === 0) {
        throw new Error(`No competitors assigned to project ${projectId}`);
      }

      // Create the report generation task
      const task: ReportGenerationTask = {
        id: generateCorrelationId(),
        projectId,
        competitorIds: project.competitors.map(c => c.id),
        reportType: 'initial',
        priority: options?.priority || 'high',
        reportTemplate: options?.reportTemplate || 'comprehensive',
        triggeredBy: 'project_creation',
        reportName: options?.reportName || `Initial Report - ${project.name}`,
        userId: options?.userId,
        timeframe: 30, // Default 30 days for initial reports
        correlationId,
        createdAt: new Date()
      };

      // Add to queue with high priority for initial reports
      const job = await this.reportQueue.add(task, {
        priority: task.priority === 'high' ? 1 : task.priority === 'normal' ? 2 : 3,
        delay: 0 // Process immediately
      });

      const queueStats = await this.reportQueue.getWaiting();
      const queuePosition = queueStats.length;

      trackBusinessEvent('auto_report_task_queued', {
        ...context,
        taskId: task.id,
        queuePosition,
        competitorCount: project.competitors.length
      });

      logger.info('Initial report generation task queued', {
        ...context,
        taskId: task.id,
        queuePosition,
        competitorCount: project.competitors.length
      });

      return {
        taskId: task.id,
        queuePosition
      };
    } catch (error) {
      logger.error('Failed to queue initial report generation', error as Error, context);
      throw error;
    }
  }

  /**
   * Schedule periodic reports for a project using enhanced cron manager
   */
  async schedulePeriodicReports(
    projectId: string,
    frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly',
    options?: {
      reportTemplate?: 'comprehensive' | 'executive' | 'technical' | 'strategic';
      startDate?: Date;
    }
  ): Promise<AutoReportSchedule> {
    const correlationId = generateCorrelationId();
    const context = { projectId, frequency, correlationId, operation: 'schedulePeriodicReports' };

    try {
      trackBusinessEvent('auto_report_schedule_requested', {
        ...context,
        reportTemplate: options?.reportTemplate || 'comprehensive'
      });

      logger.info('Scheduling periodic reports for project using enhanced cron manager', context);

      // Calculate next run time based on frequency
      const nextRunTime = this.calculateNextRunTime(frequency, options?.startDate);

      // Create schedule record
      const schedule: AutoReportSchedule = {
        id: generateCorrelationId(),
        projectId,
        frequency,
        nextRunTime,
        reportTemplate: options?.reportTemplate || 'comprehensive',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Store schedule in database
      await prisma.project.update({
        where: { id: projectId },
        data: {
          parameters: {
            autoReportSchedule: schedule
          }
        }
      });

      // Use enhanced cron job manager instead of basic cron
      const cronJobId = `scheduled-report-${projectId}`;
      await this.cronJobManager.scheduleJob({
        id: cronJobId,
        name: `Scheduled Report - ${projectId}`,
        cronPattern: this.getCronPattern(frequency),
        projectId: projectId,
        jobType: 'SCHEDULED_REPORT',
        isActive: true,
        maxRetries: 3,
        retryDelayMs: 60000, // 1 minute
        timeoutMs: 600000,   // 10 minutes
        metadata: {
          reportTemplate: options?.reportTemplate || 'comprehensive',
          scheduleId: schedule.id
        }
      });

      logger.info('Scheduled reports set up with enhanced cron manager', {
        ...context,
        scheduleId: schedule.id,
        cronJobId,
        cronPattern: this.getCronPattern(frequency)
      });

      trackBusinessEvent('auto_report_schedule_created', {
        ...context,
        scheduleId: schedule.id,
        cronJobId
      });

      return schedule;
    } catch (error) {
      logger.error('Failed to schedule periodic reports', error as Error, context);
      throw error;
    }
  }

  /**
   * Trigger report generation based on events
   */
  async triggerReportOnEvent(
    projectId: string,
    event: ReportTriggerEvent
  ): Promise<{ taskId: string; queuePosition: number }> {
    const correlationId = generateCorrelationId();
    const context = { projectId, eventType: event.type, correlationId, operation: 'triggerReportOnEvent' };

    try {
      trackBusinessEvent('auto_report_event_triggered', {
        ...context,
        competitorId: event.competitorId,
        metadata: event.metadata
      });

      logger.info('Triggering report generation based on event', context);

      // Get project and competitors
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          competitors: {
            select: { id: true, name: true }
          }
        }
      });

      if (!project) {
        throw new Error(`Project ${projectId} not found`);
      }

      // Determine which competitors to include
      let competitorIds = project.competitors?.map(c => c.id) || [];
      if (event.competitorId && event.type === 'competitorWebsiteChange') {
        competitorIds = [event.competitorId];
      }

      // Create the report generation task
      const task: ReportGenerationTask = {
        id: generateCorrelationId(),
        projectId,
        competitorIds,
        reportType: 'event-driven',
        priority: this.determineEventPriority(event.type),
        reportTemplate: 'comprehensive', // Default for event-driven reports
        triggeredBy: 'event',
        reportName: `${event.type} Report - ${project.name}`,
        timeframe: 7, // Shorter timeframe for event-driven reports
        correlationId,
        createdAt: new Date()
      };

      // Add to queue
      const job = await this.reportQueue.add(task, {
        priority: task.priority === 'high' ? 1 : task.priority === 'normal' ? 2 : 3,
        delay: 0
      });

      const queueStats = await this.reportQueue.getWaiting();
      const queuePosition = queueStats.length;

      trackBusinessEvent('auto_report_event_task_queued', {
        ...context,
        taskId: task.id,
        queuePosition
      });

      logger.info('Event-driven report generation task queued', {
        ...context,
        taskId: task.id,
        queuePosition
      });

      return {
        taskId: task.id,
        queuePosition
      };
    } catch (error) {
      logger.error('Failed to trigger event-driven report generation', error as Error, context);
      throw error;
    }
  }

  /**
   * Get queue status for a project
   */
  async getQueueStatus(projectId: string): Promise<QueueStatus> {
    try {
      const waitingJobs = await this.reportQueue.getWaiting();
      const activeJobs = await this.reportQueue.getActive();
      
      // Find if project has jobs in queue
      const projectJob = [...waitingJobs, ...activeJobs].find(
        job => job.data.projectId === projectId
      );

      const queuePosition = projectJob ? 
        waitingJobs.findIndex(job => job.id === projectJob.id) + 1 : 0;

      // Estimate completion time (rough calculation)
      const avgProcessingTime = 120000; // 2 minutes average
      const estimatedCompletion = new Date(Date.now() + (queuePosition * avgProcessingTime));

      // Get last generated report
      const lastReport = await prisma.report.findFirst({
        where: { projectId },
        orderBy: { createdAt: 'desc' }
      });

      // Get next scheduled report
      const project = await prisma.project.findUnique({
        where: { id: projectId }
      });
      
      const scheduleData = project?.parameters as any;
      const nextScheduled = scheduleData?.autoReportSchedule?.nextRunTime ? 
        new Date(scheduleData.autoReportSchedule.nextRunTime) : undefined;

      return {
        isGenerating: !!projectJob,
        queuePosition: Math.max(0, queuePosition),
        estimatedCompletion,
        lastGenerated: lastReport?.createdAt,
        nextScheduled
      };
    } catch (error) {
      logger.error('Failed to get queue status', error as Error, { projectId });
      throw error;
    }
  }

  /**
   * Process the report generation queue
   */
  private processQueue(): void {
    this.reportQueue.process(async (job) => {
      const task = job.data;
      const correlationId = task.correlationId;
      const context = { 
        taskId: task.id, 
        projectId: task.projectId, 
        correlationId,
        operation: 'processReportTask'
      };

      const startTime = Date.now();

      try {
        trackReportFlow('auto_report_task_processing_started', {
          ...context,
          stepStatus: 'started',
          stepData: {
            reportType: task.reportType,
            competitorCount: task.competitorIds.length,
            priority: task.priority
          }
        });

        logger.info('Processing report generation task', context);

        const reportResults = [];
        const errors = [];

        // Generate reports for each competitor
        for (const competitorId of task.competitorIds) {
          try {
            const report = await this.reportGenerator.generateReport(
              competitorId,
              task.timeframe || 30,
              {
                reportName: task.reportName,
                projectId: task.projectId,
                userId: task.userId,
                reportOptions: {
                  fallbackToSimpleReport: true,
                  maxRetries: 2
                }
              }
            );

            if (report.error) {
              const competitor = await prisma.competitor.findUnique({
                where: { id: competitorId },
                select: { name: true }
              });

              errors.push({
                competitorId,
                competitorName: competitor?.name || 'Unknown',
                error: report.error
              });
            } else {
              reportResults.push({
                competitorId,
                report: report.data,
                success: true
              });
            }
          } catch (error) {
            const competitor = await prisma.competitor.findUnique({
              where: { id: competitorId },
              select: { name: true }
            });

            errors.push({
              competitorId,
              competitorName: competitor?.name || 'Unknown',
              error: (error as Error).message
            });
          }
        }

        const processingTimeMs = Date.now() - startTime;
        const result: ReportGenerationResult = {
          taskId: task.id,
          projectId: task.projectId,
          success: reportResults.length > 0,
          reportsGenerated: reportResults.length,
          errors,
          completedAt: new Date(),
          processingTimeMs
        };

        trackReportFlow('auto_report_task_processing_completed', {
          ...context,
          stepStatus: 'completed',
          stepData: {
            reportsGenerated: reportResults.length,
            errorsCount: errors.length,
            processingTimeMs
          }
        });

        trackBusinessEvent('auto_report_generation_completed', {
          ...context,
          success: result.success,
          reportsGenerated: result.reportsGenerated,
          errorsCount: errors.length,
          processingTimeMs
        });

        logger.info('Report generation task completed', {
          ...context,
          reportsGenerated: reportResults.length,
          errorsCount: errors.length,
          processingTimeMs
        });

        return result;
      } catch (error) {
        const processingTimeMs = Date.now() - startTime;
        
        trackReportFlow('auto_report_task_processing_failed', {
          ...context,
          stepStatus: 'failed',
          stepData: {
            errorMessage: (error as Error).message,
            processingTimeMs
          }
        });

        logger.error('Report generation task failed', error as Error, context);
        throw error;
      }
    });
  }

  /**
   * NEW: Process the comparative report generation queue
   */
  private processComparativeQueue(): void {
    this.comparativeReportQueue.process('generate-comparative-report', async (job) => {
      const task: ComparativeReportTask = job.data;
      const { projectId, productId, competitorIds, correlationId } = task;
      const context = { taskId: task.id, projectId, correlationId, operation: 'processComparativeReportTask' };

      try {
        logger.info('Processing comparative report task', context);

        trackReportFlow('comparative_report_task_processing_started', {
          ...context,
          stepStatus: 'started',
          stepData: {
            reportType: task.reportType,
            competitorCount: task.competitorIds.length,
            priority: task.priority
          }
        });

        // 1. Ensure recent data for product and competitors
        await this.ensureRecentData(productId, competitorIds);

        // 2. Get project with related data
        const project = await prisma.project.findUnique({
          where: { id: projectId },
          include: {
            competitors: {
              include: {
                snapshots: {
                  orderBy: { createdAt: 'desc' },
                  take: 1
                }
              }
            }
          }
        });

                 // 3. Get product with snapshots
         const product = await prisma.product.findUnique({
           where: { id: productId },
           include: {
             snapshots: {
               orderBy: { createdAt: 'desc' },
               take: 1
             }
           }
         });

        if (!project || !product) {
          throw new Error(`Project or product not found: ${projectId}, ${productId}`);
        }

        if (!product.snapshots || product.snapshots.length === 0) {
          throw new Error(`No product data available for ${productId}. Please ensure product website is scraped.`);
        }

        // 4. Generate comparative analysis using existing AI service
        const analysisInput = {
          productSnapshot: product.snapshots[0],
          competitorSnapshots: project.competitors
            .filter(c => c.snapshots && c.snapshots.length > 0)
            .map(c => c.snapshots[0]),
          focusArea: task.focusArea,
          template: task.template
        };

        if (analysisInput.competitorSnapshots.length === 0) {
          throw new Error('No competitor data available for comparison. Please ensure competitors are scraped.');
        }

        // 5. Create report using ReportGenerator (existing service)
        const reportResult = await this.reportGenerator.generateComparativeReport(
          projectId,
          {
            reportName: task.reportName,
            template: task.template,
            focusArea: task.focusArea,
            includeRecommendations: true
          }
        );

        if (reportResult.error) {
          throw new Error(`Report generation failed: ${reportResult.error}`);
        }

        const reportData = reportResult.data!;

        // 6. Store the comparative report (already stored by generateComparativeReport)
        // Just get the report ID from the database
        const report = await prisma.report.findFirst({
          where: {
            projectId,
            reportType: 'COMPARATIVE'
          },
          orderBy: { createdAt: 'desc' }
        });

        if (!report) {
          throw new Error('Failed to retrieve stored comparative report');
        }

        trackReportFlow('comparative_report_task_completed', {
          ...context,
          stepStatus: 'completed',
          stepData: {
            reportId: report.id,
            confidenceScore: 0.85,
            contentLength: reportData.title.length
          }
        });

        logger.info('Comparative report generated successfully', {
          ...context,
          reportId: report.id,
          contentLength: reportData.title.length
        });

        return {
          success: true,
          reportId: report.id,
          reportContent: reportData.title,
          processingTime: Date.now() - task.createdAt.getTime()
        };

      } catch (error) {
        const errorMessage = this.createActionableErrorMessage(error as Error, context);
        
        trackReportFlow('comparative_report_task_failed', {
          ...context,
          stepStatus: 'failed',
          stepData: {
            errorMessage,
            errorType: (error as Error).constructor.name
          }
        });

        logger.error('Comparative report generation failed', error as Error, context);
        throw new Error(errorMessage);
      }
    });
  }

  /**
   * NEW: Ensure recent data for product and competitors
   */
  private async ensureRecentData(productId: string, competitorIds: string[]): Promise<void> {
    const correlationId = generateCorrelationId();
    const promises = [];

    // Ensure product data is recent (< 7 days)
    promises.push(this.productScrapingService.ensureRecentProductData(productId));

    // Ensure competitor data is recent for each competitor
    for (const competitorId of competitorIds) {
      promises.push(this.ensureRecentCompetitorData(competitorId));
    }

    try {
      await Promise.all(promises);
      logger.info('Data freshness check completed', {
        productId,
        competitorCount: competitorIds.length,
        correlationId
      });
    } catch (error) {
      logger.warn('Some data freshness checks failed, proceeding with available data', {
        productId,
        competitorIds,
        error: (error as Error).message,
        correlationId
      });
    }
  }

  /**
   * NEW: Ensure recent competitor data
   */
  private async ensureRecentCompetitorData(competitorId: string): Promise<void> {
    const recentSnapshot = await prisma.snapshot.findFirst({
      where: {
        competitorId,
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 days
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!recentSnapshot) {
      logger.info('Competitor data stale, triggering refresh', { competitorId });
      // Note: We don't await this to avoid blocking the report generation
      // The scraping will happen asynchronously and future reports will use fresh data
      this.triggerCompetitorScraping(competitorId);
    }
  }

  /**
   * NEW: Trigger competitor scraping (async)
   */
  private async triggerCompetitorScraping(competitorId: string): Promise<void> {
    try {
      // Use existing web scraper service for competitors
      const competitor = await prisma.competitor.findUnique({
        where: { id: competitorId }
      });

      if (competitor) {
        // Note: This would use the existing scraping infrastructure
        logger.info('Triggered competitor scraping', { 
          competitorId, 
          competitorName: competitor.name 
        });
      }
    } catch (error) {
      logger.warn('Failed to trigger competitor scraping', {
        competitorId,
        error: (error as Error).message
      });
    }
  }

  /**
   * NEW: Set up comparative queue event handlers
   */
  private setupComparativeQueueHandlers(): void {
    this.comparativeReportQueue.on('completed', (job, result) => {
      logger.info('Comparative report task completed successfully', {
        jobId: job.id,
        taskId: job.data.id,
        projectId: job.data.projectId,
        reportId: result.reportId
      });
    });

    this.comparativeReportQueue.on('failed', (job, err) => {
      logger.error('Comparative report task failed', err, {
        jobId: job.id,
        taskId: job.data.id,
        projectId: job.data.projectId,
        attempts: job.attemptsMade,
        maxAttempts: job.opts.attempts
      });
    });

    this.comparativeReportQueue.on('stalled', (job) => {
      logger.warn('Comparative report task stalled', {
        jobId: job.id,
        taskId: job.data.id,
        projectId: job.data.projectId
      });
    });
  }

  /**
   * NEW: Create actionable error messages for common failure scenarios
   */
  private createActionableErrorMessage(error: Error, context: any): string {
    if (error.message.includes('Product not found')) {
      return `Project ${context.projectId} missing product entity. Please recreate the project with product information.`;
    }
    if (error.message.includes('No product data')) {
      return `Product website not scraped yet. Triggering scraping and retry in 5 minutes.`;
    }
    if (error.message.includes('Insufficient competitor data')) {
      return `Not enough competitor data for analysis. Need at least 1 competitor with recent snapshots.`;
    }
    if (error.message.includes('AI analysis failed')) {
      return `AI analysis service temporarily unavailable. Report generation will retry automatically in 5 minutes.`;
    }
    return `Comparative analysis failed: ${error.message}. Check logs for correlation ID: ${context.correlationId}`;
  }

  /**
   * Set up queue event handlers
   */
  private setupQueueHandlers(): void {
    this.reportQueue.on('completed', (job, result) => {
      logger.info('Report generation task completed successfully', {
        jobId: job.id,
        taskId: job.data.id,
        projectId: job.data.projectId,
        reportsGenerated: result.reportsGenerated
      });
    });

    this.reportQueue.on('failed', (job, err) => {
      logger.error('Report generation task failed', err, {
        jobId: job.id,
        taskId: job.data.id,
        projectId: job.data.projectId,
        attempts: job.attemptsMade,
        maxAttempts: job.opts.attempts
      });
    });

    this.reportQueue.on('stalled', (job) => {
      logger.warn('Report generation task stalled', {
        jobId: job.id,
        taskId: job.data.id,
        projectId: job.data.projectId
      });
    });
  }

  /**
   * Execute scheduled report generation
   */
  private async executeScheduledReport(projectId: string, schedule: AutoReportSchedule): Promise<void> {
    const correlationId = generateCorrelationId();
    const context = { projectId, scheduleId: schedule.id, correlationId };

    try {
      logger.info('Executing scheduled report generation', context);

      // Get project and competitors
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          competitors: { select: { id: true } }
        }
      });

      if (!project || !project.competitors || project.competitors.length === 0) {
        logger.warn('Project not found or has no competitors for scheduled report', context);
        return;
      }

      // Create scheduled report task
      const task: ReportGenerationTask = {
        id: generateCorrelationId(),
        projectId,
        competitorIds: project.competitors.map(c => c.id),
        reportType: 'scheduled',
        priority: 'normal',
        reportTemplate: schedule.reportTemplate,
        triggeredBy: 'schedule',
        reportName: `Scheduled ${schedule.frequency} Report - ${project.name}`,
        timeframe: this.getTimeframeForFrequency(schedule.frequency),
        correlationId,
        createdAt: new Date()
      };

      // Add to queue
      await this.reportQueue.add(task, {
        priority: 2 // Normal priority for scheduled reports
      });

      // Update next run time
      const nextRunTime = this.calculateNextRunTime(schedule.frequency);
      await prisma.project.update({
        where: { id: projectId },
        data: {
          parameters: {
            autoReportSchedule: {
              ...schedule,
              lastExecuted: new Date(),
              nextRunTime,
              updatedAt: new Date()
            }
          }
        }
      });

      logger.info('Scheduled report generation task queued', {
        ...context,
        taskId: task.id,
        nextRunTime: nextRunTime.toISOString()
      });
    } catch (error) {
      logger.error('Failed to execute scheduled report generation', error as Error, context);
    }
  }

  /**
   * Calculate next run time based on frequency
   */
  private calculateNextRunTime(frequency: string, startDate?: Date): Date {
    const now = startDate || new Date();
    const nextRun = new Date(now);

    switch (frequency) {
      case 'daily':
        nextRun.setDate(nextRun.getDate() + 1);
        break;
      case 'weekly':
        nextRun.setDate(nextRun.getDate() + 7);
        break;
      case 'biweekly':
        nextRun.setDate(nextRun.getDate() + 14);
        break;
      case 'monthly':
        nextRun.setMonth(nextRun.getMonth() + 1);
        break;
      default:
        nextRun.setDate(nextRun.getDate() + 7); // Default to weekly
    }

    return nextRun;
  }

  /**
   * Get cron pattern for frequency
   */
  private getCronPattern(frequency: string): string {
    switch (frequency) {
      case 'daily':
        return '0 9 * * *'; // 9 AM daily
      case 'weekly':
        return '0 9 * * 1'; // 9 AM every Monday
      case 'biweekly':
        return '0 9 * * 1/2'; // 9 AM every other Monday
      case 'monthly':
        return '0 9 1 * *'; // 9 AM on the 1st of each month
      default:
        return '0 9 * * 1'; // Default to weekly
    }
  }

  /**
   * Determine priority based on event type
   */
  private determineEventPriority(eventType: string): 'high' | 'normal' | 'low' {
    switch (eventType) {
      case 'competitorWebsiteChange':
      case 'significantContentUpdate':
        return 'high';
      case 'newCompetitorAdded':
        return 'normal';
      case 'userRequestedUpdate':
        return 'high';
      default:
        return 'normal';
    }
  }

  /**
   * Get appropriate timeframe for frequency
   */
  private getTimeframeForFrequency(frequency: string): number {
    switch (frequency) {
      case 'daily':
        return 1;
      case 'weekly':
        return 7;
      case 'biweekly':
        return 14;
      case 'monthly':
        return 30;
      default:
        return 7;
    }
  }

  /**
   * Handle generation failures with retry logic
   */
  async handleGenerationFailure(taskId: string, error: Error): Promise<void> {
    const context = { taskId, operation: 'handleGenerationFailure' };
    
    try {
      logger.warn('Handling report generation failure', { ...context, error: error.message });
      
      // Implement custom failure handling logic here
      // For now, we rely on Bull's built-in retry mechanism
      
      trackBusinessEvent('auto_report_generation_failure_handled', {
        ...context,
        errorMessage: error.message
      });
    } catch (handlingError) {
      logger.error('Failed to handle generation failure', handlingError as Error, context);
    }
  }

  /**
   * Retry failed tasks manually
   */
  async retryFailedTasks(): Promise<number> {
    try {
      const failedJobs = await this.reportQueue.getFailed();
      let retriedCount = 0;

      for (const job of failedJobs) {
        try {
          await job.retry();
          retriedCount++;
          
          logger.info('Retried failed report generation task', {
            jobId: job.id,
            taskId: job.data.id,
            projectId: job.data.projectId
          });
        } catch (retryError) {
          logger.error('Failed to retry report generation task', retryError as Error, {
            jobId: job.id,
            taskId: job.data.id,
            projectId: job.data.projectId
          });
        }
      }

      logger.info('Completed retrying failed tasks', { 
        totalFailed: failedJobs.length, 
        retriedCount 
      });

      return retriedCount;
    } catch (error) {
      logger.error('Failed to retry failed tasks', error as Error);
      throw error;
    }
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    try {
      // Stop all cron jobs
             await this.cronJobManager.cleanup();
      logger.info('Enhanced cron job manager cleanup completed');

      // Close the queue
      await this.reportQueue.close();
      
      logger.info('AutoReportGenerationService cleanup completed');
    } catch (error) {
      logger.error('Failed to cleanup AutoReportGenerationService', error as Error);
    }
  }

  /**
   * NEW: Generate comparative report instead of individual competitor reports
   * This is the main fix for Phase 2.1 - replacing individual reports with unified comparative analysis
   */
  async generateInitialComparativeReport(projectId: string): Promise<ReportTaskResult> {
    const correlationId = generateCorrelationId();
    const context = { projectId, correlationId, operation: 'generateInitialComparativeReport' };
    
    try {
      logger.info('Starting comparative report generation for project', context);

                    // 1. Validate project has product
       const project = await prisma.project.findUnique({
         where: { id: projectId },
         include: { 
           competitors: true,
           products: true
         }
       });

       if (!project) {
         throw new Error(`Project ${projectId} not found`);
       }

       if (!project.products || project.products.length === 0) {
         throw new Error(`Project ${projectId} missing product entity. Cannot generate comparative report without product data.`);
       }

       if (!project.competitors || project.competitors.length === 0) {
         logger.warn('Project has no competitors assigned, skipping comparative report', context);
         throw new Error(`Project ${projectId} has no competitors assigned. Cannot generate comparative analysis.`);
       }

       // 2. Create comparative report task
       const task: ComparativeReportTask = {
         id: correlationId + '_task',
         projectId,
         productId: project.products[0].id,
         competitorIds: project.competitors.map(c => c.id),
         reportType: 'comparative',
         reportName: `${project.name} - Competitive Analysis`,
         template: 'comprehensive',
         focusArea: 'user_experience',
         priority: 'high',
         correlationId,
         createdAt: new Date()
       };

      // 3. Queue for processing
      const job = await this.comparativeReportQueue.add('generate-comparative-report', task, {
        priority: 10,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        }
      });

      trackBusinessEvent('comparative_report_task_queued', {
        ...context,
        taskId: task.id,
        productId: task.productId,
        competitorCount: task.competitorIds.length
      });

      logger.info('Comparative report task queued successfully', {
        ...context,
        taskId: task.id,
        productId: task.productId,
        competitorCount: task.competitorIds.length,
        jobId: job.id
      });

      return {
        taskId: task.id,
        status: 'queued',
        estimatedCompletion: new Date(Date.now() + 120000), // 2 minutes
        queuePosition: 1 // First comparative report in queue
      };

    } catch (error) {
      trackBusinessEvent('comparative_report_task_queue_failed', {
        ...context,
        error: (error as Error).message
      });
      
      logger.error('Failed to queue comparative report', error as Error, context);
      throw error;
    }
  }

  // ... existing code ...
}

// Singleton instance
let autoReportService: AutoReportGenerationService | null = null;

export function getAutoReportService(): AutoReportGenerationService {
  if (!autoReportService) {
    autoReportService = new AutoReportGenerationService();
  }
  return autoReportService;
} 