/**
 * Unified Reporting Domain Types
 * Consolidates all reporting service interfaces into unified types
 * Focuses exclusively on comparative reports in markdown format
 */

// ===== CORE SERVICE INTERFACES =====

/**
 * Main unified ReportingService interface
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

// ===== UNIFIED DOMAIN TYPES (Task 4.3) =====

/**
 * Unified ReportRequest - Consolidates all report request types
 * Removes individual/scheduled types, focuses on comparative only
 */
export type ReportRequest = ComparativeReportRequest | IntelligentReportRequest | {
  projectId: string;
  type: 'initial';
  options: InitialReportOptions;
};

/**
 * Unified ReportResponse - Consolidates all report response types
 * Standardized response format across all report generation
 */
export type ReportResponse = ComparativeReportResponse | IntelligentReportResponse | InitialReportResponse;

/**
 * Unified ReportConfig - Consolidated configuration for all reporting
 * Focuses exclusively on comparative report configuration
 */
export interface ReportConfig {
  // Core configuration
  template: ReportTemplate;
  focusArea: ReportFocusArea;
  analysisDepth: AnalysisDepth;
  
  // Processing configuration
  priority: Priority;
  forceDataRefresh?: boolean;
  timeout?: number;
  
  // Output configuration (markdown only)
  format: 'markdown';
  includeTableOfContents?: boolean;
  includeDiagrams?: boolean;
  maxSectionLength?: number;
  
  // Enhancement configuration
  enhanceWithAI?: boolean;
  includeDataFreshness?: boolean;
  includeActionableInsights?: boolean;
  
  // Intelligence configuration (for intelligent reports)
  smartReporting?: Partial<SmartReportingConfig>;
  
  // Scheduling configuration
  scheduling?: {
    enabled: boolean;
    frequency?: ScheduleFrequency;
    adaptiveFrequency?: boolean;
    notificationChannels?: NotificationChannel[];
  };
}

/**
 * Legacy type mappings for backward compatibility
 * Maps old service types to new unified types
 */
export interface LegacyTypeMapping {
  // AutoReportGenerationService types
  ReportGenerationTask: ReportTask;
  ReportGenerationResult: ComparativeReportResponse;
  AutoReportSchedule: ScheduleResult;
  
  // IntelligentReportingService types  
  IntelligentReportingRequest: IntelligentReportRequest;
  IntelligentReport: IntelligentReport;
  
  // ComparativeReportService types
  ReportGenerationOptions: ReportGenerationOptions;
  ComparativeReportGenerationResult: GenerationResult;
  
  // InitialComparativeReportService types
  InitialReportOptions: InitialReportOptions;
  ProjectReadinessResult: {
    isReady: boolean;
    hasProduct: boolean;
    hasCompetitors: boolean;
    hasProductData: boolean;
    missingData: string[];
    readinessScore: number;
  };
}

/**
 * Database compatibility types
 * Ensures compatibility with existing report storage
 */
export interface ReportStorageCompatibility {
  // Prisma model compatibility
  Report: {
    id: string;
    projectId: string;
    type: 'comparative' | 'intelligent' | 'initial';
    title: string;
    description: string;
    content: string; // Markdown content
    metadata: string; // JSON stringified metadata
    status: 'completed' | 'failed' | 'processing';
    createdAt: Date;
    updatedAt: Date;
  };
  
  // Report file storage
  ReportFile: {
    reportId: string;
    filename: string;
    path: string;
    format: 'markdown';
    size: number;
    checksum: string;
  };
}

// ===== REQUEST TYPES =====

/**
 * Unified comparative report request
 */
export interface ComparativeReportRequest {
  taskId?: string;
  projectId: string;
  reportType: 'comparative';
  analysis?: any; // ComparativeAnalysis
  product?: any; // Product
  productSnapshot?: any; // ProductSnapshot
  options?: ReportGenerationOptions;
}

/**
 * Intelligent report request
 */
export interface IntelligentReportRequest {
  taskId?: string;
  projectId: string;
  analysis?: any; // ComparativeAnalysis
  product?: any; // Product
  productSnapshot?: any; // ProductSnapshot
  enhanceWithAI?: boolean;
  options?: ReportGenerationOptions;
}

/**
 * Initial report options for new projects
 */
export interface InitialReportOptions {
  template?: ReportTemplate;
  priority?: Priority;
  timeout?: number;
  fallbackToPartialData?: boolean;
  requireFreshSnapshots?: boolean;
  forceGeneration?: boolean;
}

