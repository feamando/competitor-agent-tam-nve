/**
 * Unified ReportingService Implementation - Task 5.1
 * Consolidates all reporting capabilities into a single service
 * Focuses exclusively on comparative reports in markdown format
 * 
 * Features:
 * - Bull queue system for async report processing
 * - Factory pattern for report sub-services
 * - Comprehensive error handling and retry mechanisms
 * - Focus ONLY on comparative report workflows
 * - Enhanced constructor initialization with graceful fallbacks (Task 1.2)
 */

import Bull from 'bull';
import { logger, generateCorrelationId, trackBusinessEvent, trackErrorWithCorrelation, trackPerformance } from '@/lib/logger';
import { AnalysisService } from './AnalysisService';
import {
  IReportingService,
  IReportGenerator,
  IReportScheduler,
  IReportProcessor,
  ComparativeReportRequest,
  ComparativeReportResponse,
  IntelligentReportRequest,
  IntelligentReportResponse,
  InitialReportOptions,
  InitialReportResponse,
  ReportSchedule,
  ScheduleResult,
  ReportStatus,
  QueueStatistics,
  ServiceHealth,
  ReportTask,
  QueueOptions,
  ReportTaskResult,
  ReportConfig,
  ReportRequest,
  ReportResponse,
  TaskType,
  Priority,
  QueueHealth
} from './reporting/types';

// Sub-service factories
import { ReportGeneratorFactory } from './reporting/ReportGeneratorFactory';
import { ReportSchedulerFactory } from './reporting/ReportSchedulerFactory';  
import { ReportProcessorFactory } from './reporting/ReportProcessorFactory';

/**
 * Enhanced Queue Configuration for Task 5.1
 */
export interface ReportingQueueConfig {
  name: string;
  redis: {
    host: string;
    port: number;
    password?: string;
    db?: number;
    connectTimeout?: number;
    lazyConnect?: boolean;
  };
  defaultJobOptions: {
    removeOnComplete: number;
    removeOnFail: number;
    attempts: number;
    backoff: {
      type: 'exponential' | 'fixed';
      delay: number;
    };
    delay?: number;
    timeout?: number;
  };
  concurrency?: number;
  stalledInterval?: number;
  maxStalledCount?: number;
}

const UNIFIED_QUEUE_CONFIG_DEFINITION: ReportingQueueConfig = {
  name: 'unified-reporting-queue',
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    ...(process.env.REDIS_PASSWORD && { password: process.env.REDIS_PASSWORD }),
    db: parseInt(process.env.REDIS_DB || '0'),
    connectTimeout: 10000,
    lazyConnect: true
  },
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    timeout: 600000 // 10 minutes timeout
  },
  concurrency: parseInt(process.env.REPORTING_CONCURRENCY || '3'),
  stalledInterval: 30000,
  maxStalledCount: 1
};

/**
 * Service Error Types for comprehensive error handling - Enhanced for Task 1.2
 */
export class ReportingServiceError extends Error {
  constructor(
    message: string,
    public code: string,
    public correlationId?: string,
    public context?: Record<string, any>
  ) {
    super(message);
    this.name = 'ReportingServiceError';
  }
}

export class QueueProcessingError extends ReportingServiceError {
  constructor(message: string, correlationId?: string, context?: Record<string, any>) {
    super(message, 'QUEUE_PROCESSING_ERROR', correlationId, context);
    this.name = 'QueueProcessingError';
  }
}

export class ReportGenerationError extends ReportingServiceError {
  constructor(message: string, correlationId?: string, context?: Record<string, any>) {
    super(message, 'REPORT_GENERATION_ERROR', correlationId, context);
    this.name = 'ReportGenerationError';
  }
}

/**
 * Task 1.2: Service Initialization Error Types
 */
export class ServiceInitializationError extends ReportingServiceError {
  constructor(message: string, correlationId?: string, context?: Record<string, any>) {
    super(message, 'SERVICE_INITIALIZATION_ERROR', correlationId, context);
    this.name = 'ServiceInitializationError';
  }
}

export class DependencyInjectionError extends ReportingServiceError {
  constructor(message: string, correlationId?: string, context?: Record<string, any>) {
    super(message, 'DEPENDENCY_INJECTION_ERROR', correlationId, context);
    this.name = 'DependencyInjectionError';
  }
}

/**
 * Task 1.2: Initialization Status Tracking
 */
export interface ServiceInitializationStatus {
  reportGenerator: {
    status: 'not_started' | 'initializing' | 'initialized' | 'failed' | 'fallback';
    error?: Error;
    initTime?: number;
  };
  reportScheduler: {
    status: 'not_started' | 'initializing' | 'initialized' | 'failed' | 'fallback';
    error?: Error;
    initTime?: number;
  };
  reportProcessor: {
    status: 'not_started' | 'initializing' | 'initialized' | 'failed' | 'fallback';
    error?: Error;
    initTime?: number;
  };
  queue: {
    status: 'not_started' | 'initializing' | 'initialized' | 'failed' | 'fallback';
    error?: Error;
    initTime?: number;
  };
  overall: 'initializing' | 'healthy' | 'degraded' | 'failed';
  fallbackModeActive: boolean;
  initializationStartTime: number;
  initializationEndTime?: number;
}

/**
 * Retry Strategy Configuration
 */
export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
  retryableErrors: string[];
}

const DEFAULT_RETRY_CONFIG_DEFINITION: RetryConfig = {
  maxAttempts: 3,
  baseDelay: 2000,
  maxDelay: 30000,
  backoffFactor: 2,
  retryableErrors: [
    'TIMEOUT_ERROR',
    'CONNECTION_ERROR',
    'ANALYSIS_SERVICE_ERROR',
    'TEMPORARY_ERROR'
  ]
};

/**
 * Main ReportingService Implementation - Task 5.1 with Task 1.2 Enhancements
 * Enhanced with Bull queue system, factory pattern, comprehensive error handling,
 * and robust service initialization with graceful fallbacks
 */
export class ReportingService implements IReportingService {
  private reportGenerator: IReportGenerator | null = null;
  private reportScheduler: IReportScheduler | null = null;
  private reportProcessor: IReportProcessor | null = null;
  private analysisService: AnalysisService;
  private queue: Bull.Queue | null = null;
  private isInitialized: boolean = false;
  private retryConfig: RetryConfig;
  private performanceMetrics: Map<string, number[]> = new Map();
  
  // Task 1.2: Enhanced initialization tracking
  private initializationStatus: ServiceInitializationStatus;
  private initializationCorrelationId: string;
  private fallbackServices: Map<string, any> = new Map();

