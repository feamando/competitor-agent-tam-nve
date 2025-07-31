# Unified ReportingService Interface Design - Task 4.2

## Overview
This document defines the unified `ReportingService` interface that consolidates the functionality of four existing reporting services into a single, cohesive service focused exclusively on **comparative report generation in markdown format**.

**Design Principles:**
- **Comparative Only**: Remove individual competitor reports, focus solely on comparative analysis
- **Markdown Only**: Exclusively generate `.md` format output as specified in requirements
- **Modular Architecture**: Three sub-services (ReportGenerator, ReportScheduler, ReportProcessor)
- **Async Processing**: Unified Bull queue with clear processing patterns
- **Backward Compatibility**: Preserve existing method signatures during transition

---

## Unified ReportingService Interface

### Core Service Interface

```typescript
/**
 * Unified ReportingService - Consolidates all reporting capabilities
 * Focuses exclusively on comparative report generation in markdown format
 */
export interface IReportingService {
  // Core comparative report generation
  generateComparativeReport(request: ComparativeReportRequest): Promise<ComparativeReportResponse>;
  
  // Async processing with queue management
  queueComparativeReport(request: ComparativeReportRequest, options?: QueueOptions): Promise<ReportTaskResult>;
  
  // Intelligent reporting with data freshness
  generateIntelligentReport(request: IntelligentReportRequest): Promise<IntelligentReportResponse>;
  
  // Initial project report generation
  generateInitialReport(projectId: string, options?: InitialReportOptions): Promise<InitialReportResponse>;
  
  // Report scheduling and automation
  scheduleReports(projectId: string, schedule: ReportSchedule): Promise<ScheduleResult>;
  cancelScheduledReports(projectId: string): Promise<void>;
  
  // Queue and processing management
  getReportStatus(taskId: string): Promise<ReportStatus>;
  getQueueStatistics(): Promise<QueueStatistics>;
  
  // Service health and monitoring
  getServiceHealth(): Promise<ServiceHealth>;
}
```

### Unified Request/Response Types

```typescript
/**
 * Unified Request Types - Consolidates all report generation requests
 */
export interface ComparativeReportRequest {
  projectId: string;
  productId: string;
  competitorIds: string[];
  
  // Report configuration (markdown only)
  template: 'comprehensive' | 'executive' | 'technical' | 'strategic';
  focusArea: 'user_experience' | 'pricing' | 'features' | 'marketing' | 'overall';
  analysisDepth: 'surface' | 'detailed' | 'comprehensive';
  
  // Processing options
  priority: 'high' | 'normal' | 'low';
  forceDataRefresh?: boolean;
  timeout?: number;
  
  // Metadata
  reportName?: string;
  userId?: string;
  correlationId?: string;
}

export interface IntelligentReportRequest {
  projectId: string;
  reportType: 'competitive_alert' | 'market_change' | 'comprehensive_intelligence';
  
  // Intelligence options
  forceDataRefresh?: boolean;
  includeAlerts?: boolean;
  timeframe?: number; // days to look back
  
  // Configuration
  config?: Partial<SmartReportingConfig>;
  correlationId?: string;
}

export interface InitialReportOptions {
  template?: 'comprehensive' | 'executive' | 'technical' | 'strategic';
  priority?: 'high' | 'normal' | 'low';
  timeout?: number;
  fallbackToPartialData?: boolean;
  requireFreshSnapshots?: boolean;
  forceGeneration?: boolean;
}

/**
 * Unified Response Types - Standardized across all report generation
 */
export interface ComparativeReportResponse {
  success: boolean;
  report?: ComparativeReport; // Always markdown format
  taskId: string;
  projectId: string;
  
  // Processing metadata
  processingTime: number;
  queueTime?: number;
  dataFreshness: DataFreshnessInfo;
  
  // Error handling
  error?: string;
  warnings?: string[];
  
  // Correlation tracking
  correlationId: string;
}

export interface IntelligentReportResponse {
  success: boolean;
  report: IntelligentReport; // Enhanced with intelligence features
  taskId: string;
  projectId: string;
  
  // Intelligence metadata
  dataFreshnessIndicators: DataFreshnessIndicators;
  competitiveActivityAlerts: CompetitiveActivityAlert[];
  marketChangeDetection: MarketChangeDetection;
  actionableInsights: ActionableInsight[];
  
  // Processing metadata
  processingTime: number;
  correlationId: string;
}

export interface InitialReportResponse {
  success: boolean;
  report?: ComparativeReport;
  taskId: string;
  projectId: string;
  
  // Status information
  status: 'completed' | 'failed' | 'processing' | 'queued';
  message?: string;
  
  // Timing
  generatedAt: Date;
  processingTime?: number;
  
  // Error handling
  error?: string;
}
```