/**
 * Initial report request (for new projects)
 */
export interface InitialReportRequest {
  taskId?: string;
  projectId: string;
  options?: InitialReportOptions;
}

// ===== RESPONSE TYPES =====

/**
 * Unified comparative report response
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

/**
 * Intelligent report response with enhanced data
 */
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

/**
 * Initial report response
 */
export interface InitialReportResponse {
  success: boolean;
  report?: ComparativeReport;
  taskId: string;
  projectId: string;
  
  // Status information
  status: TaskStatus;
  message?: string;
  
  // Timing
  generatedAt: Date;
  processingTime?: number;
  
  // Error handling
  error?: string;
}

// ===== QUEUE MANAGEMENT TYPES =====

/**
 * Unified report task for queue processing
 */
export interface ReportTask {
  id: string;
  projectId: string;
  taskType: TaskType;
  
  // Request data (polymorphic based on taskType)
  request: ComparativeReportRequest | IntelligentReportRequest | InitialReportOptions;
  
  // Queue metadata
  priority: Priority;
  createdAt: Date;
  scheduledFor?: Date | undefined;
  retryCount: number;
  maxRetries: number;
  
  // Processing tracking
  correlationId: string;
  userId?: string | undefined;
}

/**
 * Queue processing options
 */
export interface QueueOptions {
  priority?: Priority;
  delay?: number; // milliseconds
  scheduledFor?: Date;
  maxRetries?: number;
  timeout?: number;
}

/**
 * Report task result from queueing
 */
export interface ReportTaskResult {
  taskId: string;
  status: TaskStatus;
  queuePosition: number;
  estimatedCompletion: Date;
  projectId: string;
}

/**
 * Real-time report status
 */
export interface ReportStatus {
  taskId: string;
  status: TaskStatus;
  progress: number; // 0-100
  currentStep?: string;
  startedAt?: Date;
  completedAt?: Date;
  processingTime?: number;
  error?: string;
}

/**
 * Queue statistics and health
 */
export interface QueueStatistics {
  totalQueued: number;
  totalProcessing: number;
  totalCompleted: number;
  totalFailed: number;
  averageProcessingTime: number;
  queueHealth: QueueHealth;
}

// ===== SCHEDULING TYPES =====

/**
 * Report scheduler configuration
 */
export interface ReportSchedulerConfig {
  queue: any; // Bull.Queue instance
  comparativeOnly: boolean;
  maxSchedules: number;
  defaultFrequency: ScheduleFrequency;
}

/**
 * Report schedule definition - enhanced for Task 5.3
 */
export interface ReportSchedule {
  id: string;
  projectId: string;
  frequency: ScheduleFrequency;
  reportType: 'comparative'; // Only comparative reports supported
  template: ReportTemplate;
  priority?: Priority;
  
  // Schedule management
  isActive: boolean;
  startDate?: Date;
  nextRunTime: Date;
  
  // Execution tracking
  lastExecuted?: Date;
  executionCount?: number;
  failureCount?: number;
  lastError?: string;
  
  // Enhancement options
  enhanceWithAI?: boolean;
  includeDataFreshness?: boolean;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Schedule creation result
 */
export interface ScheduleResult {
  success: boolean;
  scheduleId: string;
  nextRun?: Date;
  cronPattern?: string;
  message: string;
  error?: string;
}

/**
 * Schedule status information
 */
export interface ScheduleStatus {
  scheduleId: string;
  projectId: string;
  isActive: boolean;
  nextRun: Date;
  lastRun?: Date;
  lastResult?: 'success' | 'failed';
  consecutiveFailures: number;
}

/**
 * Schedule information summary
 */
export interface ScheduleInfo {
  scheduleId: string;
  frequency: string;
  template: string;
  focusArea: string;
  nextRun: Date;
  isActive: boolean;
}

// ===== REPORT STRUCTURE TYPES =====

/**
 * Comparative report (markdown only)
 */
export interface ComparativeReport {
  id: string;
  title: string;
  description: string;
  projectId: string;
  productId: string;
  analysisId: string;
  
  // Report content (markdown format)
  content: string; // Full markdown content
  metadata: ComparativeReportMetadata;
  sections: ComparativeReportSection[];
  
  // Analysis results
  executiveSummary: string;
  keyFindings: string[];
  strategicRecommendations: StrategicRecommendations;
  competitiveIntelligence: CompetitiveIntelligence;
  