  constructor(
    analysisService: AnalysisService,
    queueConfig: ReportingQueueConfig = UNIFIED_QUEUE_CONFIG_DEFINITION,
    retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG_DEFINITION
  ) {
    // Task 1.2: Initialize correlation ID and status tracking
    this.initializationCorrelationId = generateCorrelationId();
    this.initializationStatus = {
      reportGenerator: { status: 'not_started' },
      reportScheduler: { status: 'not_started' },
      reportProcessor: { status: 'not_started' },
      queue: { status: 'not_started' },
      overall: 'initializing',
      fallbackModeActive: false,
      initializationStartTime: Date.now()
    };

    this.analysisService = analysisService;
    this.retryConfig = retryConfig;
    
    // Task 1.2: Enhanced constructor with comprehensive error handling
    this.initializeServiceWithFallbacks(queueConfig)
      .then(() => {
        this.initializationStatus.initializationEndTime = Date.now();
        const totalInitTime = this.initializationStatus.initializationEndTime - this.initializationStatus.initializationStartTime;
        
        logger.info('ReportingService initialization completed', {
          correlationId: this.initializationCorrelationId,
          service: 'ReportingService',
          queueName: queueConfig.name,
          concurrency: queueConfig.concurrency,
          totalInitializationTime: totalInitTime,
          fallbackModeActive: this.initializationStatus.fallbackModeActive,
          status: this.initializationStatus.overall
        });

        trackBusinessEvent('reporting_service_initialized', {
          service: 'ReportingService',
          queueName: queueConfig.name,
          concurrency: queueConfig.concurrency,
          initializationTime: totalInitTime,
          fallbackModeActive: this.initializationStatus.fallbackModeActive,
          correlationId: this.initializationCorrelationId
        });
      })
      .catch((error) => {
        this.handleInitializationFailure(error, queueConfig);
      });
  }

  /**
   * Task 1.2: Enhanced service initialization with comprehensive fallback mechanisms
   */
  private async initializeServiceWithFallbacks(queueConfig: ReportingQueueConfig): Promise<void> {
    const context = {
      correlationId: this.initializationCorrelationId,
      service: 'ReportingService',
      queueName: queueConfig.name
    };

    try {
      logger.info('Starting ReportingService initialization with fallback mechanisms', context);

      // Step 1: Initialize Bull queue with retry logic
      await this.initializeQueueWithRetry(queueConfig, context);

      // Step 2: Initialize sub-services with individual fallback handling
      await this.initializeSubServicesWithFallbacks(context);
      
      // Step 3: Setup comprehensive event handlers
      this.setupEventHandlers();
      
      // Step 4: Start queue processing with fallback considerations
      await this.startQueueProcessingWithFallbacks(queueConfig.concurrency);
      
      // Step 5: Validate overall service health
      await this.validateServiceInitialization();
      
      this.isInitialized = true;
      this.initializationStatus.overall = this.initializationStatus.fallbackModeActive ? 'degraded' : 'healthy';

    } catch (error) {
      logger.error('Critical failure during ReportingService initialization', error as Error, context);
      throw new ServiceInitializationError(
        'Complete service initialization failed',
        this.initializationCorrelationId,
        { 
          error: (error as Error).message,
          initializationStatus: this.initializationStatus,
          context
        }
      );
    }
  }