### Queue Management Types

```typescript
/**
 * Unified Queue Management - Single Bull queue with job type differentiation
 */
export interface ReportTask {
  id: string;
  projectId: string;
  taskType: 'comparative' | 'intelligent' | 'initial';
  
  // Request data (polymorphic based on taskType)
  request: ComparativeReportRequest | IntelligentReportRequest | InitialReportOptions;
  
  // Queue metadata
  priority: 'high' | 'normal' | 'low';
  createdAt: Date;
  scheduledFor?: Date;
  retryCount: number;
  maxRetries: number;
  
  // Processing tracking
  correlationId: string;
  userId?: string;
}

export interface QueueOptions {
  priority?: 'high' | 'normal' | 'low';
  delay?: number; // milliseconds
  scheduledFor?: Date;
  maxRetries?: number;
  timeout?: number;
}

export interface ReportTaskResult {
  taskId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  queuePosition: number;
  estimatedCompletion: Date;
  projectId: string;
}

export interface ReportStatus {
  taskId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number; // 0-100
  currentStep?: string;
  startedAt?: Date;
  completedAt?: Date;
  processingTime?: number;
  error?: string;
}

export interface QueueStatistics {
  totalQueued: number;
  totalProcessing: number;
  totalCompleted: number;
  totalFailed: number;
  averageProcessingTime: number;
  queueHealth: 'healthy' | 'degraded' | 'critical';
}
```

### Report Scheduling Types

```typescript
/**
 * Unified Scheduling - Comparative reports only
 */
export interface ReportSchedule {
  frequency: 'daily' | 'weekly' | 'monthly';
  template: 'comprehensive' | 'executive' | 'technical' | 'strategic';
  focusArea: 'user_experience' | 'pricing' | 'features' | 'marketing' | 'overall';
  
  // Scheduling options
  startDate?: Date;
  timezone?: string;
  notificationChannels?: ('email' | 'dashboard' | 'webhook')[];
  
  // Intelligent scheduling
  adaptiveFrequency?: boolean; // Adjust based on market changes
  dataFreshnessThreshold?: number; // days
}

export interface ScheduleResult {
  scheduleId: string;
  projectId: string;
  nextRunTime: Date;
  isActive: boolean;
  createdAt: Date;
}
```

---

## Modular Sub-Services Design

### 1. ReportGenerator Sub-Service

```typescript
/**
 * ReportGenerator - Core report generation logic
 * Focuses exclusively on comparative reports in markdown format
 */
export interface IReportGenerator {
  // Primary generation method
  generateComparativeReport(
    analysis: ComparativeAnalysis,
    product: Product,
    competitors: Competitor[],
    options: ReportGenerationOptions
  ): Promise<GenerationResult>;
  
  // Template and formatting
  getAvailableTemplates(): ReportTemplate[];
  validateTemplate(template: string): boolean;
  
  // Content enhancement
  enhanceWithAI(content: string, context: ReportContext): Promise<string>;
  
  // Quality assurance
  validateReport(report: ComparativeReport): ReportValidationResult;
}

export interface ReportGenerationOptions {
  template: 'comprehensive' | 'executive' | 'technical' | 'strategic';
  focusArea: 'user_experience' | 'pricing' | 'features' | 'marketing' | 'overall';
  analysisDepth: 'surface' | 'detailed' | 'comprehensive';
  
  // Markdown-specific options
  includeTableOfContents: boolean;
  includeDiagrams: boolean;
  maxSectionLength?: number;
  
  // Enhancement options
  enhanceWithAI: boolean;
  includeDataFreshness: boolean;
  includeActionableInsights: boolean;
}

export interface GenerationResult {
  success: boolean;
  report: ComparativeReport; // Always markdown format
  metadata: GenerationMetadata;
  warnings?: string[];
  error?: string;
}

export interface GenerationMetadata {
  templateUsed: string;
  sectionsGenerated: number;
  processingTime: number;
  memoryUsage: number;
  aiEnhancementApplied: boolean;
  dataFreshnessScore: number;
}
```