  // Status and timing
  createdAt: Date;
  updatedAt: Date;
  status: 'completed' | 'failed' | 'processing';
  format: 'markdown'; // Always markdown
}

/**
 * Enhanced intelligent report
 */
export interface IntelligentReport extends ComparativeReport {
  // Additional intelligence features
  dataFreshnessIndicators: DataFreshnessIndicators;
  competitiveActivityAlerts: CompetitiveActivityAlert[];
  schedulingMetadata: SchedulingMetadata;
  marketChangeDetection: MarketChangeDetection;
  actionableInsights: ActionableInsight[];
  
  // Enhanced analysis
  analysis: string; // AI-enhanced analysis content
  reportType: IntelligentReportType;
}

/**
 * Report metadata
 */
export interface ComparativeReportMetadata {
  productName: string;
  productUrl: string;
  competitorCount: number;
  analysisDate: Date;
  reportGeneratedAt: Date;
  analysisId: string;
  analysisMethod: string;
  confidenceScore: number;
  dataQuality: number;
  reportVersion: string;
  focusAreas: string[];
  analysisDepth: AnalysisDepth;
  templateUsed: ReportTemplate;
  processingTime: number;
  memoryUsage?: number;
}

/**
 * Report section structure
 */
export interface ComparativeReportSection {
  id: string;
  title: string;
  content: string; // Markdown content
  order: number;
  subsections?: ComparativeReportSection[];
}

/**
 * Strategic recommendations
 */
export interface StrategicRecommendations {
  immediate: string[];
  shortTerm: string[];
  longTerm: string[];
  priorityScore: number;
}

/**
 * Competitive intelligence insights
 */
export interface CompetitiveIntelligence {
  marketPosition: string;
  keyThreats: string[];
  opportunities: string[];
  competitiveAdvantages: string[];
}

// ===== INTELLIGENCE FEATURES =====

/**
 * Data freshness indicators
 */
export interface DataFreshnessIndicators {
  overallFreshness: 'FRESH' | 'STALE' | 'MIXED';
  productDataAge: number; // days
  competitorDataAge: number[]; // days per competitor
  lastScrapingAttempt: Date | null;
  dataQualityScore: number; // 0-100
  freshnessWarnings: string[];
  nextRecommendedUpdate: Date;
}

/**
 * Competitive activity alert
 */
export interface CompetitiveActivityAlert {
  type: 'pricing_change' | 'feature_update' | 'marketing_shift' | 'website_redesign' | 'content_change';
  competitorId: string;
  competitorName: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  detectedAt: Date;
  aiConfidence: number; // 0-100
  recommendedAction: string;
  businessImpact: string;
}

/**
 * Market change detection
 */
export interface MarketChangeDetection {
  changeVelocity: 'low' | 'moderate' | 'high' | 'rapid';
  significantChanges: MarketChange[];
  trendAnalysis: string;
  marketDynamics: string;
  recommendedReportingFrequency: ScheduleFrequency;
}

/**
 * Individual market change
 */
export interface MarketChange {
  category: string;
  description: string;
  impactLevel: 'low' | 'medium' | 'high';
  detectedAt: Date;
}

/**
 * Actionable insight
 */
export interface ActionableInsight {
  category: 'immediate' | 'short_term' | 'long_term' | 'strategic';
  priority: Priority;
  insight: string;
  recommendedAction: string;
  estimatedImpact: string;
  timeframe: string;
  resourcesRequired: string[];
}

/**
 * Scheduling metadata
 */
export interface SchedulingMetadata {
  lastAnalysisRun: Date | null;
  nextScheduledAnalysis: Date | null;
  analysisFrequency: ScheduleFrequency;
  smartSchedulingTriggers: string[];
  dataCollectionEfficiency: number; // 0-100
  analysisHistory: AnalysisHistoryEntry[];
}

/**
 * Analysis history entry
 */
export interface AnalysisHistoryEntry {
  date: Date;
  type: string;
  dataFreshness: string;
}

// ===== CONFIGURATION TYPES =====

/**
 * Smart reporting configuration
 */
export interface SmartReportingConfig {
  enableDataFreshnessIndicators: boolean;
  enableCompetitiveActivityAlerts: boolean;
  enableMarketChangeDetection: boolean;
  alertThresholds: AlertThresholds;
  reportingFrequency: ScheduleFrequency | 'adaptive';
  notificationChannels: NotificationChannel[];
}

/**
 * Alert thresholds
 */
export interface AlertThresholds {
  dataAge: number; // days
  changeConfidence: number; // 0-100
  marketVelocity: 'low' | 'moderate' | 'high';
}

/**
 * Data freshness information
 */
export interface DataFreshnessInfo {
  overallStatus: 'FRESH' | 'STALE' | 'MIXED';
  lastUpdated: Date;
  dataQualityScore?: number;
}

/**
 * Service health status
 */
export interface ServiceHealth {
  status: QueueHealth;
  queueStatistics: QueueStatistics;
  uptime: number;
  memoryUsage: NodeJS.MemoryUsage;
  lastHealthCheck: Date;
}

// ===== ENUM TYPES =====

export type ReportTemplate = 'comprehensive' | 'executive' | 'technical' | 'strategic';
export type ReportFocusArea = 'user_experience' | 'pricing' | 'features' | 'marketing' | 'overall';
export type AnalysisDepth = 'surface' | 'detailed' | 'comprehensive';
export type Priority = 'high' | 'normal' | 'low';
export type TaskType = 'comparative' | 'intelligent' | 'initial';
export type TaskStatus = 'queued' | 'processing' | 'completed' | 'failed';
export type QueueHealth = 'healthy' | 'degraded' | 'critical';
export type ScheduleFrequency = 'daily' | 'weekly' | 'monthly';
export type NotificationChannel = 'email' | 'dashboard' | 'webhook';
export type IntelligentReportType = 'competitive_alert' | 'market_change' | 'data_freshness' | 'comprehensive_intelligence';

// ===== SUB-SERVICE INTERFACES =====

/**
 * Report generation sub-service interface
 */
export interface IReportGenerator {
  // Primary generation methods - migrated from ComparativeReportService
  generateComparativeReport(request: ComparativeReportRequest): Promise<ComparativeReportResponse>;
  generateIntelligentReport(request: IntelligentReportRequest): Promise<IntelligentReportResponse>;
  generateInitialReport(request: InitialReportRequest): Promise<InitialReportResponse>;
}

/**
 * Report scheduling sub-service interface
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

/**
 * Report processing sub-service interface
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
  getQueueHealth(): Promise<QueueHealthStatus>;
  
  // Error handling and recovery
  retryFailedTask(taskId: string): Promise<void>;
  cancelTask(taskId: string): Promise<void>;
}

/**
 * Report generator configuration
 */
export interface ReportGeneratorConfig {
  analysisService: any; // AnalysisService instance
  markdownOnly: boolean;
  maxConcurrency: number;
  timeout: number;
}

/**
 * Report processor configuration
 */
export interface ReportProcessorConfig {
  queue: any; // Bull.Queue instance
  reportGenerator: IReportGenerator;
  analysisService: any; // AnalysisService instance
  processingTimeout: number;
  retryConfig: RetryConfig;
  comparativeOnly: boolean;
}

/**
 * Retry configuration for report processing
 */
export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
  retryableErrors: string[];
}