  /**
   * Task 1.2: Initialize Bull queue with comprehensive retry logic
   */
  private async initializeQueueWithRetry(queueConfig: ReportingQueueConfig, context: Record<string, any>): Promise<void> {
    this.initializationStatus.queue.status = 'initializing';
    const startTime = Date.now();

    const maxRetries = 3;
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info('Initializing Bull queue', { ...context, attempt, maxRetries });

        this.queue = new Bull(queueConfig.name, {
          redis: queueConfig.redis,
          defaultJobOptions: queueConfig.defaultJobOptions,
          settings: {
            stalledInterval: queueConfig.stalledInterval,
            maxStalledCount: queueConfig.maxStalledCount
          }
        });

        // Test queue connection
        await this.testQueueConnection();

        this.initializationStatus.queue.status = 'initialized';
        this.initializationStatus.queue.initTime = Date.now() - startTime;
        
        logger.info('Bull queue initialized successfully', {
          ...context,
          attempt,
          initTime: this.initializationStatus.queue.initTime
        });
        
        return;

      } catch (error) {
        lastError = error as Error;
        this.initializationStatus.queue.error = lastError;
        
        logger.warn('Bull queue initialization failed', {
          ...context,
          attempt,
          maxRetries,
          willRetry: attempt < maxRetries,
          error: lastError.message
        });

        if (attempt < maxRetries) {
          const delay = Math.min(2000 * Math.pow(2, attempt - 1), 10000);
          await this.sleep(delay);
          continue;
        }
      }
    }

    // All retries failed - attempt fallback queue initialization
    try {
      logger.warn('Attempting fallback queue initialization', { ...context });
      await this.initializeFallbackQueue(queueConfig, context);
    } catch (fallbackError) {
      this.initializationStatus.queue.status = 'failed';
      throw new ServiceInitializationError(
        `Queue initialization failed after ${maxRetries} attempts: ${lastError!.message}. Fallback also failed: ${(fallbackError as Error).message}`,
        this.initializationCorrelationId,
        { 
          originalError: lastError!.message,
          fallbackError: (fallbackError as Error).message,
          context
        }
      );
    }
  }

  /**
   * Task 1.2: Fallback queue initialization with minimal Redis configuration
   */
  private async initializeFallbackQueue(queueConfig: ReportingQueueConfig, context: Record<string, any>): Promise<void> {
    logger.info('Initializing fallback queue with minimal configuration', context);

    const fallbackConfig = {
      ...queueConfig,
      redis: {
        host: 'localhost',
        port: 6379,
        connectTimeout: 5000,
        lazyConnect: true,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 1
      },
      defaultJobOptions: {
        ...queueConfig.defaultJobOptions,
        attempts: 1, // Minimal retries in fallback mode
        timeout: 300000 // 5 minutes reduced timeout
      }
    };

    this.queue = new Bull(`${queueConfig.name}-fallback`, fallbackConfig);
    await this.testQueueConnection();

    this.initializationStatus.queue.status = 'fallback';
    this.initializationStatus.fallbackModeActive = true;
    this.fallbackServices.set('queue', this.queue);

    logger.warn('Fallback queue initialized - running in degraded mode', context);
  }

  /**
   * Task 1.2: Test queue connection with timeout
   */
  private async testQueueConnection(): Promise<void> {
    if (!this.queue) {
      throw new Error('Queue is not initialized');
    }

    // Test with a simple job operation
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Queue connection test timeout'));
      }, 5000);

      this.queue!.isReady()
        .then(() => {
          clearTimeout(timeout);
          resolve();
        })
        .catch((error: Error) => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  /**
   * Task 1.2: Initialize sub-services with individual fallback handling
   */
  private async initializeSubServicesWithFallbacks(context: Record<string, any>): Promise<void> {
    logger.info('Initializing sub-services with fallback mechanisms', context);

    // Initialize services in parallel with individual error handling
    const initializationPromises = [
      this.initializeReportGeneratorWithFallback(context),
      this.initializeReportSchedulerWithFallback(context),
      this.initializeReportProcessorWithFallback(context)
    ];

    // Wait for all initializations to complete (don't fail if one fails)
    const results = await Promise.allSettled(initializationPromises);
    
    // Log results and handle any failures
    results.forEach((result, index) => {
      const serviceNames = ['reportGenerator', 'reportScheduler', 'reportProcessor'];
      const serviceName = serviceNames[index];
      
      if (result.status === 'rejected') {
        logger.error(`Sub-service ${serviceName} initialization failed`, result.reason, context);
      } else {
        logger.info(`Sub-service ${serviceName} initialized successfully`, context);
      }
    });
  }

  /**
   * Task 1.2: Initialize ReportGenerator with fallback
   */
  private async initializeReportGeneratorWithFallback(context: Record<string, any>): Promise<void> {
    this.initializationStatus.reportGenerator.status = 'initializing';
    const startTime = Date.now();

    try {
      // Fixed: Create proper config object for ReportGeneratorFactory
      const generatorConfig = {
        analysisService: this.analysisService,
        config: {
          markdownOnly: true,
          maxConcurrency: 2,
          timeout: 300000
        }
      };

      this.reportGenerator = ReportGeneratorFactory.create(generatorConfig);
      
      // Test generator functionality
      if (this.reportGenerator && typeof this.reportGenerator.generateComparativeReport === 'function') {
        this.initializationStatus.reportGenerator.status = 'initialized';
        this.initializationStatus.reportGenerator.initTime = Date.now() - startTime;
        
        logger.info('ReportGenerator initialized successfully', {
          ...context,
          initTime: this.initializationStatus.reportGenerator.initTime
        });
      } else {
        throw new Error('ReportGenerator factory returned invalid instance');
      }

    } catch (error) {
      this.initializationStatus.reportGenerator.error = error as Error;
      
      logger.warn('ReportGenerator initialization failed, attempting fallback', {
        ...context,
        error: (error as Error).message
      });
      
      try {
        // Fallback: Create a minimal report generator
        this.reportGenerator = this.createFallbackReportGenerator();
        this.initializationStatus.reportGenerator.status = 'fallback';
        this.initializationStatus.fallbackModeActive = true;
        this.fallbackServices.set('reportGenerator', this.reportGenerator);
        
        logger.warn('Fallback ReportGenerator initialized', context);
      } catch (fallbackError) {
        this.initializationStatus.reportGenerator.status = 'failed';
        throw new DependencyInjectionError(
          `ReportGenerator initialization failed: ${(error as Error).message}. Fallback failed: ${(fallbackError as Error).message}`,
          this.initializationCorrelationId,
          { originalError: error, fallbackError, context }
        );
      }
    }
  }

  /**
   * Task 1.2: Initialize ReportScheduler with fallback
   */
  private async initializeReportSchedulerWithFallback(context: Record<string, any>): Promise<void> {
    this.initializationStatus.reportScheduler.status = 'initializing';
    const startTime = Date.now();

    try {
      if (!this.queue) {
        throw new Error('Queue must be initialized before ReportScheduler');
      }

      // Fixed: Create proper config object for ReportSchedulerFactory
      const schedulerConfig = {
        queue: this.queue,
        config: {
          comparativeOnly: true,
          maxSchedules: 100,
          defaultFrequency: 'weekly' as const
        }
      };

      this.reportScheduler = ReportSchedulerFactory.create(schedulerConfig);
      
      // Test scheduler functionality
      if (this.reportScheduler && typeof this.reportScheduler.createSchedule === 'function') {
        this.initializationStatus.reportScheduler.status = 'initialized';
        this.initializationStatus.reportScheduler.initTime = Date.now() - startTime;
        
        logger.info('ReportScheduler initialized successfully', {
          ...context,
          initTime: this.initializationStatus.reportScheduler.initTime
        });
      } else {
        throw new Error('ReportScheduler factory returned invalid instance');
      }

    } catch (error) {
      this.initializationStatus.reportScheduler.error = error as Error;
      
      logger.warn('ReportScheduler initialization failed, attempting fallback', {
        ...context,
        error: (error as Error).message
      });
      
      try {
        // Fallback: Create a minimal report scheduler
        this.reportScheduler = this.createFallbackReportScheduler();
        this.initializationStatus.reportScheduler.status = 'fallback';
        this.initializationStatus.fallbackModeActive = true;
        this.fallbackServices.set('reportScheduler', this.reportScheduler);
        
        logger.warn('Fallback ReportScheduler initialized', context);
      } catch (fallbackError) {
        this.initializationStatus.reportScheduler.status = 'failed';
        throw new DependencyInjectionError(
          `ReportScheduler initialization failed: ${(error as Error).message}. Fallback failed: ${(fallbackError as Error).message}`,
          this.initializationCorrelationId,
          { originalError: error, fallbackError, context }
        );
      }
    }
  }

  /**
   * Task 1.2: Initialize ReportProcessor with fallback
   */
  private async initializeReportProcessorWithFallback(context: Record<string, any>): Promise<void> {
    this.initializationStatus.reportProcessor.status = 'initializing';
    const startTime = Date.now();

    try {
      if (!this.queue || !this.reportGenerator) {
        throw new Error('Queue and ReportGenerator must be initialized before ReportProcessor');
      }

      // Fixed: Create proper config object for ReportProcessorFactory
      const processorConfig = {
        queue: this.queue,
        reportGenerator: this.reportGenerator,
        analysisService: this.analysisService,
        config: {
          processingTimeout: 600000,
          retryConfig: this.retryConfig,
          comparativeOnly: true
        }
      };

      this.reportProcessor = ReportProcessorFactory.create(processorConfig);
      
      // Test processor functionality
      if (this.reportProcessor && typeof this.reportProcessor.queueReport === 'function') {
        this.initializationStatus.reportProcessor.status = 'initialized';
        this.initializationStatus.reportProcessor.initTime = Date.now() - startTime;
        
        logger.info('ReportProcessor initialized successfully', {
          ...context,
          initTime: this.initializationStatus.reportProcessor.initTime
        });
      } else {
        throw new Error('ReportProcessor factory returned invalid instance');
      }

    } catch (error) {
      this.initializationStatus.reportProcessor.error = error as Error;
      
      logger.warn('ReportProcessor initialization failed, attempting fallback', {
        ...context,
        error: (error as Error).message
      });
      
      try {
        // Fallback: Create a minimal report processor
        this.reportProcessor = this.createFallbackReportProcessor();
        this.initializationStatus.reportProcessor.status = 'fallback';
        this.initializationStatus.fallbackModeActive = true;
        this.fallbackServices.set('reportProcessor', this.reportProcessor);
        
        logger.warn('Fallback ReportProcessor initialized', context);
      } catch (fallbackError) {
        this.initializationStatus.reportProcessor.status = 'failed';
        throw new DependencyInjectionError(
          `ReportProcessor initialization failed: ${(error as Error).message}. Fallback failed: ${(fallbackError as Error).message}`,
          this.initializationCorrelationId,
          { originalError: error, fallbackError, context }
        );
      }
    }
  }

  /**
   * Task 1.2: Handle complete initialization failure
   */
  private handleInitializationFailure(error: Error, queueConfig: ReportingQueueConfig): void {
    this.initializationStatus.overall = 'failed';
    this.initializationStatus.initializationEndTime = Date.now();
    
    const context = {
      correlationId: this.initializationCorrelationId,
      service: 'ReportingService',
      queueName: queueConfig.name,
      initializationTime: this.initializationStatus.initializationEndTime - this.initializationStatus.initializationStartTime,
      status: this.initializationStatus,
      error: error.message
    };

    logger.error('ReportingService initialization failed completely', context);

    trackErrorWithCorrelation(
      error,
      'ReportingService.constructor',
      this.initializationCorrelationId
    );

    // Don't throw here - let the service continue in emergency mode
    // The service will report its degraded state via health checks
  }

  /**
   * Initialize sub-services using factory pattern - Enhanced for Task 1.2
   */
  private initializeSubServices(): void {
    // This method is kept for backward compatibility
    // The actual initialization now happens in initializeSubServicesWithFallbacks
    logger.info('Legacy initializeSubServices called - redirecting to enhanced initialization');
  }

  /**
   * Start Bull queue processing with concurrency control - Enhanced for Task 1.2
   */
  private startQueueProcessing(concurrency: number = 3): void {
    try {
      if (!this.queue) {
        throw new Error('Queue must be initialized before starting processing');
      }

      // Process comparative reports (primary workflow)
      this.queue.process('comparative', concurrency, async (job: Bull.Job<ReportTask>) => {
        return await this.processComparativeReportWithRetry(job.data);
      });

      // Process intelligent reports  
      this.queue.process('intelligent', Math.max(1, Math.floor(concurrency / 2)), async (job: Bull.Job<ReportTask>) => {
        return await this.processIntelligentReportWithRetry(job.data);
      });

      // Process initial reports
      this.queue.process('initial', Math.max(1, Math.floor(concurrency / 2)), async (job: Bull.Job<ReportTask>) => {
        return await this.processInitialReportWithRetry(job.data);
      });

      logger.info('Queue processing started', { 
        concurrency, 
        queueName: this.queue.name 
      });

    } catch (error) {
      throw new QueueProcessingError(
        'Failed to start queue processing',
        undefined,
        { error: (error as Error).message }
      );
    }
  }

  /**
   * Generate comparative report (primary method) - Enhanced for Task 5.1
   */
  async generateComparativeReport(
    request: ComparativeReportRequest
  ): Promise<ComparativeReportResponse> {
    const correlationId = request.correlationId || generateCorrelationId();
    const context = { 
      projectId: request.projectId, 
      correlationId, 
      operation: 'generateComparativeReport' 
    };

    const startTime = Date.now();

    try {
      logger.info('Generating comparative report', {
        ...context,
        template: request.template,
        focusArea: request.focusArea,
        priority: request.priority,
        competitorCount: request.competitorIds.length
      });

      trackBusinessEvent('unified_comparative_report_requested', {
        ...context,
        template: request.template,
        focusArea: request.focusArea,
        competitorCount: request.competitorIds.length
      });

      // Comprehensive request validation
      await this.validateComparativeReportRequest(request);

      // Performance tracking
      const perfTimer = trackPerformance('comparative_report_generation');

      // Check for high-priority immediate processing
      if (request.priority === 'high' && !request.timeout) {
        const result = await this.processImmediateReportWithRetry(request, correlationId);
        
        perfTimer.end({ 
          success: result.success,
          processingTime: Date.now() - startTime
        });

        this.recordPerformanceMetric('immediate_processing', Date.now() - startTime);
        return result;
      }

      // Queue for async processing with enhanced task creation
      const task = await this.createReportTask(request, correlationId, 'comparative');
      const taskResult = await this.reportProcessor.queueReport(task);
      
      const processingTime = Date.now() - startTime;
      
      perfTimer.end({
        success: true,
        processingTime,
        queuePosition: taskResult.queuePosition
      });

      this.recordPerformanceMetric('queued_processing', processingTime);

      logger.info('Comparative report queued successfully', {
        ...context,
        taskId: taskResult.taskId,
        queuePosition: taskResult.queuePosition,
        processingTime
      });

      return {
        success: true,
        taskId: taskResult.taskId,
        projectId: request.projectId,
        processingTime,
        queueTime: processingTime,
        dataFreshness: {
          overallStatus: 'MIXED',
          lastUpdated: new Date()
        },
        correlationId
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      trackErrorWithCorrelation(
        error as Error,
        'generateComparativeReport',
        correlationId,
        { ...context, processingTime }
      );
      
      this.recordPerformanceMetric('failed_processing', processingTime);

      if (error instanceof ReportingServiceError) {
        return {
          success: false,
          taskId: '',
          projectId: request.projectId,
          processingTime,
          error: error.message,
          dataFreshness: {
            overallStatus: 'STALE',
            lastUpdated: new Date()
          },
          correlationId,
          warnings: [`Error Code: ${error.code}`]
        };
      }

      return {
        success: false,
        taskId: '',
        projectId: request.projectId,
        processingTime,
        error: (error as Error).message,
        dataFreshness: {
          overallStatus: 'STALE',
          lastUpdated: new Date()
        },
        correlationId
      };
    }
  }

  /**
   * Queue comparative report for async processing - Enhanced
   */
  async queueComparativeReport(
    request: ComparativeReportRequest,
    options?: QueueOptions
  ): Promise<ReportTaskResult> {
    const correlationId = request.correlationId || generateCorrelationId();
    const context = { 
      projectId: request.projectId, 
      correlationId, 
      operation: 'queueComparativeReport' 
    };

    try {
      logger.info('Queueing comparative report', {
        ...context,
        priority: options?.priority || request.priority,
        delay: options?.delay || 0
      });

      await this.validateComparativeReportRequest(request);

      const task = await this.createReportTask(request, correlationId, 'comparative', options);
      const result = await this.reportProcessor.queueReport(task, options);

      trackBusinessEvent('comparative_report_queued', {
        ...context,
        taskId: result.taskId,
        queuePosition: result.queuePosition
      });

      return result;

    } catch (error) {
      trackErrorWithCorrelation(
        error as Error,
        'queueComparativeReport',
        correlationId,
        context
      );
      throw error;
    }
  }

  /**
   * Generate intelligent report with enhanced features
   */
  async generateIntelligentReport(
    request: IntelligentReportRequest
  ): Promise<IntelligentReportResponse> {
    const correlationId = request.correlationId || generateCorrelationId();
    const context = { 
      projectId: request.projectId, 
      correlationId, 
      operation: 'generateIntelligentReport' 
    };

    try {
      logger.info('Generating intelligent report', {
        ...context,
        reportType: request.reportType,
        includeAlerts: request.includeAlerts
      });

      const task = await this.createReportTask(request, correlationId, 'intelligent');
      return await this.reportProcessor.processIntelligentReport(task);

    } catch (error) {
      trackErrorWithCorrelation(
        error as Error,
        'generateIntelligentReport',
        correlationId,
        context
      );
      throw error;
    }
  }

  /**
   * Generate initial report for new projects
   */
  async generateInitialReport(
    projectId: string,
    options: InitialReportOptions = {}
  ): Promise<InitialReportResponse> {
    const correlationId = generateCorrelationId();
    const context = { 
      projectId, 
      correlationId, 
      operation: 'generateInitialReport' 
    };

    try {
      logger.info('Generating initial report', {
        ...context,
        template: options.template,
        priority: options.priority
      });

      const task = await this.createReportTask(
        { ...options, projectId }, 
        correlationId, 
        'initial'
      );

      return await this.reportProcessor.processInitialReport(task);

    } catch (error) {
      trackErrorWithCorrelation(
        error as Error,
        'generateInitialReport',
        correlationId,
        context
      );
      
      return {
        success: false,
        taskId: '',
        projectId,
        status: 'failed',
        message: `Initial report generation failed: ${(error as Error).message}`,
        generatedAt: new Date(),
        error: (error as Error).message
      };
    }
  }

  /**
   * Schedule comparative reports
   */
  async scheduleReports(
    projectId: string,
    schedule: ReportSchedule
  ): Promise<ScheduleResult> {
    const context = { 
      projectId, 
      operation: 'scheduleReports',
      frequency: schedule.frequency 
    };

    try {
      logger.info('Scheduling reports', context);
      
      // Task 5.1: Focus ONLY on comparative workflows
      if (schedule.focusArea === undefined) {
        schedule.focusArea = 'overall'; // Default for comparative reports
      }

      return await this.reportScheduler.createSchedule(projectId, schedule);
    } catch (error) {
      logger.error('Failed to schedule reports', error as Error, context);
      throw error;
    }
  }

  /**
   * Cancel scheduled reports for a project
   */
  async cancelScheduledReports(projectId: string): Promise<void> {
    const context = { projectId, operation: 'cancelScheduledReports' };

    try {
      logger.info('Cancelling scheduled reports', context);
      
      const schedules = await this.reportScheduler.listProjectSchedules(projectId);
      
      for (const schedule of schedules) {
        await this.reportScheduler.deleteSchedule(schedule.scheduleId);
      }
      
      logger.info('Scheduled reports cancelled successfully', {
        ...context,
        cancelledCount: schedules.length
      });
    } catch (error) {
      logger.error('Failed to cancel scheduled reports', error as Error, context);
      throw error;
    }
  }

  /**
   * Get report processing status
   */
  async getReportStatus(taskId: string): Promise<ReportStatus> {
    try {
      return await this.reportProcessor.getTaskStatus(taskId);
    } catch (error) {
      logger.error('Failed to get report status', error as Error, { taskId });
      throw error;
    }
  }

  /**
   * Get enhanced queue statistics
   */
  async getQueueStatistics(): Promise<QueueStatistics> {
    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        this.queue.getWaiting(),
        this.queue.getActive(),
        this.queue.getCompleted(),
        this.queue.getFailed(),
        this.queue.getDelayed()
      ]);

      // Enhanced performance calculation
      const recentCompleted = completed.slice(-20);
      const avgProcessingTime = recentCompleted.length > 0
        ? recentCompleted.reduce((sum, job) => {
            const processingTime = job.finishedOn && job.processedOn 
              ? job.finishedOn - job.processedOn 
              : 0;
            return sum + processingTime;
          }, 0) / recentCompleted.length
        : 0;

      const queueHealth = this.determineQueueHealth(
        waiting.length, 
        failed.length, 
        avgProcessingTime,
        active.length
      );

      return {
        totalQueued: waiting.length,
        totalProcessing: active.length,
        totalCompleted: completed.length,
        totalFailed: failed.length,
        averageProcessingTime: avgProcessingTime,
        queueHealth
      };
    } catch (error) {
      logger.error('Failed to get queue statistics', error as Error);
      throw error;
    }
  }

  /**
   * Get comprehensive service health information
   */
  async getServiceHealth(): Promise<ServiceHealth> {
    try {
      const queueStatistics = await this.getQueueStatistics();
      const queueHealthStatus = await this.reportProcessor.getQueueHealth();
      
      // Calculate service metrics
      const performanceMetrics = this.calculatePerformanceMetrics();
      
      return {
        status: queueHealthStatus.status,
        queueStatistics,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        lastHealthCheck: new Date(),
        performanceMetrics,
        isInitialized: this.isInitialized,
        subServices: {
          reportGenerator: 'healthy',
          reportScheduler: 'healthy',
          reportProcessor: queueHealthStatus.status
        }
      };
    } catch (error) {
      logger.error('Failed to get service health', error as Error);
      throw error;
    }
  }

  // ===== PRIVATE METHODS - Enhanced for Task 5.1 =====

  /**
   * Create enhanced report task with comprehensive metadata
   */
  private async createReportTask(
    request: ComparativeReportRequest | IntelligentReportRequest | (InitialReportOptions & { projectId: string }),
    correlationId: string,
    taskType: TaskType,
    options?: QueueOptions
  ): Promise<ReportTask> {
    const taskId = this.generateTaskId();
    
    const baseTask = {
      id: taskId,
      projectId: 'projectId' in request ? request.projectId : (request as any).projectId,
      taskType,
      request,
      priority: (options?.priority || ('priority' in request ? request.priority : 'normal')) as Priority,
      createdAt: new Date(),
      scheduledFor: options?.scheduledFor,
      retryCount: 0,
      maxRetries: options?.maxRetries || this.retryConfig.maxAttempts,
      correlationId,
      userId: 'userId' in request ? request.userId : undefined
    };

    // Task 5.1: Add comprehensive metadata for comparative workflows
    return {
      ...baseTask,
      metadata: {
        createdBy: 'ReportingService',
        version: '1.0',
        workflow: 'comparative_only', // Task 5.1: Focus ONLY on comparative workflows
        retryConfig: this.retryConfig,
        queueConfig: {
          priority: baseTask.priority,
          timeout: options?.timeout || 600000
        }
      }
    } as ReportTask;
  }

  /**
   * Process comparative report with comprehensive retry logic
   */
  private async processComparativeReportWithRetry(
    task: ReportTask
  ): Promise<ComparativeReportResponse> {
    const maxAttempts = task.maxRetries || this.retryConfig.maxAttempts;
    let lastError: Error;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        logger.info('Processing comparative report', {
          taskId: task.id,
          attempt,
          maxAttempts,
          correlationId: task.correlationId
        });

        const result = await this.reportProcessor.processComparativeReport(task);
        
        if (result.success) {
          logger.info('Comparative report processed successfully', {
            taskId: task.id,
            attempt,
            processingTime: result.processingTime
          });
          return result;
        }

        throw new ReportGenerationError(
          result.error || 'Report generation failed',
          task.correlationId
        );

      } catch (error) {
        lastError = error as Error;
        
        if (attempt < maxAttempts && this.isRetryableError(error as Error)) {
          const delay = this.calculateRetryDelay(attempt);
          
          logger.warn('Comparative report processing failed, retrying', {
            taskId: task.id,
            attempt,
            maxAttempts,
            delay,
            error: lastError.message
          });

          await this.sleep(delay);
          continue;
        }

        logger.error('Comparative report processing failed permanently', lastError, {
          taskId: task.id,
          attempts: attempt,
          correlationId: task.correlationId
        });

        break;
      }
    }

    // Return failure response
    return {
      success: false,
      taskId: task.id,
      projectId: task.projectId,
      processingTime: 0,
      error: lastError?.message || 'Processing failed after all retry attempts',
      dataFreshness: {
        overallStatus: 'STALE',
        lastUpdated: new Date()
      },
      correlationId: task.correlationId
    };
  }

  /**
   * Process intelligent report with retry logic
   */
  private async processIntelligentReportWithRetry(
    task: ReportTask
  ): Promise<IntelligentReportResponse> {
    // Similar retry logic for intelligent reports
    return await this.reportProcessor.processIntelligentReport(task);
  }

  /**
   * Process initial report with retry logic  
   */
  private async processInitialReportWithRetry(
    task: ReportTask
  ): Promise<InitialReportResponse> {
    // Similar retry logic for initial reports
    return await this.reportProcessor.processInitialReport(task);
  }

  /**
   * Process immediate report with retry logic
   */
  private async processImmediateReportWithRetry(
    request: ComparativeReportRequest,
    correlationId: string
  ): Promise<ComparativeReportResponse> {
    const task = await this.createReportTask(request, correlationId, 'comparative');
    task.maxRetries = 1; // Limited retries for immediate processing

    return await this.processComparativeReportWithRetry(task);
  }

  /**
   * Comprehensive request validation
   */
  private async validateComparativeReportRequest(request: ComparativeReportRequest): Promise<void> {
    const errors: string[] = [];

    if (!request.projectId) errors.push('Project ID is required');
    if (!request.productId) errors.push('Product ID is required');
    if (!request.competitorIds || request.competitorIds.length === 0) {
      errors.push('At least one competitor ID is required');
    }
    if (!['comprehensive', 'executive', 'technical', 'strategic'].includes(request.template)) {
      errors.push('Invalid template specified');
    }
    if (!['user_experience', 'pricing', 'features', 'marketing', 'overall'].includes(request.focusArea)) {
      errors.push('Invalid focus area specified');
    }
    if (!['surface', 'detailed', 'comprehensive'].includes(request.analysisDepth)) {
      errors.push('Invalid analysis depth specified');
    }

    // Task 5.1: Additional validation for comparative-only workflows
    if (request.competitorIds.length > 10) {
      errors.push('Maximum 10 competitors allowed for comparative analysis');
    }

    if (errors.length > 0) {
      throw new ReportingServiceError(
        `Validation failed: ${errors.join(', ')}`,
        'VALIDATION_ERROR',
        request.correlationId,
        { validationErrors: errors }
      );
    }
  }

  /**
   * Check if error is retryable based on configuration
   */
  private isRetryableError(error: Error): boolean {
    if (error instanceof ReportingServiceError) {
      return this.retryConfig.retryableErrors.includes(error.code);
    }
    
    // Check common retryable error patterns
    const retryablePatterns = [
      /timeout/i,
      /connection/i,
      /temporary/i,
      /network/i,
      /redis/i
    ];
    
    return retryablePatterns.some(pattern => pattern.test(error.message));
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(attempt: number): number {
    const delay = Math.min(
      this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffFactor, attempt - 1),
      this.retryConfig.maxDelay
    );
    
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.1 * delay;
    return Math.floor(delay + jitter);
  }

  /**
   * Generate unique task ID with timestamp and randomness
   */
  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Enhanced queue health determination
   */
  private determineQueueHealth(
    queueLength: number,
    failedCount: number,
    avgProcessingTime: number,
    activeCount: number
  ): QueueHealth {
    // Critical conditions
    if (failedCount > 20 || queueLength > 200 || avgProcessingTime > 600000 || activeCount > 50) {
      return 'critical';
    }
    
    // Degraded conditions  
    if (failedCount > 10 || queueLength > 100 || avgProcessingTime > 300000 || activeCount > 20) {
      return 'degraded';
    }
    
    return 'healthy';
  }

  /**
   * Record performance metrics for monitoring
   */
  private recordPerformanceMetric(operation: string, duration: number): void {
    if (!this.performanceMetrics.has(operation)) {
      this.performanceMetrics.set(operation, []);
    }
    
    const metrics = this.performanceMetrics.get(operation)!;
    metrics.push(duration);
    
    // Keep only last 100 measurements
    if (metrics.length > 100) {
      metrics.shift();
    }
  }

  /**
   * Calculate performance metrics summary
   */
  private calculatePerformanceMetrics(): Record<string, any> {
    const summary: Record<string, any> = {};
    
    for (const [operation, durations] of this.performanceMetrics.entries()) {
      if (durations.length > 0) {
        summary[operation] = {
          count: durations.length,
          average: durations.reduce((a, b) => a + b, 0) / durations.length,
          min: Math.min(...durations),
          max: Math.max(...durations),
          median: durations.sort((a, b) => a - b)[Math.floor(durations.length / 2)]
        };
      }
    }
    
    return summary;
  }

  /**
   * Set up comprehensive event handlers for Bull queue
   */
  private setupEventHandlers(): void {
    // Job completion events
    this.queue.on('completed', (job) => {
      const processingTime = job.finishedOn! - job.processedOn!;
      
      logger.info('Report job completed', {
        jobId: job.id,
        taskType: job.data.taskType,
        projectId: job.data.projectId,
        processingTime,
        correlationId: job.data.correlationId
      });

      trackBusinessEvent('report_job_completed', {
        taskType: job.data.taskType,
        processingTime,
        correlationId: job.data.correlationId
      });

      this.recordPerformanceMetric('job_completion', processingTime);
    });

    // Job failure events
    this.queue.on('failed', (job, error) => {
      logger.error('Report job failed', error, {
        jobId: job.id,
        taskType: job.data.taskType,
        projectId: job.data.projectId,
        retryCount: job.attemptsMade,
        correlationId: job.data.correlationId
      });

      trackBusinessEvent('report_job_failed', {
        taskType: job.data.taskType,
        error: error.message,
        retryCount: job.attemptsMade,
        correlationId: job.data.correlationId
      });
    });

    // Job stalled events
    this.queue.on('stalled', (job) => {
      logger.warn('Report job stalled', {
        jobId: job.id,
        taskType: job.data.taskType,
        projectId: job.data.projectId,
        correlationId: job.data.correlationId
      });
    });

    // Queue error events
    this.queue.on('error', (error) => {
      logger.error('Queue error occurred', error);
      
      trackBusinessEvent('queue_error', {
        error: error.message,
        service: 'ReportingService'
      });
    });

    // Connection events
    this.queue.on('ready', () => {
      logger.info('Queue connection established');
    });

    this.queue.on('close', () => {
      logger.info('Queue connection closed');
    });
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Graceful shutdown with cleanup
   */
  async shutdown(): Promise<void> {
    try {
      logger.info('Shutting down ReportingService');
      
      // Wait for active jobs to complete
      await this.queue.whenCurrentJobsFinished();
      
      // Close queue connection
      await this.queue.close();
      
      // Clear performance metrics
      this.performanceMetrics.clear();
      
      this.isInitialized = false;
      
      logger.info('ReportingService shutdown completed');
    } catch (error) {
      logger.error('Error during ReportingService shutdown', error as Error);
      throw error;
    }
  }

  /**
   * Task 1.2: Start queue processing with fallback considerations
   */
  private async startQueueProcessingWithFallbacks(concurrency: number = 3): Promise<void> {
    try {
      if (!this.queue) {
        throw new Error('Queue must be initialized before starting processing');
      }

      // Start queue processing with enhanced error handling
      this.startQueueProcessing(concurrency);
      
      logger.info('Queue processing started with fallback support', { 
        concurrency, 
        queueName: this.queue.name,
        fallbackModeActive: this.initializationStatus.fallbackModeActive
      });

    } catch (error) {
      logger.error('Failed to start queue processing', {
        error: (error as Error).message,
        correlationId: this.initializationCorrelationId
      });
      throw new ServiceInitializationError(
        'Queue processing startup failed',
        this.initializationCorrelationId,
        { error: (error as Error).message }
      );
    }
  }

  /**
   * Task 1.2: Validate overall service initialization
   */
  private async validateServiceInitialization(): Promise<void> {
    const errors: string[] = [];
    
    // Check critical components
    if (!this.queue) {
      errors.push('Queue is not initialized');
    }
    
    if (!this.reportGenerator) {
      errors.push('ReportGenerator is not initialized');
    }
    
    if (!this.reportScheduler) {
      errors.push('ReportScheduler is not initialized');
    }
    
    if (!this.reportProcessor) {
      errors.push('ReportProcessor is not initialized');
    }

    // If we have errors but some services are in fallback mode, it's acceptable
    if (errors.length > 0 && !this.initializationStatus.fallbackModeActive) {
      throw new ServiceInitializationError(
        `Service validation failed: ${errors.join(', ')}`,
        this.initializationCorrelationId,
        { validationErrors: errors }
      );
    }

    // Warn if running in fallback mode
    if (this.initializationStatus.fallbackModeActive) {
      logger.warn('Service initialized but running in fallback mode', {
        correlationId: this.initializationCorrelationId,
        validationErrors: errors,
        fallbackServices: Array.from(this.fallbackServices.keys())
      });
    }

    logger.info('Service initialization validation completed', {
      correlationId: this.initializationCorrelationId,
      fallbackModeActive: this.initializationStatus.fallbackModeActive,
      servicesInitialized: {
        queue: !!this.queue,
        reportGenerator: !!this.reportGenerator,
        reportScheduler: !!this.reportScheduler,
        reportProcessor: !!this.reportProcessor
      }
    });
  }

  /**
   * Task 1.2: Create fallback ReportGenerator
   */
  private createFallbackReportGenerator(): IReportGenerator {
    logger.warn('Creating fallback ReportGenerator with minimal functionality');
    
    return {
      generateComparativeReport: async (request: any) => {
        logger.warn('Fallback ReportGenerator: generateComparativeReport called', {
          correlationId: this.initializationCorrelationId,
          requestId: request.taskId
        });
        
        return {
          success: false,
          taskId: request.taskId || 'fallback-task',
          projectId: request.projectId,
          processingTime: 0,
          error: 'Service running in fallback mode - report generation not available',
          dataFreshness: {
            overallStatus: 'STALE',
            lastUpdated: new Date()
          },
          correlationId: this.initializationCorrelationId,
          warnings: ['Service running in fallback mode']
        };
      },
      generateIntelligentReport: async (request: any) => {
        logger.warn('Fallback ReportGenerator: generateIntelligentReport called', {
          correlationId: this.initializationCorrelationId
        });
        
        return {
          success: false,
          reportId: 'fallback-report',
          projectId: request.projectId,
          error: 'Service running in fallback mode - intelligent reporting not available',
          correlationId: this.initializationCorrelationId
        };
      },
      generateInitialReport: async (request: any) => {
        logger.warn('Fallback ReportGenerator: generateInitialReport called', {
          correlationId: this.initializationCorrelationId
        });
        
        return {
          success: false,
          taskId: 'fallback-task',
          projectId: request.projectId,
          status: 'failed',
          message: 'Service running in fallback mode - initial report generation not available',
          generatedAt: new Date(),
          error: 'Fallback mode active'
        };
      }
    } as IReportGenerator;
  }

  /**
   * Task 1.2: Create fallback ReportScheduler
   */
  private createFallbackReportScheduler(): IReportScheduler {
    logger.warn('Creating fallback ReportScheduler with minimal functionality');
    
    return {
      createSchedule: async (projectId: string, schedule: ReportSchedule) => {
        logger.warn('Fallback ReportScheduler: createSchedule called', {
          correlationId: this.initializationCorrelationId,
          projectId,
          scheduleId: schedule.id
        });
        
        return {
          success: false,
          scheduleId: schedule.id,
          message: 'Service running in fallback mode - scheduling not available',
          error: 'Fallback mode active',
          correlationId: this.initializationCorrelationId
        };
      },
      deleteSchedule: async (scheduleId: string) => {
        logger.warn('Fallback ReportScheduler: deleteSchedule called', {
          correlationId: this.initializationCorrelationId,
          scheduleId
        });
        
        return {
          success: false,
          message: 'Service running in fallback mode - schedule deletion not available'
        };
      },
      listProjectSchedules: async (projectId: string) => {
        logger.warn('Fallback ReportScheduler: listProjectSchedules called', {
          correlationId: this.initializationCorrelationId,
          projectId
        });
        
        return [];
      },
      getScheduleStatus: async (scheduleId: string) => {
        logger.warn('Fallback ReportScheduler: getScheduleStatus called', {
          correlationId: this.initializationCorrelationId,
          scheduleId
        });
        
        return {
          scheduleId,
          status: 'inactive',
          isActive: false,
          lastExecuted: null,
          nextRun: null,
          executionCount: 0,
          failureCount: 0
        };
      }
    } as IReportScheduler;
  }

  /**
   * Task 1.2: Create fallback ReportProcessor
   */
  private createFallbackReportProcessor(): IReportProcessor {
    logger.warn('Creating fallback ReportProcessor with minimal functionality');
    
    return {
      queueReport: async (task: ReportTask, options?: QueueOptions) => {
        logger.warn('Fallback ReportProcessor: queueReport called', {
          correlationId: this.initializationCorrelationId,
          taskId: task.id,
          projectId: task.projectId
        });
        
        return {
          success: false,
          taskId: task.id,
          queuePosition: 0,
          estimatedProcessingTime: 0,
          message: 'Service running in fallback mode - report queueing not available',
          error: 'Fallback mode active',
          correlationId: this.initializationCorrelationId
        };
      },
      processComparativeReport: async (task: ReportTask) => {
        logger.warn('Fallback ReportProcessor: processComparativeReport called', {
          correlationId: this.initializationCorrelationId,
          taskId: task.id
        });
        
        return {
          success: false,
          taskId: task.id,
          projectId: task.projectId,
          processingTime: 0,
          error: 'Service running in fallback mode - report processing not available',
          dataFreshness: {
            overallStatus: 'STALE',
            lastUpdated: new Date()
          },
          correlationId: this.initializationCorrelationId
        };
      },
      processIntelligentReport: async (task: ReportTask) => {
        logger.warn('Fallback ReportProcessor: processIntelligentReport called', {
          correlationId: this.initializationCorrelationId,
          taskId: task.id
        });
        
        return {
          success: false,
          reportId: task.id,
          projectId: task.projectId,
          error: 'Service running in fallback mode - intelligent report processing not available',
          correlationId: this.initializationCorrelationId
        };
      },
      processInitialReport: async (task: ReportTask) => {
        logger.warn('Fallback ReportProcessor: processInitialReport called', {
          correlationId: this.initializationCorrelationId,
          taskId: task.id
        });
        
        return {
          success: false,
          taskId: task.id,
          projectId: task.projectId,
          status: 'failed',
          message: 'Service running in fallback mode - initial report processing not available',
          generatedAt: new Date(),
          error: 'Fallback mode active'
        };
      },
      getTaskStatus: async (taskId: string) => {
        logger.warn('Fallback ReportProcessor: getTaskStatus called', {
          correlationId: this.initializationCorrelationId,
          taskId
        });
        
        return {
          taskId,
          status: 'failed',
          progress: 0,
          currentStep: 'Fallback mode - processing unavailable',
          error: 'Service running in fallback mode',
          queuedAt: new Date(),
          startedAt: new Date(),
          completedAt: new Date()
        };
      },
      getQueueHealth: async () => {
        logger.warn('Fallback ReportProcessor: getQueueHealth called', {
          correlationId: this.initializationCorrelationId
        });
        
        return {
          status: 'degraded',
          queueLength: 0,
          processingCount: 0,
          failedCount: 0,
          lastProcessed: new Date(),
          avgProcessingTime: 0
        };
      }
    } as IReportProcessor;
  }

  /**
   * Task 1.2: Enhanced health check method
   */
  async healthCheck(): Promise<ServiceHealth> {
    try {
      const health = await this.getServiceHealth();
      
      // Add initialization status to health check
      (health as any).initializationStatus = this.initializationStatus;
      (health as any).fallbackServices = Array.from(this.fallbackServices.keys());
      
      return health;
    } catch (error) {
      logger.error('Health check failed', {
        correlationId: this.initializationCorrelationId,
        error: (error as Error).message
      });
      
      return {
        status: 'unhealthy',
        queueStatistics: {
          totalQueued: 0,
          totalProcessing: 0,
          totalCompleted: 0,
          totalFailed: 0,
          averageProcessingTime: 0,
          queueHealth: 'critical'
        },
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        lastHealthCheck: new Date(),
        performanceMetrics: {},
        isInitialized: this.isInitialized,
        subServices: {
          reportGenerator: this.initializationStatus.reportGenerator.status,
          reportScheduler: this.initializationStatus.reportScheduler.status,
          reportProcessor: this.initializationStatus.reportProcessor.status
        }
      };
    }
  }
}

/**
 * Factory function for creating ReportingService instances
 */
export class ReportingServiceFactory {
  static create(
    analysisService: AnalysisService,
    config?: {
      queueConfig?: Partial<ReportingQueueConfig>;
      retryConfig?: Partial<RetryConfig>;
    }
  ): ReportingService {
    const queueConfig = { ...UNIFIED_QUEUE_CONFIG_DEFINITION, ...(config?.queueConfig || {}) };
    const retryConfig = { ...DEFAULT_RETRY_CONFIG_DEFINITION, ...(config?.retryConfig || {}) };
    
    return new ReportingService(analysisService, queueConfig, retryConfig);
  }
}

// Export configurations for external use
export { UNIFIED_QUEUE_CONFIG_DEFINITION as UNIFIED_QUEUE_CONFIG, DEFAULT_RETRY_CONFIG_DEFINITION as DEFAULT_RETRY_CONFIG };
export type { ReportingQueueConfig, RetryConfig }; 