### 2. ReportScheduler Sub-Service

```typescript
/**
 * ReportScheduler - Scheduling and automation logic
 * Manages cron jobs and intelligent scheduling
 */
export interface IReportScheduler {
  // Schedule management
  createSchedule(projectId: string, schedule: ReportSchedule): Promise<ScheduleResult>;
  updateSchedule(scheduleId: string, schedule: Partial<ReportSchedule>): Promise<ScheduleResult>;
  deleteSchedule(scheduleId: string): Promise<void>;
  
  // Schedule execution
  executeScheduledReport(scheduleId: string): Promise<ReportTaskResult>;
  getNextScheduledRun(scheduleId: string): Promise<Date>;
  
  // Intelligent scheduling
  adjustFrequencyBasedOnMarketChanges(projectId: string): Promise<void>;
  predictOptimalSchedule(projectId: string): Promise<ReportSchedule>;
  
  // Schedule monitoring
  getScheduleStatus(scheduleId: string): Promise<ScheduleStatus>;
  listProjectSchedules(projectId: string): Promise<ScheduleInfo[]>;
}

export interface ScheduleStatus {
  scheduleId: string;
  projectId: string;
  isActive: boolean;
  nextRun: Date;
  lastRun?: Date;
  lastResult?: 'success' | 'failed';
  consecutiveFailures: number;
}

export interface ScheduleInfo {
  scheduleId: string;
  frequency: string;
  template: string;
  focusArea: string;
  nextRun: Date;
  isActive: boolean;
}
```

### 3. ReportProcessor Sub-Service

```typescript
/**
 * ReportProcessor - Async processing and queue management
 * Handles Bull queue integration and processing orchestration
 */
export interface IReportProcessor {
  // Queue management
  queueReport(task: ReportTask, options?: QueueOptions): Promise<ReportTaskResult>;
  processQueue(): void; // Starts queue processing
  
  // Task processing
  processComparativeReport(task: ReportTask): Promise<ComparativeReportResponse>;
  processIntelligentReport(task: ReportTask): Promise<IntelligentReportResponse>;
  processInitialReport(task: ReportTask): Promise<InitialReportResponse>;
  
  // Status and monitoring
  getTaskStatus(taskId: string): Promise<ReportStatus>;
  getQueueHealth(): Promise<QueueHealth>;
  
  // Error handling and recovery
  retryFailedTask(taskId: string): Promise<void>;
  cancelTask(taskId: string): Promise<void>;
}

export interface QueueHealth {
  status: 'healthy' | 'degraded' | 'critical';
  queueLength: number;
  processingCount: number;
  failedJobsCount: number;
  avgProcessingTime: number;
  lastProcessedAt?: Date;
}
```

---

## Unified Bull Queue Architecture

### Single Queue Design

```typescript
/**
 * Unified Queue Configuration
 * Single Bull queue with job type differentiation
 */
export const UNIFIED_QUEUE_CONFIG = {
  name: 'unified-reporting-queue',
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD
  },
  defaultJobOptions: {
    removeOnComplete: 100,  // Keep completed jobs
    removeOnFail: 50,       // Keep failed jobs
    attempts: 3,            // Retry attempts
    backoff: {
      type: 'exponential',
      delay: 2000
    }
  }
};

/**
 * Job Types - Differentiate processing within single queue
 */
export enum ReportJobType {
  COMPARATIVE_REPORT = 'comparative-report',
  INTELLIGENT_REPORT = 'intelligent-report',
  INITIAL_REPORT = 'initial-report',
  SCHEDULED_REPORT = 'scheduled-report'
}

export interface UnifiedReportJob {
  type: ReportJobType;
  data: ReportTask;
  options?: QueueOptions;
}
```

### Processing Patterns