// ===== GENERATION OPTIONS =====

/**
 * Report generation options
 */
export interface ReportGenerationOptions {
  template: ReportTemplate;
  focusArea: ReportFocusArea;
  analysisDepth: AnalysisDepth;
  
  // Markdown-specific options
  includeTableOfContents: boolean;
  includeDiagrams: boolean;
  maxSectionLength?: number;
  
  // Enhancement options
  enhanceWithAI: boolean;
  includeDataFreshness: boolean;
  includeActionableInsights: boolean;
}

/**
 * Generation result
 */
export interface GenerationResult {
  success: boolean;
  report: ComparativeReport; // Always markdown format
  metadata: GenerationMetadata;
  warnings?: string[];
  error?: string;
}

/**
 * Generation metadata
 */
export interface GenerationMetadata {
  templateUsed: string;
  sectionsGenerated: number;
  processingTime: number;
  memoryUsage: number;
  aiEnhancementApplied: boolean;
  dataFreshnessScore: number;
}

/**
 * Report context for AI enhancement
 */
export interface ReportContext {
  projectId: string;
  productName: string;
  competitorNames: string[];
  analysisType: string;
  focusArea: ReportFocusArea;
  businessContext?: string;
}

/**
 * Report validation result
 */
export interface ReportValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  qualityScore: number; // 0-100
}

/**
 * Queue health status
 */
export interface QueueHealthStatus {
  status: QueueHealth;
  queueLength: number;
  processingCount: number;
  failedJobsCount: number;
  avgProcessingTime: number;
  lastProcessedAt?: Date;
} 