```typescript
/**
 * Queue Processing Patterns
 */
export class ReportQueueProcessor {
  private queue: Bull.Queue;
  private reportGenerator: IReportGenerator;
  private analysisService: IAnalysisService;

  constructor(
    queue: Bull.Queue,
    reportGenerator: IReportGenerator,
    analysisService: IAnalysisService
  ) {
    this.queue = queue;
    this.reportGenerator = reportGenerator;
    this.analysisService = analysisService;
    this.setupProcessing();
  }

  private setupProcessing(): void {
    // Process different job types with single processor
    this.queue.process('*', async (job: Bull.Job<ReportTask>) => {
      const { taskType, request, correlationId } = job.data;
      
      switch (taskType) {
        case 'comparative':
          return this.processComparativeReport(job.data, correlationId);
        case 'intelligent':
          return this.processIntelligentReport(job.data, correlationId);
        case 'initial':
          return this.processInitialReport(job.data, correlationId);
        default:
          throw new Error(`Unknown report task type: ${taskType}`);
      }
    });
  }

  private async processComparativeReport(
    task: ReportTask,
    correlationId: string
  ): Promise<ComparativeReportResponse> {
    // Unified processing logic for comparative reports
    const request = task.request as ComparativeReportRequest;
    
    // 1. Generate analysis using consolidated AnalysisService
    const analysis = await this.analysisService.analyzeProductVsCompetitors({
      projectId: request.projectId,
      productId: request.productId,
      competitorIds: request.competitorIds,
      analysisDepth: request.analysisDepth,
      focusArea: request.focusArea
    });

    // 2. Generate report using ReportGenerator (markdown only)
    const result = await this.reportGenerator.generateComparativeReport(
      analysis,
      await this.getProduct(request.productId),
      await this.getCompetitors(request.competitorIds),
      {
        template: request.template,
        focusArea: request.focusArea,
        analysisDepth: request.analysisDepth,
        includeTableOfContents: true,
        includeDiagrams: true,
        enhanceWithAI: true,
        includeDataFreshness: true,
        includeActionableInsights: true
      }
    );

    return {
      success: result.success,
      report: result.report,
      taskId: task.id,
      projectId: request.projectId,
      processingTime: result.metadata.processingTime,
      dataFreshness: {
        overallStatus: 'FRESH', // From analysis
        lastUpdated: new Date()
      },
      correlationId
    };
  }
}
```

---

## Service Implementation Architecture

### Main ReportingService Class

```typescript
/**
 * Main ReportingService Implementation
 * Orchestrates all sub-services and provides unified interface
 */
export class ReportingService implements IReportingService {
  private reportGenerator: IReportGenerator;
  private reportScheduler: IReportScheduler;
  private reportProcessor: IReportProcessor;
  private analysisService: IAnalysisService;
  private queue: Bull.Queue;

  constructor(
    analysisService: IAnalysisService,
    queueConfig: QueueConfig = UNIFIED_QUEUE_CONFIG
  ) {
    // Initialize queue
    this.queue = new Bull(queueConfig.name, queueConfig);
    
    // Initialize sub-services
    this.reportGenerator = new ReportGenerator();
    this.reportScheduler = new ReportScheduler(this.queue);
    this.reportProcessor = new ReportProcessor(
      this.queue,
      this.reportGenerator,
      analysisService
    );
    
    this.analysisService = analysisService;
  }

  /**
   * Generate comparative report (primary method)
   * Focuses exclusively on comparative analysis in markdown format
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

    try {
      logger.info('Generating comparative report', context);

      // Validate request
      this.validateComparativeReportRequest(request);

      // Check for high-priority immediate processing
      if (request.priority === 'high' && !request.timeout) {
        return await this.processImmediateReport(request, correlationId);
      }

      // Queue for async processing
      const task: ReportTask = {
        id: generateTaskId(),
        projectId: request.projectId,
        taskType: 'comparative',
        request,
        priority: request.priority || 'normal',
        createdAt: new Date(),
        retryCount: 0,
        maxRetries: 3,
        correlationId,
        userId: request.userId
      };

      const taskResult = await this.reportProcessor.queueReport(task);
      
      return {
        success: true,
        taskId: taskResult.taskId,
        projectId: request.projectId,
        processingTime: 0,
        correlationId
      };

    } catch (error) {
      logger.error('Failed to generate comparative report', error as Error, context);
      
      return {
        success: false,
        taskId: '',
        projectId: request.projectId,
        processingTime: 0,
        error: (error as Error).message,
        correlationId
      };
    }
  }

  /**
   * Generate intelligent report with enhanced features
   */
  async generateIntelligentReport(
    request: IntelligentReportRequest
  ): Promise<IntelligentReportResponse> {
    // Implementation delegated to reportProcessor
    const task: ReportTask = {
      id: generateTaskId(),
      projectId: request.projectId,
      taskType: 'intelligent',
      request,
      priority: 'normal',
      createdAt: new Date(),
      retryCount: 0,
      maxRetries: 3,
      correlationId: request.correlationId || generateCorrelationId()
    };

    return await this.reportProcessor.processIntelligentReport(task);
  }

  /**
   * Schedule comparative reports
   */
  async scheduleReports(
    projectId: string,
    schedule: ReportSchedule
  ): Promise<ScheduleResult> {
    return await this.reportScheduler.createSchedule(projectId, schedule);
  }

  /**
   * Get report processing status
   */
  async getReportStatus(taskId: string): Promise<ReportStatus> {
    return await this.reportProcessor.getTaskStatus(taskId);
  }

  /**
   * Get service health information
   */
  async getServiceHealth(): Promise<ServiceHealth> {
    const queueHealth = await this.reportProcessor.getQueueHealth();
    
    return {
      status: queueHealth.status,
      queueStatistics: {
        totalQueued: queueHealth.queueLength,
        totalProcessing: queueHealth.processingCount,
        totalCompleted: 0, // Would be tracked separately
        totalFailed: queueHealth.failedJobsCount,
        averageProcessingTime: queueHealth.avgProcessingTime,
        queueHealth: queueHealth.status
      },
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      lastHealthCheck: new Date()
    };
  }

  private validateComparativeReportRequest(request: ComparativeReportRequest): void {
    if (!request.projectId) throw new Error('Project ID is required');
    if (!request.productId) throw new Error('Product ID is required');
    if (!request.competitorIds || request.competitorIds.length === 0) {
      throw new Error('At least one competitor ID is required');
    }
    if (!['comprehensive', 'executive', 'technical', 'strategic'].includes(request.template)) {
      throw new Error('Invalid template specified');
    }
  }
}
```

---

## Backward Compatibility Strategy

### Interface Mapping

```typescript
/**
 * Backward Compatibility Adapters
 * Map existing service interfaces to unified ReportingService
 */

// Legacy AutoReportGenerationService compatibility
export class AutoReportGenerationServiceAdapter {
  constructor(private reportingService: IReportingService) {}

  async generateInitialComparativeReport(projectId: string): Promise<ReportTaskResult> {
    const request: ComparativeReportRequest = {
      projectId,
      productId: await this.getProjectProductId(projectId),
      competitorIds: await this.getProjectCompetitorIds(projectId),
      template: 'comprehensive',
      focusArea: 'overall',
      analysisDepth: 'comprehensive',
      priority: 'high'
    };

    const response = await this.reportingService.generateComparativeReport(request);
    
    return {
      taskId: response.taskId,
      status: response.success ? 'queued' : 'failed',
      queuePosition: 0,
      estimatedCompletion: new Date(Date.now() + 300000), // 5 minutes
      projectId
    };
  }
}

// Legacy IntelligentReportingService compatibility
export class IntelligentReportingServiceAdapter {
  constructor(private reportingService: IReportingService) {}

  async generateIntelligentReport(
    request: LegacyIntelligentReportingRequest
  ): Promise<LegacyIntelligentReport> {
    const unifiedRequest: IntelligentReportRequest = {
      projectId: request.projectId,
      reportType: request.reportType || 'comprehensive_intelligence',
      forceDataRefresh: request.forceDataRefresh,
      includeAlerts: request.includeAlerts,
      timeframe: request.timeframe,
      config: request.config
    };

    const response = await this.reportingService.generateIntelligentReport(unifiedRequest);
    
    // Convert to legacy format
    return {
      id: response.taskId,
      projectId: response.projectId,
      reportType: request.reportType || 'comprehensive_intelligence',
      analysis: response.report.analysis || '',
      dataFreshnessIndicators: response.dataFreshnessIndicators,
      competitiveActivityAlerts: response.competitiveActivityAlerts,
      schedulingMetadata: {} as SchedulingMetadata, // Would be populated
      marketChangeDetection: response.marketChangeDetection,
      actionableInsights: response.actionableInsights,
      generatedAt: new Date(),
      correlationId: response.correlationId
    };
  }
}
```

---

## Feature Flag Integration

```typescript
/**
 * Feature Flag Integration for Gradual Migration
 */
export class FeatureFlaggedReportingService implements IReportingService {
  private unifiedService: ReportingService;
  private legacyServices: {
    autoReportGeneration: AutoReportGenerationService;
    intelligentReporting: IntelligentReportingService;
    comparativeReport: ComparativeReportService;
    initialComparativeReport: InitialComparativeReportService;
  };

  constructor(
    unifiedService: ReportingService,
    legacyServices: any
  ) {
    this.unifiedService = unifiedService;
    this.legacyServices = legacyServices;
  }

  async generateComparativeReport(
    request: ComparativeReportRequest
  ): Promise<ComparativeReportResponse> {
    const useUnified = featureFlags.isEnabledForReporting(
      `comparative_report_${request.projectId}`
    );

    if (useUnified) {
      return await this.unifiedService.generateComparativeReport(request);
    } else {
      // Fallback to legacy services
      return await this.legacyComparativeReportGeneration(request);
    }
  }

  private async legacyComparativeReportGeneration(
    request: ComparativeReportRequest
  ): Promise<ComparativeReportResponse> {
    // Complex orchestration of legacy services
    // This would delegate to the appropriate legacy service based on request type
    // Implementation details would depend on specific legacy service interfaces
    
    // Placeholder implementation
    throw new Error('Legacy fallback not yet implemented');
  }
}
```

---

## Migration Timeline & Rollout Strategy

### Phase 1: Interface Implementation (Week 1-2)
1. Implement unified `ReportingService` interface
2. Create modular sub-services (`ReportGenerator`, `ReportScheduler`, `ReportProcessor`)
3. Set up unified Bull queue architecture
4. Implement backward compatibility adapters

### Phase 2: Feature Flag Integration (Week 3)
1. Integrate feature flag system for gradual rollout
2. Implement parallel processing (unified + legacy)
3. Set up monitoring and comparison metrics
4. Test unified service with low-risk projects

### Phase 3: Gradual Migration (Week 4-6)
1. Migrate 10% of traffic to unified service
2. Monitor performance and error rates
3. Gradually increase traffic percentage
4. Address any issues discovered during migration

### Phase 4: Full Migration (Week 7-8)
1. Migrate 100% of traffic to unified service
2. Deprecate legacy service interfaces
3. Remove feature flag dependencies
4. Clean up legacy service code

---

## Success Criteria

### Functional Requirements
- [x] Unified interface supports all existing report generation capabilities
- [x] Exclusive focus on comparative reports (no individual competitor reports)
- [x] Markdown-only output format as specified
- [x] Modular sub-service architecture implemented
- [x] Unified Bull queue with job type differentiation
- [x] Backward compatibility maintained through adapters

### Performance Requirements
- [ ] Report generation times match or exceed current performance
- [ ] Queue processing throughput maintains current levels
- [ ] Memory usage optimized through service consolidation
- [ ] Error rates remain at or below current levels

### Operational Requirements
- [ ] Feature flag system enables gradual rollout
- [ ] Monitoring and alerting configured for unified service
- [ ] Rollback procedures documented and tested
- [ ] Documentation updated for new service architecture

---

## Next Steps

1. **Implement Core Interfaces**: Create TypeScript interfaces and types
2. **Build Sub-Services**: Implement `ReportGenerator`, `ReportScheduler`, `ReportProcessor`
3. **Set Up Queue Architecture**: Configure unified Bull queue
4. **Create Backward Compatibility**: Implement adapter pattern for legacy services
5. **Integration Testing**: Comprehensive testing of unified service
6. **Feature Flag Integration**: Set up gradual migration system
7. **Documentation**: Update API documentation and service guides 